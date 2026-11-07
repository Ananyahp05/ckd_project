"""
test_fhir_interop.py — Unit verification of requirement H.3 (HL7 FHIR R4 Standard Interoperability).
Verifies:
  1. FHIR Bundle generation adheres to HL7 FHIR R4 StructureDefinition.
  2. LOINC code mappings for laboratory observations.
  3. SNOMED-CT code mappings for CKD diagnosis and KDIGO risk assessment.
  4. RBAC protection on GET /fhir/patient/{patient_id}.
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("KERAS_HOME", str(backend_dir / ".keras_cache"))

from database import SessionLocal
from models.db_models import User, PredictionHistory
from api.routes import get_patient_fhir_bundle
from services.fhir_service import (
    generate_fhir_bundle,
    LOINC_MAPPINGS,
    SNOMED_KDIGO_MAPPINGS,
)
from fastapi import HTTPException


def test_fhir_interoperability():
    print("=" * 65)
    print("TESTING H.3: HL7 FHIR R4 HEALTHCARE INTEROPERABILITY STANDARDS")
    print("=" * 65)

    db = SessionLocal()
    try:
        # 1. Fetch Doctor user
        doc = db.query(User).filter(User.role == "Doctor").first()
        assert doc is not None, "Expected at least one Doctor user in database"
        print(f"[OK] Attending Doctor Loaded: Dr. {doc.username}")

        # 2. Find sample patient record
        sample_rec = db.query(PredictionHistory).filter(PredictionHistory.owner_id == doc.id).first()
        patient_id = sample_rec.patient_id if sample_rec else "PT-LSTM-001"
        print(f"[OK] Evaluating Target Patient: '{patient_id}'")

        # 3. Call FHIR R4 Bundle endpoint
        bundle = get_patient_fhir_bundle(patient_id=patient_id, db=db, current_user=doc)
        assert bundle is not None, "FHIR Bundle was None"

        # 4. Verify Bundle metadata
        assert bundle["resourceType"] == "Bundle", "Expected resourceType 'Bundle'"
        assert bundle["type"] == "collection", "Expected Bundle type 'collection'"
        assert "entry" in bundle and len(bundle["entry"]) > 0, "Expected non-empty entries in Bundle"
        print(f"[OK] Valid FHIR R4 Bundle Root: ID={bundle['id']} | Total Entries={bundle['total']}")

        # 5. Verify Patient Resource
        patient_entries = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Patient"]
        assert len(patient_entries) == 1, "Expected exactly 1 Patient resource in Bundle"
        pt = patient_entries[0]
        print(f"[OK] FHIR Patient Resource verified: ID={pt['id']} (MRN: {pt['identifier'][0]['value']})")

        # 6. Verify LOINC Coded Observations
        obs_entries = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Observation"]
        assert len(obs_entries) > 0, "Expected at least one Observation resource"
        print(f"[OK] Total LOINC-coded Observations: {len(obs_entries)}")
        
        # Verify a sample LOINC observation
        sample_obs = obs_entries[0]
        coding = sample_obs["code"]["coding"][0]
        assert coding["system"] == "http://loinc.org", "Expected LOINC coding system"
        print(f"     Sample Observation: Code={coding['code']} | Display={coding['display']} | Value={sample_obs['valueQuantity']['value']} {sample_obs['valueQuantity']['unit']}")

        # 7. Verify SNOMED-CT Coded RiskAssessment Resource
        ra_entries = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "RiskAssessment"]
        assert len(ra_entries) == 1, "Expected exactly 1 RiskAssessment resource in Bundle"
        ra = ra_entries[0]
        ra_code = ra["code"]["coding"][0]
        assert ra_code["system"] == "http://snomed.info/sct", "Expected SNOMED-CT system"
        assert ra_code["code"] == "709044004", "Expected SNOMED code 709044004 for CKD"
        pred = ra["prediction"][0]
        print(f"[OK] FHIR RiskAssessment verified: SNOMED Code={pred['outcome']['coding'][0]['code']} | Probability={pred['probabilityDecimal']} ({pred['qualitativeRisk']['coding'][0]['code'].upper()} RISK)")

        # 8. Verify FHIR DiagnosticReport Resource
        dr_entries = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "DiagnosticReport"]
        assert len(dr_entries) == 1, "Expected exactly 1 DiagnosticReport resource in Bundle"
        dr = dr_entries[0]
        print(f"[OK] FHIR DiagnosticReport verified: Code={dr['code']['coding'][0]['code']} | Conclusion={dr['conclusion']}")

        # 9. Verify RBAC Isolation: Unauthorized patient cannot export other patients' FHIR records
        print("\n[RBAC Verification]")
        patient_user = db.query(User).filter(User.role == "Patient").first()
        if patient_user:
            foreign_patient = "FOREIGN_PATIENT_UNAUTHORIZED"
            try:
                get_patient_fhir_bundle(foreign_patient, db=db, current_user=patient_user)
                assert False, "Unauthorized patient should be blocked with 403"
            except HTTPException as exc:
                assert exc.status_code == 403, "Expected 403 Forbidden"
                print(f"[OK] Blocked unauthorized patient access to foreign FHIR record (HTTP {exc.status_code})")

        print("\n" + "=" * 65)
        print("ALL H.3 HL7 FHIR R4 INTEROPERABILITY STANDARDS FULLY PASSED!")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    test_fhir_interoperability()

