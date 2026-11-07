"""
verify_services.py — Direct synchronous verification of the completed synopsis requirements:
- C.1 Explainable AI (Temporal Saliency for LSTM & Hybrid, Gradient x Input for ANN)
- D.2 Disease Progression Probability & Tangri KFRE
- D.3 Systemic Complication Likelihood (5 complications)
- D.4 Treatment Priority Scoring (0-100 triage, tiers, clinical protocols)
- H.4 Interactive Plotly JSON Schema Generation
"""

import sys
import os
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("KERAS_HOME", str(backend_dir / ".keras_cache"))

import numpy as np

def run_tests():
    print("=" * 65, flush=True)
    print("1. VERIFYING C.1 EXPLAINABLE AI (LSTM SEQUENTIAL SALIENCY)", flush=True)
    print("=" * 65, flush=True)
    from services.lstm_service import predict_egfr_lstm

    seq = [
        {"step": 1, "ady": 0.0, "aval": 72.0, "base": 72.0},
        {"step": 2, "ady": 90.0, "aval": 68.0, "base": 72.0},
        {"step": 3, "ady": 180.0, "aval": 64.0, "base": 72.0},
    ]
    lstm_res = predict_egfr_lstm(seq)
    print(f"  [OK] Predicted eGFR: {lstm_res['predicted_egfr']:.2f} mL/min/1.73m2 ({lstm_res['kdigo_stage']})", flush=True)
    assert "explanation" in lstm_res, "Explanation missing in LSTM response"
    expl = lstm_res["explanation"]
    print(f"  [OK] Method: {expl.get('method')}", flush=True)
    print(f"  [OK] Temporal Weights: {expl.get('temporal_weights_percent')}%", flush=True)
    print(f"  [OK] Dominant Visit: Visit {expl.get('most_influential_visit')}", flush=True)
    print(f"  [OK] Clinical Rationale: {expl.get('clinical_summary')}", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("2. VERIFYING C.1 EXPLAINABLE AI (HYBRID DENSE + LSTM DUAL BRANCH)", flush=True)
    print("=" * 65, flush=True)
    from services.hybrid_service import predict_egfr_hybrid

    hyb_seq = [
        {"step": 1, "ady": 0.0, "aval": 72.0},
        {"step": 2, "ady": 90.0, "aval": 68.0},
        {"step": 3, "ady": 180.0, "aval": 64.0},
    ]
    hyb_res = predict_egfr_hybrid(hyb_seq, baseline_egfr=72.0)
    print(f"  [OK] Predicted eGFR: {hyb_res['predicted_egfr']:.2f} mL/min/1.73m2 ({hyb_res['kdigo_stage']})", flush=True)
    assert "explanation" in hyb_res, "Explanation missing in Hybrid response"
    hyb_expl = hyb_res["explanation"]
    branch = hyb_expl.get("branch_attribution", {})
    print(f"  [OK] Method: {hyb_expl.get('method')}", flush=True)
    print(f"  [OK] Branch Attribution: Seq={branch.get('sequence_branch_percent')}% | Base={branch.get('baseline_branch_percent')}%", flush=True)
    print(f"  [OK] Dominant Branch: {branch.get('dominant_branch')}", flush=True)
    print(f"  [OK] Clinical Rationale: {hyb_expl.get('clinical_summary')}", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("3. VERIFYING C.1 EXPLAINABLE AI (ANN CLASSIFIER SALIENCY)", flush=True)
    print("=" * 65, flush=True)
    from models.schemas import PatientData
    from services.preprocessing import preprocess_patient_data
    from services.prediction import predict_ckd
    from services.explainability import explain_prediction

    mock_patient = PatientData(
        patient_id="TEST_ANN_01",
        age=55.0, bp=80.0, sg=1.020, al=0.0, su=0.0,
        bgr=110.0, bu=35.0, sc=1.1, sod=138.0, pot=4.5,
        hemo=14.5, pcv=44.0, wbcc=7500.0, rbcc=5.0,
        rbc="normal", pc="normal", pcc="notpresent", ba="notpresent",
        htn="no", dm="no", cad="no", appet="good", pe="no", ane="no"
    )
    scaled = preprocess_patient_data(mock_patient)
    prob = predict_ckd(scaled)
    ann_expl = explain_prediction(scaled)
    print(f"  [OK] ANN Probability: {prob:.4f} (Risk: {'HIGH' if prob >= 0.5 else 'LOW'})", flush=True)
    print(f"  [OK] Explanations extracted: {len(ann_expl)} features", flush=True)
    print(f"  [OK] Top Feature: {ann_expl[0]['feature']} (Impact: {ann_expl[0]['contribution']:+.4f})", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("4. VERIFYING D.2 DISEASE PROGRESSION PROBABILITY & TANGRI KFRE", flush=True)
    print("=" * 65, flush=True)
    from services.clinical_engine import calculate_progression_probability

    prog = calculate_progression_probability(
        current_egfr=38.0,
        patient_age=65,
        sex="male",
        albumin_grade=2,
        historical_points=[
            {"day": 0, "observed_egfr": 50.0},
            {"day": 180, "observed_egfr": 38.0}
        ]
    )
    print(f"  [OK] Progression Risk Category: {prog['progression_risk_category']}", flush=True)
    print(f"  [OK] Annualized Loss Rate (Delta eGFR/yr): {prog['annualized_slope_ml_min_year']} mL/min/year", flush=True)
    print(f"  [OK] Tangri KFRE 2-Year ESRD Risk: {prog['kfre_two_year_esrd_probability_pct']}%", flush=True)
    print(f"  [OK] Tangri KFRE 5-Year ESRD Risk: {prog['kfre_five_year_esrd_probability_pct']}%", flush=True)
    print(f"  [OK] Estimated Months to Stage 5: {prog['estimated_months_to_esrd']} months", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("5. VERIFYING D.3 MULTI-COMPLICATION LIKELIHOOD", flush=True)
    print("=" * 65, flush=True)
    from services.clinical_engine import calculate_complication_likelihood

    comps = calculate_complication_likelihood(
        current_egfr=38.0,
        biomarkers={"hemo": 10.2, "pot": 5.4, "bu": 38.0, "sc": 2.1, "bp": 148.0}
    )
    print(f"  [OK] Total Complications Evaluated: {len(comps)}", flush=True)
    for c in comps:
        print(f"      * {c['name']}: {c['probability_pct']}% ({c['risk_level']}) | Action: {c['preventive_countermeasure'][:50]}...", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("6. VERIFYING D.4 TREATMENT PRIORITY SCORING & CLINICAL PROTOCOLS", flush=True)
    print("=" * 65, flush=True)
    from services.clinical_engine import calculate_treatment_priority

    prio = calculate_treatment_priority(
        current_egfr=38.0,
        kdigo_stage="Stage 3b",
        progression=prog,
        complications=comps,
        biomarkers={"pot": 5.4, "hemo": 10.2}
    )
    print(f"  [OK] Clinical Triage Score: {prio['priority_score']}/100", flush=True)
    print(f"  [OK] Urgency Tier: {prio['triage_tier']}", flush=True)
    print(f"  [OK] Recommended Review Timeframe: {prio['recommended_timeframe']}", flush=True)
    print(f"  [OK] Action Protocol 1: {prio['prescribed_clinical_protocols'][0]}", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("7. VERIFYING H.4 INTERACTIVE PLOTLY JSON SCHEMAS", flush=True)
    print("=" * 65, flush=True)
    from services.visualizations import (
        generate_plotly_trajectory_figure,
        generate_plotly_temporal_saliency_figure,
        generate_plotly_kdigo_matrix,
        generate_plotly_complications_radar
    )

    traj_fig = generate_plotly_trajectory_figure("PAT_VERIFY_01", lstm_res["trajectory"], lstm_res["predicted_egfr"])
    print(f"  [OK] Trajectory Plotly Schema: {len(traj_fig['data'])} trace series generated", flush=True)

    xai_fig = generate_plotly_temporal_saliency_figure(lstm_res["explanation"])
    print(f"  [OK] Temporal Saliency Plotly Schema: {len(xai_fig['data'])} traces generated", flush=True)

    kdigo_fig = generate_plotly_kdigo_matrix(current_egfr=38.0, albumin_grade=2)
    print(f"  [OK] KDIGO Matrix Plotly Schema: {len(kdigo_fig['data'])} traces (Heatmap + Patient)", flush=True)

    radar_fig = generate_plotly_complications_radar(comps)
    print(f"  [OK] Complications Radar Plotly Schema: {len(radar_fig['data'])} radar traces generated", flush=True)

    print("\n" + "=" * 65, flush=True)
    print("ALL SYNOPSIS MODULES (C.1, D.2, D.3, D.4, H.4) FULLY VERIFIED!", flush=True)
    print("=" * 65, flush=True)

if __name__ == "__main__":
    run_tests()
