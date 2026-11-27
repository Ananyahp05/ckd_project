"use client";

import React, { useState } from "react";
import { ShieldIcon, UserIcon, LockIcon, AlertTriangleIcon, StethoscopeIcon, ActivityIcon } from "./Icons";
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
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
          border-radius: 16px;
          max-width: 440px;
          width: 100%;
          padding: 32px 28px;
          position: relative;
          color: var(--text-primary);
          animation: authCardIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
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
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 24px;
          gap: 4px;
        }
        .auth-tab-btn {
          flex: 1;
          padding: 10px 14px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .auth-tab-btn--active {
          background: var(--color-primary-accent);
          color: #ffffff;
        }
        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 18px;
          text-align: left;
        }
        .auth-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-secondary);
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
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          pointer-events: none;
        }
        .auth-input {
          width: 100%;
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 11px 14px 11px 42px;
          color: var(--text-primary);
          font-size: 0.9rem;
          font-weight: 500;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .auth-input::placeholder {
          color: var(--text-muted);
        }
        .auth-input:focus {
          border-color: var(--color-primary-accent);
          box-shadow: 0 0 0 3px var(--color-primary-subtle);
        }
        .auth-password-toggle {
          position: absolute;
          right: 12px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s ease;
        }
        .auth-password-toggle:hover {
          color: var(--text-primary);
        }
        .auth-select {
          width: 100%;
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 11px 14px 11px 42px;
          color: var(--text-primary);
          font-size: 0.9rem;
          font-weight: 600;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          appearance: auto;
          -webkit-appearance: menulist;
        }
        .auth-select:focus {
          border-color: var(--color-primary-accent);
          box-shadow: 0 0 0 3px var(--color-primary-subtle);
        }
        .auth-select option {
          background: var(--bg-surface);
          color: var(--text-primary);
          padding: 10px;
        }
        .role-hint-box {
          margin-top: 8px;
          padding: 10px 12px;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 0.74rem;
          color: var(--text-secondary);
          line-height: 1.45;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .auth-error {
          background: var(--risk-high-bg);
          border: 1px solid var(--risk-high-border);
          border-radius: 8px;
          padding: 12px 14px;
          color: var(--risk-high);
          font-size: 0.82rem;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .auth-submit-btn {
          width: 100%;
          padding: 12px 20px;
          border-radius: 8px;
          border: none;
          background: var(--color-primary-accent);
          color: #ffffff;
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background-color 0.15s ease;
          margin-top: 6px;
        }
        .auth-submit-btn:hover:not(:disabled) {
          background: var(--color-primary-hover);
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
                borderRadius: "10px",
                background: "var(--color-primary-subtle)",
                border: "1px solid var(--color-primary-border)",
                color: "var(--color-primary-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldIcon size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                {isLogin ? "Clinical Portal Login" : "Create Clinical Account"}
              </h2>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
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
              <AlertTriangleIcon size={16} />
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
                <span className="auth-input-icon"><UserIcon size={16} /></span>
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
                <span className="auth-input-icon"><LockIcon size={16} /></span>
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
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
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
                  <span className="auth-input-icon"><StethoscopeIcon size={16} /></span>
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
                  <span style={{ color: "var(--color-primary-accent)", display: "inline-flex", marginTop: "2px" }}>
                    {role === "Doctor" ? <StethoscopeIcon size={16} /> : role === "Patient" ? <ActivityIcon size={16} /> : <ShieldIcon size={16} />}
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
                  <LockIcon size={16} />
                  <span>{isLogin ? "Sign In to Portal" : "Register Account"}</span>
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
