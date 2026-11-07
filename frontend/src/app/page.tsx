"use client";

import React, { useState, useEffect } from "react";
import PatientForm from "@/components/PatientForm";
import FederatedDashboard from "@/components/FederatedDashboard";
import HistoryDashboard from "@/components/HistoryDashboard";
import RealTimeAlerts from "@/components/RealTimeAlerts";
import UserManagement from "@/components/UserManagement";
import PatientPortal from "@/components/PatientPortal";
import UnifiedPatientEHR from "@/components/UnifiedPatientEHR";
import LabDashboard from "@/components/LabDashboard";
import DoctorDashboard from "@/components/DoctorDashboard";
import AdminDashboard from "@/components/AdminDashboard";
import { API_BASE_URL } from "@/lib/api";

type UserProfile = {
  username: string;
  email?: string;
  full_name?: string;
  role: string;
  id: number;
};

type TabType = "assessment" | "history" | "federated" | "patient_portal" | "users" | "ehr" | "lab";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("ehr");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ehrPatientId, setEhrPatientId] = useState<string>("");

  // Landing Page Auth Card State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // States to pass reloaded inputs back to PatientForm
  const [externalPatientData, setExternalPatientData] = useState<any>(null);
  const [externalPatientResult, setExternalPatientResult] = useState<any>(null);

  const fetchProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setToken(authToken);
        const normRole = (userData.role || "").toLowerCase();
        if (normRole === "patient") {
          setActiveTab("patient_portal");
        } else if (normRole === "admin") {
          setActiveTab("users");
        } else if (normRole === "lab_technician") {
          setActiveTab("lab");
        } else {
          setActiveTab("ehr");
        }
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error("Failed to load user profile:", e);
      handleLogout();
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("edcif_token");
    if (savedToken) {
      fetchProfile(savedToken);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("edcif_token");
    setToken(null);
    setUser(null);
    setExternalPatientData(null);
    setExternalPatientResult(null);
    setActiveTab("assessment");
    setAuthError(null);
    setAuthSuccess(null);
  };

  const handleSelectHistoryPatient = (patientInput: any, result: any) => {
    setExternalPatientData(patientInput);
    setExternalPatientResult(result);
    setActiveTab("assessment");
  };

  // ── Unified Login Handler (Email + Password ONLY) ──────────────────────────
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail ?? "Invalid credentials. Please verify your email and password.");
      }

      const data = await res.json();
      localStorage.setItem("edcif_token", data.access_token);
      setToken(data.access_token);
      fetchProfile(data.access_token);
    } catch (err: any) {
      setAuthError(err.message ?? "Authentication service unreachable. Check backend connection.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Public Patient Registration (Full Name, Email, Password ONLY) ──────────
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: regFullName.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail ?? "Registration failed. An account with this email may already exist.");
      }

      // Auto login newly registered patient
      const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regEmail.trim(),
          password: regPassword,
        }),
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        localStorage.setItem("edcif_token", loginData.access_token);
        setToken(loginData.access_token);
        fetchProfile(loginData.access_token);
      } else {
        setAuthSuccess("Account created successfully as Patient! Please sign in with your credentials.");
        setAuthMode("login");
        setLoginEmail(regEmail);
      }
    } catch (err: any) {
      setAuthError(err.message ?? "Registration service unreachable. Check backend connection.");
    } finally {
      setAuthLoading(false);
    }
  };

  const userRole = (user?.role || "").toLowerCase();

  return (
    <main className="edcif-main">
      <style>{`
        /* ── Medical Blue & White Navigation Styles ── */
        .nav-tabs {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin: 16px auto 0;
          max-width: 900px;
          background: rgba(11, 34, 64, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 50px;
          padding: 6px;
          flex-wrap: wrap;
        }
        .nav-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 700;
          border: 1px solid transparent;
          background: transparent;
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.25s ease;
          white-space: nowrap;
        }
        .nav-tab-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .nav-tab-btn--active {
          background: #ffffff;
          color: #0369a1;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }
        .auth-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .auth-user-badge {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 50px;
          padding: 6px 16px;
          font-size: 0.82rem;
          font-weight: 700;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .logout-btn {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #fca5a5;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .logout-btn:hover {
          background: #ef4444;
          color: #ffffff;
        }

        /* ── Landing Page Hero & Crisp White Auth Card ── */
        .landing-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 40px;
          align-items: center;
          max-width: 1280px;
          margin: 40px auto 20px;
        }
        @media (max-width: 960px) {
          .landing-grid {
            grid-template-columns: 1fr;
            gap: 30px;
            margin: 20px auto;
          }
        }
        .hero-badge-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(2, 132, 199, 0.2);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #7dd3fc;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 50px;
          margin-bottom: 18px;
        }
        .hero-title {
          font-size: clamp(2rem, 3.8vw, 3.2rem);
          font-weight: 800;
          color: #ffffff;
          line-height: 1.18;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
        }
        .hero-desc {
          font-size: 1.05rem;
          color: #cbd5e1;
          line-height: 1.65;
          margin-bottom: 28px;
        }
        .hero-pillars {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 28px;
        }
        @media (max-width: 600px) {
          .hero-pillars { grid-template-columns: 1fr; }
        }
        .pillar-card {
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 16px;
          color: #f1f5f9;
        }
        .pillar-title {
          font-weight: 700;
          font-size: 0.92rem;
          color: #38bdf8;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pillar-text {
          font-size: 0.8rem;
          color: #94a3b8;
          line-height: 1.45;
        }

        /* ── THE CRISP WHITE REGISTER / LOGIN CARD ── */
        .white-auth-card {
          background: #ffffff;
          border-radius: 20px;
          padding: 32px 28px;
          box-shadow: 0 25px 60px -15px rgba(2, 22, 58, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.2);
          color: #0f172a;
          position: relative;
        }
        .auth-tab-row {
          display: flex;
          background: #f1f5f9;
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 24px;
        }
        .auth-tab-btn {
          flex: 1;
          padding: 10px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 700;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }
        .auth-tab-btn--active {
          background: #0284c7;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
        }
        .auth-label {
          display: block;
          font-size: 0.82rem;
          font-weight: 700;
          color: #334155;
          margin-bottom: 6px;
        }
        .auth-input {
          width: 100%;
          padding: 11px 14px;
          border-radius: 10px;
          border: 1.5px solid #cbd5e1;
          font-size: 0.92rem;
          color: #0f172a;
          background: #f8fafc;
          outline: none;
          transition: all 0.2s;
        }
        .auth-input:focus {
          border-color: #0284c7;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
        }
        .auth-submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 13px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
        }
        .auth-submit-btn:hover {
          background: linear-gradient(135deg, #0369a1, #075985);
          transform: translateY(-1px);
        }
        .demo-pill {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 0.72rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s;
        }
        .demo-pill:hover {
          background: #e2e8f0;
          color: #0284c7;
          border-color: #0284c7;
        }
      `}</style>

      {/* Decorative Blue Orbs */}
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      {/* Real-time alert stream listener */}
      <RealTimeAlerts />

      {/* Hospital Top Header */}
      <header className="edcif-header">
        <div className="header-inner" style={{ flexDirection: "column", alignItems: "stretch", gap: "18px" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div className="logo-badge">🏥 METROHEALTH</div>
              <div>
                <h1 className="header-title">
                  Nephrology & Kidney{" "}
                  <span className="header-gradient">Clinical Platform</span>
                </h1>
                <p className="header-sub">
                  Chronic Kidney Disease Multi-Model Deep Learning (ANN, LSTM, Hybrid) + SHAP Explainability + HL7 FHIR R4 Interoperability.
                </p>
              </div>
            </div>

            {/* Auth Session State */}
            <div className="auth-bar">
              {user ? (
                <>
                  <div className="auth-user-badge">
                    <span>
                      {userRole === "doctor" ? "⚕️ Dr." : userRole === "admin" ? "🛡️ Admin" : userRole === "lab_technician" ? "🧪 Tech" : "🩺 Patient"}
                    </span>
                    <strong>{user.full_name || user.username}</strong>
                    <span style={{
                      color: userRole === "admin" ? "#b45309" : userRole === "patient" ? "#15803d" : "#0369a1",
                      marginLeft: "2px",
                      fontSize: "0.75rem",
                      textTransform: "uppercase"
                    }}>
                      ({user.role})
                    </span>
                  </div>
                  <button onClick={handleLogout} className="logout-btn">
                    Sign Out
                  </button>
                </>
              ) : (
                <div style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                  Clinical Hotline: <strong>+1-800-555-0199</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <section className="edcif-content">
        
        {/* ── GUEST LANDING PAGE (HERO + CRISP WHITE AUTH CARD ON BLUE BACKGROUND) ── */}
        {!user && (
          <div className="landing-grid">
            
            {/* Left Column: Hospital Overview & Key Features */}
            <div>
              <div className="hero-badge-tag">
                <span>🛡️</span> HIPAA-Compliant Hospital Clinical Decision Support
              </div>
              <h2 className="hero-title">
                Explainable Chronic Kidney Disease Intelligence & Hospital Management
              </h2>
              <p className="hero-desc">
                Welcome to <strong>MetroHealth Nephrology & Kidney Institute</strong>. A unified clinical framework integrating Artificial Neural Networks for binary CKD risk assessment, LSTM sequential modeling for eGFR progression forecasting, and SHAP explainability.
              </p>

              <div className="hero-pillars">
                <div className="pillar-card">
                  <div className="pillar-title">
                    <span>🩺</span> Nephrology Diagnostics
                  </div>
                  <div className="pillar-text">
                    Multi-model diagnostic consensus, KDIGO staging, and clean 1-row-per-patient longitudinal tracking.
                  </div>
                </div>

                <div className="pillar-card">
                  <div className="pillar-title">
                    <span>🧪</span> Laboratory Matrix
                  </div>
                  <div className="pillar-text">
                    Standardized LOINC-coded biomarker entry with automated reference range anomaly alerts.
                  </div>
                </div>

                <div className="pillar-card">
                  <div className="pillar-title">
                    <span>📥</span> HL7 FHIR R4 Interop
                  </div>
                  <div className="pillar-text">
                    One-click JSON bundle export for seamless EHR integration with Epic and Cerner hospital systems.
                  </div>
                </div>

                <div className="pillar-card">
                  <div className="pillar-title">
                    <span>🛡️</span> Hospital Governance
                  </div>
                  <div className="pillar-text">
                    Role-isolated access for Doctors, Patients, Lab Technicians, and Administrators with full audit logging.
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                🔒 All clinical data is encrypted in transit and at rest in compliance with healthcare data protection standards.
              </div>
            </div>

            {/* Right Column: THE REGISTER / LOGIN CARD (CRISP WHITE CARD ON BLUE BACKGROUND) */}
            <div className="white-auth-card">
              
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
                  🩺
                </div>
                <div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    {authMode === "login" ? "Portal Sign In" : "Patient Registration"}
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0 0" }}>
                    MetroHealth Secure Clinical Healthcare Gateway
                  </p>
                </div>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="auth-tab-row">
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); setAuthError(null); }}
                  className={`auth-tab-btn ${authMode === "login" ? "auth-tab-btn--active" : ""}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode("register"); setAuthError(null); }}
                  className={`auth-tab-btn ${authMode === "register" ? "auth-tab-btn--active" : ""}`}
                >
                  Register
                </button>
              </div>

              {authError && (
                <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, marginBottom: "16px" }}>
                  ⚠️ {authError}
                </div>
              )}
              {authSuccess && (
                <div style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, marginBottom: "16px" }}>
                  ✅ {authSuccess}
                </div>
              )}

              {/* ── TAB 1: LOGIN (EMAIL + PASSWORD ONLY) ── */}
              {authMode === "login" ? (
                <form onSubmit={handleLoginSubmit}>
                  <div style={{ marginBottom: "16px" }}>
                    <label className="auth-label">Email Address:</label>
                    <input
                      type="text"
                      placeholder="e.g. doctor@metrohealth.org"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label className="auth-label" style={{ margin: 0 }}>Password:</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ background: "none", border: "none", color: "#0284c7", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="auth-submit-btn"
                  >
                    {authLoading ? "Authenticating..." : "Sign In to Hospital Portal"}
                  </button>
                </form>
              ) : (
                /* ── TAB 2: PATIENT SELF-REGISTRATION (FULL NAME, EMAIL, PASSWORD ONLY) ── */
                <form onSubmit={handleRegisterSubmit}>
                  <div style={{ marginBottom: "14px" }}>
                    <label className="auth-label">Full Legal Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Jane Foster"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label className="auth-label">Email Address:</label>
                    <input
                      type="email"
                      placeholder="e.g. jane.foster@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label className="auth-label">Create Secure Password:</label>
                    <input
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="auth-input"
                      required
                      minLength={6}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="auth-submit-btn"
                    style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
                  >
                    {authLoading ? "Creating Account..." : "Create Verified Patient Account"}
                  </button>

                  <p style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "14px", lineHeight: "1.45" }}>
                    Registration automatically establishes a personal Patient health record. No staff or administrator roles may be self-selected.
                  </p>
                </form>
              )}
            </div>

          </div>
        )}

        {/* ── LOGGED-IN WORKSPACES (ROLE-BASED SIDEPANELS & CLICKABLE DETAIL VIEWS) ── */}

        {/* 1. Doctor Workspace: Clean Left Sidepanel, Clickable 1-Row-per-Patient Table & Full Dossier */}
        {userRole === "doctor" && token && (
          <DoctorDashboard token={token} doctorProfile={user} />
        )}

        {/* 2. Administrator Workspace: Clean Left Sidepanel, Clickable Doctors & Patients Tables with Detail Views */}
        {userRole === "admin" && token && (
          <AdminDashboard token={token} />
        )}

        {/* 3. Lab Technician Workspace */}
        {userRole === "lab_technician" && token && (
          <LabDashboard token={token} />
        )}

        {/* 4. Patient Workspace */}
        {userRole === "patient" && token && (
          <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
            <PatientPortal
              token={token}
              username={user?.username || ""}
            />
          </div>
        )}

      </section>

      {/* Hospital Footer */}
      <footer className="edcif-footer">
        <div>🏥 <strong>MetroHealth Nephrology & Kidney Institute</strong> &bull; EDCIF Clinical Decision Support Platform</div>
        <div className="footer-sep">&bull;</div>
        <div>HL7 FHIR R4 Compliant</div>
        <div className="footer-sep">&bull;</div>
        <div>LOINC & SNOMED-CT Coded</div>
        <div className="footer-sep">&bull;</div>
        <div>Hospital Security & Privacy Architecture</div>
      </footer>
    </main>
  );
}
