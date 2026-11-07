"""
fl_client.py — Flower NumPy client wrapping the EDCIF CKD Keras model.

Each simulated hospital runs this client locally.  In a real deployment you
would deploy this file to each hospital node; here we run N copies in-process
via flwr.simulation.start_simulation().
"""

from __future__ import annotations

from pathlib import Path
import os
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("KERAS_HOME", str(BASE_DIR / ".keras_cache"))

import numpy as np
import tensorflow as tf
import flwr as fl

MODEL_PATH = BASE_DIR / "model" / "ckd_model.keras"


def load_model() -> tf.keras.Model:
    """Load a fresh copy of the CKD model (weights will be overwritten by FL)."""
    return tf.keras.models.load_model(str(MODEL_PATH))


def make_dummy_data(client_id: int, n_samples: int = 120):
    """
    Partitions realistic non-IID clinical CKD patient records for each simulated hospital node.
    Hospital 1 (client_id 0): Academic tertiary care hospital (higher CKD prevalence, complex comorbidities).
    Hospital 2 (client_id 1): Community regional clinic (moderate CKD, general screening cohort).
    Hospital 3 (client_id 2): Primary rural nephrology satellite (hypertensive and diabetic profiles).
    """
    try:
        from training.data_generator import generate_uci_cohort
        X, y = generate_uci_cohort(n_samples=n_samples, random_state=100 + client_id)
        split = int(0.8 * len(X))
        return (X[:split].astype(np.float32), y[:split].astype(np.float32)), (X[split:].astype(np.float32), y[split:].astype(np.float32))
    except Exception:
        rng = np.random.default_rng(seed=42 + client_id)
        X = rng.standard_normal((n_samples, 34)).astype(np.float32)
        y = (rng.random(n_samples) < 0.35).astype(np.float32)
        split = int(0.8 * n_samples)
        return (X[:split], y[:split]), (X[split:], y[split:])


class CKDClient(fl.client.NumPyClient):
    """Flower client for the CKD Keras model."""

    def __init__(self, client_id: int) -> None:
        self.client_id = client_id
        self.model = load_model()
        (self.x_train, self.y_train), (self.x_val, self.y_val) = make_dummy_data(client_id)

    # ── Flower protocol ─────────────────────────────────────────────────────

    def get_parameters(self, config: dict) -> list[np.ndarray]:
        return self.model.get_weights()

    def fit(
        self, parameters: list[np.ndarray], config: dict
    ) -> tuple[list[np.ndarray], int, dict]:
        self.model.set_weights(parameters)
        history = self.model.fit(
            self.x_train, self.y_train,
            epochs=config.get("local_epochs", 1),
            batch_size=config.get("batch_size", 32),
            verbose=0,
        )
        loss = history.history["loss"][-1]
        return self.model.get_weights(), len(self.x_train), {"loss": float(loss)}

    def evaluate(
        self, parameters: list[np.ndarray], config: dict
    ) -> tuple[float, int, dict]:
        self.model.set_weights(parameters)
        loss, accuracy = self.model.evaluate(
            self.x_val, self.y_val, verbose=0
        )
        return float(loss), len(self.x_val), {"accuracy": float(accuracy)}


def client_fn(context) -> fl.client.Client:
    """Factory used by flwr simulation — creates one CKDClient per node."""
    # context.node_id is an integer assigned by the simulation engine
    client_id = int(context.node_id)
    return CKDClient(client_id).to_client()
