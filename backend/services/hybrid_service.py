from __future__ import annotations

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
import tensorflow as tf

BASE_DIR = Path(__file__).resolve().parent.parent
HYBRID_DIR = BASE_DIR / "model" / "hybrid_artifacts"

# Paths to artifacts
MODEL_PATH = HYBRID_DIR / "hybrid_model.keras"
SEQ_SCALER_PATH = HYBRID_DIR / "hybrid_sequence_scaler.pkl"
BASE_SCALER_PATH = HYBRID_DIR / "hybrid_baseline_scaler.pkl"
TARG_SCALER_PATH = HYBRID_DIR / "hybrid_target_scaler.pkl"
CONFIG_PATH = HYBRID_DIR / "hybrid_config.json"
METRICS_PATH = HYBRID_DIR / "evaluation_metrics.json"

for p in [MODEL_PATH, SEQ_SCALER_PATH, BASE_SCALER_PATH, TARG_SCALER_PATH, CONFIG_PATH]:
    if not p.exists():
        raise FileNotFoundError(f"Missing required Hybrid artifact at {p}")

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    hybrid_config = json.load(f)

hybrid_metrics = {}
if METRICS_PATH.exists():
    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        hybrid_metrics = json.load(f)

# Load model and scalers once at startup
hybrid_model = tf.keras.models.load_model(str(MODEL_PATH))
hybrid_sequence_scaler = joblib.load(str(SEQ_SCALER_PATH))
hybrid_baseline_scaler = joblib.load(str(BASE_SCALER_PATH))
hybrid_target_scaler = joblib.load(str(TARG_SCALER_PATH))

EXPECTED_TIMESTEPS = hybrid_config.get("timesteps", 3)
EXPECTED_SEQ_FEATURES = hybrid_config.get("sequence_features", ["aval", "ady"])
EXPECTED_BASE_FEATURES = hybrid_config.get("baseline_features", ["base"])


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
            "clinical_significance": "Significant renal impairment. Active nephrology management, progression slope assessment, and complication screening needed.",
            "risk_color": "red",
        }
    elif egfr >= 15.0:
        return {
            "stage": "Stage 4",
            "description": "Severely Decreased eGFR (15–29 mL/min/1.73m²)",
            "clinical_significance": "Severe loss of kidney function. Specialized nephrology care and renal replacement therapy preparation recommended.",
            "risk_color": "red",
        }
    else:
        return {
            "stage": "Stage 5",
            "description": "Kidney Failure / End-Stage (< 15 mL/min/1.73m²)",
            "clinical_significance": "Critical end-stage renal condition. Urgent clinical evaluation for dialysis or kidney transplantation required.",
            "risk_color": "red",
        }


def predict_egfr_hybrid(sequence: list[dict], baseline_egfr: float) -> dict:
    """
    Predict next observed eGFR using the trained Hybrid Dense + LSTM model.
    Expects:
      - sequence: 3 timesteps with fields 'aval' (eGFR) and 'ady' (day)
      - baseline_egfr: float scalar baseline eGFR ('base')
    """
    if len(sequence) != EXPECTED_TIMESTEPS:
        raise ValueError(
            f"Hybrid model requires exactly {EXPECTED_TIMESTEPS} historical timesteps, got {len(sequence)}."
        )

    if baseline_egfr < 0:
        raise ValueError(f"Baseline eGFR cannot be negative, got {baseline_egfr}.")

    # 1. Prepare and scale sequence features (aval, ady)
    seq_rows = []
    for step in sequence:
        row = {feat: float(step.get(feat, 0.0)) for feat in EXPECTED_SEQ_FEATURES}
        seq_rows.append(row)

    df_seq = pd.DataFrame(seq_rows, columns=EXPECTED_SEQ_FEATURES)
    scaled_seq_matrix = hybrid_sequence_scaler.transform(df_seq)
    scaled_seq = scaled_seq_matrix.reshape(1, EXPECTED_TIMESTEPS, len(EXPECTED_SEQ_FEATURES))

    # 2. Prepare and scale baseline feature (base)
    df_base = pd.DataFrame([{"base": float(baseline_egfr)}], columns=EXPECTED_BASE_FEATURES)
    scaled_base = hybrid_baseline_scaler.transform(df_base)

    # 3. Multi-input prediction: [sequence_input, baseline_input] (direct tensor call for rapid inference)
    pred_scaled = hybrid_model([scaled_seq, scaled_base], training=False).numpy()

    # 4. Invert scaling to obtain original eGFR units (mL/min/1.73m²)
    pred_egfr = float(hybrid_target_scaler.inverse_transform(pred_scaled)[0][0])
    pred_egfr = max(0.0, pred_egfr)

    stage_info = classify_kdigo_stage(pred_egfr)

    # Calculate multi-branch explainability
    try:
        from services.explainability import explain_hybrid_prediction
        explanation = explain_hybrid_prediction(scaled_seq, scaled_base, sequence, float(baseline_egfr), pred_egfr)
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
        "model_type": "Hybrid Dense + LSTM Regression",
        "predicted_egfr": round(pred_egfr, 2),
        "unit": "mL/min/1.73m²",
        "target_description": hybrid_config.get("prediction_target", "next observed eGFR (aval)"),
        "parameter_code": hybrid_config.get("selected_paramcd", "GFRBSCRT"),
        "kdigo_stage": stage_info["stage"],
        "stage_description": stage_info["description"],
        "kdigo_description": stage_info["description"],
        "clinical_significance": stage_info["clinical_significance"],
        "risk_color": stage_info["risk_color"],
        "timesteps_used": EXPECTED_TIMESTEPS,
        "sequence_features_used": EXPECTED_SEQ_FEATURES,
        "baseline_features_used": EXPECTED_BASE_FEATURES,
        "baseline_egfr": float(baseline_egfr),
        "input_sequence": sequence,
        "trajectory": trajectory,
        "explanation": explanation,
        "test_benchmarks": {
            "test_mae": round(hybrid_metrics.get("test_mae", 5.801), 3),
            "test_rmse": round(hybrid_metrics.get("test_rmse", 7.29), 3),
            "test_r2": round(hybrid_metrics.get("test_r2", 0.049), 3),
        },
    }
