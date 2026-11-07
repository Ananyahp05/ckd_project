import sqlite3
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "ckd_project.db"

def migrate():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Extend ckd_users
    cursor.execute("PRAGMA table_info(ckd_users)")
    existing_user_cols = [row[1] for row in cursor.fetchall()]

    new_user_cols = [
        ("full_name", "TEXT"),
        ("email", "TEXT"),
        ("hospital_id", "INTEGER"),
        ("account_status", "TEXT DEFAULT 'active'"),
        ("email_verified", "BOOLEAN DEFAULT 1"),
        ("invitation_token", "TEXT"),
        ("invitation_expires_at", "TIMESTAMP"),
        ("created_at", "TIMESTAMP"),
        ("updated_at", "TIMESTAMP")
    ]

    for col_name, col_type in new_user_cols:
        if col_name not in existing_user_cols:
            print(f"Adding column '{col_name}' to ckd_users...")
            cursor.execute(f"ALTER TABLE ckd_users ADD COLUMN {col_name} {col_type}")

    # 2. Create ckd_hospitals
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ckd_hospitals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        address TEXT,
        contact_email TEXT,
        phone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Create ckd_patient_records
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ckd_patient_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        hospital_id INTEGER,
        assigned_doctor_id INTEGER,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        date_of_birth TEXT,
        age REAL,
        gender TEXT,
        blood_group TEXT,
        emergency_contact TEXT,
        medical_history TEXT,
        allergies TEXT,
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'Active',
        FOREIGN KEY(user_id) REFERENCES ckd_users(id),
        FOREIGN KEY(hospital_id) REFERENCES ckd_hospitals(id),
        FOREIGN KEY(assigned_doctor_id) REFERENCES ckd_users(id)
    )
    """)

    # 4. Create ckd_lab_tests
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ckd_lab_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        test_name TEXT NOT NULL,
        category TEXT NOT NULL,
        test_value REAL NOT NULL,
        unit TEXT NOT NULL,
        reference_range TEXT,
        loinc_code TEXT,
        status TEXT DEFAULT 'NORMAL',
        notes TEXT,
        technician_id INTEGER,
        technician_name TEXT,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(technician_id) REFERENCES ckd_users(id)
    )
    """)

    # 5. Create ckd_lab_requests
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ckd_lab_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        doctor_id INTEGER NOT NULL,
        doctor_name TEXT,
        test_type TEXT NOT NULL,
        priority TEXT DEFAULT 'Routine',
        clinical_notes TEXT,
        status TEXT DEFAULT 'Pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY(doctor_id) REFERENCES ckd_users(id)
    )
    """)

    # 6. Create ckd_audit_logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ckd_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_email TEXT,
        role TEXT,
        action TEXT NOT NULL,
        resource TEXT,
        details TEXT,
        ip_address TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES ckd_users(id)
    )
    """)

    # 7. Create ckd_notifications
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ckd_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        is_read BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES ckd_users(id)
    )
    """)

    # Seed default hospital
    cursor.execute("SELECT id FROM ckd_hospitals WHERE code = 'METRO-NEPHRO-01'")
    hosp = cursor.fetchone()
    if not hosp:
        cursor.execute("""
        INSERT INTO ckd_hospitals (name, code, address, contact_email, phone)
        VALUES ('MetroHealth Nephrology & Kidney Institute', 'METRO-NEPHRO-01', '742 Evergreen Terrace, Medical District', 'nephrology@metrohealth.org', '+1-800-555-0199')
        """)
        hospital_id = cursor.lastrowid
        print(f"Created default hospital with ID: {hospital_id}")
    else:
        hospital_id = hosp[0]

    # Update existing users with emails and hospital_id
    cursor.execute("SELECT id, username, email, full_name, role FROM ckd_users")
    users = cursor.fetchall()
    for uid, uname, uemail, ufname, urole in users:
        # Default email if empty
        computed_email = uemail
        if not computed_email:
            if "@" in uname:
                computed_email = uname.lower()
            else:
                computed_email = f"{uname.lower()}@metrohealth.org"
        
        computed_fullname = ufname
        if not computed_fullname:
            if urole.lower() == "doctor":
                computed_fullname = f"Dr. {uname.capitalize()}"
            elif urole.lower() == "patient":
                computed_fullname = f"Patient {uname}"
            elif urole.lower() == "admin":
                computed_fullname = f"Administrator {uname.capitalize()}"
            else:
                computed_fullname = uname.capitalize()

        # Normalize role to lowercase standard: 'doctor', 'patient', 'admin', 'lab_technician'
        norm_role = urole.lower()
        if norm_role == "doctor":
            norm_role = "doctor"
        elif norm_role == "patient":
            norm_role = "patient"
        elif norm_role == "admin":
            norm_role = "admin"
        elif "lab" in norm_role or "tech" in norm_role:
            norm_role = "lab_technician"

        cursor.execute("""
        UPDATE ckd_users 
        SET email = ?, full_name = ?, hospital_id = ?, role = ?
        WHERE id = ?
        """, (computed_email, computed_fullname, hospital_id, norm_role, uid))

    # Ensure hospital bootstrap administrator exists with role 'admin'
    cursor.execute("SELECT id FROM ckd_users WHERE role = 'admin' OR username = 'admin'")
    admin_row = cursor.fetchone()
    if not admin_row:
        import bcrypt
        hashed = bcrypt.hashpw(b"Admin@Hospital2026", bcrypt.gensalt()).decode('utf-8')
        cursor.execute("""
        INSERT INTO ckd_users (username, email, full_name, hashed_password, role, hospital_id, account_status, email_verified)
        VALUES ('admin', 'admin@metrohealth.org', 'Chief Hospital Administrator', ?, 'admin', ?, 'active', 1)
        """, (hashed, hospital_id))
        print("Provisioned authorized Hospital Admin bootstrap account: admin@metrohealth.org")

    # Backfill patient records from existing assignments and predictions
    cursor.execute("SELECT DISTINCT patient_id FROM ckd_prediction_history WHERE patient_id IS NOT NULL")
    history_patients = [row[0] for row in cursor.fetchall()]

    cursor.execute("SELECT DISTINCT patient_id, doctor_id FROM ckd_doctor_patient_assignments")
    assigned_patients = cursor.fetchall()
    doc_map = {p: d for p, d in assigned_patients}

    all_patient_ids = set(history_patients) | set(doc_map.keys())

    # Get a default doctor id
    cursor.execute("SELECT id FROM ckd_users WHERE role = 'doctor' LIMIT 1")
    first_doc = cursor.fetchone()
    default_doc_id = first_doc[0] if first_doc else None

    for pid in all_patient_ids:
        cursor.execute("SELECT id FROM ckd_patient_records WHERE patient_id = ?", (pid,))
        if not cursor.fetchone():
            assigned_doc = doc_map.get(pid, default_doc_id)
            cursor.execute("""
            INSERT INTO ckd_patient_records (patient_id, full_name, age, gender, blood_group, hospital_id, assigned_doctor_id, status)
            VALUES (?, ?, 54.0, 'Male', 'O+', ?, ?, 'Active')
            """, (pid, f"Patient {pid}", hospital_id, assigned_doc))
            print(f"Created patient profile for existing patient ID: {pid}")

    conn.commit()
    conn.close()
    print("Database migration and schema enhancement completed successfully!")

if __name__ == "__main__":
    migrate()
