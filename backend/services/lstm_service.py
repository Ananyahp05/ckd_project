from __future__ import annotations

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
import tensorflow as tf

BASE_DIR = Path(__file__).resolve().parent.parent
LSTM_DIR = BASE_DIR / "model" / "lstm_artifacts"

# Paths to artifacts
MODEL_PATH = LSTM_DIR / "lstm_model.keras"
FEAT_SCALER_PATH = LSTM_DIR / "lstm_feature_scaler.pkl"
TARG_SCALER_PATH = LSTM_DIR / "lstm_target_scaler.pkl"
CONFIG_PATH = LSTM_DIR / "lstm_config.json"
METRICS_PATH = LSTM_DIR / "evaluation_metrics.json"

# Validate files exist
for p in [MODEL_PATH, FEAT_SCALER_PATH, TARG_SCALER_PATH, CONFIG_PATH]:
    if not p.exists():
        raise FileNotFoundError(f"Missing required LSTM artifact at {p}")

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    lstm_config = json.load(f)

lstm_metrics = {}
if METRICS_PATH.exists():
    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        lstm_metrics = json.load(f)

# Load model and scalers once at startup
lstm_model = tf.keras.models.load_model(str(MODEL_PATH))
lstm_feature_scaler = joblib.load(str(FEAT_SCALER_PATH))
lstm_target_scaler = joblib.load(str(TARG_SCALER_PATH))

EXPECTED_TIMESTEPS = lstm_config.get("timesteps", 3)
EXPECTED_FEATURES = lstm_config.get("input_features", ["aval", "ady", "base"])


def classify_kdigo_stage(egfr: float) -> dict:
    if egfr >= 90.0:
        return {
            "stage": "Stage 1",
            "description": "Normal or High eGFR (≥ 90 mL/min/1.73m²)",
            "clinical_significance": "Preserved filtration capacity. Monitor for persistent proteinuria or structural kidney damage.",
            "risk_color": "green",
        }
    elif egfr >= 60.0:
        return {
            "stage": "Stage 2",
            "description": "Mildly Decreased eGFR (60–89 mL/min/1.73m²)",
            "clinical_significance": "Mild reduction in filtration. Routine monitoring of blood pressure, glycemic markers, and annual lab panels recommended.",
            "risk_color": "amber",
        }
    elif egfr >= 45.0:
        return {
            "stage": "Stage 3a",
            "description": "Mild to Moderately Decreased eGFR (45–59 mL/min/1.73m²)",
            "clinical_significance": "Moderate renal function decline. Clinician review, electrolyte assessment, and cardiovascular risk evaluation advised.",
            "risk_color": "amber",
        }
    elif egfr >= 30.0:
        return {
            "stage": "Stage 3b",
            "description": "Moderately to Severely Decreased eGFR (30–44 mL/min/1.73m²)",
            "clinical_significance": "Significant renal impairment. Active renal specialist management, progression slope assessment, and complication screening needed.",
            "risk_color": "red",
        }
    elif egfr >= 15.0:
        return {
            "stage": "Stage 4",
            "description": "Severely Decreased eGFR (15–29 mL/min/1.73m²)",
            "clinical_significance": "Severe loss of kidney function. Specialized renal care and renal replacement therapy preparation recommended.",
            "risk_color": "red",
        }
    else:
        return {
            "stage": "Stage 5",
            "description": "Kidney Failure / End-Stage (< 15 mL/min/1.73m²)",
            "clinical_significance": "Critical end-stage renal condition. Urgent clinical evaluation for dialysis or kidney transplantation required.",
            "risk_color": "red",
        }


def predict_egfr_lstm(sequence: list[dict]) -> dict:
    """
    Predict next observed eGFR using the trained LSTM model.
    Expects sequence of 3 timesteps with fields: 'aval', 'ady', 'base'.
    """
    if len(sequence) != EXPECTED_TIMESTEPS:
        raise ValueError(
            f"LSTM model requires exactly {EXPECTED_TIMESTEPS} historical timesteps, got {len(sequence)}."
        )

    # Build DataFrame preserving exact feature names and order
    rows = []
    for step in sequence:
        row = {feat: float(step.get(feat, 0.0)) for feat in EXPECTED_FEATURES}
        if row["aval"] < 0 or row["base"] < 0:
            raise ValueError(f"eGFR values cannot be negative. Got aval={row['aval']}, base={row['base']}.")
        rows.append(row)

    df = pd.DataFrame(rows, columns=EXPECTED_FEATURES)

    # Scale using the LSTM-specific feature scaler
    scaled_matrix = lstm_feature_scaler.transform(df)
    scaled_seq = scaled_matrix.reshape(1, EXPECTED_TIMESTEPS, len(EXPECTED_FEATURES))

    # Predict scaled eGFR (direct tensor call for rapid low-latency inference)
    pred_scaled = lstm_model(scaled_seq, training=False).numpy()

    # Invert scaling to obtain original eGFR units (mL/min/1.73m²)
    pred_egfr = float(lstm_target_scaler.inverse_transform(pred_scaled)[0][0])
    # Biological lower bound clamp at 0
    pred_egfr = max(0.0, pred_egfr)

    stage_info = classify_kdigo_stage(pred_egfr)

    # Calculate temporal explainability
    try:
        from services.explainability import explain_lstm_prediction
        explanation = explain_lstm_prediction(scaled_seq, sequence, pred_egfr)
    except Exception as exc:
        explanation = {"status": "unavailable", "detail": str(exc)}

    trajectory = [
        {
            "step": i + 1,
            "day": float(step.get("ady", 0.0)),
            "egfr": round(float(step.get("aval", 0.0)), 2),
            "type": "observed"
        }
        for i, step in enumerate(sequence)
    ]
    last_day = float(sequence[-1].get("ady", 180.0))
    first_day = float(sequence[0].get("ady", 0.0))
    avg_gap = max(30.0, (last_day - first_day) / max(1, len(sequence) - 1))
    trajectory.append({
        "step": len(sequence) + 1,
        "day": round(last_day + avg_gap, 1),
        "egfr": round(pred_egfr, 2),
        "type": "predicted"
    })

    return {
        "model_type": "LSTM Sequence Regression",
        "predicted_egfr": round(pred_egfr, 2),
        "unit": "mL/min/1.73m²",
        "target_description": lstm_config.get("prediction_target", "next observed eGFR (aval)"),
        "parameter_code": lstm_config.get("parameter_code", "GFRBSCRT"),
        "kdigo_stage": stage_info["stage"],
        "stage_description": stage_info["description"],
        "kdigo_description": stage_info["description"],
        "clinical_significance": stage_info["clinical_significance"],
        "risk_color": stage_info["risk_color"],
        "timesteps_used": EXPECTED_TIMESTEPS,
        "features_used": EXPECTED_FEATURES,
        "input_sequence": sequence,
        "trajectory": trajectory,
        "explanation": explanation,
        "test_benchmarks": {
            "test_mae": round(lstm_metrics.get("test_mae", 5.82), 3),
            "test_rmse": round(lstm_metrics.get("test_rmse", 7.30), 3),
            "test_r2": round(lstm_metrics.get("test_r2", 0.045), 3),
        },
    }
