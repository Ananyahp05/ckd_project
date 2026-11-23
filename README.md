# CKD Guardian - AI-Powered Chronic Kidney Disease Management System

A comprehensive web application for early detection, risk stratification, and longitudinal monitoring of Chronic Kidney Disease using advanced Artificial Intelligence and Machine Learning techniques.

## 🚀 Features

- **AI-Based eGFR Prediction**: Utilizes deep learning models (ANN, LSTM, Hybrid) to predict Glomerular Filtration Rate (eGFR) with high accuracy.
- **Patient Assessment**: Self-assessment module for patients to evaluate their CKD risk based on clinical parameters.
- **Clinician Dashboard**: Comprehensive view for doctors to monitor patient trends, risks, and treatment adherence.
- **Longitudinal Monitoring**: Track patient vitals (Albumin, Creatinine, etc.) over time with interactive visualizations.
- **Real-time Alerts**: Instant notifications for critical eGFR drops or risk escalations.
- **Hybrid ML Architecture**: Combines Multiple Linear Regression, KNN, and XGBoost for robust classification and regression tasks.

## 🛠️ Tech Stack

### Backend (Python - FastAPI)
- **Framework**: FastAPI
- **Database**: SQLite (Local), PostgreSQL (Production)
- **ORM**: SQLAlchemy
- **AI/ML Libraries**:
  - Scikit-learn
  - TensorFlow / Keras
  - XGBoost
- **Authentication**: JWT (PyJWT), Bcrypt

### Frontend (Next.js 16)
- **Framework**: Next.js (React)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI, Lucide React
- **Visualization**: Recharts

## 📂 Project Structure

```
ckd_project/
├── backend/                    # FastAPI Application
│   ├── api/                    # API Endpoints and Routing
│   ├── models/                 # Database Models
│   ├── services/               # Business Logic & AI Models (ann_service, lstm_service, etc.)
│   ├── utils/                  # Utility Functions (e.g., sql_utils)
│   └── main.py                 # Application Entry Point
│
├── frontend/                   # Next.js Application
│   ├── app/                    # Pages and Routes
│   ├── components/             # Reusable UI Components
│   ├── lib/                    # Utility Functions & API Clients
│   └── store/                  # Zustand State Management
│
└── docs/                       # Documentation
    └── ckd_prediction_system_spec.md
```

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+ recommended for backend, v20+ for frontend)
- **Python** (v3.8+)
- **npm** (or **yarn**)

### Backend Setup
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  Run the FastAPI server:
    ```bash
    uvicorn main:app --host 127.0.0.1 --port 8000 --reload
    ```
    The API will be available at `http://localhost:8000`.

### Frontend Setup
1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install Node.js dependencies:
    ```bash
    npm install
    ```

3.  Run the Next.js development server:
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:3000`.

## 🤝 Contributing

Contributions are welcome! Please refer to the [Contribution Guidelines](docs/CONTRIBUTING.md) for more details.

## 📄 License

This project is proprietary and part of the **CKD Guardian** system. All rights reserved.