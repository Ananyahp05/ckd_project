"""
fl_server.py — Flower FL server configuration and simulation launcher.

Uses FedAvg strategy to aggregate weights from N simulated clients,
then saves the federated model weights back to disk.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional
import time

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("KERAS_HOME", str(BASE_DIR / ".keras_cache"))

import numpy as np
import flwr as fl
from flwr.common import Metrics
from flwr.server.strategy import FedAvg

# ── Constants ────────────────────────────────────────────────────────────────

NUM_CLIENTS = 2          # Simulated hospital nodes
NUM_ROUNDS  = 3          # Federation rounds
LOCAL_EPOCHS = 2         # Local training epochs per round
MODEL_OUT_PATH = str(BASE_DIR / "model" / "ckd_model_federated.keras")


# ── Metric aggregation helpers ────────────────────────────────────────────────

def weighted_average(metrics: list[tuple[int, Metrics]]) -> Metrics:
    """Average accuracy weighted by number of local samples."""
    total = sum(n for n, _ in metrics)
    acc   = sum(n * m.get("accuracy", 0.0) for n, m in metrics) / total if total else 0.0
    loss  = sum(n * m.get("loss", 0.0)     for n, m in metrics) / total if total else 0.0
    return {"accuracy": acc, "loss": loss}


def build_strategy() -> FedAvg:
    return FedAvg(
        fraction_fit=1.0,           # all clients participate in each round
        fraction_evaluate=1.0,
        min_fit_clients=NUM_CLIENTS,
        min_evaluate_clients=NUM_CLIENTS,
        min_available_clients=NUM_CLIENTS,
        fit_metrics_aggregation_fn=weighted_average,
        evaluate_metrics_aggregation_fn=weighted_average,
        on_fit_config_fn=lambda rnd: {
            "local_epochs": LOCAL_EPOCHS,
            "batch_size": 32,
            "round": rnd,
        },
    )


# ── Simulation entry-point ────────────────────────────────────────────────────

def start_simulation(
    save_path: str = MODEL_OUT_PATH,
    num_rounds: int = NUM_ROUNDS,
    num_clients: int = NUM_CLIENTS,
    progress_callback=None,
) -> dict:
    """
    Run a full Flower simulation and save the federated model.

    Args:
        save_path:          Where to save the aggregated Keras model.
        num_rounds:         Number of FL aggregation rounds.
        num_clients:        Number of simulated client nodes.
        progress_callback:  Optional callable(round_num, metrics) for live logging.

    Returns:
        dict with final aggregated metrics.
    """
    try:
        # Verify Flower and Ray are both functional
        import flwr as fl
        import ray
        
        from federated.fl_client import client_fn  # local import to avoid circular

        print(f"\n[FL] Starting simulation - {num_clients} clients x {num_rounds} rounds")

        # Track per-round history
        round_history: list[dict] = []

        class LoggingStrategy(FedAvg):
            def aggregate_fit(self, rnd, results, failures):
                aggregated = super().aggregate_fit(rnd, results, failures)
                if aggregated:
                    print(f"[FL] Round {rnd} — fit aggregated ({len(results)} clients)")
                return aggregated

            def aggregate_evaluate(self, rnd, results, failures):
                aggregated = super().aggregate_evaluate(rnd, results, failures)
                # aggregated[1] is the metrics dict
                metrics = aggregated[1] if aggregated else {}
                entry = {"round": rnd, **metrics}
                round_history.append(entry)
                print(f"[FL] Round {rnd} — eval metrics: {metrics}")
                if progress_callback:
                    progress_callback(rnd, metrics)
                return aggregated

        strategy = LoggingStrategy(
            fraction_fit=1.0,
            fraction_evaluate=1.0,
            min_fit_clients=num_clients,
            min_evaluate_clients=num_clients,
            min_available_clients=num_clients,
            fit_metrics_aggregation_fn=weighted_average,
            evaluate_metrics_aggregation_fn=weighted_average,
            on_fit_config_fn=lambda r: {
                "local_epochs": LOCAL_EPOCHS,
                "batch_size": 32,
                "round": r,
            },
        )

        history = fl.simulation.start_simulation(
            client_fn=client_fn,
            num_clients=num_clients,
            config=fl.server.ServerConfig(num_rounds=num_rounds),
            strategy=strategy,
            client_resources={"num_cpus": 1, "num_gpus": 0.0},
        )

        # ── Save the aggregated weights ──────────────────────────────────────────
        _save_federated_weights(history, save_path)

        final_metrics = round_history[-1] if round_history else {}
        print(f"\n[FL] Simulation complete. Weights saved to: {save_path}")
        print(f"[FL] Final metrics: {final_metrics}")

        return {
            "rounds_completed": num_rounds,
            "round_history": round_history,
            "final_metrics": final_metrics,
            "model_path": save_path,
        }

    except Exception as exc:
        print(f"\n[FL] Flower simulation failed/unavailable ({exc}). Switching to sequential simulation fallback...")
        
        # Fallback simulation of FedAvg strategy on Windows Python 3.13 without Ray
        import tensorflow as tf
        from federated.fl_client import CKDClient
        
        # 1. Load initial model parameters
        base_model = tf.keras.models.load_model(str(BASE_DIR / "model" / "ckd_model.keras"))
        current_weights = base_model.get_weights()
        
        # 2. Instantiate clients
        clients_list = [CKDClient(i) for i in range(num_clients)]
        
        round_history = []
        
        for r in range(1, num_rounds + 1):
            client_weights_list = []
            client_sizes = []
            
            # Local training on each client sequentially
            for client_id, client in enumerate(clients_list):
                print(f"[FL Fallback] Round {r} - Training Client {client_id}...")
                updated_weights, num_samples, fit_metrics = client.fit(
                    current_weights, 
                    {"local_epochs": LOCAL_EPOCHS, "batch_size": 32, "round": r}
                )
                client_weights_list.append(updated_weights)
                client_sizes.append(num_samples)
            
            # FedAvg Aggregation (weighted average of weights)
            total_samples = sum(client_sizes)
            new_weights = []
            for layer_idx in range(len(current_weights)):
                layer_weights = [client_weights_list[c][layer_idx] for c in range(num_clients)]
                weighted_layer = sum(layer_weights[c] * (client_sizes[c] / total_samples) for c in range(num_clients))
                new_weights.append(weighted_layer)
                
            current_weights = new_weights
            
            # Evaluate aggregated model on each client's validation set
            eval_accuracies = []
            eval_losses = []
            eval_sizes = []
            
            for client_id, client in enumerate(clients_list):
                loss, size, eval_metrics = client.evaluate(current_weights, {})
                eval_accuracies.append(eval_metrics.get("accuracy", 0.0))
                eval_losses.append(loss)
                eval_sizes.append(size)
                
            # Aggregate evaluation metrics
            total_eval_samples = sum(eval_sizes)
            agg_accuracy = sum(eval_accuracies[c] * eval_sizes[c] for c in range(num_clients)) / total_eval_samples
            agg_loss = sum(eval_losses[c] * eval_sizes[c] for c in range(num_clients)) / total_eval_samples
            
            metrics = {"accuracy": float(agg_accuracy), "loss": float(agg_loss)}
            entry = {"round": r, **metrics}
            round_history.append(entry)
            
            print(f"[FL Fallback] Round {r} - eval metrics: {metrics}")
            if progress_callback:
                progress_callback(r, metrics)
                
            # Brief sleep to simulate aggregation network delays
            time.sleep(0.5)
            
        # Save final aggregated model weights
        target_path = Path(save_path)
        if not target_path.is_absolute():
            target_path = BASE_DIR / target_path
        target_path.parent.mkdir(parents=True, exist_ok=True)

        base_model.set_weights(current_weights)
        base_model.save(str(target_path))
        print(f"[FL Fallback] Federated model saved -> {target_path}")
        
        final_metrics = round_history[-1] if round_history else {}
        return {
            "rounds_completed": num_rounds,
            "round_history": round_history,
            "final_metrics": final_metrics,
            "model_path": str(target_path),
        }


def _save_federated_weights(history, save_path: str) -> None:
    """Extract aggregated weights from simulation history and save the model."""
    import tensorflow as tf

    target_path = Path(save_path)
    if not target_path.is_absolute():
        target_path = BASE_DIR / target_path
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # Reload the original model architecture and apply the final global weights
    base_model = tf.keras.models.load_model(str(BASE_DIR / "model" / "ckd_model.keras"))

    # history.parameters_res contains (round, Parameters) tuples
    # The last entry has the final aggregated weights
    if history.parameters_res:
        last_params = history.parameters_res[-1][1].parameters
        weights = fl.common.parameters_to_ndarrays(last_params)
        base_model.set_weights(weights)
        base_model.save(str(target_path))
        print(f"[FL] Federated model saved -> {target_path}")
    else:
        print("[FL] Warning: no aggregated parameters found; original model unchanged.")
