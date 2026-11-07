"""
train_lstm.py — Reproducible training pipeline for the Long Short-Term Memory (LSTM)
Sequential eGFR Regression Engine.
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

def build_lstm_model(timesteps: int = 3, n_features: int = 3) -> tf.keras.Model:
    """
    Constructs the 2-Layer Sequential LSTM architecture matching backend/model/lstm_artifacts/lstm_model.keras:
      LSTM(64, return_sequences=True) -> Dropout(0.2) -> LSTM(32) -> Dense(16, relu) -> Dense(1, linear)
    """
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(timesteps, n_features)),
        tf.keras.layers.LSTM(64, return_sequences=True, name="lstm_layer_1"),
        tf.keras.layers.Dropout(0.2, name="dropout_1"),
        tf.keras.layers.LSTM(32, return_sequences=False, name="lstm_layer_2"),
        tf.keras.layers.Dense(16, activation="relu", name="dense_head"),
        tf.keras.layers.Dense(1, activation="linear", name="output_egfr_regression")
    ], name="lstm_egfr_regressor")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="mse",
        metrics=["mae", tf.keras.metrics.RootMeanSquaredError(name="rmse")]
    )
    return model


def train_lstm(save_artifacts: bool = False, output_dir: Path = None) -> dict:
    """
    Trains the LSTM regressor on sequential clinical visits, prints evaluation metrics,
    and optionally saves model, scalers, and config artifacts.
    """
    print("=" * 60)
    print("  EDCIF: Training Long Short-Term Memory (LSTM) Regressor")
    print("=" * 60)

    # 1. Generate/Load Longitudinal Cohort
    X_3feat, _, _, y_raw = generate_cdisc_adam_longitudinal(n_subjects=800, random_seed=42)
    timesteps = 3
    features = ["aval", "ady", "base"]
    print(f"Cohort loaded: {len(X_3feat)} longitudinal sequences across {timesteps} timesteps.")

    # 2. Train/Test Split (80/20)
    X_train_raw, X_test_raw, y_train_raw, y_test_raw = train_test_split(
        X_3feat, y_raw, test_size=0.20, random_state=42
    )

    # 3. Fit Feature Scaler on 2D reshaped training matrix
    feat_scaler = StandardScaler()
    N_tr = len(X_train_raw)
    X_train_flat = X_train_raw.reshape(-1, len(features))
    feat_scaler.fit(X_train_flat)

    X_train_scaled = feat_scaler.transform(X_train_flat).reshape(N_tr, timesteps, len(features))
    N_te = len(X_test_raw)
    X_test_scaled = feat_scaler.transform(X_test_raw.reshape(-1, len(features))).reshape(N_te, timesteps, len(features))

    # Fit Target Scaler
    target_scaler = StandardScaler()
    y_train_scaled = target_scaler.fit_transform(y_train_raw)
    y_test_scaled = target_scaler.transform(y_test_raw)

    # 4. Build Model & Train
    model = build_lstm_model(timesteps=timesteps, n_features=len(features))
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=12, restore_best_weights=True)
    ]

    history = model.fit(
        X_train_scaled, y_train_scaled,
        validation_split=0.15,
        epochs=70,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )

    # 5. Evaluate on Held-Out Test Set (Inverse transformed to original eGFR units)
    pred_scaled = model.predict(X_test_scaled, verbose=0)
    pred_original = target_scaler.inverse_transform(pred_scaled)

    mse = float(mean_squared_error(y_test_raw, pred_original))
    mae = float(mean_absolute_error(y_test_raw, pred_original))
    rmse = float(np.sqrt(mse))
    r2 = float(r2_score(y_test_raw, pred_original))

    metrics = {
        "model_name": "Long Short-Term Memory (LSTM)",
        "task": "eGFR Progression Regression",
        "timesteps": timesteps,
        "input_features": features,
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
        dest = output_dir or (BASE_DIR / "model" / "lstm_artifacts")
        dest.mkdir(parents=True, exist_ok=True)
        model.save(str(dest / "lstm_model.keras"))
        joblib.dump(feat_scaler, str(dest / "lstm_feature_scaler.pkl"))
        joblib.dump(target_scaler, str(dest / "lstm_target_scaler.pkl"))

        config = {
            "model_type": "LSTM Sequence Regression",
            "prediction_target": "next observed eGFR (aval)",
            "parameter_code": "GFRBSCRT",
            "timesteps": timesteps,
            "input_features": features,
            "architecture": "LSTM(64) -> Dropout(0.2) -> LSTM(32) -> Dense(16) -> Dense(1)"
        }
        with open(str(dest / "lstm_config.json"), "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        with open(str(dest / "evaluation_metrics.json"), "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)

        print(f"\n[OK] Artifacts successfully saved to: {dest}")

    return metrics


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(BASE_DIR))
    train_lstm(save_artifacts=False)
