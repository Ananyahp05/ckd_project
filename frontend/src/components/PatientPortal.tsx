"use client";

import { API_BASE_URL } from "@/lib/api";
import React, { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import ClinicalReportModal, { ClinicalReportData } from "./ClinicalReportModal";

type PatientSummaryData = {
  patient_id: string;
  total_assessments: number;
  latest_record: {
    date: string | null;
    risk_score: number;
    severity: string;
    patient_age: number | null;
    key_vitals: {
      bp?: number;
      creatinine?: number;
      urea?: number;
      hemoglobin?: number;
    };
  } | null;
  trajectory: Array<{
    id: number;
    date: string | null;
    risk_score: number;
    severity: string;
    creatinine?: number;
    bp?: number;
    glucose?: number;
  }>;
  lifestyle_guidelines: string[];
};

type PatientPortalProps = {
  token: string;
  username: string;
  onInspectRecord?: (patientInput: any, result: any) => void;
};

export default function PatientPortal({ token, username }: PatientPortalProps) {
  const [summary, setSummary] = useState<PatientSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const fetchPatientSummary = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/predictions/patient-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to retrieve your patient summary");
      }
      const data = await res.json();
      setSummary(data);
    } catch (err: any) {
      setErrorMsg(err.message ?? "Connection to backend failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientSummary();
  }, [token]);

  const latest = summary?.latest_record;
  const isHigh = latest?.severity === "CKD";

  const formattedTrajectory = (summary?.trajectory || []).map((t, idx) => ({
    name: t.date
      ? new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : `Visit ${idx + 1}`,
    risk_score: Number(t.risk_score.toFixed(1)),
    creatinine: t.creatinine ?? null,
    bp: t.bp ?? null,
  }));

  return (
    <>
      <style>{`
        .patient-portal-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 0 12px;
          width: 100%;
          box-sizing: border-box;
        }
        .portal-card {
          background: var(--bg-surface, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          color: var(--text-primary, #0f172a);
          width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 600px) {
          .portal-card {
            padding: 16px 14px;
          }
          .kpi-val {
            font-size: 1.75rem !important;
          }
        }
        .portal-header-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 50px;
          background: rgba(22, 163, 74, 0.12);
          border: 1px solid rgba(22, 163, 74, 0.25);
          color: #16A34A;
          font-size: 0.8rem;
          font-weight: 700;
        }
        .patient-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
          gap: 16px;
          margin-top: 20px;
        }
        .kpi-card {
          background: var(--bg-surface-subtle, #f8fafc);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .kpi-label {
          font-size: 0.72rem;
          text-transform: uppercase;
          font-weight: 700;
          color: var(--text-muted, #64748b);
          letter-spacing: 0.05em;
        }
        .kpi-val {
          font-size: 2.2rem;
          font-weight: 900;
          line-height: 1.1;
          color: var(--text-primary, #0f172a);
        }
        .guideline-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          background: var(--bg-surface-subtle, #f8fafc);
          border: 1px solid var(--border-color, #e2e8f0);
          font-size: 0.88rem;
          color: var(--text-secondary, #334155);
          line-height: 1.4;
        }
      `}</style>

      <div className="patient-portal-container">
        {/* Patient Welcome Header */}
        <div className="portal-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span className="portal-header-badge">Verified Patient Portal</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>ID: <strong style={{ color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>{username}</strong></span>
            </div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Personal Kidney Health Intelligence
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Longitudinal tracking of clinical biomarker trends, risk analytics, and personalized lifestyle recommendations.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setIsReportOpen(true)}
              className="btn-primary-teal"
            >
              Download Health Report (PDF)
            </button>
            <button
              onClick={fetchPatientSummary}
              className="btn-secondary"
            >
              Refresh Records
            </button>
          </div>
        </div>

        {loading ? (
          <div className="portal-card" style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
            <span className="spinner" /> Loading personal clinical records...
          </div>
        ) : errorMsg ? (
          <div className="error-box">⚠ {errorMsg}</div>
        ) : !latest ? (
          <div className="portal-card" style={{ textAlign: "center", padding: "60px 40px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>📋</div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>No Prior Assessment on File</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "500px", margin: "8px auto 24px" }}>
              No diagnostic evaluations have been saved under Patient ID <strong>{username}</strong> yet. When your doctor evaluates your vitals and lab results, your risk trajectories will appear here automatically.
            </p>

            <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "left" }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", marginBottom: "12px" }}>
                General Preventive Kidney Health Guidelines:
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(summary?.lifestyle_guidelines || []).map((g, i) => (
                  <div key={i} className="guideline-item">
                    <span style={{ color: "var(--risk-low)" }}>✓</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Cards: Latest Status */}
            <div className="patient-kpi-grid">
              <div className="kpi-card" style={{
                background: isHigh ? "var(--risk-high-bg)" : "var(--risk-low-bg)",
                border: `1px solid ${isHigh ? "var(--risk-high-border)" : "var(--risk-low-border)"}`,
              }}>
                <div className="kpi-label">Latest CKD Risk Score</div>
                <div className="kpi-val" style={{ color: isHigh ? "var(--risk-high)" : "var(--risk-low)", fontFamily: "JetBrains Mono, monospace" }}>
                  {latest.risk_score !== null && latest.risk_score !== undefined ? `${Number(latest.risk_score).toFixed(1)}%` : "—"}
                </div>
                <span style={{
                  fontSize: "0.75rem", fontWeight: 600,
                  color: isHigh ? "var(--risk-high)" : "var(--risk-low)"
                }}>
                  Status: {latest.severity} ({isHigh ? "Elevated Attention Needed" : "Low Risk Profile"})
                </span>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Serum Creatinine</div>
                <div className="kpi-val" style={{ color: (latest.key_vitals?.creatinine ?? 0) > 1.2 ? "var(--risk-high)" : "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>
                  {latest.key_vitals?.creatinine !== undefined ? `${latest.key_vitals.creatinine} ` : "—"}
                  <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}>mg/dL</span>
                </div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Normal reference: 0.6 – 1.2 mg/dL</span>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Blood Pressure</div>
                <div className="kpi-val" style={{ color: (latest.key_vitals?.bp ?? 0) > 85 ? "var(--risk-high)" : "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>
                  {latest.key_vitals?.bp !== undefined ? `${latest.key_vitals.bp} ` : "—"}
                  <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}>mmHg</span>
                </div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Normal reference: 60 – 85 mmHg (diastolic)</span>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Total Visits Tracked</div>
                <div className="kpi-val" style={{ color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                  {summary?.total_assessments}
                </div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Last visit: {latest.date ? new Date(latest.date).toLocaleDateString() : "Recent"}
                </span>
              </div>
            </div>

            {/* Longitudinal Trend Chart (Fulfilling Synopsis Real-Time Monitoring & Trend Modeling) */}
            <div className="portal-card">
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Longitudinal Health Trajectory Over Time
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Visualizing how your kidney risk score and serum creatinine have evolved across clinical consultations.
                </p>
              </div>

              <div style={{ height: "280px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={formattedTrajectory} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-color)", color: "var(--text-primary)", borderRadius: "6px" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="risk_score" stroke="var(--risk-high)" strokeWidth={2.5} name="Risk Score (%)" dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="creatinine" stroke="var(--color-primary-accent)" strokeWidth={2} name="Creatinine (mg/dL)" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Personalized Clinical Lifestyle & Dietary Recommendations */}
            <div className="portal-card">
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                Personalized Lifestyle & Care Guidelines
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "18px" }}>
                Clinical guidance tailored to your recorded biomarkers:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {summary?.lifestyle_guidelines.map((guide, idx) => (
                  <div key={idx} className="guideline-item">
                    <span style={{ color: "var(--color-primary-accent)", fontSize: "1rem" }}>&bull;</span>
                    <span>{guide}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <ClinicalReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportData={{
          patient_id: username,
          patient_age: latest?.patient_age,
          report_date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
          ann_result: latest ? {
            prediction: latest.severity,
            risk_score: latest.risk_score,
            probability: latest.risk_score / 100,
          } : null,
          consensus: latest ? {
            diagnosis: latest.severity === "CKD" ? "Positive for Chronic Kidney Disease" : "Preserved Renal Function",
            risk_level: latest.severity === "CKD" ? "HIGH" : "LOW",
            risk_score: latest.risk_score,
            predicted_egfr: null,
            kdigo_stage: latest.severity === "CKD" ? "KDIGO Evaluation Indicated" : "Stage 1 (Normal)",
            concordance: "Personal Health Monitoring Portal",
            clinical_action: latest.severity === "CKD"
              ? "Consult your attending renal specialist promptly. Discuss blood pressure targets (<130/80 mmHg) and renal protection."
              : "Continue healthy lifestyle habits, active hydration, and annual biometric checkups.",
          } : null,
          biomarkers: latest?.key_vitals ? [
            {
              name: "Serum Creatinine",
              value: latest.key_vitals.creatinine ?? 0,
              unit: "mg/dL",
              reference: "0.6 - 1.2 mg/dL",
              category: "Renal Panel",
              status: (latest.key_vitals.creatinine ?? 0) > 1.4 ? "CRITICAL" : (latest.key_vitals.creatinine ?? 0) > 1.2 ? "ELEVATED" : "NORMAL",
            },
            {
              name: "Blood Pressure (Diastolic)",
              value: latest.key_vitals.bp ?? 0,
              unit: "mmHg",
              reference: "60 - 80 mmHg",
              category: "Vitals",
              status: (latest.key_vitals.bp ?? 0) > 90 ? "ELEVATED" : "NORMAL",
            },
            {
              name: "Blood Urea",
              value: latest.key_vitals.urea ?? 0,
              unit: "mg/dL",
              reference: "7 - 20 mg/dL",
              category: "Renal Panel",
              status: (latest.key_vitals.urea ?? 0) > 20 ? "ELEVATED" : "NORMAL",
            },
            {
              name: "Hemoglobin",
              value: latest.key_vitals.hemoglobin ?? 0,
              unit: "g/dL",
              reference: "13.0 - 17.0 g/dL",
              category: "Hematology",
              status: (latest.key_vitals.hemoglobin ?? 0) < 12 ? "LOW" : "NORMAL",
            },
          ] : [],
          guidelines: summary?.lifestyle_guidelines,
        }}
      />
    </>
  );
}
