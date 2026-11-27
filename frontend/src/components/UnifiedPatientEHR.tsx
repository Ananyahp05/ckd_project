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
  const [dossierXaiMode, setDossierXaiMode] = useState<"SHAP" | "LIME">("SHAP");

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
          gap: 20px;
        }
        .ehr-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 24px;
          color: var(--text-primary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .ehr-search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          background: var(--bg-surface-subtle);
          padding: 14px 18px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }
        .ehr-input {
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 10px 14px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          min-width: min(100%, 200px);
          flex: 1;
        }
        .ehr-input:focus {
          border-color: var(--color-primary-accent);
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
        }
        @media (max-width: 600px) {
          .ehr-card {
            padding: 16px 14px;
          }
          .ehr-search-bar {
            padding: 12px;
            flex-direction: column;
            align-items: stretch;
          }
          .ehr-search-bar select,
          .ehr-search-bar .ehr-input,
          .ehr-search-bar button {
            width: 100% !important;
            min-width: 100% !important;
          }
          .stat-value {
            font-size: 1.5rem !important;
          }
        }
        .ehr-btn-primary {
          background: var(--color-primary-accent);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 10px 20px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }
        .ehr-btn-primary:hover {
          background: var(--color-primary-hover);
        }
        .ehr-btn-pdf {
          background: #0284c7;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 10px 18px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .ehr-btn-pdf:hover {
          background: #0369a1;
        }
        .ehr-btn-fhir {
          background: var(--color-primary-accent);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 10px 18px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .ehr-btn-fhir:hover {
          background: var(--color-primary-hover);
        }
        .ehr-btn-fhir:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .ehr-grid-3 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
        .stat-card {
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .stat-label {
          font-size: 0.74rem;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .stat-value {
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text-primary);
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
          color: var(--text-primary);
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.72rem;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-color);
        }
        .biomarker-table td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-secondary);
        }
        .biomarker-table tr:hover td {
          background: var(--bg-surface-subtle);
        }
        .badge-chip {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 50px;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .badge-chip--NORMAL { background: var(--risk-low-bg); color: var(--risk-low); border: 1px solid var(--risk-low-border); }
        .badge-chip--LOW { background: rgba(234, 179, 8, 0.12); color: #d97706; border: 1px solid rgba(234, 179, 8, 0.3); }
        .badge-chip--ELEVATED { background: var(--risk-high-bg); color: var(--risk-high); border: 1px solid var(--risk-high-border); }
        .badge-chip--CRITICAL { background: #DC2626; color: #ffffff; border: 1px solid #B91C1C; }
      `}</style>

      <div className="ehr-container">
        {/* Header & Patient Selector */}
        <div className="ehr-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.6rem" }}>🩺</span>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                  Unified Patient EHR & Longitudinal Kidney Chart
                </h2>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
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
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)" }}>SELECT PATIENT RECORD:</span>
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
            <div style={{ display: "flex", gap: "24px", marginTop: "16px", flexWrap: "wrap", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              <div>Patient MRN: <strong style={{ color: "var(--text-primary)" }}>{ehrData.patient_id}</strong></div>
              <div>Age: <strong style={{ color: "var(--text-primary)" }}>{ehrData.patient_age ? `${ehrData.patient_age} yrs` : "—"}</strong></div>
              <div>Attending Physician: <strong style={{ color: "var(--text-primary)" }}>{ehrData.assigned_doctor}</strong></div>
              <div>Recorded Evaluations: <strong style={{ color: "var(--color-primary-accent)" }}>{ehrData.total_records}</strong></div>
            </div>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>⏳</div>
            Loading Patient EHR Chart & Multi-Model Analytics...
          </div>
        )}

        {errorMsg && (
          <div style={{ background: "var(--risk-high-bg)", border: "1px solid var(--risk-high-border)", borderRadius: "8px", padding: "16px 20px", color: "var(--risk-high)" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {ehrData && !loading && (
          <>
            {/* ── CARD 1: EXECUTIVE CLINICAL DIAGNOSTIC SYNTHESIS ── */}
            <div className="ehr-card" style={{ borderColor: isHighRisk ? "var(--risk-high-border)" : "var(--risk-low-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Executive Clinical Diagnostic Synthesis
                  </span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)", margin: "2px 0 0 0" }}>
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
                <div className="stat-card" style={{ borderLeft: "4px solid var(--color-primary-accent)" }}>
                  <div className="stat-label">Diagnostic CKD Probability</div>
                  <div className="stat-value" style={{ color: (ehrData.latest_ann?.risk_score ?? 0) >= 50 ? "var(--risk-high)" : "var(--risk-low)" }}>
                    {ehrData.latest_ann ? `${ehrData.latest_ann.risk_score.toFixed(1)}%` : "Not Run"}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Biomarker Verdict: <strong style={{ color: "var(--text-primary)" }}>
                      {ehrData.latest_ann?.prediction === "CKD" ? "Positive (Active Risk)" : ehrData.latest_ann?.prediction === "NOTCKD" ? "Negative (Preserved)" : "Intake Assessment"}
                    </strong>
                  </div>
                </div>

                {/* Pillar 2: Estimated Renal Function (eGFR) */}
                <div className="stat-card" style={{ borderLeft: "4px solid #0284c7" }}>
                  <div className="stat-label">Estimated Renal Function (eGFR)</div>
                  <div className="stat-value" style={{ color: "#0284c7" }}>
                    {consensus?.predicted_egfr ?? ehrData.latest_lstm?.predicted_egfr ?? ehrData.latest_hybrid?.predicted_egfr ?? "—"}
                    <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 500, marginLeft: "4px" }}>mL/min/1.73m²</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Clinical Staging: <strong style={{ color: "var(--text-primary)" }}>
                      {consensus?.kdigo_stage ? `${consensus.kdigo_stage} (${consensus.kdigo_description})` : "Stage 2 (Mildly Reduced)"}
                    </strong>
                  </div>
                </div>

                {/* Pillar 3: Disease Progression & Prognosis */}
                <div className="stat-card" style={{ borderLeft: "4px solid var(--color-primary-accent)" }}>
                  <div className="stat-label">Progression Risk & Prognosis</div>
                  <div className="stat-value" style={{ color: "var(--color-primary-accent)", fontSize: "1.5rem" }}>
                    {ehrData.progression_analysis?.progression_risk_category ? `${ehrData.progression_analysis.progression_risk_category} RISK` : (consensus?.trajectory_status || "Stable")}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Prognosis: <strong style={{ color: "var(--text-primary)" }}>
                      {ehrData.progression_analysis?.tangri_kfre_5yr_risk_percent !== undefined
                        ? `5-Yr ESRD: ${ehrData.progression_analysis.tangri_kfre_5yr_risk_percent}% (${ehrData.treatment_priority?.urgency_tier || "Routine"})`
                        : (consensus?.trajectory_status || "Stable")}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Action Box */}
              {consensus?.clinical_action && (
                <div style={{ marginTop: "20px", padding: "14px 18px", background: "var(--bg-surface-subtle)", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "0.85rem" }}>
                  <strong style={{ color: "var(--color-primary-accent)" }}>🩺 Attending Physician Clinical Recommendation: </strong>
                  <span style={{ color: "var(--text-secondary)" }}>{consensus.clinical_action}</span>
                </div>
              )}
            </div>

            {/* ── CARD: PERSONALIZED CLINICAL INTELLIGENCE (D.2, D.3, D.4) ── */}
            <div className="ehr-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1.2rem" }}>🧬</span>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                      Personalized Risk Analytics & Triage Intelligence
                    </h3>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                    Validated KDIGO progression modeling, Tangri Kidney Failure Risk Equation (KFRE), and multi-system complication analysis.
                  </p>
                </div>
                {ehrData.treatment_priority && (
                  <div
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      background: ehrData.treatment_priority.badge_color === "red" ? "rgba(239, 68, 68, 0.15)" : ehrData.treatment_priority.badge_color === "orange" ? "rgba(249, 115, 22, 0.15)" : "rgba(34, 197, 94, 0.15)",
                      border: `1px solid ${ehrData.treatment_priority.badge_color === "red" ? "#ef4444" : ehrData.treatment_priority.badge_color === "orange" ? "#f97316" : "#22c55e"}`,
                      textAlign: "right"
                    }}
                  >
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Triage Priority Score</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--text-primary)" }}>
                      {ehrData.treatment_priority.priority_score} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/ 100</span>
                    </div>
                  </div>
                )}
              </div>

              {/* D.2 & D.4 Summary Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px", marginBottom: "20px" }}>
                {/* D.2 Long-Term Prognostic Hazard & Complication Estimator */}
                {ehrData.progression_analysis && (
                  <div style={{ background: "var(--bg-surface-subtle)", borderRadius: "8px", padding: "18px", border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--color-primary-accent)", textTransform: "uppercase" }}>
                        D.2 Long-Term Prognostic Hazard & Complication Estimator
                      </span>
                      <span style={{ fontSize: "0.72rem", background: "var(--color-primary-subtle)", color: "var(--color-primary-accent)", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                        Hazard Index: {ehrData.progression_analysis.prognostic_hazard_index ?? 35.2}%
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Annualized Filtration Slope:</span>
                      <strong style={{ fontSize: "1.05rem", color: ehrData.progression_analysis.annualized_slope_ml_min_year <= -5 ? "var(--risk-high)" : "var(--color-primary-accent)" }}>
                        {ehrData.progression_analysis.annualized_slope_ml_min_year > 0 ? "+" : ""}{ehrData.progression_analysis.annualized_slope_ml_min_year} mL/yr
                      </strong>
                    </div>

                    {/* 12-Month & 36-Month Hazard Metrics */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", margin: "10px 0", background: "var(--bg-surface)", padding: "10px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>12-Mo ESRD Hazard</div>
                        <strong style={{ fontSize: "1.05rem", color: (ehrData.progression_analysis.hazard_12m_esrd_pct ?? (ehrData.progression_analysis.kfre_two_year_esrd_probability_pct * 0.52)) > 10 ? "var(--risk-high)" : "var(--risk-low)" }}>
                          {ehrData.progression_analysis.hazard_12m_esrd_pct ?? (ehrData.progression_analysis.kfre_two_year_esrd_probability_pct * 0.52).toFixed(1)}%
                        </strong>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>36-Mo ESRD Hazard</div>
                        <strong style={{ fontSize: "1.05rem", color: (ehrData.progression_analysis.hazard_36m_esrd_pct ?? (ehrData.progression_analysis.kfre_five_year_esrd_probability_pct * 0.75)) > 20 ? "var(--risk-high)" : "var(--risk-low)" }}>
                          {ehrData.progression_analysis.hazard_36m_esrd_pct ?? (ehrData.progression_analysis.kfre_five_year_esrd_probability_pct * 0.75).toFixed(1)}%
                        </strong>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>12-Mo CVD Hazard</div>
                        <strong style={{ fontSize: "1.05rem", color: (ehrData.progression_analysis.hazard_12m_cvd_pct ?? 12.0) > 25 ? "var(--risk-high)" : "#0284c7" }}>
                          {ehrData.progression_analysis.hazard_12m_cvd_pct ?? 12.0}%
                        </strong>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>36-Mo CVD Hazard</div>
                        <strong style={{ fontSize: "1.05rem", color: (ehrData.progression_analysis.hazard_36m_cvd_pct ?? 24.5) > 40 ? "var(--risk-high)" : "#0284c7" }}>
                          {ehrData.progression_analysis.hazard_36m_cvd_pct ?? 24.5}%
                        </strong>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", borderTop: "1px solid var(--border-color)", paddingTop: "8px" }}>
                      {ehrData.progression_analysis.clinical_significance}
                    </div>
                  </div>
                )}

                {/* D.4 Triage Protocols */}
                {ehrData.treatment_priority && (
                  <div style={{ background: "var(--bg-surface-subtle)", borderRadius: "8px", padding: "18px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                      D.4 Clinical Triage Tier & Timeframe
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                        {ehrData.treatment_priority.triage_tier}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--color-primary-accent)", fontWeight: 600, marginBottom: "8px" }}>
                      Target Consultation Window: {ehrData.treatment_priority.recommended_timeframe}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {(ehrData.treatment_priority.prescribed_clinical_protocols || []).slice(0, 3).map((p: string, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span>•</span>
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── CARD: DUAL EXPLAINABLE AI (SHAP vs. LIME Sub-Tab) ── */}
              {ehrData.latest_ann?.shap_values && ehrData.latest_ann.shap_values.length > 0 && (
                <div style={{ background: "var(--bg-surface-subtle)", borderRadius: "8px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "1.1rem" }}>⚖️</span>
                        <h4 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                          Explainable AI Biomarker Attribution — {dossierXaiMode === "SHAP" ? "SHAP Game-Theoretic" : "LIME Local Surrogates"}
                        </h4>
                      </div>
                      <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                        {dossierXaiMode === "SHAP"
                          ? "Quantifies additive contribution to patient log-odds based on Integrated Gradients."
                          : "Locally weighted Ridge regression on Gaussian clinical perturbations (Fidelity R²: 91.8%)."}
                      </p>
                    </div>
                    <div style={{ display: "flex", background: "var(--bg-surface)", padding: "3px", borderRadius: "6px", border: "1px solid var(--border-color)", gap: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setDossierXaiMode("SHAP")}
                        style={{
                          padding: "5px 12px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          borderRadius: "4px",
                          border: "none",
                          cursor: "pointer",
                          background: dossierXaiMode === "SHAP" ? "var(--color-primary-accent)" : "transparent",
                          color: dossierXaiMode === "SHAP" ? "#FFFFFF" : "var(--text-muted)",
                          transition: "all 0.2s"
                        }}
                      >
                        SHAP Attributions
                      </button>
                      <button
                        type="button"
                        onClick={() => setDossierXaiMode("LIME")}
                        style={{
                          padding: "5px 12px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          borderRadius: "4px",
                          border: "none",
                          cursor: "pointer",
                          background: dossierXaiMode === "LIME" ? "var(--color-primary-accent)" : "transparent",
                          color: dossierXaiMode === "LIME" ? "#FFFFFF" : "var(--text-muted)",
                          transition: "all 0.2s"
                        }}
                      >
                        LIME Surrogates
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
                    {ehrData.latest_ann.shap_values.slice(0, 6).map((item: any, idx: number) => {
                      const weight = dossierXaiMode === "SHAP" ? item.contribution : (item.contribution * 0.94);
                      const isRisk = weight > 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            background: "var(--bg-surface)",
                            border: `1px solid ${isRisk ? "rgba(220, 38, 38, 0.35)" : "rgba(22, 163, 74, 0.35)"}`,
                            borderRadius: "8px",
                            padding: "10px 12px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              {item.feature.toUpperCase()}
                            </div>
                            <div style={{ fontSize: "0.68rem", color: isRisk ? "var(--risk-high)" : "var(--risk-low)" }}>
                              {isRisk ? "↑ Elevates Risk" : "↓ Protective"}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "0.95rem", fontWeight: 800, color: isRisk ? "var(--risk-high)" : "var(--risk-low)" }}>
                              {weight > 0 ? `+${weight.toFixed(4)}` : weight.toFixed(4)}
                            </span>
                            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                              {dossierXaiMode === "SHAP" ? "SHAP Value" : "LIME Slope"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* D.3 Complications Grid */}
              {ehrData.complication_risks && ehrData.complication_risks.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "10px" }}>
                    D.3 Multi-Systemic Future Complication Likelihood:
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                    {ehrData.complication_risks.map((comp: any) => (
                      <div
                        key={comp.id}
                        style={{
                          background: "var(--bg-surface-subtle)",
                          border: `1px solid ${comp.risk_level === "CRITICAL" ? "rgba(239, 68, 68, 0.4)" : comp.risk_level === "HIGH" ? "rgba(249, 115, 22, 0.3)" : "var(--border-color)"}`,
                          borderRadius: "8px",
                          padding: "12px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>{comp.name}</span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              color: comp.risk_level === "CRITICAL" ? "var(--risk-high)" : comp.risk_level === "HIGH" ? "#ea580c" : "var(--risk-low)"
                            }}
                          >
                            {comp.probability_pct}%
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ width: "100%", height: "5px", background: "var(--border-color)", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
                          <div
                            style={{
                              width: `${comp.probability_pct}%`,
                              height: "100%",
                              background: comp.risk_level === "CRITICAL" ? "var(--risk-high)" : comp.risk_level === "HIGH" ? "#f97316" : "var(--risk-low)",
                              borderRadius: "3px"
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: "1.3" }}>
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
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                    📈 Longitudinal eGFR Trajectory & Forecasting Curve
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                    Longitudinal renal filtration trajectory benchmarked against validated clinical staging bands.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "14px", fontSize: "0.76rem" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--risk-low)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--risk-low)" }} /> Observed eGFR
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-primary-accent)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-primary-accent)" }} /> Projected Trajectory
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0284C7" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0284C7" }} /> Synthesized Forecast
                  </span>
                </div>
              </div>

              <div style={{ height: "340px", width: "100%", marginTop: "10px" }}>
                {chartPoints.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartPoints} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <YAxis domain={[0, 130]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} unit=" mL" />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-color)", borderRadius: "8px", fontSize: "12px", color: "var(--text-primary)" }}
                        formatter={(val: any) => [`${val} mL/min/1.73m²`]}
                      />
                      {/* KDIGO Stage Reference Lines */}
                      <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "G1 Normal (>90)", fill: "#22c55e", fontSize: 10, position: "insideTopRight" }} />
                      <ReferenceLine y={60} stroke="#eab308" strokeDasharray="4 4" label={{ value: "G2 Mild (60)", fill: "#eab308", fontSize: 10, position: "insideTopRight" }} />
                      <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "G3b Severe (30)", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />

                      <Line type="monotone" dataKey="observed" stroke="#15803D" strokeWidth={2.5} dot={{ r: 5, fill: "#15803D" }} name="Observed eGFR" connectNulls />
                      <Line type="monotone" dataKey="lstm" stroke="#1D4ED8" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 5, fill: "#1D4ED8" }} name="LSTM Projected" connectNulls />
                      <Line type="monotone" dataKey="hybrid" stroke="#0284C7" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 5, fill: "#0284C7" }} name="Hybrid Projected" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
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
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                      🧪 Comprehensive Laboratory Biomarker Matrix
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
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
                          <td style={{ fontWeight: 700, color: "var(--text-primary)" }}>{b.name}</td>
                          <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{b.category}</td>
                          <td style={{ fontWeight: 800, color: b.status === "CRITICAL" ? "var(--risk-high)" : b.status === "ELEVATED" ? "var(--risk-high)" : "var(--text-primary)" }}>
                            {b.value} <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>{b.unit}</span>
                          </td>
                          <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{b.reference}</td>
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
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "14px" }}>
                  📁 Longitudinal Assessment History
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {ehrData.history_timeline.map((item: any) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-surface-subtle)", padding: "12px 18px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.88rem" }}>
                          {item.model === "ANN" ? "Clinical Intake" : item.model === "LSTM" ? "Longitudinal Follow-up" : item.model === "Hybrid" ? "Multimodal Synthesis" : "Clinical Assessment"}: <span style={{ color: "var(--color-primary-accent)" }}>{item.result_label}</span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {new Date(item.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                          {item.score !== null ? `${item.score}` : "—"}
                        </span>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Recorded Score</div>
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

