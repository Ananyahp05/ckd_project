"""
verify_all_endpoints.py — End-to-end verification of all models, explainability engines,
clinical intelligence calculations, and Plotly visualization payloads.
"""

import sys
import os
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("KERAS_HOME", str(backend_dir / ".keras_cache"))

import asyncio
from models.schemas import PatientData, LSTMPredictRequest, LSTMTimeStep, HybridPredictRequest, HybridSequenceStep
from models.db_models import User
from api.routes import predict, predict_lstm, predict_hybrid, get_models_info
from services.clinical_engine import (
    calculate_progression_probability,
    calculate_complication_likelihood,
    calculate_treatment_priority
)
from services.visualizations import (
    generate_plotly_trajectory_figure,
    generate_plotly_temporal_saliency_figure,
    generate_plotly_kdigo_matrix,
    generate_plotly_complications_radar
)

mock_doctor = User(id=1, username="test_doctor", role="Doctor", is_active=True)

async def run_full_suite():
    print("=" * 65, flush=True)
    print("CKD SYNOPSIS AUDIT VERIFICATION SUITE", flush=True)
    print("=" * 65, flush=True)

    # 1. Models Info
    print("\n--- TEST 1: GET /models/info ---", flush=True)
    info = await get_models_info()
    models = info.get("models", {})
    assert "ann" in models and "lstm" in models and "hybrid" in models, "Missing model in /models/info"
    for k, v in models.items():
        print(f"  [PASS] {k.upper()}: {v['name']} ({v.get('status', 'active')})", flush=True)

    # 2. LSTM eGFR Regression + Temporal Saliency XAI (C.1)
    print("\n--- TEST 2: LSTM Prediction + Temporal XAI (C.1) ---", flush=True)
    lstm_req = LSTMPredictRequest(
        patient_id="VERIFY_PATIENT_01",
        sequence=[
            LSTMTimeStep(step=1, ady=0.0, aval=72.0, base=72.0),
            LSTMTimeStep(step=2, ady=90.0, aval=68.0, base=72.0),
            LSTMTimeStep(step=3, ady=180.0, aval=64.0, base=72.0),
        ]
    )
    lstm_res = await predict_lstm(lstm_req, db=None, current_user=mock_doctor)
    assert "predicted_egfr" in lstm_res, "LSTM missing predicted_egfr"
    assert "explanation" in lstm_res, "LSTM missing explanation"
    assert "temporal_weights_percent" in lstm_res["explanation"], "LSTM missing temporal weights"
    print(f"  [PASS] Predicted eGFR: {lstm_res['predicted_egfr']:.2f} mL/min/1.73m2 ({lstm_res['kdigo_stage']})", flush=True)
    print(f"  [PASS] Temporal Weights (V1, V2, V3): {lstm_res['explanation']['temporal_weights_percent']}%", flush=True)
    print(f"  [PASS] Clinical Summary: {lstm_res['explanation']['clinical_summary']}", flush=True)

    # 3. Hybrid Dense + LSTM Regression + Dual-Branch XAI (C.1)
    print("\n--- TEST 3: Hybrid Prediction + Dual-Branch XAI (C.1) ---", flush=True)
    hybrid_req = HybridPredictRequest(
        patient_id="VERIFY_PATIENT_01",
        baseline_egfr=72.0,
        sequence=[
            HybridSequenceStep(step=1, ady=0.0, aval=72.0),
            HybridSequenceStep(step=2, ady=90.0, aval=68.0),
            HybridSequenceStep(step=3, ady=180.0, aval=64.0),
        ]
    )
    hybrid_res = await predict_hybrid(hybrid_req, db=None, current_user=mock_doctor)
    assert "predicted_egfr" in hybrid_res, "Hybrid missing predicted_egfr"
    assert "explanation" in hybrid_res, "Hybrid missing explanation"
    branch_attr = hybrid_res["explanation"]["branch_attribution"]
    print(f"  [PASS] Predicted eGFR: {hybrid_res['predicted_egfr']:.2f} mL/min/1.73m2 ({hybrid_res['kdigo_stage']})", flush=True)
    print(f"  [PASS] Branch Attribution: Seq={branch_attr['sequence_branch_percent']}% | Base={branch_attr['baseline_branch_percent']}%", flush=True)
    print(f"  [PASS] Clinical Summary: {hybrid_res['explanation']['clinical_summary']}", flush=True)

    # 4. ANN Binary Classification + Saliency XAI
    print("\n--- TEST 4: ANN Binary Classification + Saliency ---", flush=True)
    ann_req = PatientData(
        patient_id="VERIFY_PATIENT_01",
        age=58.0, bp=80.0, sg=1.020, al=0.0, su=0.0,
        bgr=110.0, bu=36.0, sc=1.1, sod=138.0, pot=4.4,
        hemo=14.2, pcv=42.0, wbcc=7200.0, rbcc=4.8,
        rbc="normal", pc="normal", pcc="notpresent", ba="notpresent",
        htn="no", dm="no", cad="no", appet="good", pe="no", ane="no"
    )
    ann_res = await predict(ann_req, db=None, current_user=mock_doctor)
    assert "prediction" in ann_res and "explanation" in ann_res, "ANN invalid response"
    print(f"  [PASS] Diagnosis: {ann_res['prediction']} (Risk: {ann_res['risk_score']:.1f}%, Level: {ann_res['risk_level']})", flush=True)
    print(f"  [PASS] Top Explaining Feature: {ann_res['explanation'][0]['feature']} ({ann_res['explanation'][0]['contribution']:+.4f})", flush=True)

    # 5. Disease Progression Engine (D.2)
    print("\n--- TEST 5: Disease Progression Engine (D.2) ---", flush=True)
    prog = calculate_progression_probability(current_egfr=42.0, patient_age=62, albumin_grade=2)
    assert "kfre_two_year_esrd_probability_pct" in prog, "D.2 missing KFRE 2-yr"
    assert "kfre_five_year_esrd_probability_pct" in prog, "D.2 missing KFRE 5-yr"
    print(f"  [PASS] KDIGO Progression Category: {prog['progression_category']}", flush=True)
    print(f"  [PASS] Annualized Loss Rate: {prog['annualized_slope_ml_min_year']} mL/min/year", flush=True)
    print(f"  [PASS] Tangri KFRE 2-Year ESRD Risk: {prog['kfre_two_year_esrd_probability_pct']}%", flush=True)
    print(f"  [PASS] Tangri KFRE 5-Year ESRD Risk: {prog['kfre_five_year_esrd_probability_pct']}%", flush=True)
    print(f"  [PASS] Projected Months to Stage 5: {prog['projected_months_to_stage_5']} months", flush=True)

    # 6. Complication Likelihood Engine (D.3)
    print("\n--- TEST 6: Complication Likelihood Engine (D.3) ---", flush=True)
    comps = calculate_complication_likelihood(
        current_egfr=42.0,
        biomarkers={"hemo": 10.5, "pot": 5.2, "bu": 34.0, "sc": 1.9, "bp": 145.0}
    )
    assert len(comps) == 5, f"Expected 5 systemic complications, got {len(comps)}"
    for c in comps:
        print(f"  [PASS] {c['name']}: {c['likelihood_pct']}% likelihood ({c['risk_level']})", flush=True)

    # 7. Treatment Priority Triage Scoring (D.4)
    print("\n--- TEST 7: Treatment Priority Scoring (D.4) ---", flush=True)
    triage = calculate_treatment_priority(
        current_egfr=42.0,
        kdigo_stage="Stage 3b",
        progression_data=prog,
        complications_data=comps,
        biomarkers={"pot": 5.2, "hemo": 10.5, "sc": 1.9}
    )
    assert "priority_score" in triage and "triage_tier" in triage, "D.4 missing score/tier"
    print(f"  [PASS] Clinical Triage Score: {triage['priority_score']}/100", flush=True)
    print(f"  [PASS] Urgency Tier: {triage['triage_tier']}", flush=True)
    print(f"  [PASS] Target Review Window: {triage['recommended_timeframe']}", flush=True)
    print(f"  [PASS] Action Protocol: {triage['action_protocol'][:70]}...", flush=True)

    # 8. Interactive Plotly Figures (H.4)
    print("\n--- TEST 8: Plotly Figure Generators (H.4) ---", flush=True)
    traj_fig = generate_plotly_trajectory_figure("TEST_PATIENT", lstm_res["trajectory"], "Stage 3a")
    assert "data" in traj_fig and "layout" in traj_fig, "Invalid Plotly Trajectory Schema"
    print(f"  [PASS] Trajectory Figure: {len(traj_fig['data'])} trace series generated", flush=True)

    xai_fig = generate_plotly_temporal_saliency_figure(lstm_res["explanation"])
    assert "data" in xai_fig and "layout" in xai_fig, "Invalid Plotly Temporal Saliency Schema"
    print(f"  [PASS] Temporal Saliency Figure: {len(xai_fig['data'])} trace series generated", flush=True)

    kdigo_fig = generate_plotly_kdigo_matrix(current_egfr=42.0, albumin_grade=2)
    assert "data" in kdigo_fig and "layout" in kdigo_fig, "Invalid Plotly KDIGO Matrix Schema"
    print(f"  [PASS] KDIGO 2D Matrix Heatmap Figure: {len(kdigo_fig['data'])} traces (Heatmap + Patient Coords)", flush=True)

    radar_fig = generate_plotly_complications_radar(comps)
    assert "data" in radar_fig and "layout" in radar_fig, "Invalid Plotly Complications Radar Schema"
    print(f"  [PASS] Complications Polar Radar Figure: {len(radar_fig['data'])} radar traces", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("ALL 8 VERIFICATION PHASES PASSED WITH ZERO ERRORS!", flush=True)
    print("=" * 65, flush=True)

if __name__ == "__main__":
    asyncio.run(run_full_suite())

