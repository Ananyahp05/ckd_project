"""
test_hospital_platform.py — Comprehensive End-to-End Hospital Management & RBAC Test Suite.
Verifies Phases 2, 3, 4, 5, 6, 7, 8, 10, 11 of the Hospital Platform Transformation.
"""

from __future__ import annotations
import sys
import os
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("KERAS_HOME", str(backend_dir / ".keras_cache"))

from database import SessionLocal
from models.db_models import User, PatientRecord, LabTest, DoctorPatientAssignment, PredictionHistory, Hospital
from models.schemas import (
    PatientRegisterRequest, LoginRequest, StaffInviteRequest, AcceptInvitationRequest,
    PatientRecordCreate, LabTestCreate, LabRequestCreate, PatientData
)
from api import auth, routes
from fastapi import HTTPException
from unittest.mock import MagicMock

async def run_tests():
    print("\n" + "="*75)
    print("STARTING COMPREHENSIVE HOSPITAL PLATFORM & RBAC TEST SUITE")
    print("="*75)

    db = SessionLocal()

    try:
        # Resolve or prepare admin user
        admin = db.query(User).filter(User.role.in_(["admin", "Admin"])).first()
        assert admin is not None, "Admin user must exist in database"
        print(f"[OK] Attending Admin Loaded: '{admin.email or admin.username}' (ID: {admin.id})")

        # ── 1. PATIENT REGISTRATION (PHASE 2.A) ──────────────────────────────
        patient_email = "john.doe.clinical@example.com"
        # Clean up existing test user if present
        existing_pt = db.query(User).filter(User.email == patient_email).first()
        if existing_pt:
            db.query(PatientRecord).filter(PatientRecord.user_id == existing_pt.id).delete()
            db.delete(existing_pt)
            db.commit()

        reg_payload = PatientRegisterRequest(
            full_name="John Doe",
            email=patient_email,
            password="PatientSecure2026!"
        )
        new_pt_user = auth.register_patient(reg_payload, db=db)
        assert new_pt_user.role.lower() == "patient", f"Expected role 'patient', got '{new_pt_user.role}'"
        assert new_pt_user.email == patient_email
        print(f"[OK] 1. Patient Self-Registration: Successfully registered '{new_pt_user.email}' with backend-enforced role '{new_pt_user.role}'.")

        # Verify associated PatientRecord profile was auto-provisioned
        pt_profile = db.query(PatientRecord).filter(PatientRecord.user_id == new_pt_user.id).first()
        assert pt_profile is not None, "Auto-provisioned PatientRecord profile not found!"
        print(f"[OK] 2. Patient Profile Auto-Provisioning: Generated MRN '{pt_profile.patient_id}' for {pt_profile.full_name}.")

        # ── 2. LOGIN WITH EMAIL & PASSWORD ONLY (PHASE 2.B) ──────────────────
        mock_req = MagicMock()
        mock_req.client.host = "127.0.0.1"

        login_res = auth.login_user(
            LoginRequest(email=patient_email, password="PatientSecure2026!"),
            request=mock_req,
            db=db
        )
        assert login_res["role"].lower() == "patient"
        assert "access_token" in login_res
        patient_token = login_res["access_token"]
        print(f"[OK] 3. Unified Login: User authenticated via Email + Password. Role returned from DB: '{login_res['role']}'.")

        # ── 3. ADMIN OVERVIEW METRICS (PHASE 5) ──────────────────────────────
        admin_stats = routes.get_admin_overview_stats(db=db, current_user=admin)
        assert "hospital" in admin_stats
        assert "stats" in admin_stats
        assert admin_stats["stats"]["total_doctors"] >= 1
        assert admin_stats["stats"]["total_patients"] >= 1
        print(f"[OK] 4. Admin Overview Statistics: Total Doctors={admin_stats['stats']['total_doctors']}, Total Patients={admin_stats['stats']['total_patients']}.")

        # ── 4. HOSPITAL ADMIN INVITES STAFF (PHASE 2.C & PHASE 5) ─────────────
        doc_email = "dr.elena.nephro@metrohealth.org"
        existing_doc = db.query(User).filter(User.email == doc_email).first()
        if existing_doc:
            db.delete(existing_doc)
            db.commit()

        invite_res = auth.invite_staff_member(
            payload=StaffInviteRequest(
                full_name="Dr. Elena Rostova",
                email=doc_email,
                role="doctor",
                specialization="Nephrology & Renal Dialysis"
            ),
            db=db,
            current_user=admin
        )
        assert invite_res["account_status"] == "pending_invitation"
        assert "token=" in invite_res["invitation_link"]
        invite_token = invite_res["invitation_link"].split("token=")[1]
        print(f"[OK] 5. Staff Invitation: Provisioned '{invite_res['full_name']}' as {invite_res['role']}. Link generated.")

        # ── 5. NON-ADMIN CANNOT INVITE STAFF (PHASE 2.C RBAC) ────────────────
        try:
            auth.invite_staff_member(
                payload=StaffInviteRequest(
                    full_name="Unauthorized Person",
                    email="unauthorized@example.com",
                    role="doctor"
                ),
                db=db,
                current_user=new_pt_user  # Patient attempting to invite staff
            )
            assert False, "Non-admin user was illegally permitted to invite staff!"
        except HTTPException as e:
            assert e.status_code == 403
            print(f"[OK] 6. Staff Invitation RBAC Isolation: Blocked non-admin invitation with HTTP {e.status_code}.")

        # ── 6. ACCEPT INVITATION & ESTABLISH PASSWORD (PHASE 2.C) ─────────────
        accept_res = auth.accept_staff_invitation(
            payload=AcceptInvitationRequest(
                token=invite_token,
                password="DoctorElenaPass2026!"
            ),
            db=db
        )
        assert "successfully activated" in accept_res["message"]
        doc_user = db.query(User).filter(User.email == doc_email).first()
        assert doc_user.account_status == "active"
        print(f"[OK] 7. Staff Account Activation: Dr. Elena activated credentials. Status: '{doc_user.account_status}'.")

        # ── 7. ADMIN ASSIGNS PATIENT TO DOCTOR (PHASE 3) ─────────────────────
        # Assign sample patient to Dr. Elena
        target_pid = pt_profile.patient_id
        db.query(DoctorPatientAssignment).filter(
            DoctorPatientAssignment.doctor_id == doc_user.id,
            DoctorPatientAssignment.patient_id == target_pid
        ).delete()
        db.commit()

        assign_res = routes.assign_patient_to_doctor(
            patient_id=target_pid,
            payload={"doctor_id": doc_user.id},
            db=db,
            current_user=admin
        )
        assert assign_res["status"] == "success"
        print(f"[OK] 8. Doctor-Patient Assignment: Assigned patient '{target_pid}' to Dr. Elena.")

        # ── 8. DOCTOR 'MY PATIENTS' DEDUPLICATION (PHASE 6) ──────────────────
        # Guarantee EXACTLY ONE row per patient
        doc_patients = routes.list_doctor_my_patients(db=db, current_user=doc_user)
        retrieved_pids = [p["patient_id"] for p in doc_patients]
        assert len(retrieved_pids) == len(set(retrieved_pids)), f"DUPLICATE PATIENT ROWS DETECTED: {retrieved_pids}"
        assert target_pid in retrieved_pids
        print(f"[OK] 9. Doctor Patient List: Verified 1-row-per-patient deduplication (Total: {len(doc_patients)}).")

        # ── 9. DOCTOR ACCESSES PATIENT DETAILS (PHASE 6) ─────────────────────
        doc_pt_details = routes.get_patient_profile_and_history(
            patient_id=target_pid,
            db=db,
            current_user=doc_user
        )
        assert doc_pt_details["profile"]["patient_id"] == target_pid
        assert "lab_results" in doc_pt_details
        assert "predictions" in doc_pt_details
        print(f"[OK] 10. Doctor Patient Profile: Loaded medical history, labs, and predictions for '{target_pid}'.")

        # ── 10. LAB TECHNICIAN RESULT ENTRY & AUDIT TRAIL (PHASE 7) ──────────
        # Create or fetch lab technician
        tech = db.query(User).filter(User.role.in_(["lab_technician", "Lab_Technician"])).first()
        if not tech:
            tech = User(
                username="tech_marcus",
                email="tech.marcus@metrohealth.org",
                full_name="Marcus Vance, MLS(ASCP)",
                role="lab_technician",
                account_status="active",
                is_active=True
            )
            db.add(tech)
            db.commit()
            db.refresh(tech)

        lab_entry = routes.enter_lab_result(
            payload=LabTestCreate(
                patient_id=target_pid,
                test_name="Serum Creatinine",
                category="Renal Function",
                test_value=1.55,
                unit="mg/dL",
                reference_range="0.7 - 1.3 mg/dL",
                loinc_code="2160-0",
                notes="Automated kinetic alkaline picrate assay (Jaffé reaction)."
            ),
            db=db,
            current_user=tech
        )
        assert lab_entry["status"] == "success"
        assert lab_entry["status_flag"] in ("ELEVATED", "CRITICAL")
        print(f"[OK] 11. Lab Technician: Recorded lab measurement (Creatinine=1.55 mg/dL, Status: {lab_entry['status_flag']}).")

        # ── 11. PATIENT DASHBOARD & STRICT PRIVACY ISOLATION (PHASE 8 & 10) ──
        pt_portal = routes.get_patient_personal_records(db=db, current_user=new_pt_user)
        assert "disclaimer" in pt_portal
        assert pt_portal["profile"]["email"] == patient_email
        print(f"[OK] 12. Patient Portal: Accessed personal records with non-diagnostic clinical disclaimer.")

        # Cross-Patient Isolation Check: Patient cannot query doctor endpoint
        try:
            routes.get_patient_profile_and_history(
                patient_id=target_pid,
                db=db,
                current_user=new_pt_user
            )
            assert False, "Patient was illegally permitted to access Doctor patient details endpoint!"
        except HTTPException as e:
            assert e.status_code == 403
            print(f"[OK] 13. Cross-Patient Isolation: Blocked unauthorized patient access to doctor clinical file (HTTP {e.status_code}).")

        # ── 12. PRESERVED ANN PREDICTION & EXPLAINABILITY (PHASE 11) ──────────
        ann_payload = PatientData(
            patient_id=target_pid,
            age=55.0, bp=85.0, sg=1.015, al=2.0, su=0.0,
            bgr=140.0, bu=45.0, sc=1.55, sod=138.0, pot=4.6,
            hemo=11.8, pcv=36.0, wbcc=8200.0, rbcc=4.2,
            rbc="normal", pc="normal", pcc="notpresent", ba="notpresent",
            htn="yes", dm="yes", cad="no", appet="good", pe="no", ane="no"
        )
        ann_pred = await routes.predict(ann_payload, db=db, current_user=doc_user)
        assert "prediction" in ann_pred
        assert "risk_score" in ann_pred
        assert "shap_values" in ann_pred
        print(f"[OK] 14. AI/ML Preserved: ANN Prediction executed (Verdict: {ann_pred['prediction']}, Risk: {ann_pred['risk_score']}%).")

        # ── 13. PRESERVED HL7 FHIR R4 INTEROPERABILITY BUNDLE (H.3) ──────────
        fhir_bundle = routes.get_patient_fhir_bundle(
            patient_id=target_pid,
            db=db,
            current_user=doc_user
        )
        assert fhir_bundle["resourceType"] == "Bundle"
        assert len(fhir_bundle.get("entry", [])) > 0
        print(f"[OK] 15. HL7 FHIR R4 Preserved: Exported valid FHIR bundle with {len(fhir_bundle['entry'])} resources.")

        print("\n" + "="*75)
        print("ALL 15 COMPREHENSIVE HOSPITAL PLATFORM TESTS PASSED WITH 100% SUCCESS!")
        print("="*75 + "\n")

    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_tests())
