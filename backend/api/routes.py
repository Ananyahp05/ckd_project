"""
routes.py — FastAPI prediction + WebSocket alert routes.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session
from typing import Optional
import json

from database import get_db
from models.db_models import (
    User, PredictionHistory, DoctorPatientAssignment,
    Hospital, PatientRecord, LabTest, LabRequest, AuditLog, Notification
)
from models.schemas import (
    PatientData, LSTMPredictRequest, HybridPredictRequest,
    AssignmentCreate, AssignmentOut,
    PatientRecordCreate, LabTestCreate, LabRequestCreate
)
from services.preprocessing import preprocess_patient_data
from services.prediction import predict_ckd
from services.explainability import (
    explain_prediction,
    explain_prediction_shap,
    explain_prediction_lime,
    explain_prediction_dual,
)
from services.alert_manager import alert_manager
from services.kafka_service import kafka_service
from services.fl_manager import fl_manager
from services.lstm_service import predict_egfr_lstm, lstm_config, lstm_metrics
from services.hybrid_service import predict_egfr_hybrid, hybrid_config, hybrid_metrics
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
from services.fhir_service import generate_fhir_bundle
from api.auth import get_optional_current_user, get_current_user, require_roles, log_audit_event
from pydantic import BaseModel, Field

router = APIRouter()

def check_and_register_doctor_patient_access(doctor: User, patient_id: str, db: Optional[Session]):
    """
    Strict Clinical RBAC:
    - Only doctors can enter and see clinical assessments.
    - If a patient has records under another physician, this doctor must be explicitly assigned by an Admin.
    - If new/unassigned, registers this doctor as the assigned physician.
    """
    if not db or not patient_id or patient_id == "Anonymous":
        return

    # Check if patient already has evaluations under a different doctor
    other_records = db.query(PredictionHistory).filter(
        PredictionHistory.patient_id == patient_id,
        PredictionHistory.owner_id.isnot(None),
        PredictionHistory.owner_id != doctor.id
    ).first()

    if other_records:
        assigned = db.query(DoctorPatientAssignment).filter(
            DoctorPatientAssignment.doctor_id == doctor.id,
            DoctorPatientAssignment.patient_id == patient_id
        ).first()

        if not assigned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Patient '{patient_id}' is under another physician's care. Access must be granted by an administrator."
            )
    else:
        assigned = db.query(DoctorPatientAssignment).filter(
            DoctorPatientAssignment.doctor_id == doctor.id,
            DoctorPatientAssignment.patient_id == patient_id
        ).first()
        if not assigned:
            db.add(DoctorPatientAssignment(
                doctor_id=doctor.id,
                patient_id=patient_id,
                assigned_by="Primary Consultation"
            ))
            db.commit()


class FLRunRequest(BaseModel):
    rounds: int = Field(default=3, ge=1, le=10)
    clients: int = Field(default=2, ge=2, le=5)


# ─────────────────────────────────────────────────────────────────────────────
# POST /predict (ANN Classification) - Doctor Only
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/predict", tags=["prediction"])
async def predict(
    data: PatientData,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Doctor"))
):
    """
    Run CKD risk prediction using the ANN classification engine.
    Restricted: Only verified Doctors are authorized to enter patient details and predict.
    """
    try:
        # Enforce doctor-patient assignment access
        check_and_register_doctor_patient_access(current_user, data.patient_id, db)

        # 1. Preprocess and scale inputs
        scaled_features = preprocess_patient_data(data)

        # 2. Predict probability
        probability = predict_ckd(scaled_features)

        # 3. Determine risk level
        risk_level       = "HIGH" if probability >= 0.5 else "LOW"
        prediction_label = "CKD"  if probability >= 0.5 else "Non-CKD"
        risk_score       = probability * 100.0

        # 4. Dual Explainable AI (SHAP & LIME)
        dual_xai = explain_prediction_dual(scaled_features)
        explanations = dual_xai["shap"]

        # 5. Broadcast real-time alert for HIGH-risk predictions (targeted to doctor)
        if risk_level == "HIGH":
            asyncio.create_task(
                alert_manager.broadcast_alert(
                    risk_score=risk_score,
                    prediction=prediction_label,
                    risk_level=risk_level,
                    top_features=explanations,
                    patient_age=data.age,
                    patient_id=data.patient_id,
                    doctor_id=current_user.id,
                )
            )

        # 5b. Stream clinical telemetry into Apache Kafka ('ckd.lab.events')
        asyncio.create_task(
            kafka_service.publish_lab_event(
                patient_id=str(data.patient_id or "UNKNOWN"),
                biomarker_data={
                    "age": data.age,
                    "blood_pressure": data.bp,
                    "blood_glucose_random": data.bgr,
                    "blood_urea": data.bu,
                    "serum_creatinine": data.sc,
                    "risk_score": round(risk_score, 2),
                    "prediction": prediction_label,
                }
            )
        )

        # 6. Save history to database
        input_dict = data.dict()
        input_dict.pop("patient_id", None)
        
        if db is not None:
            history_record = PredictionHistory(
                patient_id=data.patient_id,
                patient_age=data.age,
                risk_score=risk_score,
                prediction_label=prediction_label,
                input_features=input_dict,
                shap_values=explanations,
                owner_id=getattr(current_user, "id", None) if current_user else None
            )
            db.add(history_record)
            db.commit()

        return {
            "model_type": "ANN Classification",
            "prediction": prediction_label,
            "probability": probability,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "explanation": explanations,
            "xai": dual_xai,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# POST /predict/dual-xai (Dual Explainable AI: SHAP + LIME)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/predict/dual-xai", tags=["xai"])
def get_dual_xai_endpoint(
    data: PatientData,
    current_user: User = Depends(require_roles("Doctor", "Admin", "Patient"))
):
    """
    Computes Dual XAI: SHAP game-theoretic feature attributions alongside
    LIME local surrogate perturbation weights, highlighting consensus features.
    """
    scaled = preprocess_patient_data(data)
    return explain_prediction_dual(scaled)


# ─────────────────────────────────────────────────────────────────────────────
# POST /predict/lstm (LSTM eGFR Regression) - Doctor Only
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/predict/lstm", tags=["prediction"])
async def predict_lstm(
    data: LSTMPredictRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Doctor"))
):
    """
    Predict next observed eGFR value using the sequential LSTM regression engine.
    Restricted: Only verified Doctors are authorized to enter patient details and predict.
    """
    try:
        # Enforce doctor-patient assignment access
        check_and_register_doctor_patient_access(current_user, data.patient_id, db)

        patient_id = data.patient_id
        seq_dicts = [step.dict() for step in data.sequence]

        result = predict_egfr_lstm(seq_dicts)
        result["patient_id"] = patient_id

        if db is not None:
            history_record = PredictionHistory(
                patient_id=patient_id,
                patient_age=None,
                risk_score=result["predicted_egfr"],
                prediction_label=f"eGFR {result['predicted_egfr']} ({result['kdigo_stage']})",
                input_features={"model": "LSTM", "sequence": seq_dicts},
                shap_values=[],
                owner_id=current_user.id
            )
            db.add(history_record)
            db.commit()

        # Trigger real-time alert if severely impaired (Stage 4 or 5)
        if result["kdigo_stage"] in ["Stage 4", "Stage 5"]:
            asyncio.create_task(
                alert_manager.broadcast_alert(
                    risk_score=result["predicted_egfr"],
                    prediction=f"eGFR {result['predicted_egfr']} ({result['kdigo_stage']})",
                    risk_level="CRITICAL",
                    top_features=[{"feature": "eGFR decline", "contribution": -0.5}],
                    patient_age=None,
                    patient_id=patient_id,
                    doctor_id=current_user.id,
                )
            )

        return result

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# POST /predict/hybrid (Hybrid Dense + LSTM eGFR Regression) - Doctor Only
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/predict/hybrid", tags=["prediction"])
async def predict_hybrid(
    data: HybridPredictRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Doctor"))
):
    """
    Predict next observed eGFR value using the multi-input Hybrid Dense + LSTM engine.
    Restricted: Only verified Doctors are authorized to enter patient details and predict.
    """
    try:
        # Enforce doctor-patient assignment access
        check_and_register_doctor_patient_access(current_user, data.patient_id, db)

        patient_id = data.patient_id
        seq_dicts = [step.dict() for step in data.sequence]

        result = predict_egfr_hybrid(seq_dicts, data.baseline_egfr)
        result["patient_id"] = patient_id

        # Save to diagnosis history
        if db is not None:
            history_record = PredictionHistory(
                patient_id=patient_id,
                patient_age=None,
                risk_score=result["predicted_egfr"],
                prediction_label=f"eGFR {result['predicted_egfr']} ({result['kdigo_stage']})",
                input_features={"model": "Hybrid", "sequence": seq_dicts, "baseline_egfr": data.baseline_egfr},
                shap_values=[],
                owner_id=current_user.id
            )
            db.add(history_record)
            db.commit()

        # Trigger real-time alert if severely impaired (Stage 4 or 5)
        if result["kdigo_stage"] in ["Stage 4", "Stage 5"]:
            asyncio.create_task(
                alert_manager.broadcast_alert(
                    risk_score=result["predicted_egfr"],
                    prediction=f"eGFR {result['predicted_egfr']} ({result['kdigo_stage']})",
                    risk_level="CRITICAL",
                    top_features=[{"feature": "eGFR decline", "contribution": -0.5}],
                    patient_age=None,
                    patient_id=patient_id,
                    doctor_id=current_user.id,
                )
            )

        return result

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# GET /models/info (Inspection Endpoint for all 3 models)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/models/info", tags=["models"])
async def get_models_info():
    """
    Returns deployment status, architecture metadata, and test evaluation metrics
    for all 3 models: ANN Classification, LSTM Regression, and Hybrid Regression.
    """
    return {
        "models": {
            "ann": {
                "name": "Artificial Neural Network (MLP)",
                "task": "CKD Classification (Binary)",
                "target": "CKD vs Non-CKD",
                "input_features_count": 34,
                "framework": "TensorFlow / Keras",
                "status": "loaded and active",
            },
            "lstm": {
                "name": "Long Short-Term Memory (LSTM)",
                "task": "eGFR Regression",
                "target": lstm_config.get("prediction_target", "next observed eGFR (aval)"),
                "timesteps": lstm_config.get("timesteps", 3),
                "features": lstm_config.get("input_features", ["aval", "ady", "base"]),
                "test_mae": lstm_metrics.get("test_mae", 5.82),
                "test_rmse": lstm_metrics.get("test_rmse", 7.30),
                "status": "loaded and active",
            },
            "hybrid": {
                "name": "Hybrid Dense + LSTM",
                "task": "eGFR Regression",
                "target": hybrid_config.get("prediction_target", "next observed eGFR (aval)"),
                "timesteps": hybrid_config.get("timesteps", 3),
                "sequence_features": hybrid_config.get("sequence_features", ["aval", "ady"]),
                "baseline_features": hybrid_config.get("baseline_features", ["base"]),
                "test_mae": hybrid_metrics.get("test_mae", 5.80),
                "test_rmse": hybrid_metrics.get("test_rmse", 7.29),
                "status": "loaded and active",
            },
        }
    }



# ─────────────────────────────────────────────────────────────────────────────
# GET /ws/alerts  (WebSocket)
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time CKD risk alerts.
    """
    await alert_manager.connect(websocket)

    try:
        await websocket.send_json({
            "type": "connected",
            "message": "Real-time alert stream active.",
            "active_connections": alert_manager.connection_count,
        })

        while True:
            await asyncio.sleep(25)
            await alert_manager.broadcast_ping()

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[WS] Unexpected error: {exc}")
    finally:
        await alert_manager.disconnect(websocket)


# ─────────────────────────────────────────────────────────────────────────────
# GET /ws/status  (REST health check for WS subsystem)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ws/status", tags=["alerts"])
def ws_status():
    """Returns the current number of active WebSocket connections."""
    return {
        "active_connections": alert_manager.connection_count,
        "status": "ok",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Apache Kafka Real-Time Streaming Telemetry & Diagnostics
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/kafka/status", tags=["kafka"])
def kafka_status():
    """Returns the live connection status, broker address, and topic telemetry for Apache Kafka."""
    return kafka_service.get_status()


@router.post("/kafka/test-event", tags=["kafka"])
async def kafka_test_event():
    """Publishes a test clinical alert to verify live Apache Kafka event dispatching."""
    success = await kafka_service.publish_critical_alert({
        "message": "Manual test event dispatched from EDCIF API",
        "severity": "TEST_ALERT",
        "patient_id": "TEST-MRN-999"
    })
    return {
        "status": "success" if success else "fallback_recorded",
        "kafka_connected": kafka_service._is_connected,
        "broker": kafka_service.bootstrap_servers
    }


# ─────────────────────────────────────────────────────────────────────────────
# Federated Learning routes (RBAC-protected)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/federated/run", tags=["federated"])
async def run_federated(
    req: FLRunRequest,
    current_user: User = Depends(require_roles("Admin"))
):
    """
    RBAC: Admin-only. Triggers the Flower Federated Learning simulation in background thread.
    """
    status = fl_manager.get_status()
    if status["status"] == "running":
        raise HTTPException(
            status_code=400,
            detail="A federated learning simulation is already running."
        )

    fl_manager.run_in_background(
        num_rounds=req.rounds,
        num_clients=req.clients,
        save_path=str(Path(__file__).resolve().parent.parent / "model" / "ckd_model_federated.keras")
    )

    return {
        "status": "started",
        "message": f"Federated Learning simulation started with {req.clients} clients for {req.rounds} rounds."
    }


@router.get("/federated/status", tags=["federated"])
def get_federated_status(
    current_user: User = Depends(require_roles("Admin", "Doctor"))
):
    """
    RBAC: Admin & Doctor. Retrieves the current status, training round history, and logs.
    """
    return fl_manager.get_status()


# ─────────────────────────────────────────────────────────────────────────────
# Diagnosis History & Global SHAP routes (RBAC-protected)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/predictions/history", tags=["prediction"])
def get_prediction_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves prediction history with strict clinical RBAC enforcement:
    - Admin: Full audit trail of all patient diagnoses across all doctors.
    - Doctor: Only sees patients assigned to this doctor (or evaluated by them).
    - Patient: Confined exclusively to records associated with their Patient ID.
    """
    if current_user.role == "Admin":
        history = db.query(PredictionHistory).order_by(PredictionHistory.created_at.desc()).all()
    elif current_user.role == "Doctor":
        # Only assigned doctors see their patient records
        assigned = db.query(DoctorPatientAssignment.patient_id).filter(
            DoctorPatientAssignment.doctor_id == current_user.id
        ).all()
        assigned_ids = [a[0] for a in assigned]
        history = db.query(PredictionHistory).filter(
            (PredictionHistory.owner_id == current_user.id) |
            (PredictionHistory.patient_id.in_(assigned_ids))
        ).order_by(PredictionHistory.created_at.desc()).all()
    elif current_user.role == "Patient":
        history = db.query(PredictionHistory).filter(
            (PredictionHistory.patient_id.ilike(current_user.username)) |
            (PredictionHistory.owner_id == current_user.id)
        ).order_by(PredictionHistory.created_at.desc()).all()
    else:
        history = []
    return history


@router.get("/predictions/patient-summary", tags=["patient"])
def get_patient_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Patient", "Doctor", "Admin")),
    patient_id: Optional[str] = None
):
    """
    RBAC: Patient (own view), Doctor, Admin.
    Retrieves personalized patient summary, longitudinal vital trajectory, and lifestyle advice.
    """
    target_id = current_user.username if current_user.role == "Patient" else (patient_id or current_user.username)
    if current_user.role == "Patient":
        records = db.query(PredictionHistory).filter(
            PredictionHistory.patient_id.ilike(current_user.username)
        ).order_by(PredictionHistory.created_at.asc()).all()
    else:
        records = db.query(PredictionHistory).filter(
            PredictionHistory.patient_id.ilike(target_id)
        ).order_by(PredictionHistory.created_at.asc()).all()

    if not records:
        return {
            "patient_id": target_id,
            "total_assessments": 0,
            "latest_record": None,
            "trajectory": [],
            "lifestyle_guidelines": [
                "Maintain healthy hydration: drink approx. 2 liters of water daily unless advised otherwise.",
                "Sodium moderation: avoid processed foods; maintain daily salt intake under 2 grams.",
                "Schedule a clinical evaluation with your attending renal specialist or physician."
            ]
        }

    latest = records[-1]
    trajectory = [
        {
            "id": r.id,
            "date": r.created_at.isoformat() if r.created_at else None,
            "risk_score": r.risk_score,
            "severity": r.prediction_label,
            "creatinine": (r.input_features or {}).get("sc"),
            "bp": (r.input_features or {}).get("bp"),
            "glucose": (r.input_features or {}).get("bgr"),
        }
        for r in records
    ]

    features = latest.input_features or {}
    guidelines = []
    if features.get("htn_yes") or (features.get("bp", 0) > 85):
        guidelines.append("Cardiovascular Care: Blood pressure control is vital. Monitor daily and aim for < 130/80 mmHg.")
    if features.get("dm_yes") or (features.get("bgr", 0) > 140):
        guidelines.append("Diabetes Management: Control blood glucose to preserve renal microvascular health.")
    if features.get("sc", 0) > 1.4:
        guidelines.append("Kidney Function Alert: Serum creatinine is elevated. Request an eGFR panel from your doctor.")
    if features.get("pot", 0) > 5.0:
        guidelines.append("Electrolyte Caution: Potassium is on the high side. Moderate high-potassium fruits and vegetables.")
    if not guidelines:
        guidelines.append("Maintenance: Continue regular physical activity, keep hydrated, and avoid overuse of NSAID painkillers.")

    return {
        "patient_id": target_id,
        "total_assessments": len(records),
        "latest_record": {
            "date": latest.created_at.isoformat() if latest.created_at else None,
            "risk_score": latest.risk_score,
            "severity": latest.prediction_label,
            "patient_age": latest.patient_age,
            "key_vitals": {
                "bp": features.get("bp"),
                "creatinine": features.get("sc"),
                "urea": features.get("bu"),
                "hemoglobin": features.get("hemo"),
            }
        },
        "trajectory": trajectory,
        "lifestyle_guidelines": guidelines,
    }


@router.get("/explanations/global", tags=["explainability"])
def get_global_explanations(db: Session = Depends(get_db)):
    """
    Aggregates SHAP feature importances dynamically from all database history.
    """
    records = db.query(PredictionHistory).all()
    
    global_importances = {}
    for rec in records:
        shaps = rec.shap_values
        if isinstance(shaps, list):
            for entry in shaps:
                feat = entry.get("feature")
                contrib = entry.get("contribution", 0.0)
                if feat:
                    global_importances[feat] = global_importances.get(feat, 0.0) + abs(contrib)
                    
    if global_importances:
        sorted_importances = sorted(
            [{"feature": k, "importance": v / len(records)} for k, v in global_importances.items()],
            key=lambda x: x["importance"],
            reverse=True
        )
        return sorted_importances[:15]
        
    fallback = [
        {"feature": "hemo", "importance": 0.285},
        {"feature": "sc", "importance": 0.244},
        {"feature": "sg", "importance": 0.198},
        {"feature": "al", "importance": 0.176},
        {"feature": "pcv", "importance": 0.145},
        {"feature": "htn_yes", "importance": 0.122},
        {"feature": "dm_yes", "importance": 0.108},
        {"feature": "bgr", "importance": 0.089},
        {"feature": "bp", "importance": 0.075},
        {"feature": "bu", "importance": 0.063},
        {"feature": "sod", "importance": 0.052},
        {"feature": "age", "importance": 0.045},
        {"feature": "pot", "importance": 0.038},
        {"feature": "wbcc", "importance": 0.029},
        {"feature": "rbcc", "importance": 0.021}
    ]
    return fallback


# ── Doctor-Patient Assignment Endpoints (Admin Controlled) ───────────────────

@router.get("/admin/assignments", tags=["admin"])
def get_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Admin"))
):
    """Admin-only: Retrieve all active doctor-patient access assignments."""
    assignments = db.query(DoctorPatientAssignment).order_by(DoctorPatientAssignment.created_at.desc()).all()
    out = []
    for a in assignments:
        doc = db.query(User).filter(User.id == a.doctor_id).first()
        out.append({
            "id": a.id,
            "doctor_id": a.doctor_id,
            "doctor_username": doc.username if doc else f"Doctor #{a.doctor_id}",
            "patient_id": a.patient_id,
            "assigned_by": a.assigned_by,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return out


@router.post("/admin/assignments", tags=["admin"])
def assign_patient_to_doctor(
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Admin"))
):
    """Admin-only: Delegate/grant a doctor access to a specific patient's clinical file."""
    doc = db.query(User).filter(User.id == payload.doctor_id, User.role == "Doctor").first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor with specified ID was not found")

    patient_id_clean = payload.patient_id.strip()
    existing = db.query(DoctorPatientAssignment).filter(
        DoctorPatientAssignment.doctor_id == payload.doctor_id,
        DoctorPatientAssignment.patient_id == patient_id_clean
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Patient '{patient_id_clean}' is already assigned to Dr. {doc.username}")

    assign = DoctorPatientAssignment(
        doctor_id=payload.doctor_id,
        patient_id=patient_id_clean,
        assigned_by=current_user.username
    )
    db.add(assign)
    db.commit()
    db.refresh(assign)
    return {
        "status": "success",
        "message": f"Successfully granted Dr. {doc.username} access to patient '{patient_id_clean}'.",
        "id": assign.id
    }


@router.delete("/admin/assignments/{assignment_id}", tags=["admin"])
def revoke_patient_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Admin"))
):
    """Admin-only: Revoke a doctor's access to a patient record."""
    assign = db.query(DoctorPatientAssignment).filter(DoctorPatientAssignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment record not found")
    db.delete(assign)
    db.commit()
    return {"status": "success", "message": "Assignment revoked successfully."}


@router.get("/admin/doctors-list", tags=["admin"])
def list_active_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Admin"))
):
    """Admin-only: List all active doctors available for assignment."""
    docs = db.query(User).filter(User.role == "Doctor", User.is_active == True).all()
    return [{"id": d.id, "username": d.username} for d in docs]


@router.get("/admin/patients-list", tags=["admin"])
def list_system_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Admin", "Doctor"))
):
    """List unique registered patients and evaluated patient IDs with doctor isolation."""
    if current_user.role == "Doctor":
        assigned = [a[0] for a in db.query(DoctorPatientAssignment.patient_id).filter(DoctorPatientAssignment.doctor_id == current_user.id).all()]
        evaluated = [r[0] for r in db.query(PredictionHistory.patient_id).filter(PredictionHistory.owner_id == current_user.id).distinct().all()]
        all_p = sorted(list(set(assigned + evaluated)))
        return all_p
    reg = [u.username for u in db.query(User).filter(User.role == "Patient").all()]
    hist = [r[0] for r in db.query(PredictionHistory.patient_id).distinct().all() if r[0] and r[0] != "Anonymous"]
    all_p = sorted(list(set(reg + hist)))
    return all_p


# ─────────────────────────────────────────────────────────────────────────────
# GET /predictions/patient-ehr/{patient_id} (Unified Patient EHR & Consensus)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/predictions/patient-ehr/{patient_id}", tags=["patient"])
def get_patient_ehr(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Doctor", "Admin", "Patient"))
):
    """
    Unified Patient EHR Chart & Multi-Model Consensus:
    - Strictly checks RBAC permission (Doctor must be assigned/have records, Patient must own record).
    - Assembles latest ANN classification, LSTM regression, and Hybrid regression.
    - Computes consensus diagnosis, longitudinal eGFR points, KDIGO staging, and full biomarker table.
    """
    clean_id = patient_id.strip()

    # 1. RBAC Access Control
    if current_user.role == "Patient":
        if current_user.username.lower() != clean_id.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only view your own patient EHR chart."
            )
    elif current_user.role == "Doctor":
        has_records = db.query(PredictionHistory).filter(
            PredictionHistory.patient_id.ilike(clean_id),
            PredictionHistory.owner_id == current_user.id
        ).first()
        has_assignment = db.query(DoctorPatientAssignment).filter(
            DoctorPatientAssignment.doctor_id == current_user.id,
            DoctorPatientAssignment.patient_id.ilike(clean_id)
        ).first()
        if not has_records and not has_assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Patient '{clean_id}' is not assigned to your clinical care."
            )

    # 2. Query all historical records for this patient
    records = db.query(PredictionHistory).filter(
        PredictionHistory.patient_id.ilike(clean_id)
    ).order_by(PredictionHistory.created_at.asc()).all()

    # Check assigned doctor
    assignment = db.query(DoctorPatientAssignment).filter(
        DoctorPatientAssignment.patient_id.ilike(clean_id)
    ).first()
    assigned_doc_name = None
    if assignment:
        doc = db.query(User).filter(User.id == assignment.doctor_id).first()
        if doc:
            assigned_doc_name = doc.username

    if not records:
        return {
            "patient_id": clean_id,
            "patient_age": None,
            "assigned_doctor": assigned_doc_name or "Unassigned",
            "total_records": 0,
            "latest_ann": None,
            "latest_lstm": None,
            "latest_hybrid": None,
            "consensus": {
                "risk_score": 0.0,
                "risk_level": "UNKNOWN",
                "diagnosis": "No Assessment on Record",
                "predicted_egfr": None,
                "kdigo_stage": "Unclassified",
                "kdigo_description": "No longitudinal data available",
                "trajectory_status": "No Data",
                "concordance": "Inconclusive",
                "clinical_action": "Complete a baseline clinical assessment to populate the patient chart."
            },
            "longitudinal_egfr": [],
            "biomarkers_panel": [],
            "history_timeline": []
        }

    # Partition by model type
    ann_records = []
    lstm_records = []
    hybrid_records = []

    for r in records:
        feats = r.input_features or {}
        model_type = feats.get("model")
        if model_type == "LSTM":
            lstm_records.append(r)
        elif model_type == "Hybrid":
            hybrid_records.append(r)
        else:
            ann_records.append(r)

    latest_ann = ann_records[-1] if ann_records else None
    latest_lstm = lstm_records[-1] if lstm_records else None
    latest_hybrid = hybrid_records[-1] if hybrid_records else None

    # Derive patient age
    patient_age = None
    for r in reversed(records):
        if r.patient_age is not None:
            patient_age = r.patient_age
            break
        elif (r.input_features or {}).get("age") is not None:
            patient_age = (r.input_features or {}).get("age")
            break

    # Build Biomarker Panel from latest ANN record
    biomarkers_panel = []
    reference_ranges = {
        "sc":   {"name": "Serum Creatinine", "unit": "mg/dL", "min": 0.6, "max": 1.2, "cat": "Renal Function"},
        "bu":   {"name": "Blood Urea", "unit": "mg/dL", "min": 7.0, "max": 20.0, "cat": "Renal Function"},
        "bp":   {"name": "Blood Pressure (Diastolic)", "unit": "mmHg", "min": 60.0, "max": 80.0, "cat": "Cardiovascular"},
        "bgr":  {"name": "Blood Glucose (Random)", "unit": "mg/dL", "min": 70.0, "max": 140.0, "cat": "Metabolic"},
        "hemo": {"name": "Hemoglobin", "unit": "g/dL", "min": 13.0, "max": 17.0, "cat": "Hematology"},
        "pcv":  {"name": "Packed Cell Volume (PCV)", "unit": "%", "min": 39.0, "max": 54.0, "cat": "Hematology"},
        "sod":  {"name": "Sodium", "unit": "mEq/L", "min": 136.0, "max": 145.0, "cat": "Electrolytes"},
        "pot":  {"name": "Potassium", "unit": "mEq/L", "min": 3.5, "max": 5.0, "cat": "Electrolytes"},
        "sg":   {"name": "Specific Gravity", "unit": "", "min": 1.005, "max": 1.030, "cat": "Urinalysis"},
        "al":   {"name": "Albumin", "unit": "(0-5)", "min": 0.0, "max": 1.0, "cat": "Urinalysis"},
        "su":   {"name": "Sugar", "unit": "(0-5)", "min": 0.0, "max": 0.0, "cat": "Urinalysis"},
        "wbcc": {"name": "WBC Count", "unit": "/µL", "min": 4000.0, "max": 11000.0, "cat": "Hematology"},
        "rbcc": {"name": "RBC Count", "unit": "M/µL", "min": 4.5, "max": 6.0, "cat": "Hematology"},
    }

    if latest_ann and latest_ann.input_features:
        feats = latest_ann.input_features
        for key, ref in reference_ranges.items():
            if key in feats and feats[key] is not None:
                val = float(feats[key])
                status_label = "NORMAL"
                if val < ref["min"]:
                    status_label = "LOW"
                elif val > ref["max"]:
                    status_label = "ELEVATED"
                if key == "sc" and val >= 1.5:
                    status_label = "CRITICAL"
                elif key == "pot" and (val >= 5.5 or val <= 3.0):
                    status_label = "CRITICAL"

                biomarkers_panel.append({
                    "key": key,
                    "name": ref["name"],
                    "value": round(val, 2),
                    "unit": ref["unit"],
                    "reference": f"{ref['min']} - {ref['max']} {ref['unit']}".strip(),
                    "category": ref["cat"],
                    "status": status_label,
                })

    # Longitudinal eGFR curve assembly
    longitudinal_egfr = []
    seq_source = None
    if latest_lstm and (latest_lstm.input_features or {}).get("sequence"):
        seq_source = latest_lstm.input_features["sequence"]
    elif latest_hybrid and (latest_hybrid.input_features or {}).get("sequence"):
        seq_source = latest_hybrid.input_features["sequence"]

    if seq_source and isinstance(seq_source, list):
        for step in seq_source:
            longitudinal_egfr.append({
                "label": f"Visit {step.get('step', 1)} (Day {int(step.get('ady', 0))})",
                "day": int(step.get("ady", 0)),
                "observed_egfr": round(float(step.get("aval", 0)), 1),
                "lstm_projected": None,
                "hybrid_projected": None,
                "type": "observed"
            })
        last_day = int(seq_source[-1].get("ady", 180)) + 90
        longitudinal_egfr.append({
            "label": f"Forecast (Day {last_day})",
            "day": last_day,
            "observed_egfr": None,
            "lstm_projected": round(float(latest_lstm.risk_score), 1) if latest_lstm else None,
            "hybrid_projected": round(float(latest_hybrid.risk_score), 1) if latest_hybrid else None,
            "type": "projected"
        })
    else:
        for idx, rec in enumerate(records):
            feats = rec.input_features or {}
            m_type = feats.get("model", "ANN")
            val = rec.risk_score
            date_label = rec.created_at.strftime("%b %d") if rec.created_at else f"Visit #{idx+1}"
            if m_type in ["LSTM", "Hybrid"]:
                longitudinal_egfr.append({
                    "label": f"{date_label} ({m_type})",
                    "day": idx * 60,
                    "observed_egfr": None,
                    "lstm_projected": round(float(val), 1) if m_type == "LSTM" else None,
                    "hybrid_projected": round(float(val), 1) if m_type == "Hybrid" else None,
                    "type": "projected"
                })
            else:
                sc_val = feats.get("sc", 1.0)
                approx_egfr = max(10.0, min(120.0, 140.0 - (sc_val * 45.0)))
                longitudinal_egfr.append({
                    "label": f"{date_label} (ANN)",
                    "day": idx * 60,
                    "observed_egfr": round(approx_egfr, 1),
                    "lstm_projected": None,
                    "hybrid_projected": None,
                    "type": "observed"
                })

    # Determine Unified Consensus
    latest_feats = (latest_ann.input_features if latest_ann else {}) or {}
    sc_val = float(latest_feats.get("sc", 1.0)) if latest_feats.get("sc") is not None else 1.0
    approx_egfr = max(10.0, min(120.0, round(140.0 - (sc_val * 45.0), 1)))

    predicted_egfr = None
    if latest_hybrid and latest_lstm:
        predicted_egfr = round((float(latest_hybrid.risk_score) + float(latest_lstm.risk_score)) / 2.0, 1)
    elif latest_hybrid:
        predicted_egfr = round(float(latest_hybrid.risk_score), 1)
    elif latest_lstm:
        predicted_egfr = round(float(latest_lstm.risk_score), 1)
    else:
        predicted_egfr = approx_egfr

    ann_risk = round(float(latest_ann.risk_score), 1) if latest_ann else None
    ann_label = latest_ann.prediction_label if latest_ann else "Unknown"

    kdigo_stage = "Stage 2"
    kdigo_desc = "Mildly reduced kidney function"
    if predicted_egfr is not None:
        if predicted_egfr >= 90:
            kdigo_stage, kdigo_desc = "Stage 1", "Normal or High renal function"
        elif predicted_egfr >= 60:
            kdigo_stage, kdigo_desc = "Stage 2", "Mildly reduced kidney function"
        elif predicted_egfr >= 45:
            kdigo_stage, kdigo_desc = "Stage 3a", "Mild to moderate kidney damage"
        elif predicted_egfr >= 30:
            kdigo_stage, kdigo_desc = "Stage 3b", "Moderate to severe kidney damage"
        elif predicted_egfr >= 15:
            kdigo_stage, kdigo_desc = "Stage 4", "Severe kidney damage"
        else:
            kdigo_stage, kdigo_desc = "Stage 5", "Kidney failure / End-stage renal disease"

    traj_status = "Stable"
    if len(longitudinal_egfr) >= 2:
        obs_points = [p["observed_egfr"] for p in longitudinal_egfr if p["observed_egfr"] is not None]
        if len(obs_points) >= 2:
            delta = obs_points[-1] - obs_points[0]
            if delta < -8:
                traj_status = "Rapid Decline"
            elif delta < -2:
                traj_status = "Mild Decline"
            elif delta > 2:
                traj_status = "Improving"
            else:
                traj_status = "Stable"
        elif predicted_egfr and obs_points:
            delta = predicted_egfr - obs_points[-1]
            if delta < -5:
                traj_status = "Rapid Decline"
            elif delta < 0:
                traj_status = "Mild Decline"
            else:
                traj_status = "Stable"

    # Consensus Verdict
    if ann_risk is not None and ann_risk >= 50.0:
        if predicted_egfr and predicted_egfr < 60.0:
            concordance = "High Risk Concordant"
            diagnosis = "Active Chronic Kidney Disease"
            action = "Urgent renal specialist referral: initiate renoprotective regimen (ACEi/ARB or SGLT2i), strict BP control (<130/80 mmHg), and quarterly eGFR monitoring."
        else:
            concordance = "Moderate Risk / Biochemical Pre-CKD"
            diagnosis = "Biomarker Positive CKD Risk"
            action = "Monitor proteinuria and repeat creatinine in 6 weeks. Optimize cardiovascular risk factors."
    else:
        if predicted_egfr and predicted_egfr < 60.0:
            concordance = "Discordant Alert (Functional Decline)"
            diagnosis = "Presumed Subclinical Renal Decline"
            action = "Investigate acute vs. chronic etiology. Repeat metabolic panel and urinalysis within 30 days."
        else:
            concordance = "Low Risk Concordant"
            diagnosis = "Non-CKD / Normal Renal Function"
            action = "Routine annual preventive health evaluation. Maintain healthy hydration and balanced nutrition."

    timeline = []
    for r in reversed(records):
        m_name = (r.input_features or {}).get("model", "ANN")
        timeline.append({
            "id": r.id,
            "date": r.created_at.isoformat() if r.created_at else None,
            "model": m_name,
            "result_label": r.prediction_label,
            "score": round(float(r.risk_score), 2) if r.risk_score is not None else None,
            "owner_id": r.owner_id
        })

    # ─────────────────────────────────────────────────────────────────────────
    # D.2, D.3, D.4 Clinical Intelligence Calculation
    # ─────────────────────────────────────────────────────────────────────────
    latest_feats = (latest_ann.input_features if latest_ann else {}) or {}
    effective_egfr = predicted_egfr if predicted_egfr is not None else (
        max(10.0, min(120.0, 140.0 - (float(latest_feats.get("sc", 1.0)) * 45.0)))
    )
    albumin_val = int(latest_feats.get("al", 0))

    progression_analysis = calculate_progression_probability(
        current_egfr=effective_egfr,
        patient_age=patient_age,
        albumin_grade=albumin_val,
        historical_points=longitudinal_egfr
    )
    complication_risks = calculate_complication_likelihood(
        current_egfr=effective_egfr,
        biomarkers=latest_feats
    )
    treatment_priority = calculate_treatment_priority(
        current_egfr=effective_egfr,
        kdigo_stage=kdigo_stage,
        progression=progression_analysis,
        complications=complication_risks,
        biomarkers=latest_feats
    )

    return {
        "patient_id": clean_id,
        "patient_age": patient_age,
        "assigned_doctor": assigned_doc_name or (f"Dr. #{current_user.id}" if current_user.role == "Doctor" else "Primary Care"),
        "total_records": len(records),
        "latest_ann": {
            "prediction": latest_ann.prediction_label,
            "risk_score": round(float(latest_ann.risk_score), 1),
            "date": latest_ann.created_at.isoformat() if latest_ann.created_at else None,
            "shap_values": latest_ann.shap_values or []
        } if latest_ann else None,
        "latest_lstm": {
            "predicted_egfr": round(float(latest_lstm.risk_score), 1),
            "label": latest_lstm.prediction_label,
            "date": latest_lstm.created_at.isoformat() if latest_lstm.created_at else None,
        } if latest_lstm else None,
        "latest_hybrid": {
            "predicted_egfr": round(float(latest_hybrid.risk_score), 1),
            "label": latest_hybrid.prediction_label,
            "date": latest_hybrid.created_at.isoformat() if latest_hybrid.created_at else None,
        } if latest_hybrid else None,
        "consensus": {
            "risk_score": ann_risk,
            "risk_level": "HIGH" if (ann_risk and ann_risk >= 50) else "LOW",
            "diagnosis": diagnosis,
            "predicted_egfr": predicted_egfr,
            "kdigo_stage": kdigo_stage,
            "kdigo_description": kdigo_desc,
            "trajectory_status": traj_status,
            "concordance": concordance,
            "clinical_action": action
        },
        "progression_analysis": progression_analysis,
        "complication_risks": complication_risks,
        "treatment_priority": treatment_priority,
        "longitudinal_egfr": longitudinal_egfr,
        "biomarkers_panel": biomarkers_panel,
        "history_timeline": timeline
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /visualizations/patient-plotly/{patient_id} (Plotly Interactive Analytics - H.4)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/visualizations/patient-plotly/{patient_id}", tags=["visualizations"])
def get_patient_plotly_charts(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Doctor", "Admin", "Patient"))
):
    """
    Synopsis H.4: Generates interactive Plotly JSON schemas for:
      1. Longitudinal Trajectory & Forecast with KDIGO reference bands.
      2. Temporal Saliency Attributions across visits.
      3. KDIGO 2024 2D Risk Grid Position.
      4. Multi-Systemic Complications Polar/Radar Chart.
    """
    ehr = get_patient_ehr(patient_id=patient_id, db=db, current_user=current_user)
    
    current_egfr = ehr["consensus"]["predicted_egfr"] or 60.0
    latest_ann_data = ehr.get("latest_ann") or {}
    latest_feats = (latest_ann_data.get("input_features") or {}) if isinstance(latest_ann_data, dict) else {}
    al_grade = int(latest_feats.get("al", 1))

    # 1. Trajectory figure
    traj_fig = generate_plotly_trajectory_figure(
        patient_id=patient_id,
        longitudinal_points=ehr.get("longitudinal_egfr", []),
        predicted_egfr=ehr["consensus"]["predicted_egfr"]
    )

    # 2. Temporal saliency figure (from LSTM or Hybrid or default)
    saliency_dict = {}
    if ehr.get("latest_hybrid") and isinstance(ehr["latest_hybrid"], dict):
        saliency_dict = ehr["latest_hybrid"].get("explanation") or {}
    elif ehr.get("latest_lstm") and isinstance(ehr["latest_lstm"], dict):
        saliency_dict = ehr["latest_lstm"].get("explanation") or {}
    saliency_fig = generate_plotly_temporal_saliency_figure(saliency_dict)

    # 3. KDIGO 2D Risk Matrix Heatmap
    kdigo_fig = generate_plotly_kdigo_matrix(current_egfr=current_egfr, albumin_grade=al_grade)

    # 4. Complications Polar/Radar Chart
    radar_fig = generate_plotly_complications_radar(ehr.get("complication_risks", []))

    return {
        "patient_id": patient_id,
        "charts": {
            "trajectory": traj_fig,
            "temporal_saliency": saliency_fig,
            "kdigo_matrix": kdigo_fig,
            "complications_radar": radar_fig
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /fhir/patient/{patient_id} (HL7 FHIR R4 Interoperability Bundle - H.3)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/fhir/patient/{patient_id}", tags=["interoperability"])
def get_patient_fhir_bundle(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("Doctor", "Admin", "Patient"))
):
    """
    Synopsis H.3: HL7 FHIR R4 Standard Interoperability Export.
    Emits an official FHIR R4 Bundle resource (type: 'collection') containing:
      1. FHIR Patient resource with MRN and demographic extensions.
      2. LOINC-coded FHIR Observation resources for all laboratory biomarkers.
      3. Predicted eGFR Observation with LOINC 33914-3.
      4. SNOMED-CT coded FHIR RiskAssessment resource (code 709044004) with probability and KDIGO outcome.
      5. FHIR DiagnosticReport resource (LOINC 24362-6).
    """
    ehr = get_patient_ehr(patient_id=patient_id, db=db, current_user=current_user)
    fhir_bundle = generate_fhir_bundle(ehr)
    return fhir_bundle


# =============================================================================
# HOSPITAL MANAGEMENT PLATFORM ENDPOINTS (PHASES 5, 6, 7, 8)
# =============================================================================

# ── 1. HOSPITAL ADMINISTRATOR DASHBOARD (PHASE 5) ─────────────────────────────

@router.get("/admin/overview-stats", tags=["admin"])
def get_admin_overview_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Retrieve genuine, database-derived hospital metrics and statistics."""
    total_doctors = db.query(User).filter(User.role.in_(["doctor", "Doctor"])).count()
    total_patients = db.query(PatientRecord).count()
    total_lab_techs = db.query(User).filter(User.role.in_(["lab_technician", "Lab_Technician"])).count()
    active_users = db.query(User).filter(User.is_active == True, User.account_status == "active").count()
    pending_invitations = db.query(User).filter(User.account_status == "pending_invitation").count()
    total_predictions = db.query(PredictionHistory).count()
    total_lab_tests = db.query(LabTest).count()

    hospital = db.query(Hospital).first()
    recent_activities = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(10).all()

    return {
        "hospital": {
            "name": hospital.name if hospital else "Clinical Renal & Kidney Health Platform",
            "code": hospital.code if hospital else "CLINICAL-CKD-01",
            "contact_email": hospital.contact_email if hospital else "care@hospital.org",
            "phone": hospital.phone if hospital else "+1-800-555-0199"
        },
        "stats": {
            "total_doctors": total_doctors,
            "total_patients": total_patients,
            "total_lab_technicians": total_lab_techs,
            "active_users": active_users,
            "pending_invitations": pending_invitations,
            "total_predictions": total_predictions,
            "total_lab_tests": total_lab_tests
        },
        "recent_activities": [
            {
                "id": a.id,
                "user_email": a.user_email,
                "role": a.role,
                "action": a.action,
                "resource": a.resource,
                "details": a.details,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None
            }
            for a in recent_activities
        ]
    }


@router.get("/admin/doctors", tags=["admin"])
def list_admin_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Retrieve detailed staff roster of all doctors."""
    doctors = db.query(User).filter(User.role.in_(["doctor", "Doctor"])).order_by(User.id.asc()).all()
    out = []
    for d in doctors:
        patient_count = db.query(DoctorPatientAssignment).filter(DoctorPatientAssignment.doctor_id == d.id).count()
        out.append({
            "id": d.id,
            "username": d.username,
            "full_name": d.full_name or f"Dr. {d.username}",
            "email": d.email or d.username,
            "role": "doctor",
            "account_status": d.account_status or ("active" if d.is_active else "deactivated"),
            "is_active": d.is_active,
            "assigned_patient_count": patient_count,
            "created_at": d.created_at.isoformat() if d.created_at else None
        })
    return out


@router.get("/admin/doctors/{doctor_id}/details", tags=["admin"])
def get_admin_doctor_details(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Retrieve single doctor profile and their assigned patients roster."""
    doc = db.query(User).filter(User.id == doctor_id, User.role.in_(["doctor", "Doctor"])).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")

    assignments = db.query(DoctorPatientAssignment).filter(DoctorPatientAssignment.doctor_id == doctor_id).all()
    assigned_pids = [a.patient_id for a in assignments]
    patients = db.query(PatientRecord).filter(
        (PatientRecord.assigned_doctor_id == doctor_id) |
        (PatientRecord.patient_id.in_(assigned_pids))
    ).all()

    seen = set()
    pt_list = []
    for p in patients:
        if p.patient_id in seen:
            continue
        seen.add(p.patient_id)
        latest_pred = db.query(PredictionHistory).filter(PredictionHistory.patient_id == p.patient_id).order_by(PredictionHistory.created_at.desc()).first()
        pt_list.append({
            "patient_id": p.patient_id,
            "full_name": p.full_name,
            "age": p.age,
            "gender": p.gender or "Unknown",
            "status": p.status or "Active",
            "latest_prediction": latest_pred.prediction_label if latest_pred else "Not Evaluated",
            "risk_score": latest_pred.risk_score if latest_pred else None
        })

    return {
        "doctor": {
            "id": doc.id,
            "username": doc.username,
            "full_name": doc.full_name or f"Dr. {doc.username}",
            "email": doc.email or doc.username,
            "account_status": doc.account_status or ("active" if doc.is_active else "deactivated"),
            "is_active": doc.is_active,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "patient_count": len(pt_list)
        },
        "assigned_patients": pt_list
    }


@router.get("/admin/patients", tags=["admin"])
def list_admin_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """
    Admin-only: Retrieve all unique patient records.
    Guarantees exactly ONE row per unique patient.
    """
    patients = db.query(PatientRecord).order_by(PatientRecord.id.desc()).all()
    out = []
    for p in patients:
        # Resolve latest prediction
        latest_pred = db.query(PredictionHistory).filter(
            PredictionHistory.patient_id == p.patient_id
        ).order_by(PredictionHistory.created_at.desc()).first()

        doc_name = None
        if p.assigned_doctor_id:
            doc = db.query(User).filter(User.id == p.assigned_doctor_id).first()
            if doc:
                doc_name = doc.full_name or doc.username

        # Resolve last measurement date
        last_measurement = None
        latest_test = db.query(LabTest).filter(LabTest.patient_id == p.patient_id).order_by(LabTest.recorded_at.desc()).first()
        if latest_test and latest_test.recorded_at:
            last_measurement = latest_test.recorded_at.isoformat()
        elif latest_pred and latest_pred.created_at:
            last_measurement = latest_pred.created_at.isoformat()

        out.append({
            "id": p.id,
            "patient_id": p.patient_id,
            "full_name": p.full_name,
            "email": p.email,
            "phone": p.phone,
            "age": p.age,
            "gender": p.gender or "Unknown",
            "blood_group": p.blood_group,
            "assigned_doctor_id": p.assigned_doctor_id,
            "assigned_doctor_name": doc_name,
            "registration_date": p.registration_date.isoformat() if p.registration_date else None,
            "status": p.status or "Active",
            "last_measurement_date": last_measurement,
            "latest_prediction_status": latest_pred.prediction_label if latest_pred else "Not Evaluated",
            "latest_risk_score": latest_pred.risk_score if latest_pred else None
        })
    return out


@router.post("/admin/patients", tags=["admin"])
def create_patient_record(
    payload: PatientRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Manually provision a new patient record."""
    pid_clean = payload.patient_id.strip()
    existing = db.query(PatientRecord).filter(PatientRecord.patient_id == pid_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Patient record '{pid_clean}' already exists.")

    hospital = db.query(Hospital).first()
    patient = PatientRecord(
        patient_id=pid_clean,
        full_name=payload.full_name.strip(),
        email=payload.email,
        phone=payload.phone,
        date_of_birth=payload.date_of_birth,
        age=payload.age,
        gender=payload.gender,
        blood_group=payload.blood_group,
        emergency_contact=payload.emergency_contact,
        medical_history=payload.medical_history,
        allergies=payload.allergies,
        assigned_doctor_id=payload.assigned_doctor_id,
        hospital_id=hospital.id if hospital else None,
        status=payload.status or "Active"
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    # If assigned to a doctor, also add DoctorPatientAssignment
    if payload.assigned_doctor_id:
        db.add(DoctorPatientAssignment(
            doctor_id=payload.assigned_doctor_id,
            patient_id=pid_clean,
            assigned_by=current_user.username
        ))
        db.commit()

    log_audit_event(
        db, current_user, "PATIENT_RECORD_CREATED",
        resource=f"patient:{pid_clean}",
        details=f"Admin created patient '{patient.full_name}' (MRN: {pid_clean})."
    )

    return {"status": "success", "patient_id": patient.patient_id, "id": patient.id}


@router.patch("/admin/patients/{patient_id}/assign-doctor", tags=["admin"])
def assign_doctor_to_patient(
    patient_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Assign or reassign attending physician to a patient."""
    doctor_id = payload.get("doctor_id")
    if not doctor_id:
        raise HTTPException(status_code=400, detail="doctor_id is required.")

    doctor = db.query(User).filter(User.id == doctor_id, User.role.in_(["doctor", "Doctor"])).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    patient = db.query(PatientRecord).filter(PatientRecord.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient record not found.")

    patient.assigned_doctor_id = doctor.id

    # Sync assignment table
    assign = db.query(DoctorPatientAssignment).filter(
        DoctorPatientAssignment.patient_id == patient_id,
        DoctorPatientAssignment.doctor_id == doctor.id
    ).first()
    if not assign:
        db.add(DoctorPatientAssignment(
            doctor_id=doctor.id,
            patient_id=patient_id,
            assigned_by=current_user.username
        ))

    db.commit()

    log_audit_event(
        db, current_user, "PATIENT_ASSIGNMENT_UPDATED",
        resource=f"patient:{patient_id}",
        details=f"Assigned patient {patient_id} to Dr. {doctor.full_name or doctor.username}."
    )

    return {"status": "success", "message": f"Patient assigned to Dr. {doctor.full_name or doctor.username}"}


@router.get("/admin/lab-technicians", tags=["admin"])
def list_admin_lab_technicians(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Retrieve all registered laboratory technicians."""
    techs = db.query(User).filter(User.role.in_(["lab_technician", "Lab_Technician"])).order_by(User.id.asc()).all()
    return [
        {
            "id": t.id,
            "username": t.username,
            "full_name": t.full_name or t.username,
            "email": t.email or t.username,
            "role": "lab_technician",
            "account_status": t.account_status or ("active" if t.is_active else "deactivated"),
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if t.created_at else None
        }
        for t in techs
    ]


@router.get("/admin/audit-logs", tags=["admin"])
def list_admin_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Retrieve hospital audit logs."""
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "user_email": l.user_email,
            "role": l.role,
            "action": l.action,
            "resource": l.resource,
            "details": l.details,
            "ip_address": l.ip_address,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None
        }
        for l in logs
    ]


# ── 2. DOCTOR DASHBOARD & PATIENT MANAGEMENT (PHASE 6) ────────────────────────

@router.get("/doctor/overview-stats", tags=["doctor"])
def get_doctor_overview_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("doctor", "admin"))
):
    """Doctor-specific dashboard overview metrics."""
    is_admin = current_user.role.lower() == "admin"

    if is_admin:
        assigned_pids = [p.patient_id for p in db.query(PatientRecord.patient_id).all()]
    else:
        assigned_assignments = [a[0] for a in db.query(DoctorPatientAssignment.patient_id).filter(DoctorPatientAssignment.doctor_id == current_user.id).all()]
        assigned_records = [p[0] for p in db.query(PatientRecord.patient_id).filter(PatientRecord.assigned_doctor_id == current_user.id).all()]
        assigned_pids = list(set(assigned_assignments + assigned_records))

    assigned_count = len(assigned_pids)

    # Recent predictions for assigned patients
    recent_preds = db.query(PredictionHistory).filter(
        PredictionHistory.patient_id.in_(assigned_pids)
    ).order_by(PredictionHistory.created_at.desc()).limit(5).all()

    # High risk count
    high_risk_count = db.query(PredictionHistory).filter(
        PredictionHistory.patient_id.in_(assigned_pids),
        PredictionHistory.risk_score >= 50.0
    ).distinct(PredictionHistory.patient_id).count()

    # Pending lab requests
    pending_labs = db.query(LabRequest).filter(
        LabRequest.patient_id.in_(assigned_pids),
        LabRequest.status == "Pending"
    ).count()

    return {
        "assigned_patient_count": assigned_count,
        "high_risk_patient_count": high_risk_count,
        "pending_lab_requests_count": pending_labs,
        "recent_predictions": [
            {
                "id": r.id,
                "patient_id": r.patient_id,
                "prediction_label": r.prediction_label,
                "risk_score": r.risk_score,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in recent_preds
        ]
    }


@router.get("/doctor/my-patients", tags=["doctor"])
def list_doctor_my_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("doctor", "admin"))
):
    """
    PHASE 6 REQUIREMENT: Clean, deduplicated list where each patient occupies
    EXACTLY ONE row, even if they have multiple lab or prediction records.
    """
    is_admin = current_user.role.lower() == "admin"

    if is_admin:
        patients = db.query(PatientRecord).order_by(PatientRecord.patient_id.asc()).all()
    else:
        assigned_assignments = [a[0] for a in db.query(DoctorPatientAssignment.patient_id).filter(DoctorPatientAssignment.doctor_id == current_user.id).all()]
        patients = db.query(PatientRecord).filter(
            (PatientRecord.assigned_doctor_id == current_user.id) |
            (PatientRecord.patient_id.in_(assigned_assignments))
        ).order_by(PatientRecord.patient_id.asc()).all()

    # Deduplicate strictly by patient_id
    seen_pids = set()
    out = []

    for p in patients:
        if p.patient_id in seen_pids:
            continue
        seen_pids.add(p.patient_id)

        # Resolve latest prediction
        latest_pred = db.query(PredictionHistory).filter(
            PredictionHistory.patient_id == p.patient_id
        ).order_by(PredictionHistory.created_at.desc()).first()

        # Resolve last recorded measurement date
        last_date = None
        latest_test = db.query(LabTest).filter(LabTest.patient_id == p.patient_id).order_by(LabTest.recorded_at.desc()).first()
        if latest_test and latest_test.recorded_at:
            last_date = latest_test.recorded_at.isoformat()
        elif latest_pred and latest_pred.created_at:
            last_date = latest_pred.created_at.isoformat()

        doc_name = None
        if p.assigned_doctor_id:
            doc = db.query(User).filter(User.id == p.assigned_doctor_id).first()
            if doc:
                doc_name = doc.full_name or doc.username

        out.append({
            "id": p.id,
            "patient_id": p.patient_id,
            "full_name": p.full_name,
            "age": p.age,
            "gender": p.gender or "Unknown",
            "blood_group": p.blood_group,
            "assigned_doctor_name": doc_name or ("Dr. " + current_user.username),
            "status": p.status or "Active",
            "last_measurement_date": last_date,
            "latest_prediction_status": latest_pred.prediction_label if latest_pred else "Not Evaluated",
            "latest_risk_score": latest_pred.risk_score if latest_pred else None
        })

    return out


@router.get("/doctor/patient/{patient_id}/details", tags=["doctor"])
def get_patient_profile_and_history(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("doctor", "admin"))
):
    """
    PHASE 6 REQUIREMENT: Complete patient detail view for doctors.
    Includes demographics, medical history, clinical measurements, lab results,
    and historical ANN, LSTM, Hybrid prediction outputs.
    """
    pid_clean = patient_id.strip()

    # Strict isolation check if not admin
    if current_user.role.lower() != "admin":
        assigned = db.query(DoctorPatientAssignment).filter(
            DoctorPatientAssignment.doctor_id == current_user.id,
            DoctorPatientAssignment.patient_id == pid_clean
        ).first()
        assigned_record = db.query(PatientRecord).filter(
            PatientRecord.patient_id == pid_clean,
            PatientRecord.assigned_doctor_id == current_user.id
        ).first()
        if not assigned and not assigned_record:
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: Patient '{pid_clean}' is not assigned to Dr. {current_user.full_name or current_user.username}."
            )

    # Retrieve patient record
    patient = db.query(PatientRecord).filter(PatientRecord.patient_id == pid_clean).first()
    if not patient:
        # Check if exists in predictions or create virtual profile
        patient = PatientRecord(
            patient_id=pid_clean,
            full_name=f"Patient {pid_clean}",
            age=55.0,
            gender="Unknown",
            status="Active"
        )

    # Attending doctor name
    doc_name = None
    if patient.assigned_doctor_id:
        doc = db.query(User).filter(User.id == patient.assigned_doctor_id).first()
        if doc:
            doc_name = doc.full_name or doc.username

    # Lab tests
    lab_tests = db.query(LabTest).filter(LabTest.patient_id == pid_clean).order_by(LabTest.recorded_at.desc()).all()

    # Lab requests
    lab_requests = db.query(LabRequest).filter(LabRequest.patient_id == pid_clean).order_by(LabRequest.requested_at.desc()).all()

    # Predictions
    predictions = db.query(PredictionHistory).filter(PredictionHistory.patient_id == pid_clean).order_by(PredictionHistory.created_at.desc()).all()

    return {
        "profile": {
            "id": patient.id,
            "patient_id": patient.patient_id,
            "full_name": patient.full_name,
            "email": patient.email,
            "phone": patient.phone,
            "date_of_birth": patient.date_of_birth,
            "age": patient.age,
            "gender": patient.gender,
            "blood_group": patient.blood_group,
            "emergency_contact": patient.emergency_contact,
            "medical_history": patient.medical_history,
            "allergies": patient.allergies,
            "assigned_doctor_name": doc_name or ("Dr. " + current_user.username),
            "status": patient.status or "Active",
            "registration_date": patient.registration_date.isoformat() if patient.registration_date else None
        },
        "lab_results": [
            {
                "id": t.id,
                "test_name": t.test_name,
                "category": t.category,
                "test_value": t.test_value,
                "unit": t.unit,
                "reference_range": t.reference_range,
                "loinc_code": t.loinc_code,
                "status": t.status,
                "notes": t.notes,
                "technician_name": t.technician_name,
                "recorded_at": t.recorded_at.isoformat() if t.recorded_at else None
            }
            for t in lab_tests
        ],
        "lab_requests": [
            {
                "id": r.id,
                "test_type": r.test_type,
                "priority": r.priority,
                "clinical_notes": r.clinical_notes,
                "status": r.status,
                "doctor_name": r.doctor_name,
                "requested_at": r.requested_at.isoformat() if r.requested_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None
            }
            for r in lab_requests
        ],
        "predictions": [
            {
                "id": p.id,
                "prediction_label": p.prediction_label,
                "risk_score": p.risk_score,
                "patient_age": p.patient_age,
                "input_features": p.input_features,
                "shap_values": p.shap_values,
                "created_at": p.created_at.isoformat() if p.created_at else None
            }
            for p in predictions
        ]
    }


@router.post("/doctor/lab-requests", tags=["doctor"])
def create_doctor_lab_request(
    payload: LabRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("doctor", "admin"))
):
    """Doctor orders a clinical laboratory test for a patient."""
    pid_clean = payload.patient_id.strip()

    req = LabRequest(
        patient_id=pid_clean,
        doctor_id=current_user.id,
        doctor_name=current_user.full_name or current_user.username,
        test_type=payload.test_type,
        priority=payload.priority,
        clinical_notes=payload.clinical_notes,
        status="Pending"
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    log_audit_event(
        db, current_user, "LAB_TEST_REQUESTED",
        resource=f"patient:{pid_clean}",
        details=f"Dr. {req.doctor_name} ordered '{req.test_type}' with priority '{req.priority}'."
    )

    return {"status": "success", "id": req.id, "message": "Laboratory test requested successfully."}


@router.delete("/doctor/patient/{patient_id}", tags=["doctor", "admin"])
@router.delete("/admin/patients/{patient_id}", tags=["doctor", "admin"])
def delete_patient_record(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("doctor", "admin"))
):
    """
    Delete a patient record and cascade cleanup of all associated clinical records:
    predictions, lab requests, lab tests, and doctor assignments.
    """
    pid_clean = patient_id.strip()

    record = db.query(PatientRecord).filter(PatientRecord.patient_id == pid_clean).first()
    preds = db.query(PredictionHistory).filter(PredictionHistory.patient_id == pid_clean).all()
    labs = db.query(LabTest).filter(LabTest.patient_id == pid_clean).all()
    reqs = db.query(LabRequest).filter(LabRequest.patient_id == pid_clean).all()
    assigns = db.query(DoctorPatientAssignment).filter(DoctorPatientAssignment.patient_id == pid_clean).all()

    if not record and not preds and not labs and not reqs and not assigns:
        raise HTTPException(status_code=404, detail=f"Patient '{pid_clean}' not found.")

    for p in preds:
        db.delete(p)
    for l in labs:
        db.delete(l)
    for r in reqs:
        db.delete(r)
    for a in assigns:
        db.delete(a)
    if record:
        db.delete(record)

    db.commit()

    log_audit_event(
        db, current_user, "PATIENT_RECORD_DELETED",
        resource=f"patient:{pid_clean}",
        details=f"Patient {pid_clean} permanently deleted by {current_user.username} ({current_user.role})."
    )

    return {"status": "success", "message": f"Patient '{pid_clean}' permanently deleted."}


# ── 3. LAB TECHNICIAN DASHBOARD & RESULTS ENTRY (PHASE 7) ────────────────────

@router.get("/lab/overview-stats", tags=["lab"])
def get_lab_overview_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("lab_technician", "admin"))
):
    """Lab technician overview stats."""
    pending_count = db.query(LabRequest).filter(LabRequest.status == "Pending").count()
    completed_count = db.query(LabRequest).filter(LabRequest.status == "Completed").count()
    total_tests_entered = db.query(LabTest).count()

    recent_tests = db.query(LabTest).order_by(LabTest.recorded_at.desc()).limit(5).all()

    return {
        "pending_requests_count": pending_count,
        "completed_requests_count": completed_count,
        "total_tests_entered": total_tests_entered,
        "recent_tests": [
            {
                "id": t.id,
                "patient_id": t.patient_id,
                "test_name": t.test_name,
                "test_value": t.test_value,
                "unit": t.unit,
                "status": t.status,
                "recorded_at": t.recorded_at.isoformat() if t.recorded_at else None
            }
            for t in recent_tests
        ]
    }


@router.get("/lab/requests", tags=["lab"])
def list_lab_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("lab_technician", "admin"))
):
    """Retrieve pending and active laboratory test requests."""
    requests = db.query(LabRequest).order_by(LabRequest.requested_at.desc()).all()
    return [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "doctor_id": r.doctor_id,
            "doctor_name": r.doctor_name,
            "test_type": r.test_type,
            "priority": r.priority,
            "clinical_notes": r.clinical_notes,
            "status": r.status,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None
        }
        for r in requests
    ]


@router.post("/lab/requests/{request_id}/complete", tags=["lab"])
def complete_lab_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("lab_technician", "admin"))
):
    """Mark a doctor's laboratory request as completed."""
    req = db.query(LabRequest).filter(LabRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Lab request not found.")
    req.status = "Completed"
    req.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Request marked as Completed."}


@router.post("/lab/tests", tags=["lab"])
def enter_lab_result(
    payload: LabTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("lab_technician", "admin"))
):
    """
    PHASE 7 REQUIREMENT: Lab technician records validated laboratory measurements.
    Maintains audit trail with technician identity.
    """
    pid_clean = payload.patient_id.strip()

    # Auto-flag status if not provided or NORMAL
    status_flag = payload.status or "NORMAL"
    val = payload.test_value
    tname = payload.test_name.lower()

    if "creatinine" in tname:
        if val > 4.0:
            status_flag = "CRITICAL"
        elif val > 1.3:
            status_flag = "ELEVATED"
    elif "egfr" in tname:
        if val < 15:
            status_flag = "CRITICAL"
        elif val < 60:
            status_flag = "LOW"
    elif "urea" in tname and val > 50:
        status_flag = "ELEVATED"
    elif "potassium" in tname and (val < 3.5 or val > 5.5):
        status_flag = "CRITICAL" if val > 6.0 else "ELEVATED"

    lab_entry = LabTest(
        patient_id=pid_clean,
        test_name=payload.test_name.strip(),
        category=payload.category,
        test_value=val,
        unit=payload.unit.strip(),
        reference_range=payload.reference_range,
        loinc_code=payload.loinc_code,
        status=status_flag,
        notes=payload.notes,
        technician_id=current_user.id,
        technician_name=current_user.full_name or current_user.username
    )
    db.add(lab_entry)
    db.commit()
    db.refresh(lab_entry)

    # Ensure patient profile exists
    patient = db.query(PatientRecord).filter(PatientRecord.patient_id == pid_clean).first()
    if not patient:
        db.add(PatientRecord(
            patient_id=pid_clean,
            full_name=f"Patient {pid_clean}",
            age=50.0,
            status="Active"
        ))
        db.commit()

    log_audit_event(
        db, current_user, "LAB_RESULT_RECORDED",
        resource=f"patient:{pid_clean}",
        details=f"Technician {lab_entry.technician_name} recorded {lab_entry.test_name} = {lab_entry.test_value} {lab_entry.unit} ({lab_entry.status})."
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Automated External Alert Dispatch (Synopsis Phase 7 / Section 8)
    # Triggered on eGFR < 15 or Serum Creatinine >= 3.0 or CRITICAL status
    # ─────────────────────────────────────────────────────────────────────────
    is_critical_lab = (
        status_flag == "CRITICAL"
        or ("creatinine" in tname and val >= 3.0)
        or ("egfr" in tname and val <= 15.0)
    )

    external_alert_result = None
    if is_critical_lab:
        # 1. Real-time Apache Kafka stream dispatch ('ckd.critical.alerts')
        alert_payload = {
            "type": "CRITICAL_LAB_MEASUREMENT",
            "patient_id": pid_clean,
            "test_name": lab_entry.test_name,
            "test_value": val,
            "unit": lab_entry.unit,
            "status": "CRITICAL",
            "technician": lab_entry.technician_name,
            "message": (
                f"🚨 Critical Lab Alarm: Patient {pid_clean} has {lab_entry.test_name} = {val} {lab_entry.unit}. "
                "Immediate attending physician triage required."
            )
        }
        asyncio.create_task(kafka_service.publish_critical_alert(alert_payload))

        # 2. In-app WebSocket Broadcast
        asyncio.create_task(alert_manager.broadcast(alert_payload))

        # 3. Locate assigned attending physician and dispatch automated external email/SMS
        assignment = db.query(DoctorPatientAssignment).filter(
            DoctorPatientAssignment.patient_id == pid_clean
        ).first()

        doc_email = "oncall-physician@hospital.org"
        doc_name = "Attending Physician"
        target_user_id = None

        if assignment and assignment.doctor:
            doc_email = getattr(assignment.doctor, "email", None) or f"{assignment.doctor.username}@hospital.org"
            doc_name = assignment.doctor.full_name or assignment.doctor.username
            target_user_id = assignment.doctor_id

        from services.email_service import send_critical_lab_alert_email
        external_alert_result = send_critical_lab_alert_email(
            to_email=doc_email,
            physician_name=doc_name,
            patient_id=pid_clean,
            test_name=lab_entry.test_name,
            test_value=val,
            unit=lab_entry.unit,
            status_flag="CRITICAL"
        )

        # 4. Record persistent in-app physician notification
        if target_user_id:
            db.add(Notification(
                user_id=target_user_id,
                title="🚨 Critical Laboratory Finding",
                message=f"Patient {pid_clean}: {lab_entry.test_name} measured at {val} {lab_entry.unit} (CRITICAL).",
                type="ALERT",
                is_read=False
            ))
            db.commit()

    return {
        "status": "success",
        "id": lab_entry.id,
        "patient_id": lab_entry.patient_id,
        "test_name": lab_entry.test_name,
        "status_flag": lab_entry.status,
        "critical_alert_dispatched": is_critical_lab,
        "external_alert": external_alert_result,
        "message": "Laboratory test result recorded successfully."
    }


@router.get("/lab/tests/history", tags=["lab"])
def get_lab_tests_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("lab_technician", "admin"))
):
    """Retrieve full history of laboratory test entries."""
    tests = db.query(LabTest).order_by(LabTest.recorded_at.desc()).limit(limit).all()
    return [
        {
            "id": t.id,
            "patient_id": t.patient_id,
            "test_name": t.test_name,
            "category": t.category,
            "test_value": t.test_value,
            "unit": t.unit,
            "reference_range": t.reference_range,
            "loinc_code": t.loinc_code,
            "status": t.status,
            "notes": t.notes,
            "technician_name": t.technician_name,
            "recorded_at": t.recorded_at.isoformat() if t.recorded_at else None
        }
        for t in tests
    ]


@router.get("/lab/patients", tags=["lab"])
def get_lab_patients_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("lab_technician", "admin", "doctor"))
):
    """List patients for laboratory selection."""
    patients = db.query(PatientRecord).order_by(PatientRecord.patient_id.asc()).all()
    return [
        {
            "patient_id": p.patient_id,
            "full_name": p.full_name,
            "age": p.age,
            "gender": p.gender
        }
        for p in patients
    ]


# ── 4. PATIENT DASHBOARD & PERSONAL PORTAL (PHASE 8) ─────────────────────────

@router.get("/patient/my-records", tags=["patient"])
def get_patient_personal_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("patient"))
):
    """
    PHASE 8 REQUIREMENT: Simple, professional patient portal.
    Strictly isolated: Patients can ONLY access their own records.
    Accompanied by non-diagnostic clinical decision support disclaimer.
    """
    # Resolve target patient identifier
    pt_record = db.query(PatientRecord).filter(
        (PatientRecord.user_id == current_user.id) |
        (PatientRecord.email == current_user.email) |
        (PatientRecord.patient_id == current_user.username)
    ).first()

    if not pt_record:
        # Check if there are prediction records directly linked to this user
        latest_pred = db.query(PredictionHistory).filter(
            (PredictionHistory.owner_id == current_user.id) |
            (PredictionHistory.patient_id == current_user.username)
        ).first()

        pid = latest_pred.patient_id if latest_pred else f"PT-{current_user.id:04d}"
        pt_record = PatientRecord(
            patient_id=pid,
            user_id=current_user.id,
            full_name=current_user.full_name or current_user.username,
            email=current_user.email,
            status="Active"
        )
        db.add(pt_record)
        db.commit()
        db.refresh(pt_record)

    pid = pt_record.patient_id

    # Predictions
    preds = db.query(PredictionHistory).filter(
        (PredictionHistory.patient_id == pid) | (PredictionHistory.owner_id == current_user.id)
    ).order_by(PredictionHistory.created_at.desc()).all()

    # Lab tests
    labs = db.query(LabTest).filter(LabTest.patient_id == pid).order_by(LabTest.recorded_at.desc()).all()

    # Attending doctor
    attending_doc = None
    if pt_record.assigned_doctor_id:
        doc = db.query(User).filter(User.id == pt_record.assigned_doctor_id).first()
        if doc:
            attending_doc = {
                "name": doc.full_name or f"Dr. {doc.username}",
                "email": doc.email or "physician@hospital.org"
            }

    # Notifications
    notifications = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(10).all()

    return {
        "disclaimer": (
            "Medical Notice: The analytics and intelligence displayed in this portal represent "
            "clinical decision support metrics. They do not constitute an independent medical diagnosis. "
            "Please consult your attending physician regarding any questions about your care plan."
        ),
        "profile": {
            "patient_id": pt_record.patient_id,
            "full_name": pt_record.full_name,
            "email": pt_record.email or current_user.email,
            "phone": pt_record.phone,
            "age": pt_record.age,
            "gender": pt_record.gender,
            "blood_group": pt_record.blood_group,
            "allergies": pt_record.allergies,
            "attending_doctor": attending_doc
        },
        "predictions": [
            {
                "id": p.id,
                "label": p.prediction_label,
                "risk_score": p.risk_score,
                "date": p.created_at.isoformat() if p.created_at else None,
                "details": "Evaluated via hospital clinical intelligence engine."
            }
            for p in preds
        ],
        "lab_reports": [
            {
                "id": l.id,
                "test_name": l.test_name,
                "category": l.category,
                "test_value": l.test_value,
                "unit": l.unit,
                "reference_range": l.reference_range,
                "status": l.status,
                "notes": l.notes,
                "recorded_at": l.recorded_at.isoformat() if l.recorded_at else None
            }
            for l in labs
        ],
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None
            }
            for n in notifications
        ]
    }



