"""
test_rbac_permissions.py — Automated verification of Clinical RBAC and Doctor-Patient isolation.
"""

import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def run_rbac_tests():
    print("==================================================")
    print("RUNNING CLINICAL RBAC & ACCESS DELEGATION TESTS")
    print("==================================================")

    # 1. Test unauthenticated request to /predict (ANN)
    print("\n[TEST 1] Unauthenticated request to POST /predict:")
    ann_payload = {
        "patient_id": "TEST_PT_999",
        "age": 50, "bp": 80, "sg": 1.020, "al": 0, "su": 0,
        "bgr": 100, "bu": 30, "sc": 1.0, "sod": 138, "pot": 4.5,
        "hemo": 14.0, "pcv": 42, "wbcc": 7000, "rbcc": 4.8,
        "rbc": "normal", "pc": "normal", "pcc": "notpresent", "ba": "notpresent",
        "htn": "no", "dm": "no", "cad": "no", "appet": "good", "pe": "no", "ane": "no"
    }
    r = requests.post(f"{BASE_URL}/predict", json=ann_payload)
    print(f"Status: {r.status_code}")
    assert r.status_code in [401, 403], f"Expected 401 or 403, got {r.status_code}"
    print("[OK] PASS: Unauthenticated access rejected.")

    # 2. Authenticate existing patient
    # In DB we have patient1@gmail.com and admin1 (Doctor)
    # Let's register a test patient and a second doctor if needed
    print("\n[TEST 2] Registering test users for verification...")
    # Register Doctor A
    doc_a_creds = {"username": "test_doc_alpha", "password": "Password123!", "role": "Doctor"}
    r = requests.post(f"{BASE_URL}/auth/register", json=doc_a_creds)
    # If already exists, login
    r_login_doc_a = requests.post(f"{BASE_URL}/auth/token", data={"username": "test_doc_alpha", "password": "Password123!"})
    if r_login_doc_a.status_code != 200:
        # Try admin1
        r_login_doc_a = requests.post(f"{BASE_URL}/auth/token", data={"username": "admin1", "password": "Password123!"})
    doc_a_token = r_login_doc_a.json().get("access_token")
    assert doc_a_token, "Could not obtain token for Doctor A"
    print(f"[OK] Doctor A authenticated.")

    # Register Doctor B
    doc_b_creds = {"username": "test_doc_beta", "password": "Password123!", "role": "Doctor"}
    requests.post(f"{BASE_URL}/auth/register", json=doc_b_creds)
    r_login_doc_b = requests.post(f"{BASE_URL}/auth/token", data={"username": "test_doc_beta", "password": "Password123!"})
    doc_b_token = r_login_doc_b.json().get("access_token")
    assert doc_b_token, "Could not obtain token for Doctor B"
    print(f"[OK] Doctor B authenticated.")

    # Register Patient X
    pat_x_creds = {"username": "patient_alex", "password": "Password123!", "role": "Patient"}
    requests.post(f"{BASE_URL}/auth/register", json=pat_x_creds)
    r_login_pat = requests.post(f"{BASE_URL}/auth/token", data={"username": "patient_alex", "password": "Password123!"})
    pat_token = r_login_pat.json().get("access_token")
    assert pat_token, "Could not obtain token for Patient Alex"
    print(f"[OK] Patient Alex authenticated.")

    # Register Admin
    admin_creds = {"username": "test_hospital_admin", "password": "Password123!", "role": "Admin"}
    requests.post(f"{BASE_URL}/auth/register", json=admin_creds)
    r_login_admin = requests.post(f"{BASE_URL}/auth/token", data={"username": "test_hospital_admin", "password": "Password123!"})
    admin_token = r_login_admin.json().get("access_token")
    assert admin_token, "Could not obtain token for Admin"
    print(f"[OK] Admin authenticated.")

    # 3. Patient role attempting clinical assessment (/predict)
    print("\n[TEST 3] Patient role attempting POST /predict:")
    r = requests.post(
        f"{BASE_URL}/predict",
        json=ann_payload,
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    print(f"Status: {r.status_code}, Body: {r.text}")
    assert r.status_code == 403, f"Expected 403 Forbidden for Patient, got {r.status_code}"
    print("[OK] PASS: Patient role successfully blocked from entering clinical assessments.")

    # 4. Patient role attempting LSTM (/predict/lstm)
    print("\n[TEST 4] Patient role attempting POST /predict/lstm:")
    lstm_payload = {
        "patient_id": "TEST_PT_999",
        "sequence": [
            {"step": 1, "ady": 0, "aval": 70, "base": 70},
            {"step": 2, "ady": 90, "aval": 65, "base": 70},
            {"step": 3, "ady": 180, "aval": 60, "base": 70}
        ]
    }
    r = requests.post(
        f"{BASE_URL}/predict/lstm",
        json=lstm_payload,
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    print(f"Status: {r.status_code}")
    assert r.status_code == 403, f"Expected 403 Forbidden for Patient on LSTM, got {r.status_code}"
    print("[OK] PASS: Patient role successfully blocked from LSTM regression engine.")

    # 5. Doctor A conducts initial assessment for patient 'TEST_PATIENT_ALPHA_01'
    print("\n[TEST 5] Doctor A predicts for a new patient 'TEST_PATIENT_ALPHA_01':")
    target_patient = "TEST_PATIENT_ALPHA_01"
    ann_payload["patient_id"] = target_patient
    r = requests.post(
        f"{BASE_URL}/predict",
        json=ann_payload,
        headers={"Authorization": f"Bearer {doc_a_token}"}
    )
    print(f"Status: {r.status_code}, Risk: {r.json().get('risk_level')}")
    assert r.status_code == 200, f"Expected 200 OK for Doctor A, got {r.status_code}: {r.text}"
    print("[OK] PASS: Doctor A successfully evaluated patient.")

    # 6. Doctor B (unassigned) tries to evaluate or access 'TEST_PATIENT_ALPHA_01'
    print("\n[TEST 6] Doctor B (unassigned) attempts to predict for 'TEST_PATIENT_ALPHA_01':")
    r = requests.post(
        f"{BASE_URL}/predict",
        json=ann_payload,
        headers={"Authorization": f"Bearer {doc_b_token}"}
    )
    print(f"Status: {r.status_code}, Detail: {r.text}")
    assert r.status_code == 403, f"Expected 403 Forbidden for unassigned Doctor B, got {r.status_code}"
    print("[OK] PASS: Doctor B blocked from unassigned patient with 403.")

    # 7. Admin delegates access to Doctor B via /admin/assignments
    print("\n[TEST 7] Admin delegates access of patient to Doctor B:")
    # Get doctor B's ID
    r_docs = requests.get(f"{BASE_URL}/admin/doctors-list", headers={"Authorization": f"Bearer {admin_token}"})
    doc_b_info = [d for d in r_docs.json() if d["username"] == "test_doc_beta"][0]
    doc_b_id = doc_b_info["id"]

    r_assign = requests.post(
        f"{BASE_URL}/admin/assignments",
        json={"doctor_id": doc_b_id, "patient_id": target_patient},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Status: {r_assign.status_code}, Message: {r_assign.json().get('message')}")
    assert r_assign.status_code == 200, f"Expected 200 OK, got {r_assign.status_code}: {r_assign.text}"
    assignment_id = r_assign.json().get("id")
    print("[OK] PASS: Admin assigned Doctor B to patient.")

    # 8. Doctor B now retries evaluation of 'TEST_PATIENT_ALPHA_01'
    print("\n[TEST 8] Doctor B retries evaluation after Admin delegation:")
    r = requests.post(
        f"{BASE_URL}/predict",
        json=ann_payload,
        headers={"Authorization": f"Bearer {doc_b_token}"}
    )
    print(f"Status: {r.status_code}, Risk: {r.json().get('risk_level')}")
    assert r.status_code == 200, f"Expected 200 OK after delegation, got {r.status_code}"
    print("[OK] PASS: Doctor B can now evaluate patient.")

    # 9. Verify History Isolation
    print("\n[TEST 9] History Isolation Check:")
    r_doc_b_hist = requests.get(f"{BASE_URL}/predictions/history", headers={"Authorization": f"Bearer {doc_b_token}"})
    patients_seen_by_b = set(item["patient_id"] for item in r_doc_b_hist.json())
    print(f"Patients visible to Doctor B: {patients_seen_by_b}")
    assert target_patient in patients_seen_by_b, "Doctor B should see assigned patient in history"

    r_pat_hist = requests.get(f"{BASE_URL}/predictions/history", headers={"Authorization": f"Bearer {pat_token}"})
    print(f"Records visible to Patient Alex: {len(r_pat_hist.json())}")
    assert all(item["patient_id"] == "patient_alex" for item in r_pat_hist.json()), "Patient should only see their own records"

    r_admin_hist = requests.get(f"{BASE_URL}/predictions/history", headers={"Authorization": f"Bearer {admin_token}"})
    print(f"Records visible to Admin (audit trail): {len(r_admin_hist.json())}")
    assert len(r_admin_hist.json()) >= len(r_doc_b_hist.json()), "Admin sees global audit records"
    print("[OK] PASS: History isolation strictly enforced.")

    # 10. Admin revokes assignment
    print("\n[TEST 10] Admin revokes Doctor B's assignment:")
    if assignment_id:
        r_del = requests.delete(f"{BASE_URL}/admin/assignments/{assignment_id}", headers={"Authorization": f"Bearer {admin_token}"})
        print(f"Status: {r_del.status_code}, Response: {r_del.json()}")
        assert r_del.status_code == 200
        print("[OK] PASS: Revocation successful.")

    print("\n==================================================")
    print("ALL CLINICAL RBAC & ACCESS DELEGATION TESTS PASSED!")
    print("==================================================")

if __name__ == "__main__":
    run_rbac_tests()
