"use client";

import { API_BASE_URL } from "@/lib/api";
import React, { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, BarChart, Bar, Cell
} from "recharts";
import ClinicalReportModal, { ClinicalReportData } from "./ClinicalReportModal";
import PlotlyVisualizer from "./PlotlyVisualizer";

type Props = {
  token: string;
  initialPatientId?: string;
  onNavigateToForm?: (tabName: string, prefillId: string) => void;
};

export default function UnifiedPatientEHR({ token, initialPatientId, onNavigateToForm }: Props) {
  const [patientIdInput, setPatientIdInput] = useState(initialPatientId || "");
  const [activePatientId, setActivePatientId] = useState(initialPatientId || "");
  const [patientsList, setPatientsList] = useState<string[]>([]);
  const [ehrData, setEhrData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // PDF report modal state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [fhirDownloading, setFhirDownloading] = useState(false);

  const handleExportFhir = async () => {
    if (!activePatientId || !token) return;
    try {
      setFhirDownloading(true);
      const res = await fetch(`${API_BASE_URL}/fhir/patient/${encodeURIComponent(activePatientId.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `FHIR export failed (${res.status})`);
      }
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fhir_r4_${activePatientId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Could not export FHIR Bundle: ${err.message}`);
    } finally {
      setFhirDownloading(false);
    }
  };

  // Fetch list of accessible patients for quick selection
  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/patients-list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const list = await res.json();
          setPatientsList(list);
          if (!activePatientId && list.length > 0) {
            setActivePatientId(list[0]);
            setPatientIdInput(list[0]);
          }
        }
      } catch (e) {
        console.error("Failed to load patient cohort list:", e);
      }
    };
    if (token) fetchPatients();
  }, [token]);

  // Load EHR data whenever activePatientId changes
  useEffect(() => {
    if (!activePatientId.trim() || !token) return;

    const fetchEHR = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`${API_BASE_URL}/predictions/patient-ehr/${encodeURIComponent(activePatientId.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed to fetch EHR (HTTP ${res.status})`);
        }
        const data = await res.json();
        setEhrData(data);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load EHR records");
        setEhrData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEHR();
  }, [activePatientId, token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patientIdInput.trim()) {
      setActivePatientId(patientIdInput.trim());
    }
  };

  // Prepare chart data for Recharts
  const chartPoints = (ehrData?.longitudinal_egfr || []).map((p: any, idx: number) => ({
    name: p.label || `Point ${idx + 1}`,
    observed: p.observed_egfr ?? null,
    lstm: p.lstm_projected ?? null,
    hybrid: p.hybrid_projected ?? null,
  }));

  // Prepare data for ClinicalReportModal
  const reportPayload: ClinicalReportData = {
    patient_id: ehrData?.patient_id || activePatientId,
    patient_age: ehrData?.patient_age,
    assigned_doctor: ehrData?.assigned_doctor,
    report_date: new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    ann_result: ehrData?.latest_ann ? {
      prediction: ehrData.latest_ann.prediction,
      risk_score: ehrData.latest_ann.risk_score,
      probability: ehrData.latest_ann.risk_score / 100,
      explanation: ehrData.latest_ann.shap_values,
    } : null,
    lstm_result: ehrData?.latest_lstm ? {
      predicted_egfr: ehrData.latest_lstm.predicted_egfr,
      kdigo_stage: ehrData.consensus?.kdigo_stage,
      kdigo_description: ehrData.consensus?.kdigo_description,
      trajectory: ehrData.consensus?.trajectory_status,
    } : null,
    hybrid_result: ehrData?.latest_hybrid ? {
      predicted_egfr: ehrData.latest_hybrid.predicted_egfr,
      kdigo_stage: ehrData.consensus?.kdigo_stage,
      kdigo_description: ehrData.consensus?.kdigo_description,
      trajectory: ehrData.consensus?.trajectory_status,
    } : null,
    consensus: ehrData?.consensus,
    biomarkers: ehrData?.biomarkers_panel || [],
  };

  const consensus = ehrData?.consensus;
  const isHighRisk = consensus?.risk_level === "HIGH" || (consensus?.risk_score ?? 0) >= 50;

  return (
    <>
      <style>{`
        .ehr-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 26px;
        }
        .ehr-card {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 22px;
          padding: 26px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        }
        .ehr-search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          background: rgba(30, 41, 59, 0.45);
          padding: 16px 20px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.15);
        }
        .ehr-input {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 10px 14px;
          color: #f8fafc;
          font-size: 0.9rem;
          outline: none;
          min-width: 240px;
        }
        .ehr-input:focus {
          border-color: #6366f1;
        }
        .ehr-btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ehr-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
        }
        .ehr-btn-pdf {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .ehr-btn-pdf:hover {
          box-shadow: 0 4px 16px rgba(2, 132, 199, 0.4);
          transform: translateY(-1px);
        }
        .ehr-btn-fhir {
          background: linear-gradient(135deg, #059669, #047857);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .ehr-btn-fhir:hover {
          box-shadow: 0 4px 16px rgba(5, 150, 105, 0.4);
          transform: translateY(-1px);
        }
        .ehr-btn-fhir:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .ehr-grid-3 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }
        .stat-card {
          background: rgba(30, 41, 59, 0.35);
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .stat-label {
          font-size: 0.75rem;
          color: #94a3b8;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .stat-value {
          font-size: 1.8rem;
          font-weight: 800;
          color: #f8fafc;
        }
        .biomarker-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.85rem;
        }
        .biomarker-table th {
          text-align: left;
          padding: 12px 14px;
          color: #94a3b8;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.72rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        }
        .biomarker-table td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.06);
          color: #cbd5e1;
        }
        .biomarker-table tr:hover td {
          background: rgba(30, 41, 59, 0.25);
        }
        .badge-chip {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 50px;
          font-size: 0.7rem;
          font-weight: 800;
        }
        .badge-chip--NORMAL { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .badge-chip--LOW { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
        .badge-chip--ELEVATED { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .badge-chip--CRITICAL { background: #991b1b; color: #ffffff; border: 1px solid #ef4444; }
      `}</style>

      <div className="ehr-container">
        {/* Header & Patient Selector */}
        <div className="ehr-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.6rem" }}>🩺</span>
                <h2 style={{ fontSize: "1.6rem", fontWeight: 800, background: "linear-gradient(135deg, #a5b4fc, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
                  Unified Patient EHR & Longitudinal Nephrology Chart
                </h2>
              </div>
              <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0 0" }}>
                Comprehensive clinical health intelligence synthesizing diagnostic risk, longitudinal eGFR trajectory, and multi-system complication analytics.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {ehrData && (
                <>
                  <button onClick={() => setIsReportOpen(true)} className="ehr-btn-pdf">
                    <span>📄</span> Export Official PDF Report
                  </button>
                  <button onClick={handleExportFhir} disabled={fhirDownloading} className="ehr-btn-fhir">
                    <span>📥</span> {fhirDownloading ? "Exporting FHIR..." : "Export FHIR R4 JSON"}
                  </button>
                </>
              )}
              {onNavigateToForm && (
                <button
                  onClick={() => onNavigateToForm("assessment", activePatientId)}
                  className="ehr-btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  <span>📋</span> New Clinical Intake
                </button>
              )}
            </div>
          </div>

          {/* Search / Select Bar */}
          <form onSubmit={handleSearchSubmit} className="ehr-search-bar">
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#94a3b8" }}>SELECT PATIENT RECORD:</span>
            {patientsList.length > 0 && (
              <select
                value={activePatientId}
                onChange={(e) => {
                  setActivePatientId(e.target.value);
                  setPatientIdInput(e.target.value);
                }}
                className="ehr-input"
                style={{ minWidth: "180px" }}
              >
                {patientsList.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Or enter Patient ID / MRN..."
              value={patientIdInput}
              onChange={(e) => setPatientIdInput(e.target.value)}
              className="ehr-input"
            />
            <button type="submit" className="ehr-btn-primary">
              Load Chart
            </button>
          </form>

          {/* Quick Meta Row */}
          {ehrData && (
            <div style={{ display: "flex", gap: "24px", marginTop: "16px", flexWrap: "wrap", fontSize: "0.85rem", color: "#94a3b8" }}>
              <div>Patient MRN: <strong style={{ color: "#f8fafc" }}>{ehrData.patient_id}</strong></div>
              <div>Age: <strong style={{ color: "#f8fafc" }}>{ehrData.patient_age ? `${ehrData.patient_age} yrs` : "—"}</strong></div>
              <div>Attending Physician: <strong style={{ color: "#f8fafc" }}>{ehrData.assigned_doctor}</strong></div>
              <div>Recorded Evaluations: <strong style={{ color: "#a5b4fc" }}>{ehrData.total_records}</strong></div>
            </div>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>⏳</div>
            Loading Patient EHR Chart & Multi-Model Analytics...
          </div>
        )}

        {errorMsg && (
          <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "14px", padding: "16px 20px", color: "#f87171" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {ehrData && !loading && (
          <>
            {/* ── CARD 1: EXECUTIVE CLINICAL DIAGNOSTIC SYNTHESIS ── */}
            <div className="ehr-card" style={{ borderColor: isHighRisk ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Executive Clinical Diagnostic Synthesis
                  </span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f8fafc", margin: "2px 0 0 0" }}>
                    {consensus?.diagnosis}
                  </h3>
                </div>
                <span className={`badge-chip ${isHighRisk ? "badge-chip--ELEVATED" : "badge-chip--NORMAL"}`} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                  {consensus?.concordance}
                </span>
              </div>

              {/* 3 Unified Clinical Synthesis Pillars */}
              <div className="ehr-grid-3">
                {/* Pillar 1: Diagnostic CKD Risk */}
                <div className="stat-card" style={{ borderLeft: "4px solid #6366f1" }}>
                  <div className="stat-label">Diagnostic CKD Probability</div>
                  <div className="stat-value" style={{ color: (ehrData.latest_ann?.risk_score ?? 0) >= 50 ? "#f87171" : "#4ade80" }}>
                    {ehrData.latest_ann ? `${ehrData.latest_ann.risk_score.toFixed(1)}%` : "Not Run"}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    Biomarker Verdict: <strong style={{ color: "#f8fafc" }}>
                      {ehrData.latest_ann?.prediction === "CKD" ? "Positive (Active Risk)" : ehrData.latest_ann?.prediction === "NOTCKD" ? "Negative (Preserved)" : "Intake Assessment"}
                    </strong>
                  </div>
                </div>

                {/* Pillar 2: Estimated Renal Function (eGFR) */}
                <div className="stat-card" style={{ borderLeft: "4px solid #0284c7" }}>
                  <div className="stat-label">Estimated Renal Function (eGFR)</div>
                  <div className="stat-value" style={{ color: "#38bdf8" }}>
                    {consensus?.predicted_egfr ?? ehrData.latest_lstm?.predicted_egfr ?? ehrData.latest_hybrid?.predicted_egfr ?? "—"}
                    <span style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: 500, marginLeft: "4px" }}>mL/min/1.73m²</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    Clinical Staging: <strong style={{ color: "#f8fafc" }}>
                      {consensus?.kdigo_stage ? `${consensus.kdigo_stage} (${consensus.kdigo_description})` : "Stage 2 (Mildly Reduced)"}
                    </strong>
                  </div>
                </div>

                {/* Pillar 3: Disease Progression & Prognosis */}
                <div className="stat-card" style={{ borderLeft: "4px solid #a855f7" }}>
                  <div className="stat-label">Progression Risk & Prognosis</div>
                  <div className="stat-value" style={{ color: "#c084fc", fontSize: "1.5rem" }}>
                    {ehrData.progression_analysis?.progression_risk_category ? `${ehrData.progression_analysis.progression_risk_category} RISK` : (consensus?.trajectory_status || "Stable")}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    Prognosis: <strong style={{ color: "#f8fafc" }}>
                      {ehrData.progression_analysis?.tangri_kfre_5yr_risk_percent !== undefined
                        ? `5-Yr ESRD: ${ehrData.progression_analysis.tangri_kfre_5yr_risk_percent}% (${ehrData.treatment_priority?.urgency_tier || "Routine"})`
                        : (consensus?.trajectory_status || "Stable")}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Action Box */}
              {consensus?.clinical_action && (
                <div style={{ marginTop: "20px", padding: "14px 18px", background: "rgba(30, 41, 59, 0.45)", borderRadius: "12px", border: "1px solid rgba(148, 163, 184, 0.15)", fontSize: "0.85rem" }}>
                  <strong style={{ color: "#38bdf8" }}>🩺 Nephrologist Clinical Recommendation: </strong>
                  <span style={{ color: "#cbd5e1" }}>{consensus.clinical_action}</span>
                </div>
              )}
            </div>

            {/* ── CARD: PERSONALIZED CLINICAL INTELLIGENCE (D.2, D.3, D.4) ── */}
            <div className="ehr-card" style={{ borderColor: "rgba(99, 102, 241, 0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1.2rem" }}>🧬</span>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                      Personalized Risk Analytics & Triage Intelligence
                    </h3>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0 0" }}>
                    Validated KDIGO progression modeling, Tangri Kidney Failure Risk Equation (KFRE), and multi-system complication analysis.
                  </p>
                </div>
                {ehrData.treatment_priority && (
                  <div
                    style={{
                      padding: "8px 16px",
                      borderRadius: "12px",
                      background: ehrData.treatment_priority.badge_color === "red" ? "rgba(239, 68, 68, 0.2)" : ehrData.treatment_priority.badge_color === "orange" ? "rgba(249, 115, 22, 0.2)" : "rgba(34, 197, 94, 0.2)",
                      border: `1px solid ${ehrData.treatment_priority.badge_color === "red" ? "#ef4444" : ehrData.treatment_priority.badge_color === "orange" ? "#f97316" : "#22c55e"}`,
                      textAlign: "right"
                    }}
                  >
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Triage Priority Score</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#f8fafc" }}>
                      {ehrData.treatment_priority.priority_score} <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>/ 100</span>
                    </div>
                  </div>
                )}
              </div>

              {/* D.2 & D.4 Summary Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                {/* D.2 Progression Card */}
                {ehrData.progression_analysis && (
                  <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: "14px", padding: "16px", border: "1px solid rgba(148, 163, 184, 0.1)" }}>
                    <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>
                      D.2 Disease Progression & KFRE Model
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>Annualized Filtration Slope:</span>
                      <strong style={{ fontSize: "1.05rem", color: ehrData.progression_analysis.annualized_slope_ml_min_year <= -5 ? "#f87171" : "#38bdf8" }}>
                        {ehrData.progression_analysis.annualized_slope_ml_min_year > 0 ? "+" : ""}{ehrData.progression_analysis.annualized_slope_ml_min_year} mL/yr
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>2-Year ESRD Risk (KFRE):</span>
                      <strong style={{ fontSize: "1.05rem", color: ehrData.progression_analysis.kfre_two_year_esrd_probability_pct > 10 ? "#f87171" : "#4ade80" }}>
                        {ehrData.progression_analysis.kfre_two_year_esrd_probability_pct}%
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                      <span style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>5-Year ESRD Risk (KFRE):</span>
                      <strong style={{ fontSize: "1.05rem", color: ehrData.progression_analysis.kfre_five_year_esrd_probability_pct > 20 ? "#f87171" : "#4ade80" }}>
                        {ehrData.progression_analysis.kfre_five_year_esrd_probability_pct}%
                      </strong>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", borderTop: "1px solid rgba(148, 163, 184, 0.08)", paddingTop: "8px" }}>
                      {ehrData.progression_analysis.clinical_significance}
                    </div>
                  </div>
                )}

                {/* D.4 Triage Protocols */}
                {ehrData.treatment_priority && (
                  <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: "14px", padding: "16px", border: "1px solid rgba(148, 163, 184, 0.1)" }}>
                    <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>
                      D.4 Clinical Triage Tier & Timeframe
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 800, fontSize: "1rem", color: "#f8fafc" }}>
                        {ehrData.treatment_priority.triage_tier}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#38bdf8", fontWeight: 600, marginBottom: "8px" }}>
                      Target Consultation Window: {ehrData.treatment_priority.recommended_timeframe}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {(ehrData.treatment_priority.prescribed_clinical_protocols || []).slice(0, 2).map((p: string, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span>•</span>
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* D.3 Complications Grid */}
              {ehrData.complication_risks && ehrData.complication_risks.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "10px" }}>
                    D.3 Multi-Systemic Future Complication Likelihood:
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                    {ehrData.complication_risks.map((comp: any) => (
                      <div
                        key={comp.id}
                        style={{
                          background: "rgba(30, 41, 59, 0.4)",
                          border: `1px solid ${comp.risk_level === "CRITICAL" ? "rgba(239, 68, 68, 0.4)" : comp.risk_level === "HIGH" ? "rgba(249, 115, 22, 0.3)" : "rgba(148, 163, 184, 0.1)"}`,
                          borderRadius: "12px",
                          padding: "12px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#f1f5f9" }}>{comp.name}</span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              color: comp.risk_level === "CRITICAL" ? "#f87171" : comp.risk_level === "HIGH" ? "#fb923c" : "#4ade80"
                            }}
                          >
                            {comp.probability_pct}%
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ width: "100%", height: "5px", background: "rgba(15, 23, 42, 0.8)", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
                          <div
                            style={{
                              width: `${comp.probability_pct}%`,
                              height: "100%",
                              background: comp.risk_level === "CRITICAL" ? "#ef4444" : comp.risk_level === "HIGH" ? "#f97316" : "#22c55e",
                              borderRadius: "3px"
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8", lineHeight: "1.3" }}>
                          {comp.preventive_countermeasure}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── CARD: INTERACTIVE PLOTLY CLINICAL SUITE (H.4) ── */}
            <PlotlyVisualizer patientId={ehrData.patient_id} token={token} />

            {/* ── CARD 2: LONGITUDINAL eGFR TRAJECTORY CHART ── */}
            <div className="ehr-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                    📈 Longitudinal eGFR Trajectory & Forecasting Curve
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0 0" }}>
                    Longitudinal renal filtration trajectory benchmarked against validated clinical staging bands.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "14px", fontSize: "0.76rem" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4ade80" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80" }} /> Observed eGFR
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#c084fc" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c084fc" }} /> Projected Trajectory
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38bdf8" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#38bdf8" }} /> Synthesized Forecast
                  </span>
                </div>
              </div>

              <div style={{ height: "340px", width: "100%", marginTop: "10px" }}>
                {chartPoints.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartPoints} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis domain={[0, 130]} tick={{ fill: "#64748b", fontSize: 11 }} unit=" mL" />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px", color: "#f8fafc" }}
                        formatter={(val: any) => [`${val} mL/min/1.73m²`]}
                      />
                      {/* KDIGO Stage Reference Lines */}
                      <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "G1 Normal (>90)", fill: "#22c55e", fontSize: 10, position: "insideTopRight" }} />
                      <ReferenceLine y={60} stroke="#eab308" strokeDasharray="4 4" label={{ value: "G2 Mild (60)", fill: "#eab308", fontSize: 10, position: "insideTopRight" }} />
                      <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "G3b Severe (30)", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />

                      <Line type="monotone" dataKey="observed" stroke="#4ade80" strokeWidth={3} dot={{ r: 5, fill: "#4ade80" }} name="Observed eGFR" connectNulls />
                      <Line type="monotone" dataKey="lstm" stroke="#c084fc" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 6, fill: "#c084fc" }} name="LSTM Projected" connectNulls />
                      <Line type="monotone" dataKey="hybrid" stroke="#38bdf8" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 6, fill: "#38bdf8" }} name="Hybrid Projected" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                    No longitudinal sequence records found for this patient.
                  </div>
                )}
              </div>
            </div>

            {/* ── CARD 3: BIOMARKER LABORATORY PANEL ── */}
            {ehrData.biomarkers_panel && ehrData.biomarkers_panel.length > 0 && (
              <div className="ehr-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <div>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                      🧪 Comprehensive Laboratory Biomarker Matrix
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0 0" }}>
                      Clinical measurements with standardized clinical reference ranges and flagged anomalies.
                    </p>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="biomarker-table">
                    <thead>
                      <tr>
                        <th>Biomarker</th>
                        <th>Category</th>
                        <th>Measured Value</th>
                        <th>Reference Range</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ehrData.biomarkers_panel.map((b: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 700, color: "#f1f5f9" }}>{b.name}</td>
                          <td style={{ color: "#64748b", fontSize: "0.78rem" }}>{b.category}</td>
                          <td style={{ fontWeight: 800, color: b.status === "CRITICAL" ? "#f87171" : b.status === "ELEVATED" ? "#f87171" : "#f8fafc" }}>
                            {b.value} <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 500 }}>{b.unit}</span>
                          </td>
                          <td style={{ color: "#94a3b8", fontSize: "0.78rem" }}>{b.reference}</td>
                          <td>
                            <span className={`badge-chip badge-chip--${b.status}`}>
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CARD 4: TIMELINE OF HISTORICAL EVALUATIONS ── */}
            {ehrData.history_timeline && ehrData.history_timeline.length > 0 && (
              <div className="ehr-card">
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#f8fafc", marginBottom: "14px" }}>
                  📁 Longitudinal Assessment History
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {ehrData.history_timeline.map((item: any) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(30, 41, 59, 0.35)", padding: "12px 18px", borderRadius: "12px", border: "1px solid rgba(148, 163, 184, 0.08)" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.88rem" }}>
                          {item.model === "ANN" ? "Clinical Intake" : item.model === "LSTM" ? "Longitudinal Follow-up" : item.model === "Hybrid" ? "Multimodal Synthesis" : "Clinical Assessment"}: <span style={{ color: "#38bdf8" }}>{item.result_label}</span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {new Date(item.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 800, color: "#f8fafc", fontSize: "0.95rem" }}>
                          {item.score !== null ? `${item.score}` : "—"}
                        </span>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Recorded Score</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Clinical PDF Report Modal */}
      <ClinicalReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportData={reportPayload}
      />
    </>
  );
}

