"use client";

import React, { useState } from "react";
import { API_BASE_URL } from "@/lib/api";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string) => void;
};

export default function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"Doctor" | "Patient" | "Admin">("Doctor");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (isLogin) {
        // OAuth2 compatible form-data
        const params = new URLSearchParams();
        params.append("username", username.trim());
        params.append("password", password);

        const res = await fetch(`${API_BASE_URL}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.detail ?? "Invalid credentials. Please verify username and password.");
        }

        const data = await res.json();
        localStorage.setItem("edcif_token", data.access_token);
        onLoginSuccess(data.access_token);
        onClose();
      } else {
        // Register JSON body
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password: password,
            role: role,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.detail ?? "Failed to register account. Username may already exist.");
        }

        // Auto login on success
        const loginParams = new URLSearchParams();
        loginParams.append("username", username.trim());
        loginParams.append("password", password);

        const loginRes = await fetch(`${API_BASE_URL}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: loginParams,
        });

        if (loginRes.ok) {
          const loginData = await loginRes.json();
          localStorage.setItem("edcif_token", loginData.access_token);
          onLoginSuccess(loginData.access_token);
          onClose();
        } else {
          setIsLogin(true);
          setErrorMsg("Account created successfully. Please sign in.");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? "Authentication service unreachable. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .auth-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .auth-card {
          background: #0b1329;
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 15, 30, 0.96) 100%);
          border: 1px solid rgba(148, 163, 184, 0.16);
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 50px rgba(99, 102, 241, 0.12);
          border-radius: 24px;
          max-width: 440px;
          width: 100%;
          padding: 32px 28px;
          position: relative;
          color: #f1f5f9;
          animation: authCardIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes authCardIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .auth-close-btn {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid rgba(148, 163, 184, 0.15);
          background: rgba(255, 255, 255, 0.04);
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .auth-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
          border-color: rgba(148, 163, 184, 0.3);
        }
        .auth-tab-group {
          display: flex;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 14px;
          padding: 4px;
          margin-bottom: 24px;
          gap: 4px;
        }
        .auth-tab-btn {
          flex: 1;
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .auth-tab-btn--active {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
        }
        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 18px;
          text-align: left;
        }
        .auth-label {
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .auth-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .auth-input-icon {
          position: absolute;
          left: 14px;
          color: #64748b;
          font-size: 0.95rem;
          pointer-events: none;
        }
        .auth-input {
          width: 100%;
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 12px;
          padding: 12px 14px 12px 42px;
          color: #f8fafc;
          font-size: 0.92rem;
          font-weight: 500;
          outline: none;
          transition: all 0.2s ease;
        }
        .auth-input::placeholder {
          color: #64748b;
        }
        .auth-input:focus {
          background: rgba(30, 41, 59, 0.95);
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
        }
        .auth-password-toggle {
          position: absolute;
          right: 12px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 1rem;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        .auth-password-toggle:hover {
          color: #f1f5f9;
        }
        .auth-select {
          width: 100%;
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          padding: 12px 14px 12px 42px;
          color: #f8fafc;
          font-size: 0.9rem;
          font-weight: 600;
          outline: none;
          cursor: pointer;
          transition: all 0.2s ease;
          appearance: auto;
          -webkit-appearance: menulist;
        }
        .auth-select:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25);
        }
        .auth-select option {
          background: #0f172a;
          color: #f8fafc;
          padding: 10px;
        }
        .role-hint-box {
          margin-top: 8px;
          padding: 10px 12px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 10px;
          font-size: 0.74rem;
          color: #cbd5e1;
          line-height: 1.45;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .auth-error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          padding: 12px 14px;
          color: #fca5a5;
          font-size: 0.82rem;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .auth-submit-btn {
          width: 100%;
          padding: 14px 20px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
          transition: all 0.2s ease;
          margin-top: 6px;
        }
        .auth-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 26px rgba(99, 102, 241, 0.45);
        }
        .auth-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .auth-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: authSpin 0.7s linear infinite;
        }
        @keyframes authSpin {
          to { transform: rotate(360deg); }
        }
        .auth-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 0.78rem;
          color: #64748b;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          padding-top: 16px;
        }
        .auth-footer strong {
          color: #a5b4fc;
        }
      `}</style>

      <div className="auth-overlay" onClick={onClose}>
        <div className="auth-card" onClick={(e) => e.stopPropagation()}>
          {/* Close button */}
          <button className="auth-close-btn" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>

          {/* Header & Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.3rem",
              }}
            >
              🛡️
            </div>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                {isLogin ? "Clinical Portal Login" : "Create Clinical Account"}
              </h2>
              <p style={{ fontSize: "0.76rem", color: "#64748b", margin: "2px 0 0 0" }}>
                EDCIF Health Intelligence & ML Platform
              </p>
            </div>
          </div>

          {/* Tab Selector: Sign In vs Register */}
          <div className="auth-tab-group">
            <button
              type="button"
              className={`auth-tab-btn ${isLogin ? "auth-tab-btn--active" : ""}`}
              onClick={() => {
                setIsLogin(true);
                setErrorMsg(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${!isLogin ? "auth-tab-btn--active" : ""}`}
              onClick={() => {
                setIsLogin(false);
                setErrorMsg(null);
              }}
            >
              New Registration
            </button>
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="auth-error">
              <span>⚠</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Username Field */}
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-username">
                <span>Username / Medical ID</span>
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">👤</span>
                <input
                  id="auth-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="auth-input"
                  placeholder={
                    isLogin
                      ? "e.g. dr_smith or patient_001"
                      : role === "Doctor"
                      ? "e.g. dr_smith"
                      : role === "Patient"
                      ? "e.g. patient_102"
                      : "e.g. hospital_admin"
                  }
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">
                <span>Password</span>
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">🔒</span>
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="••••••••••••"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Access Role Selection (Only on Registration) */}
            {!isLogin && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-role">
                  <span>Assigned Healthcare Role</span>
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon">⚕️</span>
                  <select
                    id="auth-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="auth-select"
                  >
                    <option value="Doctor">Doctor / Clinician (Assessments & XAI)</option>
                    <option value="Patient">Patient (Personal Health Portal & History)</option>
                    <option value="Admin">Administrator (FL Console & User Audit)</option>
                  </select>
                </div>

                {/* Role Description Card */}
                <div className="role-hint-box">
                  <span style={{ fontSize: "1rem" }}>
                    {role === "Doctor" ? "🩺" : role === "Patient" ? "🧬" : "🛡️"}
                  </span>
                  <div>
                    {role === "Doctor" && (
                      <>
                        <strong>Doctor Role:</strong> Authorizes conducting clinical intakes, inspecting explainable AI diagnostic synthesis, reviewing longitudinal eGFR charts, and managing patient health records.
                      </>
                    )}
                    {role === "Patient" && (
                      <>
                        <strong>Patient Role:</strong> Username is linked as your patient ID. Directs to your personal longitudinal health tracking portal.
                      </>
                    )}
                    {role === "Admin" && (
                      <>
                        <strong>Admin Role:</strong> Grants access to Federated Learning round simulations and complete system user RBAC auditing.
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button type="submit" disabled={loading} className="auth-submit-btn">
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  <span>{isLogin ? "Authenticating..." : "Creating Account..."}</span>
                </>
              ) : (
                <>
                  <span>{isLogin ? "🔐 Sign In to Portal" : "✨ Register Account"}</span>
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="auth-footer">
            <span>Role-Based Access Control Active</span>
            <span style={{ margin: "0 6px" }}>·</span>
            <strong>JWT Encrypted</strong>
          </div>
        </div>
      </div>
    </>
  );
}
