"""
train_ann.py — Reproducible training pipeline for the Artificial Neural Network (ANN)
CKD Binary Classification Engine (34 features).
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
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

from training.data_generator import generate_uci_tabular_cohort

BASE_DIR = Path(__file__).resolve().parent.parent

def build_ann_model(input_dim: int = 34) -> tf.keras.Model:
    """
    Constructs the Sequential MLP Architecture matching backend/model/ckd_model.keras:
      Dense(64, relu) -> Dropout(0.2) -> Dense(32, relu) -> Dropout(0.2) -> Dense(16, relu) -> Dense(1, sigmoid)
    """
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(input_dim,)),
        tf.keras.layers.Dense(64, activation="relu", name="dense_1"),
        tf.keras.layers.Dropout(0.2, name="dropout_1"),
        tf.keras.layers.Dense(32, activation="relu", name="dense_2"),
        tf.keras.layers.Dropout(0.2, name="dropout_2"),
        tf.keras.layers.Dense(16, activation="relu", name="dense_3"),
        tf.keras.layers.Dense(1, activation="sigmoid", name="output_classification")
    ], name="ann_ckd_classifier")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="binary_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")]
    )
    return model


def train_ann(save_artifacts: bool = False, output_dir: Path = None) -> dict:
    """
    Trains the ANN on the 34-feature cohort, prints evaluation metrics, and optionally saves artifacts.
    """
    print("=" * 60)
    print("  EDCIF: Training Artificial Neural Network (ANN) Classifier")
    print("=" * 60)

    # 1. Generate/Load Cohort
    df, y = generate_uci_tabular_cohort(n_samples=500, random_seed=42)
    feature_names = list(df.columns)
    print(f"Cohort loaded: {len(df)} patients, {len(feature_names)} features.")

    # 2. Train/Test Split (80/20)
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        df, y, test_size=0.20, random_state=42, stratify=y
    )

    # 3. Fit StandardScaler on Training Set Only (Prevents Data Leakage)
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train_raw)
    X_test = scaler.transform(X_test_raw)

    # 4. Build Model & Train
    model = build_ann_model(input_dim=len(feature_names))
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True)
    ]

    history = model.fit(
        X_train, y_train,
        validation_split=0.15,
        epochs=60,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )

    # 5. Evaluate on Held-Out Test Set
    y_pred_prob = model.predict(X_test, verbose=0).ravel()
    y_pred_class = (y_pred_prob >= 0.5).astype(int)

    acc = float(accuracy_score(y_test, y_pred_class))
    prec = float(precision_score(y_test, y_pred_class, zero_division=0))
    rec = float(recall_score(y_test, y_pred_class, zero_division=0))
    f1 = float(f1_score(y_test, y_pred_class, zero_division=0))
    auc = float(roc_auc_score(y_test, y_pred_prob))

    metrics = {
        "model_name": "Artificial Neural Network (ANN)",
        "task": "CKD Binary Classification",
        "input_features": len(feature_names),
        "test_accuracy": round(acc, 4),
        "test_precision": round(prec, 4),
        "test_recall": round(rec, 4),
        "test_f1_score": round(f1, 4),
        "test_roc_auc": round(auc, 4)
    }

    print("\n--- Test Set Evaluation Results ---")
    for k, v in metrics.items():
        print(f"  {k:20s}: {v}")

    # 6. Save Artifacts if requested
    if save_artifacts:
        dest = output_dir or (BASE_DIR / "model")
        dest.mkdir(parents=True, exist_ok=True)
        model.save(str(dest / "ckd_model.keras"))
        joblib.dump(scaler, str(dest / "ckd_scaler.pkl"))
        with open(str(dest / "feature_names.json"), "w", encoding="utf-8") as f:
            json.dump(feature_names, f, indent=2)
        print(f"\n[OK] Artifacts successfully saved to: {dest}")

    return metrics


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(BASE_DIR))
    train_ann(save_artifacts=False)
