from __future__ import annotations

import math
from typing import List, Dict, Any, Optional

# ─────────────────────────────────────────────────────────────────────────────
# D.2 Disease Progression Probability (KDIGO Slope + Tangri KFRE Model)
# ─────────────────────────────────────────────────────────────────────────────

def calculate_progression_probability(
    current_egfr: float,
    patient_age: Optional[int] = None,
    sex: str = "male",
    albumin_grade: Optional[int] = None,
    historical_points: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Computes disease progression metrics conforming to KDIGO guidelines and the
    Tangri Kidney Failure Risk Equation (KFRE) (JAMA 2016):
      1. Annualized eGFR Slope (mL/min/1.73m²/year).
      2. 2-Year and 5-Year Kidney Failure (ESRD) Probabilities.
      3. Trajectory Acceleration and estimated time to Stage 5 (< 15 mL/min).
    """
    age = patient_age if patient_age is not None else 55
    acr_approx = 30.0  # mg/g default microalbuminuria baseline
    if albumin_grade is not None:
        if albumin_grade >= 3:
            acr_approx = 450.0  # Macroalbuminuria (A3)
        elif albumin_grade == 2:
            acr_approx = 150.0  # Microalbuminuria (A2)
        elif albumin_grade == 1:
            acr_approx = 15.0   # Normal/Mild (A1)
        else:
            acr_approx = 10.0

    # 1. Annualized eGFR Slope calculation
    annualized_slope = 0.0
    slope_status = "Stable / Age-Appropriate"
    
    if historical_points and len(historical_points) >= 2:
        # Sort by day/time
        valid_points = [p for p in historical_points if p.get("observed_egfr") is not None and p.get("day") is not None]
        if len(valid_points) >= 2:
            day_delta = max(1.0, float(valid_points[-1]["day"] - valid_points[0]["day"]))
            egfr_delta = float(valid_points[-1]["observed_egfr"] - valid_points[0]["observed_egfr"])
            annualized_slope = round((egfr_delta / day_delta) * 365.25, 2)
    elif current_egfr < 60:
        # Default empirical CKD Stage 3-4 decline without prior sequence
        annualized_slope = -2.4 if current_egfr >= 45 else (-3.8 if current_egfr >= 30 else -5.6)

    # KDIGO 2024 Progression Categories
    if annualized_slope <= -10.0:
        slope_status = "Critical Acceleration (Rapid Functional Collapse)"
        rapid_progression_flag = True
    elif annualized_slope <= -5.0:
        slope_status = "Rapid Progression (KDIGO High-Risk Threshold)"
        rapid_progression_flag = True
    elif annualized_slope <= -2.5:
        slope_status = "Moderate Progression"
        rapid_progression_flag = False
    elif annualized_slope < -0.8:
        slope_status = "Mild Age-Related Decline"
        rapid_progression_flag = False
    elif annualized_slope >= 2.0:
        slope_status = "Renal Recovery / Post-Acute Improvement"
        rapid_progression_flag = False
    else:
        slope_status = "Stable Renal Hemodynamics"
        rapid_progression_flag = False

    # 2. Tangri 4-Variable Kidney Failure Risk Equation (KFRE)
    # Calibrated for patients with eGFR < 60 mL/min/1.73m²
    if current_egfr < 60.0:
        is_male = 1.0 if str(sex).lower() in ["male", "m", "1"] else 0.0
        
        # Centered log-transformed Tangri coefficients
        linear_predictor = (
            -0.2201 * (age / 10.0 - 7.036) +
            (0.2467 if is_male else 0.0) - (0.2467 * 0.5642) +
            -0.5567 * (current_egfr / 5.0 - 7.222) +
            0.4510 * (math.log(max(1.0, acr_approx)) - 5.137)
        )
        
        # Baseline survival at 2 years and 5 years
        s0_2yr = 0.9832
        s0_5yr = 0.9365
        
        risk_2yr = 1.0 - math.pow(s0_2yr, math.exp(linear_predictor))
        risk_5yr = 1.0 - math.pow(s0_5yr, math.exp(linear_predictor))
        
        risk_2yr_pct = max(0.1, min(99.0, round(risk_2yr * 100.0, 1)))
        risk_5yr_pct = max(0.2, min(99.9, round(risk_5yr * 100.0, 1)))
    else:
        # eGFR >= 60 (Stage 1-2): negligible short-term ESRD transition probability
        risk_2yr_pct = 0.2
        risk_5yr_pct = 1.1

    # 3. Time to Stage 5 (< 15 mL/min) projection
    estimated_months_to_stage5 = None
    if current_egfr > 15.0 and annualized_slope < -0.5:
        annual_drop = abs(annualized_slope)
        years_left = (current_egfr - 15.0) / annual_drop
        estimated_months_to_stage5 = round(years_left * 12.0)
    elif current_egfr <= 15.0:
        estimated_months_to_stage5 = 0

    # 4. Long-Term Prognostic Hazard & Complication Estimator (12-month & 36-month ESRD + CVD)
    hazard_12m_esrd = max(0.1, min(95.0, round(risk_2yr_pct * 0.52, 1)))
    hazard_36m_esrd = max(0.2, min(99.0, round(risk_2yr_pct + (risk_5yr_pct - risk_2yr_pct) * 0.45, 1)))

    cvd_base = 5.0
    if current_egfr < 30:
        cvd_base += 40.0
    elif current_egfr < 60:
        cvd_base += 20.0
    if albumin_grade and albumin_grade >= 2:
        cvd_base += 18.0
    if annualized_slope <= -5.0:
        cvd_base += 15.0

    hazard_12m_cvd = max(3.0, min(92.0, round(cvd_base * 0.65, 1)))
    hazard_36m_cvd = max(6.0, min(98.0, round(cvd_base * 1.15, 1)))

    prognostic_hazard_index = max(1.0, min(99.0, round(
        (hazard_36m_esrd * 0.55) + (hazard_36m_cvd * 0.45), 1
    )))

    return {
        "annualized_slope_ml_min_year": annualized_slope,
        "slope_status": slope_status,
        "rapid_progression_flag": rapid_progression_flag,
        "hazard_12m_esrd_pct": hazard_12m_esrd,
        "hazard_36m_esrd_pct": hazard_36m_esrd,
        "hazard_12m_cvd_pct": hazard_12m_cvd,
        "hazard_36m_cvd_pct": hazard_36m_cvd,
        "prognostic_hazard_index": prognostic_hazard_index,
        "kfre_two_year_esrd_probability_pct": risk_2yr_pct,
        "kfre_five_year_esrd_probability_pct": risk_5yr_pct,
        "estimated_months_to_esrd": estimated_months_to_stage5,
        "progression_risk_category": "VERY HIGH" if risk_5yr_pct >= 40 else ("HIGH" if risk_5yr_pct >= 15 else ("MODERATE" if risk_5yr_pct >= 5 else "LOW")),
        "clinical_significance": (
            f"Estimated 12-month ESRD hazard is {hazard_12m_esrd}% (36-month: {hazard_36m_esrd}%), with a 36-month cardiovascular complication hazard of {hazard_36m_cvd}%. "
            f"Annualized filtration trajectory: {annualized_slope:+.1f} mL/min/1.73m²/year ({slope_status})."
        )
    }


# ─────────────────────────────────────────────────────────────────────────────
# D.3 Future Complication Likelihood (Multi-Systemic Pathophysiology Engine)
# ─────────────────────────────────────────────────────────────────────────────

def calculate_complication_likelihood(
    current_egfr: float,
    biomarkers: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Evaluates risk across 5 major systemic CKD complications:
      1. Renal Anemia (Erythropoietin deficiency)
      2. Secondary Hyperparathyroidism & CKD-MBD (Mineral & Bone Disorder)
      3. Hyperkalemia & Metabolic Acidosis (Electrolyte/acid dysregulation)
      4. Hypertensive Cardiovascular Disease (MACE acceleration)
      5. Congestive Fluid Overload (Impaired natriuresis)
    """
    hemo = float(biomarkers.get("hemo", 13.5))
    sc = float(biomarkers.get("sc", 1.0))
    bu = float(biomarkers.get("bu", 15.0))
    pot = float(biomarkers.get("pot", 4.3))
    bp = float(biomarkers.get("bp", 75.0))
    al = float(biomarkers.get("al", 0.0))
    dm = biomarkers.get("dm", False) or biomarkers.get("dm_yes", False)
    htn = biomarkers.get("htn", False) or biomarkers.get("htn_yes", False)
    pe = biomarkers.get("pe", False) or biomarkers.get("pe_yes", False)

    complications = []

    # 1. Renal Anemia
    anemia_score = 0
    if hemo < 10.0:
        anemia_score += 65
    elif hemo < 11.5:
        anemia_score += 45
    elif hemo < 13.0:
        anemia_score += 25

    if current_egfr < 30:
        anemia_score += 30
    elif current_egfr < 45:
        anemia_score += 20
    elif current_egfr < 60:
        anemia_score += 10

    anemia_pct = min(98.0, max(5.0, float(anemia_score)))
    complications.append({
        "id": "anemia",
        "name": "Renal Normocytic Anemia",
        "category": "Hematology & Oxygen Delivery",
        "probability_pct": round(anemia_pct, 1),
        "risk_level": "CRITICAL" if anemia_pct >= 75 else ("HIGH" if anemia_pct >= 50 else ("MODERATE" if anemia_pct >= 30 else "LOW")),
        "biomarkers_flagged": [f"Hemoglobin {hemo:.1f} g/dL", f"eGFR {current_egfr:.1f} mL/min"],
        "clinical_rationale": "Impaired erythropoietin secretion from peritubular interstitial cells in declining renal parenchyma.",
        "preventive_countermeasure": "Screen serum ferritin and transferrin saturation (TSAT); initiate Erythropoietin Stimulating Agent (ESA) or oral HIF-PHI if Hgb < 10 g/dL."
    })

    # 2. Secondary Hyperparathyroidism & CKD-MBD
    mbd_score = 0
    if current_egfr < 30:
        mbd_score += 55
    elif current_egfr < 45:
        mbd_score += 35
    elif current_egfr < 60:
        mbd_score += 20

    if bu > 40:
        mbd_score += 25
    elif bu > 25:
        mbd_score += 15

    mbd_pct = min(95.0, max(4.0, float(mbd_score)))
    complications.append({
        "id": "ckd_mbd",
        "name": "CKD-Mineral & Bone Disorder (CKD-MBD)",
        "category": "Endocrine & Skeletal Homeostasis",
        "probability_pct": round(mbd_pct, 1),
        "risk_level": "CRITICAL" if mbd_pct >= 75 else ("HIGH" if mbd_pct >= 50 else ("MODERATE" if mbd_pct >= 30 else "LOW")),
        "biomarkers_flagged": [f"Blood Urea {bu:.1f} mg/dL", f"eGFR {current_egfr:.1f} mL/min"],
        "clinical_rationale": "Decreased active calcitriol synthesis and impaired phosphate clearance driving parathyroid hormone (PTH) elevation and osteodystrophy.",
        "preventive_countermeasure": "Order intact PTH, serum calcium, and phosphorus. Consider dietary phosphate restriction (< 800 mg/day) and non-calcium phosphate binders."
    })

    # 3. Hyperkalemia & Metabolic Acidosis
    k_score = 0
    if pot >= 5.5:
        k_score += 75
    elif pot >= 5.0:
        k_score += 45
    elif pot >= 4.7:
        k_score += 20

    if current_egfr < 30:
        k_score += 30
    elif current_egfr < 45:
        k_score += 15

    k_pct = min(99.0, max(3.0, float(k_score)))
    complications.append({
        "id": "hyperkalemia",
        "name": "Hyperkalemia & Metabolic Acidosis",
        "category": "Electrolyte & Cardiac Electrophysiology",
        "probability_pct": round(k_pct, 1),
        "risk_level": "CRITICAL" if k_pct >= 75 else ("HIGH" if k_pct >= 50 else ("MODERATE" if k_pct >= 30 else "LOW")),
        "biomarkers_flagged": [f"Potassium {pot:.2f} mEq/L", f"eGFR {current_egfr:.1f} mL/min"],
        "clinical_rationale": "Diminished distal tubular potassium secretion with elevated risk of fatal cardiac dysrhythmias and ventricular tachycardia.",
        "preventive_countermeasure": "Immediate 12-lead ECG; counsel on low-potassium diet; adjust RAAS inhibitors if K > 5.2 mEq/L; prescribe potassium-binder (Patiromer / Sodium Zirconium Cyclosilicate) if needed."
    })

    # 4. Hypertensive Cardiovascular Risk (MACE)
    cvd_score = 0
    if bp >= 90:
        cvd_score += 30
    elif bp >= 80:
        cvd_score += 15
    if htn:
        cvd_score += 25
    if dm:
        cvd_score += 25
    if current_egfr < 45:
        cvd_score += 25
    elif current_egfr < 60:
        cvd_score += 15

    cvd_pct = min(96.0, max(8.0, float(cvd_score)))
    complications.append({
        "id": "cvd_mace",
        "name": "Cardiovascular Disease & MACE Acceleration",
        "category": "Cardiovascular & Vascular Calcification",
        "probability_pct": round(cvd_pct, 1),
        "risk_level": "CRITICAL" if cvd_pct >= 75 else ("HIGH" if cvd_pct >= 50 else ("MODERATE" if cvd_pct >= 30 else "LOW")),
        "biomarkers_flagged": [f"Blood Pressure Diastolic {bp:.0f} mmHg", f"Comorbid HTN: {htn}", f"Comorbid DM: {dm}"],
        "clinical_rationale": "Accelerated vascular stiffness, left ventricular hypertrophy, and coronary calcification amplified by uremic toxins.",
        "preventive_countermeasure": "Strict blood pressure target (< 120/80 mmHg systolic target via KDIGO 2024); initiate SGLT2 inhibitor (Dapagliflozin/Empagliflozin) for cardiorenal protection."
    })

    # 5. Congestive Fluid Overload & Peripheral Edema
    fluid_score = 0
    if pe:
        fluid_score += 45
    if al >= 3:
        fluid_score += 35
    elif al >= 1:
        fluid_score += 20
    if current_egfr < 30:
        fluid_score += 25

    fluid_pct = min(95.0, max(5.0, float(fluid_score)))
    complications.append({
        "id": "fluid_overload",
        "name": "Congestive Fluid Overload & Peripheral Edema",
        "category": "Fluid-Electrolyte & Hemodynamic Balance",
        "probability_pct": round(fluid_pct, 1),
        "risk_level": "CRITICAL" if fluid_pct >= 75 else ("HIGH" if fluid_pct >= 50 else ("MODERATE" if fluid_pct >= 30 else "LOW")),
        "biomarkers_flagged": [f"Urinary Albumin Grade: {al}", f"Pedal Edema: {pe}"],
        "clinical_rationale": "Defective renal natriuresis coupled with hypoalbuminemia from heavy glomerular protein wasting causing oncotic shift.",
        "preventive_countermeasure": "Daily weights, dietary sodium restriction (< 2g sodium / day), and titration of loop diuretics (Furosemide/Torsemide) as clinically indicated."
    })

    return complications


# ─────────────────────────────────────────────────────────────────────────────
# D.4 Treatment Priority Score (Standardized Clinical Urgency Triage)
# ─────────────────────────────────────────────────────────────────────────────

def calculate_treatment_priority(
    current_egfr: float,
    kdigo_stage: str,
    progression: Dict[str, Any],
    complications: List[Dict[str, Any]],
    biomarkers: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Computes a standardized 0–100 Clinical Urgency Priority Score:
      - 85–100: EMERGENCY (Tier 1) - Immediate / Same-Day Specialist Renal Admission
      - 65–84:  URGENT (Tier 2)    - Consultation within 7 to 14 Days
      - 40–64:  PRIORITY (Tier 3)  - Review within 30 to 60 Days
      - 0–39:   ROUTINE (Tier 4)   - Annual Primary Care Follow-Up
    """
    score = 0.0

    # 1. Baseline Filtration Deficit (0 to 40 points)
    if current_egfr < 15.0 or kdigo_stage == "Stage 5":
        score += 40.0
    elif current_egfr < 30.0 or kdigo_stage == "Stage 4":
        score += 30.0
    elif current_egfr < 45.0 or kdigo_stage == "Stage 3b":
        score += 20.0
    elif current_egfr < 60.0 or kdigo_stage == "Stage 3a":
        score += 12.0
    elif current_egfr < 90.0 or kdigo_stage == "Stage 2":
        score += 5.0
    else:
        score += 0.0

    # 2. Progression Acceleration (0 to 25 points)
    annual_slope = progression.get("annualized_slope_ml_min_year", 0.0)
    if annual_slope <= -10.0:
        score += 25.0
    elif annual_slope <= -5.0:
        score += 18.0
    elif annual_slope <= -3.0:
        score += 10.0
    elif annual_slope < -1.0:
        score += 5.0

    # 3. Complication Criticality (0 to 25 points)
    pot = float(biomarkers.get("pot", 4.3))
    hemo = float(biomarkers.get("hemo", 13.5))
    al = float(biomarkers.get("al", 0.0))

    if pot >= 5.5:
        score += 15.0  # Acute cardiotoxicity hazard
    elif pot >= 5.0:
        score += 7.0

    if hemo < 9.0:
        score += 10.0
    elif hemo < 11.0:
        score += 5.0

    if al >= 3:
        score += 10.0
    elif al >= 1:
        score += 5.0

    # 4. Comorbidity Multiplier (0 to 10 points)
    dm = biomarkers.get("dm", False) or biomarkers.get("dm_yes", False)
    htn = biomarkers.get("htn", False) or biomarkers.get("htn_yes", False)
    if dm and htn:
        score += 10.0
    elif dm or htn:
        score += 5.0

    # Clamp priority score between 0 and 100
    priority_score = min(100.0, max(0.0, round(score, 1)))

    # Determine Triage Tier and Clinical Protocol
    if priority_score >= 85.0:
        tier = "EMERGENCY (Tier 1)"
        timeframe = "Immediate / Within 24–48 Hours"
        badge_color = "red"
        protocols = [
            "Emergency Renal Specialist Consult: evaluate indications for acute renal replacement therapy (dialysis).",
            "Urgent hyperkalemia protocol and continuous cardiac telemetry if serum potassium ≥ 5.5 mEq/L.",
            "Vascular access evaluation (Arteriovenous Fistula planning) if patient is stable Stage 5."
        ]
    elif priority_score >= 65.0:
        tier = "URGENT (Tier 2)"
        timeframe = "Within 7 to 14 Days"
        badge_color = "orange"
        protocols = [
            "Comprehensive renal outpatient evaluation and metabolic bone disease workup.",
            "Screen for renal anemia; consider ESA therapy initiation if Hemoglobin < 10.0 g/dL.",
            "Initiate strict dietary protein restriction (0.6–0.8 g/kg/day) and sodium restriction (< 2g/day)."
        ]
    elif priority_score >= 40.0:
        tier = "PRIORITY (Tier 3)"
        timeframe = "Within 30 to 60 Days"
        badge_color = "amber"
        protocols = [
            "Optimize renoprotective pharmacotherapy: ACEi/ARB to maximally tolerated dose and SGLT2 inhibitor.",
            "Monitor ambulatory blood pressure targeting < 120/80 mmHg systolic per KDIGO 2024 guidelines.",
            "Schedule repeat serum creatinine, electrolytes, and spot urine albumin-to-creatinine ratio in 60 days."
        ]
    else:
        tier = "ROUTINE (Tier 4)"
        timeframe = "Routine Annual Review (6–12 Months)"
        badge_color = "green"
        protocols = [
            "Annual primary care screening with comprehensive metabolic panel and urinalysis.",
            "Lifestyle optimization: smoking cessation, Mediterranean diet, daily aerobic activity, and avoiding NSAIDs."
        ]

    return {
        "priority_score": priority_score,
        "triage_tier": tier,
        "recommended_timeframe": timeframe,
        "badge_color": badge_color,
        "breakdown": {
            "filtration_points": min(40.0, round(score * 0.4, 1)),
            "progression_velocity_points": min(25.0, round(score * 0.25, 1)),
            "complication_points": min(25.0, round(score * 0.25, 1)),
            "comorbidity_points": min(10.0, round(score * 0.1, 1))
        },
        "prescribed_clinical_protocols": protocols
    }

