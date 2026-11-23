"""
reset_passwords.py — Utility to reset user passwords in the CKD hospital platform database.
Usage:
    python reset_passwords.py               (Resets all accounts to standard default passwords)
    python reset_passwords.py <email> <new_password>
"""

import sys
import sqlite3
import shutil
from pathlib import Path
import bcrypt

BASE_DIR = Path(__file__).resolve().parent
DB_BACKEND = BASE_DIR / "ckd_project.db"
DB_ROOT = BASE_DIR.parent / "ckd_project.db"

def get_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def reset_all_passwords():
    print(f"Connecting to database: {DB_BACKEND}")
    conn = sqlite3.connect(DB_BACKEND)
    cursor = conn.cursor()

    # Default passwords mapped by email / role
    defaults = {
        "admin@hospital.org": ("admin", "Admin123!"),
        "admin1@hospital.org": ("doctor", "Doctor123!"),
        "admin2@hospital.org": ("doctor", "Doctor123!"),
        "patient1@gmail.com": ("patient", "Patient123!"),
        "john@123gmail.com": ("patient", "Patient123!"),
    }

    # Fetch all users
    cursor.execute("SELECT id, username, email, role, full_name FROM ckd_users")
    users = cursor.fetchall()

    print("\n" + "="*70)
    print("RESETTING PASSWORDS TO KNOWN STANDARDS:")
    print("="*70)

    for uid, uname, uemail, urole, ufname in users:
        key = uemail or uname
        if key in defaults:
            new_pass = defaults[key][1]
        elif urole.lower() == "admin":
            new_pass = "Admin123!"
        elif urole.lower() == "doctor":
            new_pass = "Doctor123!"
        elif urole.lower() == "lab_technician":
            new_pass = "Tech123!"
        else:
            new_pass = "Patient123!"

        pwd_hash = get_hash(new_pass)
        cursor.execute("UPDATE ckd_users SET hashed_password = ? WHERE id = ?", (pwd_hash, uid))
        print(f"User: {uname:<20} | Email: {uemail:<26} | Role: {urole:<10} -> Password set to: {new_pass}")

    conn.commit()
    conn.close()

    # Sync to root ckd_project.db
    if DB_ROOT.exists():
        shutil.copy2(DB_BACKEND, DB_ROOT)
        print(f"\n[OK] Synced database to root directory: {DB_ROOT}")

    print("="*70)
    print("ALL PASSWORDS RESET SUCCESSFULLY!")
    print("="*70 + "\n")

def reset_single_user(identifier: str, new_password: str):
    conn = sqlite3.connect(DB_BACKEND)
    cursor = conn.cursor()
    pwd_hash = get_hash(new_password)
    
    cursor.execute("UPDATE ckd_users SET hashed_password = ? WHERE email = ? OR username = ?", (pwd_hash, identifier, identifier))
    if cursor.rowcount == 0:
        print(f"[ERROR] User '{identifier}' not found in database.")
    else:
        conn.commit()
        print(f"[OK] Password for '{identifier}' successfully reset to: {new_password}")
        if DB_ROOT.exists():
            shutil.copy2(DB_BACKEND, DB_ROOT)

    conn.close()

if __name__ == "__main__":
    if len(sys.argv) == 3:
        reset_single_user(sys.argv[1], sys.argv[2])
    else:
        reset_all_passwords()

