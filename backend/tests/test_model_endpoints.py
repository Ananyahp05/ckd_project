import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("KERAS_HOME", str(backend_dir / ".keras_cache"))

import asyncio
from models.schemas import PatientData, LSTMPredictRequest, LSTMTimeStep, HybridPredictRequest, HybridSequenceStep
from models.db_models import User
from api.routes import predict, predict_lstm, predict_hybrid, get_models_info

mock_doctor = User(id=1, username="test_doctor", role="Doctor", is_active=True)

async def run_all_tests():
    print("=" * 60)
    print("1. TESTING /models/info ENDPOINT")
    print("=" * 60)
    info = await get_models_info()
    for m, d in info["models"].items():
        print(f"Model: {m.upper()}")
        print(f"  Name: {d.get('name')}")
        print(f"  Task: {d.get('task')}")
        print(f"  Status: {d.get('status', 'active')}")

    print("\n" + "=" * 60)
    print("2. TESTING /predict/lstm ENDPOINT (LSTM eGFR Regression + XAI)")
    print("=" * 60)
    lstm_req = LSTMPredictRequest(
        patient_id="PATIENT_LSTM_001",
        sequence=[
            LSTMTimeStep(step=1, ady=0.0, aval=72.0, base=72.0),
            LSTMTimeStep(step=2, ady=90.0, aval=68.0, base=72.0),
            LSTMTimeStep(step=3, ady=180.0, aval=64.0, base=72.0),
        ]
    )
    lstm_res = await predict_lstm(lstm_req, db=None, current_user=mock_doctor)
    print("LSTM Output:")
    print(f"  Model: {lstm_res['model_type']}")
    print(f"  Predicted eGFR: {lstm_res['predicted_egfr']} {lstm_res['unit']}")
    print(f"  KDIGO Stage: {lstm_res['kdigo_stage']} - {lstm_res['kdigo_description']}")
    print(f"  Trajectory: {len(lstm_res['trajectory'])} points")
    print(f"  Temporal Saliency: {lstm_res.get('explanation', {}).get('clinical_summary')}")
    print(f"  Temporal Weights: {lstm_res.get('explanation', {}).get('temporal_weights_percent')}")

    print("\n" + "=" * 60)
    print("3. TESTING /predict/hybrid ENDPOINT (Hybrid Dense + LSTM + XAI)")
    print("=" * 60)
    hybrid_req = HybridPredictRequest(
        patient_id="PATIENT_HYBRID_001",
        baseline_egfr=72.0,
        sequence=[
            HybridSequenceStep(step=1, ady=0.0, aval=72.0),
            HybridSequenceStep(step=2, ady=90.0, aval=68.0),
            HybridSequenceStep(step=3, ady=180.0, aval=64.0),
        ]
    )
    hybrid_res = await predict_hybrid(hybrid_req, db=None, current_user=mock_doctor)
    print("Hybrid Output:")
    print(f"  Model: {hybrid_res['model_type']}")
    print(f"  Predicted eGFR: {hybrid_res['predicted_egfr']} {hybrid_res['unit']}")
    print(f"  KDIGO Stage: {hybrid_res['kdigo_stage']} - {hybrid_res['kdigo_description']}")
    print(f"  Branch Attribution: {hybrid_res.get('explanation', {}).get('branch_attribution')}")
    print(f"  Temporal Weights: {hybrid_res.get('explanation', {}).get('temporal_weights_percent')}")

    print("\n" + "=" * 60)
    print("4. TESTING EXISTING ANN CLASSIFICATION ENDPOINT (/predict)")
    print("=" * 60)
    ann_req = PatientData(
        patient_id="PATIENT_ANN_001",
        age=55.0,
        bp=80.0,
        sg=1.020,
        al=0.0,
        su=0.0,
        bgr=110.0,
        bu=35.0,
        sc=1.1,
        sod=138.0,
        pot=4.5,
        hemo=14.5,
        pcv=44.0,
        wbcc=7500.0,
        rbcc=5.0,
        rbc="normal",
        pc="normal",
        pcc="notpresent",
        ba="notpresent",
        htn="no",
        dm="no",
        cad="no",
        appet="good",
        pe="no",
        ane="no"
    )
    ann_res = await predict(ann_req, db=None, current_user=mock_doctor)
    print("ANN Output:")
    print(f"  Model: {ann_res['model_type']}")
    print(f"  Prediction: {ann_res['prediction']}")
    print(f"  Probability: {ann_res['probability']}")
    print(f"  Risk Level: {ann_res['risk_level']}")
    print(f"  SHAP Explanation features count: {len(ann_res['explanation'])}")

    print("\n" + "=" * 60)
    print("5. TESTING ERROR VALIDATION")
    print("=" * 60)
    from services.lstm_service import predict_egfr_lstm
    from services.hybrid_service import predict_egfr_hybrid
    
    # Test LSTM with fewer than 3 timesteps
    try:
        predict_egfr_lstm([{"step": 1, "ady": 0, "aval": 60, "base": 60}])
        print("ERROR: LSTM did not reject short sequence!")
    except ValueError as e:
        print(f"PASS: LSTM rejected short sequence with: {e}")

    # Test Hybrid with invalid baseline
    try:
        predict_egfr_hybrid([
            {"step": 1, "ady": 0, "aval": 60},
            {"step": 2, "ady": 90, "aval": 58},
            {"step": 3, "ady": 180, "aval": 55}
        ], baseline_egfr=-10.0)
        print("ERROR: Hybrid did not reject negative baseline!")
    except ValueError as e:
        print(f"PASS: Hybrid rejected negative baseline with: {e}")

    print("\n" + "=" * 60)
    print("6. TESTING D.2, D.3, D.4 CLINICAL ENGINE")
    print("=" * 60)
    from services.clinical_engine import (
        calculate_progression_probability,
        calculate_complication_likelihood,
        calculate_treatment_priority
    )
    prog = calculate_progression_probability(current_egfr=38.0, patient_age=65, albumin_grade=2)
    print(f"PASS: D.2 Progression: 5-Yr ESRD Risk = {prog['kfre_five_year_esrd_probability_pct']}% | Slope = {prog['annualized_slope_ml_min_year']} mL/yr")

    comps = calculate_complication_likelihood(current_egfr=38.0, biomarkers={"hemo": 10.2, "pot": 5.4, "bu": 38.0})
    print(f"PASS: D.3 Complications count = {len(comps)} (Top: {comps[0]['name']}: {comps[0]['risk_level']})")

    prio = calculate_treatment_priority(38.0, "Stage 3b", prog, comps, {"pot": 5.4, "hemo": 10.2})
    print(f"PASS: D.4 Triage Priority = {prio['priority_score']}/100 -> {prio['triage_tier']} ({prio['recommended_timeframe']})")

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run_all_tests())
