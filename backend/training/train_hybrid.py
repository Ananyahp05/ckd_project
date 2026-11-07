"""
train_hybrid.py — Reproducible training pipeline for the Hybrid Dense + LSTM
Multi-Input eGFR Regression Engine.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("KERAS_HOME", str(BASE_DIR / ".keras_cache"))

import json
import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

from training.data_generator import generate_cdisc_adam_longitudinal

BASE_DIR = Path(__file__).resolve().parent.parent

def build_hybrid_model(timesteps: int = 3, n_seq_features: int = 2, n_base_features: int = 1) -> tf.keras.Model:
    """
    Constructs the Dual-Input Functional Keras Architecture matching backend/model/hybrid_artifacts/hybrid_model.keras:
      Branch 1: sequence_input (3, 2) -> LSTM(64, return_seq=True) -> LSTM(32) -> Dense(16)
      Branch 2: baseline_input (1,) -> Dense(16) -> Dense(8)
      Fusion: Concatenate(16 + 8 = 24) -> Dense(32) -> Dense(16) -> Dense(1, linear)
    """
    # Branch 1: Temporal Dynamics
    seq_input = tf.keras.layers.Input(shape=(timesteps, n_seq_features), name="sequence_input")
    x_seq = tf.keras.layers.LSTM(64, return_sequences=True, name="lstm_branch_1")(seq_input)
    x_seq = tf.keras.layers.Dropout(0.2, name="dropout_seq")(x_seq)
    x_seq = tf.keras.layers.LSTM(32, return_sequences=False, name="lstm_branch_2")(x_seq)
    x_seq = tf.keras.layers.Dense(16, activation="relu", name="seq_dense_out")(x_seq)

    # Branch 2: Baseline Static Anchor
    base_input = tf.keras.layers.Input(shape=(n_base_features,), name="baseline_input")
    x_base = tf.keras.layers.Dense(16, activation="relu", name="base_dense_1")(base_input)
    x_base = tf.keras.layers.Dense(8, activation="relu", name="base_dense_out")(x_base)

    # Multi-Modal Concatenation Head
    concat = tf.keras.layers.Concatenate(name="fusion_concatenate")([x_seq, x_base])
    x_fused = tf.keras.layers.Dense(32, activation="relu", name="fused_dense_1")(concat)
    x_fused = tf.keras.layers.Dense(16, activation="relu", name="fused_dense_2")(x_fused)
    output = tf.keras.layers.Dense(1, activation="linear", name="output_egfr")(x_fused)

    model = tf.keras.Model(inputs=[seq_input, base_input], outputs=output, name="hybrid_dense_lstm_regressor")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="mse",
        metrics=["mae", tf.keras.metrics.RootMeanSquaredError(name="rmse")]
    )
    return model


def train_hybrid(save_artifacts: bool = False, output_dir: Path = None) -> dict:
    """
    Trains the dual-input Hybrid model, prints evaluation metrics,
    and optionally saves model, scalers, and config artifacts.
    """
    print("=" * 60)
    print("  EDCIF: Training Hybrid Dense + LSTM Regressor")
    print("=" * 60)

    # 1. Generate/Load Longitudinal Cohort
    _, X_2feat, X_base, y_raw = generate_cdisc_adam_longitudinal(n_subjects=800, random_seed=42)
    timesteps = 3
    seq_features = ["aval", "ady"]
    base_features = ["base"]
    print(f"Cohort loaded: {len(X_2feat)} sequences. Dual inputs: {seq_features} and {base_features}.")

    # 2. Train/Test Split (80/20)
    indices = np.arange(len(X_2feat))
    train_idx, test_idx = train_test_split(indices, test_size=0.20, random_state=42)

    X_seq_tr_raw, X_seq_te_raw = X_2feat[train_idx], X_2feat[test_idx]
    X_base_tr_raw, X_base_te_raw = X_base[train_idx], X_base[test_idx]
    y_tr_raw, y_te_raw = y_raw[train_idx], y_raw[test_idx]

    # 3. Fit Sequence Scaler
    seq_scaler = StandardScaler()
    N_tr = len(X_seq_tr_raw)
    seq_scaler.fit(X_seq_tr_raw.reshape(-1, len(seq_features)))

    X_seq_tr_scaled = seq_scaler.transform(X_seq_tr_raw.reshape(-1, len(seq_features))).reshape(N_tr, timesteps, len(seq_features))
    N_te = len(X_seq_te_raw)
    X_seq_te_scaled = seq_scaler.transform(X_seq_te_raw.reshape(-1, len(seq_features))).reshape(N_te, timesteps, len(seq_features))

    # Fit Baseline Scaler
    base_scaler = StandardScaler()
    X_base_tr_scaled = base_scaler.fit_transform(X_base_tr_raw)
    X_base_te_scaled = base_scaler.transform(X_base_te_raw)

    # Fit Target Scaler
    target_scaler = StandardScaler()
    y_tr_scaled = target_scaler.fit_transform(y_tr_raw)
    y_te_scaled = target_scaler.transform(y_te_raw)

    # 4. Build Model & Train
    model = build_hybrid_model(timesteps=timesteps, n_seq_features=len(seq_features), n_base_features=len(base_features))
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=12, restore_best_weights=True)
    ]

    history = model.fit(
        [X_seq_tr_scaled, X_base_tr_scaled], y_tr_scaled,
        validation_split=0.15,
        epochs=70,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )

    # 5. Evaluate on Held-Out Test Set
    pred_scaled = model.predict([X_seq_te_scaled, X_base_te_scaled], verbose=0)
    pred_original = target_scaler.inverse_transform(pred_scaled)

    mse = float(mean_squared_error(y_te_raw, pred_original))
    mae = float(mean_absolute_error(y_te_raw, pred_original))
    rmse = float(np.sqrt(mse))
    r2 = float(r2_score(y_te_raw, pred_original))

    metrics = {
        "model_name": "Hybrid Dense + LSTM",
        "task": "eGFR Progression Regression (Multi-Input)",
        "timesteps": timesteps,
        "sequence_features": seq_features,
        "baseline_features": base_features,
        "test_mse": round(mse, 4),
        "test_mae": round(mae, 4),
        "test_rmse": round(rmse, 4),
        "test_r2": round(r2, 4)
    }

    print("\n--- Test Set Evaluation Results ---")
    for k, v in metrics.items():
        print(f"  {k:20s}: {v}")

    # 6. Save Artifacts if requested
    if save_artifacts:
        dest = output_dir or (BASE_DIR / "model" / "hybrid_artifacts")
        dest.mkdir(parents=True, exist_ok=True)
        model.save(str(dest / "hybrid_model.keras"))
        joblib.dump(seq_scaler, str(dest / "hybrid_sequence_scaler.pkl"))
        joblib.dump(base_scaler, str(dest / "hybrid_baseline_scaler.pkl"))
        joblib.dump(target_scaler, str(dest / "hybrid_target_scaler.pkl"))

        config = {
            "model_type": "Hybrid Dense + LSTM Regression",
            "prediction_target": "next observed eGFR (aval)",
            "selected_paramcd": "GFRBSCRT",
            "timesteps": timesteps,
            "sequence_features": seq_features,
            "baseline_features": base_features,
            "architecture": "Branch 1 (LSTM 64->32->Dense 16) + Branch 2 (Dense 16->8) -> Fusion Dense(32->16->1)"
        }
        with open(str(dest / "hybrid_config.json"), "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        with open(str(dest / "evaluation_metrics.json"), "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)

        print(f"\n[OK] Artifacts successfully saved to: {dest}")

    return metrics


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(BASE_DIR))
    train_hybrid(save_artifacts=False)
