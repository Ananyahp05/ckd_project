from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import jwt
import uuid
import os
import bcrypt

from database import get_db
from models.db_models import User, PatientRecord, AuditLog, Hospital, DoctorPatientAssignment
from models.schemas import (
    PatientRegisterRequest, LoginRequest, StaffInviteRequest, AcceptInvitationRequest,
    UserOut, UserRoleUpdate, UserStatusUpdate, Token
)
from services.email_service import send_invitation_email, get_email_config_status

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-keep-it-secret-production-grade")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="auth/token", auto_error=False)

router = APIRouter()

# ── Helper Security Functions ────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def log_audit_event(db: Session, user: User, action: str, resource: str = None, details: str = None, ip_address: str = None):
    try:
        log = AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else "anonymous",
            role=user.role if user else "guest",
            action=action,
            resource=resource,
            details=details,
            ip_address=ip_address
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"[AUDIT LOGGING ERROR] Failed to write audit event: {e}")
        db.rollback()

# ── Current User Authentication & Role Dependencies ──────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or session has expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    # Match by email or username
    user = db.query(User).filter((User.email == username) | (User.username == username)).first()
    if user is None:
        raise credentials_exception

    # Check account status
    if not user.is_active or user.account_status in ("deactivated", "suspended"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended or deactivated. Contact a hospital administrator."
        )
    if user.account_status == "pending_invitation":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is pending initial password setup. Please activate using your invitation link."
        )
    return user

def get_optional_current_user(token: str = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        return get_current_user(token=token, db=db)
    except Exception:
        return None

def require_roles(*allowed_roles: str):
    """
    RBAC dependency factory that validates the authenticated user has one of the allowed roles.
    Performs case-insensitive matching (e.g. 'doctor' == 'Doctor').
    """
    normalized_allowed = {r.lower() for r in allowed_roles}

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = (current_user.role or "").lower()
        if user_role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: role '{current_user.role}' is not authorized. Required: {list(allowed_roles)}"
            )
        return current_user
    return role_checker

# ── PHASE 2.A: Patient Public Registration ───────────────────────────────────

@router.post("/register", response_model=UserOut)
def register_patient(payload: PatientRegisterRequest, db: Session = Depends(get_db)):
    """
    Public registration endpoint strictly reserved for Patients.
    Accepts ONLY: full_name, email, password.
    Automatically assigns role='patient'. Does not trust any client-supplied role.
    """
    email_clean = payload.email.strip().lower()

    # Check for existing email or username
    existing_user = db.query(User).filter(
        (User.email == email_clean) | (User.username == email_clean)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address is already registered. Please log in."
        )

    # Resolve default hospital
    hospital = db.query(Hospital).first()
    hospital_id = hospital.id if hospital else None

    hashed_password = get_password_hash(payload.password)
    new_user = User(
        username=email_clean,
        email=email_clean,
        full_name=payload.full_name.strip(),
        hashed_password=hashed_password,
        role="patient",  # Strictly assigned by backend
        hospital_id=hospital_id,
        account_status="active",
        email_verified=True,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Automatically generate corresponding PatientRecord profile
    assigned_doctor = db.query(User).filter(User.role.in_(["doctor", "Doctor"])).first()
    patient_mrn = f"PT-{new_user.id:04d}"
    
    patient_profile = PatientRecord(
        patient_id=patient_mrn,
        user_id=new_user.id,
        hospital_id=hospital_id,
        assigned_doctor_id=assigned_doctor.id if assigned_doctor else None,
        full_name=new_user.full_name,
        email=new_user.email,
        status="Active"
    )
    db.add(patient_profile)
    db.commit()

    log_audit_event(
        db, new_user, "PATIENT_SELF_REGISTERED",
        resource=f"patient:{patient_mrn}",
        details=f"Patient {new_user.full_name} registered via public portal."
    )

    return new_user

# ── PHASE 2.B: Unified Login (Email + Password Only) ─────────────────────────

@router.post("/login", response_model=Token)
def login_user(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Professional login requiring ONLY email and password.
    No role dropdown or user-type selection.
    Retrieves the actual role from the database and returns token with user profile.
    """
    identifier = payload.email.strip().lower()
    alt_identifier = identifier.replace("@metrohealth.org", "@hospital.org")
    user = db.query(User).filter(
        (User.email == identifier) | (User.email == alt_identifier) | (User.username == identifier)
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please verify your credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active or user.account_status in ("deactivated", "suspended"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated or suspended. Please contact hospital administration."
        )

    if user.account_status == "pending_invitation":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account invitation is pending activation. Please use your setup link to establish a password."
        )

    # Standardize role format
    norm_role = user.role.lower()

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email or user.username, "role": norm_role, "uid": user.id},
        expires_delta=access_token_expires
    )

    log_audit_event(
        db, user, "USER_LOGIN",
        resource=f"user:{user.id}",
        details=f"Successful authentication as role '{norm_role}'.",
        ip_address=request.client.host if request.client else None
    )

    user_out = UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=norm_role,
        hospital_id=user.hospital_id,
        account_status=user.account_status,
        is_active=user.is_active
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": norm_role,
        "user": user_out
    }

# Backward compatibility for OAuth2 Form Data (e.g. Swagger UI or existing scripts)
@router.post("/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    identifier = form_data.username.strip().lower()
    user = db.query(User).filter(
        (User.email == identifier) | (User.username == identifier)
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active or user.account_status in ("deactivated", "suspended"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive or suspended. Contact an administrator."
        )

    norm_role = user.role.lower()
    access_token = create_access_token(
        data={"sub": user.email or user.username, "role": norm_role, "uid": user.id}
    )
    user_out = UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=norm_role,
        hospital_id=user.hospital_id,
        account_status=user.account_status,
        is_active=user.is_active
    )
    return {"access_token": access_token, "token_type": "bearer", "role": norm_role, "user": user_out}

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    norm_role = current_user.role.lower()
    
    # If patient, resolve patient_id MRN
    patient_mrn = None
    if norm_role == "patient":
        pt = db.query(PatientRecord).filter(
            (PatientRecord.user_id == current_user.id) | 
            (PatientRecord.patient_id == current_user.username) |
            (PatientRecord.email == current_user.email)
        ).first()
        if pt:
            patient_mrn = pt.patient_id

    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": norm_role,
        "hospital_id": current_user.hospital_id,
        "account_status": current_user.account_status,
        "is_active": current_user.is_active,
        "patient_mrn": patient_mrn
    }

# ── PHASE 2.C: Hospital Administrator Staff Invitations ─────────────────────

@router.post("/invite-staff", tags=["admin"])
def invite_staff_member(
    payload: StaffInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """
    Hospital Administrator only: Securely provision an authorized staff account
    (Doctor or Lab Technician). Sends a one-time expiring invitation link.
    """
    email_clean = payload.email.strip().lower()

    # Check if already registered
    existing_user = db.query(User).filter(
        (User.email == email_clean) | (User.username == email_clean)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{email_clean}' already exists."
        )

    token = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(hours=48)
    hospital_id = payload.hospital_id or current_user.hospital_id

    # Temporary placeholder random hash until invitation acceptance
    temp_hash = get_password_hash(str(uuid.uuid4()))

    new_staff = User(
        username=email_clean,
        email=email_clean,
        full_name=payload.full_name.strip(),
        hashed_password=temp_hash,
        role=payload.role.lower(),
        hospital_id=hospital_id,
        account_status="pending_invitation",
        email_verified=False,
        invitation_token=token,
        invitation_expires_at=expires_at,
        is_active=True
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    invitation_link = f"{FRONTEND_URL}/accept-invitation?token={token}"
    dispatch_result = send_invitation_email(
        to_email=new_staff.email,
        recipient_name=new_staff.full_name,
        role=new_staff.role,
        invitation_link=invitation_link
    )

    log_audit_event(
        db, current_user, "STAFF_INVITED",
        resource=f"user:{new_staff.id}",
        details=f"Invited staff '{new_staff.full_name}' ({new_staff.email}) as {new_staff.role}."
    )

    return {
        "id": new_staff.id,
        "full_name": new_staff.full_name,
        "email": new_staff.email,
        "role": new_staff.role,
        "account_status": new_staff.account_status,
        "invitation_expires_at": new_staff.invitation_expires_at.isoformat(),
        "invitation_link": invitation_link,
        "delivery": dispatch_result
    }

@router.post("/resend-invitation/{user_id}", tags=["admin"])
def resend_staff_invitation(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Regenerates and resends a staff invitation link."""
    staff = db.query(User).filter(User.id == user_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff account not found.")

    if staff.account_status != "pending_invitation":
        raise HTTPException(status_code=400, detail="Account is already activated.")

    token = str(uuid.uuid4())
    staff.invitation_token = token
    staff.invitation_expires_at = datetime.utcnow() + timedelta(hours=48)
    db.commit()

    invitation_link = f"{FRONTEND_URL}/accept-invitation?token={token}"
    dispatch_result = send_invitation_email(
        to_email=staff.email,
        recipient_name=staff.full_name,
        role=staff.role,
        invitation_link=invitation_link
    )

    log_audit_event(
        db, current_user, "STAFF_INVITATION_RESENT",
        resource=f"user:{staff.id}",
        details=f"Regenerated invitation link for staff '{staff.full_name}'."
    )

    return {
        "id": staff.id,
        "email": staff.email,
        "invitation_link": invitation_link,
        "delivery": dispatch_result
    }

@router.post("/accept-invitation")
def accept_staff_invitation(payload: AcceptInvitationRequest, db: Session = Depends(get_db)):
    """
    Staff members establish their secure password via their one-time invitation token.
    """
    user = db.query(User).filter(User.invitation_token == payload.token.strip()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token."
        )

    if user.invitation_expires_at and user.invitation_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation token has expired. Please contact your hospital administrator for a new link."
        )

    user.hashed_password = get_password_hash(payload.password)
    user.account_status = "active"
    user.email_verified = True
    user.invitation_token = None
    user.invitation_expires_at = None
    user.is_active = True
    db.commit()

    log_audit_event(
        db, user, "INVITATION_ACTIVATED",
        resource=f"user:{user.id}",
        details=f"Staff account activated credentials for role '{user.role}'."
    )

    return {"message": "Account successfully activated! You may now sign in.", "role": user.role}

# ── Admin Account & Status Controls ──────────────────────────────────────────

@router.get("/users", tags=["admin"])
def get_all_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Retrieve all registered hospital staff and accounts."""
    users = db.query(User).order_by(User.id.asc()).all()
    out = []
    for u in users:
        # Count assigned patients if doctor
        assigned_cnt = 0
        if u.role.lower() == "doctor":
            assigned_cnt = db.query(DoctorPatientAssignment).filter(
                DoctorPatientAssignment.doctor_id == u.id
            ).count()
        out.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.lower(),
            "hospital_id": u.hospital_id,
            "account_status": u.account_status,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "assigned_patient_count": assigned_cnt
        })
    return out

@router.patch("/users/{user_id}/status", tags=["admin"])
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin"))
):
    """Admin-only: Activate, deactivate, or suspend a user account."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot alter your own active status.")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.is_active is not None:
        user.is_active = payload.is_active
        user.account_status = "active" if payload.is_active else "deactivated"
    if payload.account_status:
        user.account_status = payload.account_status
        user.is_active = (payload.account_status == "active")

    db.commit()
    db.refresh(user)

    log_audit_event(
        db, current_user, "USER_STATUS_UPDATED",
        resource=f"user:{user.id}",
        details=f"Updated status for '{user.email}' to '{user.account_status}'."
    )

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role.lower(),
        "account_status": user.account_status,
        "is_active": user.is_active
    }

@router.get("/email-status", tags=["admin"])
def check_email_configuration(current_user: User = Depends(require_roles("admin"))):
    """Inspects environment configuration for SMTP email provider."""
    return get_email_config_status()
