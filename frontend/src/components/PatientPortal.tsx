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
          max-width: 1300px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .portal-card {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .portal-header-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 50px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #4ade80;
          font-size: 0.8rem;
          font-weight: 700;
        }
        .patient-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-top: 20px;
        }
        .kpi-card {
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 18px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .kpi-label {
          font-size: 0.72rem;
          text-transform: uppercase;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }
        .kpi-val {
          font-size: 2.2rem;
          font-weight: 900;
          line-height: 1.1;
        }
        .guideline-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(148, 163, 184, 0.08);
          font-size: 0.88rem;
          color: #e2e8f0;
          line-height: 1.4;
        }
      `}</style>

      <div className="patient-portal-container">
        {/* Patient Welcome Header */}
        <div className="portal-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span className="portal-header-badge">🩺 Verified Patient Portal</span>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>ID: <strong style={{ color: "#a5b4fc" }}>{username}</strong></span>
            </div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f8fafc" }}>
              Personal Kidney Health Intelligence
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "4px" }}>
              Longitudinal tracking of clinical biomarker trends, risk analytics, and personalized lifestyle recommendations.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setIsReportOpen(true)}
              style={{
                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "8px 18px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              📄 Download My Health Report (PDF)
            </button>
            <button
              onClick={fetchPatientSummary}
              style={{
                background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.3)",
                color: "#a5b4fc", padding: "8px 18px", borderRadius: "12px", fontSize: "0.82rem",
                fontWeight: 700, cursor: "pointer"
              }}
            >
              ↻ Refresh Health Records
            </button>
          </div>
        </div>

        {loading ? (
          <div className="portal-card" style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>
            <span className="spinner" /> Loading your personal kidney intelligence records...
          </div>
        ) : errorMsg ? (
          <div className="error-box">⚠ {errorMsg}</div>
        ) : !latest ? (
          <div className="portal-card" style={{ textAlign: "center", padding: "60px 40px" }}>
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📋</div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f1f5f9" }}>No Prior Assessment on File</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", maxWidth: "500px", margin: "8px auto 24px" }}>
              No diagnostic evaluations have been saved under Patient ID <strong>{username}</strong> yet. When your doctor evaluates your vitals and lab results, your risk trajectories will appear here automatically.
            </p>

            <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "left" }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "12px" }}>
                General Preventive Kidney Health Guidelines:
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(summary?.lifestyle_guidelines || []).map((g, i) => (
                  <div key={i} className="guideline-item">
                    <span style={{ color: "#4ade80" }}>✓</span>
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
                background: `radial-gradient(ellipse at top, ${isHigh ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)"} 0%, rgba(15,23,42,0.6) 70%)`,
                border: `1px solid ${isHigh ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              }}>
                <div className="kpi-label">Latest CKD Risk Score</div>
                <div className="kpi-val" style={{ color: isHigh ? "#f87171" : "#4ade80" }}>
                  {latest.risk_score.toFixed(1)}%
                </div>
                <span style={{
                  fontSize: "0.75rem", fontWeight: 700,
                  color: isHigh ? "#fca5a5" : "#86efac"
                }}>
                  Status: {latest.severity} ({isHigh ? "Elevated Attention Needed" : "Low Risk Profile"})
                </span>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Serum Creatinine</div>
                <div className="kpi-val" style={{ color: (latest.key_vitals?.creatinine ?? 0) > 1.2 ? "#fbbf24" : "#e2e8f0" }}>
                  {latest.key_vitals?.creatinine !== undefined ? `${latest.key_vitals.creatinine} ` : "—"}
                  <span style={{ fontSize: "1rem", fontWeight: 500, color: "#64748b" }}>mg/dL</span>
                </div>
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Normal reference: 0.6 – 1.2 mg/dL</span>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Blood Pressure</div>
                <div className="kpi-val" style={{ color: (latest.key_vitals?.bp ?? 0) > 85 ? "#fbbf24" : "#e2e8f0" }}>
                  {latest.key_vitals?.bp !== undefined ? `${latest.key_vitals.bp} ` : "—"}
                  <span style={{ fontSize: "1rem", fontWeight: 500, color: "#64748b" }}>mmHg</span>
                </div>
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Normal reference: 60 – 85 mmHg (diastolic)</span>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Total Visits Tracked</div>
                <div className="kpi-val" style={{ color: "#a5b4fc" }}>
                  {summary?.total_assessments}
                </div>
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                  Last visit: {latest.date ? new Date(latest.date).toLocaleDateString() : "Recent"}
                </span>
              </div>
            </div>

            {/* Longitudinal Trend Chart (Fulfilling Synopsis Real-Time Monitoring & Trend Modeling) */}
            <div className="portal-card">
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f1f5f9" }}>
                  📈 Longitudinal Health Trajectory Over Time
                </h3>
                <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                  Visualizing how your kidney risk score and serum creatinine have evolved across clinical consultations.
                </p>
              </div>

              <div style={{ height: "280px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={formattedTrajectory} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="risk_score" stroke="#ef4444" strokeWidth={3} name="Risk Score (%)" dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="creatinine" stroke="#60a5fa" strokeWidth={2} name="Creatinine (mg/dL)" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Personalized Clinical Lifestyle & Dietary Recommendations */}
            <div className="portal-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f1f5f9", marginBottom: "8px" }}>
                🥗 Personalized Lifestyle & Care Guidelines
              </h3>
              <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "18px" }}>
                Dynamic health guidelines tailored directly to your latest laboratory readings:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {summary?.lifestyle_guidelines.map((guide, idx) => (
                  <div key={idx} className="guideline-item">
                    <span style={{ color: "#38bdf8", fontSize: "1.1rem" }}>💡</span>
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
              ? "Consult your nephrologist promptly. Discuss blood pressure targets (<130/80 mmHg) and renal protection."
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
