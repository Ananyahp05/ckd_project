"use client";

import { API_BASE_URL } from "@/lib/api";
import React, { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import ClinicalReportModal, { ClinicalReportData } from "./ClinicalReportModal";

type PredictionHistoryRecord = {
  id: number;
  patient_id: string;
  patient_age: number;
  risk_score: number;
  prediction_label: string;
  created_at: string;
  input_features: any;
  shap_values: any[];
};

type GlobalShapEntry = {
  feature: string;
  importance: number;
};

type HistoryDashboardProps = {
  token: string;
  onSelectPatient: (patientInput: any, result: any) => void;
  onViewEHR?: (patientId: string) => void;
};

const FEAT_LABEL_MAP: Record<string, string> = {
  age: "Age", bp: "Blood Pressure", sg: "Specific Gravity", al: "Albumin",
  su: "Sugar", bgr: "Blood Glucose", bu: "Blood Urea", sc: "Serum Creatinine",
  sod: "Sodium", pot: "Potassium", hemo: "Hemoglobin", pcv: "PCV",
  wbcc: "WBC Count", rbcc: "RBC Count",
};

export default function HistoryDashboard({ token, onSelectPatient, onViewEHR }: HistoryDashboardProps) {
  const [history, setHistory] = useState<PredictionHistoryRecord[]>([]);
  const [globalShap, setGlobalShap] = useState<GlobalShapEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ClinicalReportData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch user-specific prediction history
      const historyRes = await fetch(`${API_BASE_URL}/predictions/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!historyRes.ok) throw new Error("Failed to load prediction history");
      const historyData = await historyRes.json();
      setHistory(historyData);

      // 2. Fetch global SHAP cohort explainability
      const shapRes = await fetch(`${API_BASE_URL}/explanations/global`);
      if (shapRes.ok) {
        const shapData = await shapRes.json();
        setGlobalShap(shapData);
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? "Connection to backend failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const filteredHistory = history.filter(
    (item) =>
      item.patient_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.prediction_label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formattedGlobalShap = globalShap.map((item) => ({
    name: FEAT_LABEL_MAP[item.feature] || item.feature,
    value: item.importance,
  }));

  const handleInspect = (item: PredictionHistoryRecord) => {
    // Reconstruct the form object matching PatientForm state
    const reconstructedForm = {
      patient_id: item.patient_id,
      age: item.input_features.age ?? 48,
      bp: item.input_features.bp ?? 80,
      sg: item.input_features.sg ?? 1.020,
      al: item.input_features.al ?? 1,
      su: item.input_features.su ?? 0,
      bgr: item.input_features.bgr ?? 121,
      bu: item.input_features.bu ?? 36,
      sc: item.input_features.sc ?? 1.2,
      sod: item.input_features.sod ?? 138,
      pot: item.input_features.pot ?? 4.5,
      hemo: item.input_features.hemo ?? 12.5,
      pcv: item.input_features.pcv ?? 38,
      wbcc: item.input_features.wbcc ?? 7800,
      rbcc: item.input_features.rbcc ?? 4.5,
      // Map categorical fields back to string value
      rbc: item.input_features.rbc_normal ? "normal" : item.input_features.rbc_nan ? "unknown" : "abnormal",
      pc: item.input_features.pc_normal ? "normal" : item.input_features.pc_nan ? "unknown" : "abnormal",
      pcc: item.input_features.pcc_present ? "present" : "notpresent",
      ba: item.input_features.ba_present ? "present" : "notpresent",
      htn: item.input_features.htn_yes ? "yes" : "no",
      dm: item.input_features.dm_yes ? "yes" : "no",
      cad: item.input_features.cad_yes ? "yes" : "no",
      appet: item.input_features.appet_poor ? "poor" : item.input_features.appet_nan ? "unknown" : "good",
      pe: item.input_features.pe_yes ? "yes" : "no",
      ane: item.input_features.ane_yes ? "yes" : "no",
    };

    // Reconstruct prediction response
    const reconstructedResult = {
      prediction: item.prediction_label,
      probability: item.risk_score / 100,
      risk_score: item.risk_score,
      risk_level: item.risk_score >= 50 ? "HIGH" : "LOW",
      explanation: item.shap_values,
    };

    onSelectPatient(reconstructedForm, reconstructedResult);
  };

  const handleOpenPdfReport = (item: PredictionHistoryRecord) => {
    const isModelLstm = item.input_features?.model === "LSTM";
    const isModelHybrid = item.input_features?.model === "Hybrid";

    const report: ClinicalReportData = {
      patient_id: item.patient_id,
      patient_age: item.patient_age,
      report_date: new Date(item.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
      ann_result: (!isModelLstm && !isModelHybrid) ? {
        prediction: item.prediction_label,
        risk_score: item.risk_score,
        probability: item.risk_score / 100,
        explanation: item.shap_values,
      } : null,
      lstm_result: isModelLstm ? {
        predicted_egfr: item.risk_score,
        trajectory: item.risk_score < 60 ? "Renal Decline" : "Stable",
      } : null,
      hybrid_result: isModelHybrid ? {
        predicted_egfr: item.risk_score,
        trajectory: item.risk_score < 60 ? "Renal Decline" : "Stable",
        baseline_egfr: item.input_features?.baseline_egfr,
      } : null,
      consensus: {
        diagnosis: item.prediction_label,
        risk_level: item.risk_score >= 50 ? "HIGH" : "LOW",
        risk_score: item.risk_score,
        predicted_egfr: (isModelLstm || isModelHybrid) ? item.risk_score : null,
        kdigo_stage: item.prediction_label.includes("Stage") ? item.prediction_label : "Standard Clinical Review",
        concordance: isModelLstm ? "Longitudinal Follow-up" : isModelHybrid ? "Multimodal Synthesis" : "Clinical Intake Assessment",
        clinical_action: item.risk_score >= 50
          ? "Nephrology clinical review: initiate renal protection protocols and monitor longitudinal trajectory."
          : "Preserved kidney function: routine annual clinical follow-up.",
      },
    };

    setSelectedReport(report);
  };

  return (
    <>
      <style>{`
        .history-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 28px;
          align-items: start;
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 20px;
        }
        @media (max-width: 1024px) {
          .history-grid { grid-template-columns: 1fr; }
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.82rem;
          color: #cbd5e1;
        }
        .history-table th {
          padding: 12px 16px;
          font-weight: 700;
          color: #94a3b8;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          text-transform: uppercase;
          font-size: 0.68rem;
          letter-spacing: 0.05em;
        }
        .history-table td {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.06);
          vertical-align: middle;
        }
        .history-row:hover {
          background: rgba(148, 163, 184, 0.03);
        }
        .search-bar {
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 12px;
          padding: 10px 16px;
          color: #f1f5f9;
          font-size: 0.85rem;
          outline: none;
          width: 100%;
          max-width: 320px;
          transition: border-color 0.2s;
        }
        .search-bar:focus { border-color: var(--accent-1); }
        .inspect-btn {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #a5b4fc;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .inspect-btn:hover {
          background: var(--accent-1);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
        }
        
        .dash-panel {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        @media (min-width: 768px) {
          .dash-panel { padding: 32px; }
        }
      `}</style>

      <div className="history-grid">
        {/* Left Column: List of Diagnoses */}
        <div className="dash-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "1.6rem", fontWeight: 800, background: "linear-gradient(135deg, #a5b4fc, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "6px" }}>
                Diagnosis Records
              </h2>
              <p style={{ fontSize: "0.85rem", color: "#64748b" }}>Audit history of your diagnostic prediction outputs and patient records.</p>
            </div>
            
            <input
              type="text"
              placeholder="Search by Patient ID / Result..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-bar"
            />
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              <span className="spinner" /> Loading Diagnostic Records...
            </div>
          ) : errorMsg ? (
            <div className="error-box">⚠ {errorMsg}</div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ padding: "60px 40px", textAlign: "center", color: "#475569", border: "1px dashed rgba(148,163,184,0.15)", borderRadius: "16px" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📁</div>
              <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>No prediction records found.</p>
              <p style={{ fontSize: "0.78rem", color: "#334155", marginTop: "4px" }}>Diagnose a patient using the Patient Assessment form to populate historical audits.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Patient ID</th>
                    <th>Age</th>
                    <th>Diag Date</th>
                    <th>Risk Score</th>
                    <th>Severity</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => {
                    const isHigh = item.prediction_label === "CKD";
                    const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <tr key={item.id} className="history-row">
                        <td style={{ fontWeight: 700, color: "#e2e8f0" }}>{item.patient_id}</td>
                        <td>{item.patient_age ? `${item.patient_age} yrs` : "—"}</td>
                        <td>{dateStr}</td>
                        <td style={{ fontWeight: 800, color: isHigh ? "#f87171" : "#4ade80" }}>
                          {item.risk_score.toFixed(1)}%
                        </td>
                        <td>
                          <span style={{
                            padding: "2px 8px", borderRadius: "50px", fontSize: "0.68rem", fontWeight: 800,
                            background: isHigh ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.1)",
                            color: isHigh ? "#f87171" : "#4ade80",
                            border: `1px solid ${isHigh ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.15)"}`,
                          }}>
                            {item.prediction_label}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            {onViewEHR && (
                              <button
                                onClick={() => onViewEHR(item.patient_id)}
                                className="inspect-btn"
                                style={{ background: "rgba(56, 189, 248, 0.1)", color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.3)" }}
                                title="Open full Unified Patient EHR Chart"
                              >
                                🩺 EHR
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenPdfReport(item)}
                              className="inspect-btn"
                              style={{ background: "rgba(2, 132, 199, 0.1)", color: "#0284c7", borderColor: "rgba(2, 132, 199, 0.3)" }}
                              title="Export official clinical PDF report"
                            >
                              📄 PDF
                            </button>
                            <button onClick={() => handleInspect(item)} className="inspect-btn" title="Re-load inputs into assessment form">
                              ⚕ Re-inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Global SHAP Explanation */}
        <div className="dash-panel" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f1f5f9" }}>Global Feature Importance</h2>
            <p style={{ fontSize: "0.78rem", color: "#475569", marginTop: "4px" }}>
              Dynamic feature importance aggregated globally across all diagnostic trials.
            </p>
          </div>

          <div style={{ height: "450px", width: "100%" }}>
            {formattedGlobalShap.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={formattedGlobalShap} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#1e293b" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name" type="category" width={110}
                    tick={{ fill: "#64748b", fontSize: 10, fontWeight: 500 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 11 }}
                    formatter={(value: any) => [`Score: ${Number(value).toFixed(4)}`, "Global Impact"]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                    {formattedGlobalShap.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill="#a5b4fc" opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
                alignItems: "center", border: "1px dashed rgba(148,163,184,0.15)", borderRadius: "12px",
                color: "#475569", fontSize: "0.85rem",
              }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📊</div>
                <span>No global SHAP analytics recorded.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedReport && (
        <ClinicalReportModal
          isOpen={!!selectedReport}
          onClose={() => setSelectedReport(null)}
          reportData={selectedReport}
        />
      )}
    </>
  );
}
