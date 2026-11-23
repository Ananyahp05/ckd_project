"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PatientPortal from "@/components/PatientPortal";
import LabDashboard from "@/components/LabDashboard";
import DoctorDashboard from "@/components/DoctorDashboard";
import AdminDashboard from "@/components/AdminDashboard";
import RealTimeAlerts from "@/components/RealTimeAlerts";
import { API_BASE_URL } from "@/lib/api";

type UserProfile = {
  username: string;
  email?: string;
  full_name?: string;
  role: string;
  id: number;
};

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  // ── THEME STATE (Day / Light Mode vs Dark Mode) ───────────────────────────
  // Default to Day / Light Mode: Soft Ice Blue (#F0F9FF) & Deep Navy (#1E3A8A)
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (localStorage.getItem("edcif_theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("edcif_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // ── Landing Page Auth State ───────────────────────────────────────────────
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

  const fetchProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setToken(authToken);
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
    setAuthError(null);
    setAuthSuccess(null);
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
    <div className="edcif-app-container">
      {/* Real-time alert stream listener */}
      <RealTimeAlerts />

      {/* ── SHARED APPLICATION HEADER (from Header.tsx) ── */}
      <Header
        user={user}
        userRole={userRole}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />

      {/* ── MAIN CONTENT WORKSPACE AREA ── */}
      <main className={user ? "main-content-full" : "main-content-workspace"} style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── A. GUEST AUTHENTICATION PORTAL (CLEAN LOGIN / REGISTRATION CARD) ── */}
        {!user && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            minHeight: "calc(100vh - 160px)",
            padding: "24px 16px",
            width: "100%",
            boxSizing: "border-box",
          }}>
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "14px",
              padding: "32px 24px",
              boxShadow: "0 4px 24px rgba(0, 0, 0, 0.05)",
              maxWidth: "520px",
              width: "100%",
              boxSizing: "border-box",
            }}>
              
              {/* Tab Switcher (Image 3: Staff & Patient Sign In / Patient Self-Registration) */}
              <div style={{
                display: "flex",
                background: "var(--bg-surface-subtle)",
                borderRadius: "8px",
                padding: "4px",
                marginBottom: "24px",
                gap: "4px"
              }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); setAuthError(null); }}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    minHeight: "44px",
                    borderRadius: "6px",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    background: authMode === "login" ? "var(--color-primary-accent)" : "transparent",
                    color: authMode === "login" ? "#FFFFFF" : "var(--text-muted)",
                    transition: "all 0.15s"
                  }}
                >
                  Staff & Patient Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode("register"); setAuthError(null); }}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    minHeight: "44px",
                    borderRadius: "6px",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: authMode === "register" ? "var(--color-primary-accent)" : "transparent",
                    color: authMode === "register" ? "#FFFFFF" : "var(--text-muted)",
                    transition: "all 0.15s"
                  }}
                >
                  Patient Self-Registration
                </button>
              </div>

              {authError && (
                <div style={{ background: "var(--risk-high-bg)", border: "1px solid var(--risk-high-border)", color: "var(--risk-high)", padding: "10px 14px", borderRadius: "6px", fontSize: "0.84rem", fontWeight: 600, marginBottom: "16px" }}>
                  {authError}
                </div>
              )}
              {authSuccess && (
                <div style={{ background: "var(--risk-low-bg)", border: "1px solid var(--risk-low-border)", color: "var(--risk-low)", padding: "10px 14px", borderRadius: "6px", fontSize: "0.84rem", fontWeight: 600, marginBottom: "16px" }}>
                  {authSuccess}
                </div>
              )}

              {/* TAB 1: SIGN IN (EMAIL + PASSWORD ONLY) */}
              {authMode === "login" ? (
                <form onSubmit={handleLoginSubmit}>
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Email Address:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. doctor@hospital.org or admin@hospital.org"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="clinical-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                        Password:
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ background: "none", border: "none", color: "var(--color-primary-accent)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="clinical-input"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="btn-primary-teal"
                    style={{ width: "100%", padding: "12px", minHeight: "44px", fontSize: "0.92rem", fontWeight: 700 }}
                  >
                    {authLoading ? "Authenticating..." : "Sign In to Hospital Portal"}
                  </button>
                </form>
              ) : (
                /* TAB 2: PATIENT REGISTRATION */
                <form onSubmit={handleRegisterSubmit}>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Full Legal Name:
                    </label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      className="clinical-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Email Address:
                    </label>
                    <input
                      type="email"
                      placeholder="user@gmail.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="clinical-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "24px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Create Secure Password:
                    </label>
                    <input
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="clinical-input"
                      required
                      minLength={6}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="btn-primary-teal"
                    style={{ width: "100%", padding: "12px", minHeight: "44px", fontSize: "0.92rem", fontWeight: 700 }}
                  >
                    {authLoading ? "Creating Account..." : "Create Verified Patient Account"}
                  </button>

                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "14px", lineHeight: "1.4", textAlign: "center" }}>
                    Notice: Public registration automatically establishes a Patient medical record. Staff accounts are provisioned exclusively by Hospital Administration.
                  </p>
                </form>
              )}

            </div>
          </div>
        )}

        {/* ── B. LOGGED-IN ROLE-SPECIFIC WORKSPACES ── */}

        {/* 1. Doctor Workspace (Clean Left Sidepanel, Clickable 1-Row-per-Patient Table & Full Dossier) */}
        {userRole === "doctor" && token && (
          <DoctorDashboard token={token} doctorProfile={user} />
        )}

        {/* 2. Administrator Workspace (Clean Left Sidepanel, Clickable Doctors & Patients Tables with Detail Views) */}
        {userRole === "admin" && token && (
          <AdminDashboard token={token} />
        )}

        {/* 3. Lab Technician Workspace */}
        {userRole === "lab_technician" && token && (
          <LabDashboard token={token} />
        )}

        {/* 4. Patient Workspace */}
        {userRole === "patient" && token && (
          <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
            <PatientPortal
              token={token}
              username={user?.username || ""}
            />
          </div>
        )}

      </main>

      {/* ── SHARED APPLICATION FOOTER (from Footer.tsx) ── */}
      <Footer />
    </div>
  );
}
