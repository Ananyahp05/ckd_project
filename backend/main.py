from pathlib import Path
import os
BASE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("KERAS_HOME", str(BASE_DIR / ".keras_cache"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as predict_router
from api.auth import router as auth_router
from database import engine, SessionLocal
from models import db_models
from services.kafka_service import kafka_service

db_models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="EDCIF CKD Prediction API")

@app.on_event("startup")
async def startup_services():
    # 1. Startup DB Seed
    db = SessionLocal()
    try:
        admin = db.query(db_models.User).filter(db_models.User.username == "admin").first()
        if not admin:
            from api.auth import get_password_hash
            new_admin = db_models.User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                role="Admin",
                is_active=True
            )
            db.add(new_admin)
            
            dr_user = db_models.User(
                username="dr_smith",
                hashed_password=get_password_hash("doctor123"),
                role="Doctor",
                is_active=True
            )
            db.add(dr_user)
            
            pt_user = db_models.User(
                username="PT-LSTM-001",
                hashed_password=get_password_hash("patient123"),
                role="Patient",
                is_active=True
            )
            db.add(pt_user)
            db.commit()
            print("[DB] Initialized default seed accounts: admin, dr_smith, PT-LSTM-001")
    except Exception as e:
        print(f"[DB] Startup seeding skipped: {e}")
    finally:
        db.close()

    # 2. Connect to Apache Kafka Cloud Broker
    try:
        await kafka_service.start()
    except Exception as e:
        print(f"[KAFKA] Startup initialization notice: {e}")

@app.on_event("shutdown")
async def shutdown_services():
    try:
        await kafka_service.stop()
    except Exception as e:
        print(f"[KAFKA] Shutdown notice: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(predict_router)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "EDCIF API is running"}
