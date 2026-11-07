from typing import Literal, Optional, List, Any
from pydantic import BaseModel, Field, field_validator
import re

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

ALLOWED_ROLES = ("doctor", "admin", "patient", "lab_technician", "Doctor", "Admin", "Patient", "Lab_Technician")

class PatientData(BaseModel):
    patient_id: str = Field(default="Anonymous", description="Patient identifier")
    age: float
    bp: float
    sg: float = 1.020
    al: float = 0.0
    su: float = 0.0
    bgr: float
    bu: float
    sc: float
    sod: float
    pot: float
    hemo: float
    pcv: float
    wbcc: float
    rbcc: float
    rbc: str = Field(description="'normal', 'abnormal', or 'unknown'")
    pc: str = Field(description="'normal', 'abnormal', or 'unknown'")
    pcc: str = Field(description="'present' or 'notpresent'")
    ba: str = Field(description="'present' or 'notpresent'")
    htn: str = Field(description="'yes' or 'no'")
    dm: str = Field(description="'yes' or 'no'")
    cad: str = Field(description="'yes' or 'no'")
    appet: str = Field(description="'good', 'poor', or 'unknown'")
    pe: str = Field(description="'yes' or 'no'")
    ane: str = Field(description="'yes' or 'no'")

# ── Authentication & User Schemas ──────────────────────────────────────────

class PatientRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if not EMAIL_REGEX.match(v_clean):
            raise ValueError("Invalid email format. Please provide a valid email address.")
        return v_clean

class LoginRequest(BaseModel):
    email: str
    password: str

class StaffInviteRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=120)
    role: Literal["doctor", "lab_technician"]
    specialization: Optional[str] = None
    hospital_id: Optional[int] = None

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if not EMAIL_REGEX.match(v_clean):
            raise ValueError("Invalid email format. Please provide a valid email address.")
        return v_clean

class AcceptInvitationRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=6, max_length=128)

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: str = "doctor"

class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    hospital_id: Optional[int] = None
    account_status: Optional[str] = "active"
    is_active: bool

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: str

class UserStatusUpdate(BaseModel):
    is_active: Optional[bool] = None
    account_status: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user: Optional[UserOut] = None

# ── Patient Management Schemas ──────────────────────────────────────────────

class PatientRecordCreate(BaseModel):
    patient_id: str = Field(..., min_length=2, max_length=64, description="Hospital MRN / identifier")
    full_name: str = Field(..., min_length=2, max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    age: Optional[float] = None
    gender: Optional[str] = "Unknown"
    blood_group: Optional[str] = None
    emergency_contact: Optional[str] = None
    medical_history: Optional[str] = None
    allergies: Optional[str] = None
    assigned_doctor_id: Optional[int] = None
    status: Optional[str] = "Active"

class PatientRecordOut(BaseModel):
    id: int
    patient_id: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[float] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    assigned_doctor_id: Optional[int] = None
    assigned_doctor_name: Optional[str] = None
    registration_date: Optional[Any] = None
    status: Optional[str] = "Active"
    last_measurement_date: Optional[Any] = None
    latest_prediction_status: Optional[str] = None
    latest_risk_score: Optional[float] = None

    class Config:
        from_attributes = True

# ── Lab Test & Request Schemas ──────────────────────────────────────────────

class LabTestCreate(BaseModel):
    patient_id: str = Field(..., description="Target patient MRN")
    test_name: str = Field(..., description="Biomarker test name (e.g., Serum Creatinine)")
    category: str = Field(default="Renal Function")
    test_value: float
    unit: str
    reference_range: Optional[str] = None
    loinc_code: Optional[str] = None
    status: Optional[str] = "NORMAL"
    notes: Optional[str] = None

class LabTestOut(BaseModel):
    id: int
    patient_id: str
    test_name: str
    category: str
    test_value: float
    unit: str
    reference_range: Optional[str] = None
    loinc_code: Optional[str] = None
    status: str
    notes: Optional[str] = None
    technician_name: Optional[str] = None
    recorded_at: Any

    class Config:
        from_attributes = True

class LabRequestCreate(BaseModel):
    patient_id: str
    test_type: str = "Comprehensive Renal Panel"
    priority: Literal["Routine", "Urgent", "STAT"] = "Routine"
    clinical_notes: Optional[str] = None

class LabRequestOut(BaseModel):
    id: int
    patient_id: str
    doctor_id: int
    doctor_name: Optional[str] = None
    test_type: str
    priority: str
    clinical_notes: Optional[str] = None
    status: str
    requested_at: Any
    completed_at: Optional[Any] = None

    class Config:
        from_attributes = True

# ── Audit & Notification Schemas ────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    user_email: Optional[str] = None
    role: Optional[str] = None
    action: str
    resource: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: Any

    class Config:
        from_attributes = True

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: Any

    class Config:
        from_attributes = True

# ── LSTM & Hybrid eGFR Prediction Schemas (Preserved) ────────────────────────

class LSTMTimeStep(BaseModel):
    aval: float = Field(..., description="Observed eGFR in mL/min/1.73m² at this visit")
    ady: float = Field(..., description="Analysis visit day (e.g., 0, 90, 180)")
    base: float = Field(..., description="Baseline eGFR measurement")

class LSTMPredictRequest(BaseModel):
    patient_id: str = Field(default="Anonymous", description="Patient identifier")
    sequence: list[LSTMTimeStep] = Field(..., min_length=3, max_length=3, description="Historical sequence of exactly 3 timesteps")

class HybridSequenceStep(BaseModel):
    aval: float = Field(..., description="Observed eGFR in mL/min/1.73m² at this visit")
    ady: float = Field(..., description="Analysis visit day (e.g., 0, 90, 180)")

class HybridPredictRequest(BaseModel):
    patient_id: str = Field(default="Anonymous", description="Patient identifier")
    sequence: list[HybridSequenceStep] = Field(..., min_length=3, max_length=3, description="Historical sequence of exactly 3 timesteps")
    baseline_egfr: float = Field(..., description="Baseline eGFR measurement ('base')")

class AssignmentCreate(BaseModel):
    doctor_id: int = Field(..., description="ID of the doctor to assign")
    patient_id: str = Field(..., description="Username or patient ID to assign")

class AssignmentOut(BaseModel):
    id: int
    doctor_id: int
    doctor_username: str
    patient_id: str
    assigned_by: str
    created_at: str
