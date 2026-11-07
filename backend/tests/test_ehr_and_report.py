"""
test_ehr_and_report.py — Direct unit verification of the Unified Patient EHR Chart endpoint & Clinical Report data generator.
"""

import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("KERAS_HOME", str(backend_dir / ".keras_cache"))

from database import SessionLocal
from models.db_models import User, PredictionHistory, DoctorPatientAssignment
from api.routes import get_patient_ehr, list_system_patients
from fastapi import HTTPException

def test_ehr_and_reports():
    print("=" * 60)
    print("TESTING UNIFIED PATIENT EHR & CLINICAL REPORT ENGINE")
    print("=" * 60)

    db = SessionLocal()
    try:
        # 1. Fetch Doctor user (admin1)
        doc = db.query(User).filter(User.role == "Doctor").first()
        assert doc is not None, "Expected at least one Doctor user in database"
        print(f"[OK] Doctor User Loaded: Dr. {doc.username} (ID: #{doc.id})")

        # 2. Test list_system_patients with doctor isolation
        patients = list_system_patients(db=db, current_user=doc)
        print(f"[OK] Accessible Patient Cohort for Dr. {doc.username}: {patients}")

        # Choose a target patient from database history or assignments
        sample_rec = db.query(PredictionHistory).filter(PredictionHistory.owner_id == doc.id).first()
        target_patient = sample_rec.patient_id if sample_rec else (patients[0] if patients else "LIVE-TEST-ANN-01")
        print(f"\n3. Testing get_patient_ehr() for patient: '{target_patient}'...")

        ehr = get_patient_ehr(target_patient, db=db, current_user=doc)
        assert ehr is not None, "EHR result was None"

        print("[OK] EHR Data Structure successfully generated:")
        print(f"   Patient ID: {ehr['patient_id']}")
        print(f"   Age: {ehr.get('patient_age')}")
        print(f"   Assigned Doctor: {ehr.get('assigned_doctor')}")
        print(f"   Total Records Count: {ehr.get('total_records')}")
        print(f"   Consensus Verdict: {ehr['consensus']['diagnosis']}")
        print(f"   Risk Level: {ehr['consensus']['risk_level']}")
        print(f"   Concordance: {ehr['consensus']['concordance']}")
        print(f"   KDIGO Staging: {ehr['consensus']['kdigo_stage']} - {ehr['consensus']['kdigo_description']}")
        print(f"   Trajectory: {ehr['consensus']['trajectory_status']}")
        print(f"   Clinical Action: {ehr['consensus']['clinical_action']}")
        print(f"   Biomarkers in Matrix: {len(ehr.get('biomarkers_panel', []))}")
        print(f"   Longitudinal Sequence Points: {len(ehr.get('longitudinal_egfr', []))}")
        print(f"   Historical Timeline Length: {len(ehr.get('history_timeline', []))}")

        # 4. Verify Biomarker Matrix Format
        if ehr.get("biomarkers_panel"):
            first_bio = ehr["biomarkers_panel"][0]
            print(f"   Sample Biomarker: {first_bio['name']} = {first_bio['value']} {first_bio['unit']} [{first_bio['status']}]")
            assert "name" in first_bio and "value" in first_bio and "status" in first_bio

        # 5. Verify RBAC Isolation
        print("\n4. Verifying RBAC isolation...")
        patient_user = db.query(User).filter(User.role == "Patient").first()
        if patient_user:
            foreign_patient = "SOME_OTHER_PATIENT_999"
            try:
                get_patient_ehr(foreign_patient, db=db, current_user=patient_user)
                print("[X] FAILED: Patient was able to view another patient's EHR!")
                assert False, "Patient access to foreign EHR should raise 403"
            except HTTPException as exc:
                print(f"[OK] PASS: Blocked patient access with HTTP {exc.status_code} ({exc.detail})")
                assert exc.status_code == 403

        print("\n" + "=" * 60)
        print("ALL EHR & CLINICAL REPORT TESTS PASSED SUCCESSFULLY!")
        print("=" * 60)

    finally:
        db.close()

if __name__ == "__main__":
    test_ehr_and_reports()
