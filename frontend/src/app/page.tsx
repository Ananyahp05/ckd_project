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
    const saved = localStorage.getItem("edcif_theme") as "light" | "dark" | null;
    const preferred = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preferred);
    document.documentElement.setAttribute("data-theme", preferred);
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
  const [showRegPassword, setShowRegPassword] = useState(false);

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
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />

      {/* ── MAIN CONTENT WORKSPACE AREA ── */}
      <main className={user ? "main-content-full" : "main-content-workspace"} style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── A. GUEST AUTHENTICATION PORTAL (CLEAN LOGIN / REGISTRATION CARD) ── */}
        {!user && (
          <div
            className="landing-hero-surface"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              minHeight: "calc(100vh - 160px)",
              padding: "32px 16px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* Subtle Federated-Learning Network Lattice SVG Backdrop */}
            <svg
              aria-hidden="true"
              viewBox="0 0 1200 600"
              preserveAspectRatio="xMidYMid slice"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                opacity: theme === "dark" ? 0.16 : 0.35,
              }}
            >
              <g stroke="var(--color-primary-accent)" strokeWidth="1" strokeOpacity="0.22" fill="none">
                <line x1="120" y1="120" x2="340" y2="220" />
                <line x1="340" y1="220" x2="220" y2="440" />
                <line x1="120" y1="120" x2="220" y2="440" />
                <line x1="340" y1="220" x2="600" y2="140" />
                <line x1="860" y1="180" x2="1080" y2="110" />
                <line x1="860" y1="180" x2="980" y2="430" />
                <line x1="1080" y1="110" x2="980" y2="430" />
                <line x1="600" y1="140" x2="860" y2="180" />
                <line x1="220" y1="440" x2="600" y2="490" />
                <line x1="600" y1="490" x2="980" y2="430" />
              </g>
              <g fill="var(--color-primary-accent)" fillOpacity="0.3">
                <circle cx="120" cy="120" r="4" />
                <circle cx="340" cy="220" r="5" />
                <circle cx="220" cy="440" r="4" />
                <circle cx="600" cy="140" r="4" />
                <circle cx="860" cy="180" r="5" />
                <circle cx="1080" cy="110" r="4" />
                <circle cx="980" cy="430" r="4" />
                <circle cx="600" cy="490" r="4" />
              </g>
            </svg>

            <div style={{
              position: "relative",
              zIndex: 1,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              padding: "32px 24px",
              boxShadow: theme === "dark" ? "none" : "0 8px 28px rgba(15, 23, 42, 0.06)",
              maxWidth: "480px",
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
                  Sign In
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
                  Register
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
                      placeholder="user@gmail.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="clinical-input"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "24px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Password:
                    </label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="clinical-input"
                        style={{ paddingRight: "42px" }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        title={showPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: "10px",
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "4px",
                        }}
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
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type={showRegPassword ? "text" : "password"}
                        placeholder="Minimum 6 characters"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="clinical-input"
                        style={{ paddingRight: "42px" }}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        aria-label={showRegPassword ? "Hide password" : "Show password"}
                        title={showRegPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: "10px",
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "4px",
                        }}
                      >
                        {showRegPassword ? (
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

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="btn-primary-teal"
                    style={{ width: "100%", padding: "12px", minHeight: "44px", fontSize: "0.92rem", fontWeight: 700 }}
                  >
                    {authLoading ? "Creating Account..." : "Create Account"}
                  </button>

                 
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
          <AdminDashboard token={token} adminProfile={user ?? undefined} />
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
      <Footer isLanding={!user} />
    </div>
  );
}
