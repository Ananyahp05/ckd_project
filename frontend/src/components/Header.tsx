"use client";

import React, { useState } from "react";

type HeaderProps = {
  user: any;
  userRole: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
};

export default function Header({
  user,
  userRole,
  theme,
  onToggleTheme,
  onLogout,
}: HeaderProps) {
  const [zoomLevel, setZoomLevel] = useState(100);

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.min(130, Math.max(80, prev + delta));
      document.documentElement.style.fontSize = `${next}%`;
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
    document.documentElement.style.fontSize = "100%";
  };

  return (
    <header className="edcif-header">
      <div className="header-inner">
        {/* Left: Platform Title Badge (exact styling & text from Image 2) */}
        <div className="brand-section">
          <div
            className="brand-crest"
            style={{
              background: "var(--color-primary-accent)",
              color: "#FFFFFF",
              padding: "7px 14px",
              borderRadius: "6px",
              fontWeight: 700,
              fontSize: "0.85rem",
              letterSpacing: "0.02em",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <span>Explainable AI-based early chronic kidney disease prediction using federated deep learning</span>
          </div>
        </div>

        {/* Right: Zoom Controls, User Info & Theme Sun/Moon Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Accessibility Zoom Control (as shown in Image 2) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#FFFFFF",
            }}
          >
            <span style={{ minWidth: "38px", textAlign: "center" }}>{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => handleZoom(-10)}
              style={{
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "0.9rem",
                fontWeight: 700,
              }}
              title="Decrease text size"
            >
              —
            </button>
            <button
              type="button"
              onClick={() => handleZoom(10)}
              style={{
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "0.9rem",
                fontWeight: 700,
              }}
              title="Increase text size"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "none",
                borderRadius: "4px",
                color: "#FFFFFF",
                cursor: "pointer",
                padding: "2px 8px",
                fontSize: "0.74rem",
                fontWeight: 600,
                marginLeft: "2px",
              }}
              title="Reset text size"
            >
              Reset
            </button>
          </div>

          {/* Authenticated User Badge */}
          {user && (
            <div
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#FFFFFF",
                padding: "5px 12px",
                borderRadius: "6px",
                fontSize: "0.82rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>
                {userRole === "doctor"
                  ? "Dr."
                  : userRole === "admin"
                  ? "Admin"
                  : userRole === "lab_technician"
                  ? "Tech"
                  : "Patient"}
              </span>
              <span>{user.full_name || user.username}</span>
              <span
                style={{
                  background: "var(--color-primary-accent)",
                  color: "#FFFFFF",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {user.role}
              </span>
            </div>
          )}

          {/* Logout Button */}
          {user && (
            <button
              type="button"
              onClick={onLogout}
              style={{
                background: "rgba(220, 38, 38, 0.15)",
                border: "1px solid rgba(220, 38, 38, 0.3)",
                color: "#FECACA",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              Sign Out
            </button>
          )}

          {/* ── STANDARD SUN (DARK MODE) / MOON (LIGHT MODE) TOGGLE (IMAGE 4 SVG OUTLINE) ── */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="theme-toggle-btn"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            aria-label={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 10px",
              borderRadius: "6px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#FFFFFF",
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
          >
            {theme === "dark" ? (
              /* Sun SVG shown when in Dark Mode (click to switch to Light) */
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Moon SVG shown when in Light Mode (click to switch to Dark) */
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
