from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class Hospital(Base):
    __tablename__ = "ckd_hospitals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    address = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users = relationship("User", back_populates="hospital")
    patients = relationship("PatientRecord", back_populates="hospital")

class User(Base):
    __tablename__ = "ckd_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String)
    role = Column(String, default="patient")  # "admin", "doctor", "patient", "lab_technician"
    hospital_id = Column(Integer, ForeignKey("ckd_hospitals.id"), nullable=True)
    account_status = Column(String, default="active")  # "active", "pending_invitation", "deactivated", "suspended"
    email_verified = Column(Boolean, default=True)
    invitation_token = Column(String, nullable=True, index=True)
    invitation_expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", back_populates="users")
    predictions = relationship("PredictionHistory", back_populates="owner")
    assigned_patients = relationship("DoctorPatientAssignment", foreign_keys="DoctorPatientAssignment.doctor_id", back_populates="doctor")
    notifications = relationship("Notification", back_populates="user")

class PatientRecord(Base):
    __tablename__ = "ckd_patient_records"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, unique=True, index=True, nullable=False)  # MRN
    user_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=True)
    hospital_id = Column(Integer, ForeignKey("ckd_hospitals.id"), nullable=True)
    assigned_doctor_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)
    age = Column(Float, nullable=True)
    gender = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    medical_history = Column(Text, nullable=True)
    allergies = Column(Text, nullable=True)
    registration_date = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="Active")  # "Active", "Discharged", "Critical"

    hospital = relationship("Hospital", back_populates="patients")
    assigned_doctor = relationship("User", foreign_keys=[assigned_doctor_id])
    user_account = relationship("User", foreign_keys=[user_id])

class PredictionHistory(Base):
    __tablename__ = "ckd_prediction_history"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, index=True)  # An identifier for the patient being evaluated
    risk_score = Column(Float)
    prediction_label = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    patient_age = Column(Float, nullable=True)
    input_features = Column(JSON, nullable=True)
    shap_values = Column(JSON, nullable=True)

    owner_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=True)

    owner = relationship("User", back_populates="predictions")

class DoctorPatientAssignment(Base):
    __tablename__ = "ckd_doctor_patient_assignments"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("ckd_users.id"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    assigned_by = Column(String, default="Admin")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    doctor = relationship("User", foreign_keys=[doctor_id], back_populates="assigned_patients")

class LabTest(Base):
    __tablename__ = "ckd_lab_tests"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, index=True, nullable=False)
    test_name = Column(String, nullable=False)
    category = Column(String, nullable=False)  # "Renal Function", "Electrolytes", "Hematology", "Metabolic"
    test_value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    reference_range = Column(String, nullable=True)
    loinc_code = Column(String, nullable=True)
    status = Column(String, default="NORMAL")  # "NORMAL", "ELEVATED", "LOW", "CRITICAL"
    notes = Column(Text, nullable=True)
    technician_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=True)
    technician_name = Column(String, nullable=True)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    technician = relationship("User", foreign_keys=[technician_id])

class LabRequest(Base):
    __tablename__ = "ckd_lab_requests"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=False)
    doctor_name = Column(String, nullable=True)
    test_type = Column(String, nullable=False)
    priority = Column(String, default="Routine")  # "Routine", "Urgent", "STAT"
    clinical_notes = Column(Text, nullable=True)
    status = Column(String, default="Pending")  # "Pending", "In Progress", "Completed", "Cancelled"
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    doctor = relationship("User", foreign_keys=[doctor_id])

class AuditLog(Base):
    __tablename__ = "ckd_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=True)
    user_email = Column(String, nullable=True)
    role = Column(String, nullable=True)
    action = Column(String, nullable=False)
    resource = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])

class Notification(Base):
    __tablename__ = "ckd_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("ckd_users.id"), nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String, default="info")  # "info", "warning", "critical", "success"
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")
