"use client";

import React from "react";
import { StethoscopeIcon } from "./Icons";

type FooterProps = {
  isLanding?: boolean;
};

export default function Footer({ isLanding = false }: FooterProps) {
  if (isLanding) {
    return (
      <footer className="edcif-footer-landing">
        <div className="landing-footer-grid">
          {/* Column 1: Project Identity & Mission */}
          <div className="landing-footer-brand">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-primary-subtle)",
                  border: "1px solid var(--color-primary-border)",
                  color: "var(--color-primary-accent)",
                }}
              >
                <StethoscopeIcon size={18} />
              </span>
              <span style={{ fontWeight: 600, fontSize: "1.1rem", color: "var(--text-primary)" }}>EDCIF Platform</span>
            </div>
            <div style={{ color: "var(--color-primary-accent)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "10px" }}>
              EXPLAINABLE CLINICAL AI INTELLIGENCE
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.55, maxWidth: "340px" }}>
              Advancing early chronic kidney disease prediction, longitudinal eGFR prognosis, and privacy-preserving federated clinical healthcare.
            </p>
          </div>

          {/* Column 2: Deep Learning Models */}
          <div>
            <h4 className="landing-footer-col-title">CLINICAL AI MODELS</h4>
            <ul className="landing-footer-links">
              <li><span>ANN Risk Classification</span></li>
              <li><span>LSTM Trajectory Regression</span></li>
              <li><span>Hybrid Multimodal DL</span></li>
              <li><span>Federated Decentralized Training</span></li>
            </ul>
          </div>

          {/* Column 3: Decision Support */}
          <div>
            <h4 className="landing-footer-col-title">DECISION SUPPORT</h4>
            <ul className="landing-footer-links">
              <li><span>KDIGO Clinical Staging</span></li>
              <li><span>Tangri KFRE Prognosis</span></li>
              <li><span>SHAP &amp; LIME Attributions</span></li>
              <li><span>HL7 FHIR R4 Interoperability</span></li>
            </ul>
          </div>

          {/* Column 4: Legal & Compliance */}
          <div>
            <h4 className="landing-footer-col-title">LEGAL &amp; COMPLIANCE</h4>
            <ul className="landing-footer-links">
              <li><span>Privacy Policy</span></li>
              <li><span>Terms of Service</span></li>
              <li><span>Cookies Policy</span></li>
              <li><span>Clinical Data Governance</span></li>
            </ul>
          </div>
        </div>

        {/* Divider & Bottom Row */}
        <div className="landing-footer-bottom">
          <div className="footer-copyright-block">
            <div>&copy; 2026 Explainable AI-based early chronic kidney disease prediction using federated deep learning</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>All rights reserved.</div>
          </div>
          <div className="footer-links-row">
            <span data-link="privacy">Privacy</span>
            <span className="footer-dot">&bull;</span>
            <span data-link="terms">Terms</span>
            <span className="footer-dot">&bull;</span>
            <span data-link="cookies">Cookies</span>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="edcif-footer edcif-footer--app">
      <div className="footer-copyright-block">
        <div>&copy; 2026 Explainable AI-based early chronic kidney disease prediction using federated deep learning</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>All rights reserved.</div>
      </div>
      <div className="footer-links-row">
        <span data-link="privacy">Privacy</span>
        <span className="footer-dot">&bull;</span>
        <span data-link="terms">Terms</span>
        <span className="footer-dot">&bull;</span>
        <span data-link="cookies">Cookies</span>
      </div>
    </footer>
  );
}
