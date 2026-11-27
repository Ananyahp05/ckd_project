"use client";

import React from "react";
import { ShieldIcon } from "./Icons";

type HeaderProps = {
  user: any;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
};

export default function Header({
  user,
  theme,
  onToggleTheme,
  onLogout,
}: HeaderProps) {
  return (
    <header className="edcif-header">
      <div className="header-inner">
        {/* Left: Platform Title Badge */}
        <div className="brand-section">
          <div className="brand-crest">
            <ShieldIcon size={16} />
            <span>Explainable AI-based early chronic kidney disease prediction using federated deep learning</span>
          </div>
        </div>

        {/* Right: Sign Out & Theme Sun/Moon Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Logout Button */}
          {user && (
            <button
              type="button"
              onClick={onLogout}
              className="header-signout-btn"
            >
              Sign Out
            </button>
          )}

          {/* Theme Sun (Dark Mode) / Moon (Light Mode) Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="theme-toggle-btn"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            aria-label={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === "dark" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
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
