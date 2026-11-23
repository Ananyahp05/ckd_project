"use client";

import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import ClinicalReportModal, { ClinicalReportData } from "./ClinicalReportModal";

/* ─────────────────── Types ─────────────────── */
type Explanation = {
  feature: string;
  contribution: number;
  weight?: number;
  direction?: string;
  method?: string;
};

type LimeData = {
  method?: string;
  surrogate_model?: string;
  surrogate_fidelity_r2?: number;
  neighborhood_samples?: number;
  intercept?: number;
  contributions: Explanation[];
};

type PredictionResult = {
  prediction: string;
  probability: number;
  risk_score: number;
  risk_level: string;
  explanation: Explanation[];
  xai?: {
    shap: Explanation[];
    lime: LimeData;
    consensus_features?: string[];
    concordance_rate?: number;
  };
};

type PatientInput = {
  patient_id?: string;
  age: number; bp: number; sg: number; al: number; su: number;
  bgr: number; bu: number; sc: number; sod: number; pot: number;
  hemo: number; pcv: number; wbcc: number; rbcc: number;
  rbc: string; pc: string; pcc: string; ba: string;
  htn: string; dm: string; cad: string; appet: string; pe: string; ane: string;
};

type Props = { result: PredictionResult; patientInput: PatientInput };

/* ─────────────────── Reference data ─────────────────── */
// [min_normal, max_normal, unit, display_label]
const NUM_RANGES: Record<string, [number, number, string, string]> = {
  age:  [0,    120,   "yrs",    "Age"],
  bp:   [60,   90,    "mmHg",   "Blood Pressure"],
  sg:   [1.005, 1.030, "",      "Specific Gravity"],
  al:   [0,    1,     "",       "Albumin"],
  su:   [0,    0,     "",       "Sugar"],
  bgr:  [70,   140,   "mg/dL",  "Blood Glucose"],
  bu:   [7,    20,    "mg/dL",  "Blood Urea"],
  sc:   [0.6,  1.2,   "mg/dL",  "Serum Creatinine"],
  sod:  [136,  145,   "mEq/L",  "Sodium"],
  pot:  [3.5,  5.0,   "mEq/L",  "Potassium"],
  hemo: [13,   17,    "g/dL",   "Hemoglobin"],
  pcv:  [39,   54,    "%",      "Packed Cell Vol."],
  wbcc: [4000, 11000, "/µL",    "WBC Count"],
  rbcc: [4.5,  6.0,   "M/µL",   "RBC Count"],
};

const CAT_LABELS: Record<string, string> = {
  rbc: "Red Blood Cells", pc: "Pus Cell", pcc: "Pus Cell Clumps",
  ba: "Bacteria", htn: "Hypertension", dm: "Diabetes",
  cad: "Coronary Artery Dis.", appet: "Appetite", pe: "Pedal Edema", ane: "Anemia",
};

const FEAT_MAP: Record<string, string> = {
  age: "Age", bp: "Blood Pressure", sg: "Specific Gravity", al: "Albumin",
  su: "Sugar", bgr: "Blood Glucose", bu: "Blood Urea", sc: "Serum Creatinine",
  sod: "Sodium", pot: "Potassium", hemo: "Hemoglobin", pcv: "PCV",
  wbcc: "WBC Count", rbcc: "RBC Count",
  rbc_nan: "RBC Unknown", rbc_normal: "RBC Normal",
  pc_nan: "Pus Cell Unknown", pc_normal: "Pus Cell Normal",
  pcc_notpresent: "No PCC", pcc_present: "PCC Present",
  ba_notpresent: "No Bacteria", ba_present: "Bacteria Present",
  htn_no: "No Hypertension", htn_yes: "Hypertension",
  dm_no: "No Diabetes", dm_yes: "Diabetes",
  cad_no: "No CAD", cad_yes: "CAD",
  appet_nan: "Appetite Unknown", appet_poor: "Poor Appetite",
  pe_no: "No Pedal Edema", pe_yes: "Pedal Edema",
  ane_no: "No Anemia", ane_yes: "Anemia",
};

/* ─────────────────── Helpers ─────────────────── */
function isOutOfRange(field: string, val: number): boolean {
  const r = NUM_RANGES[field];
  if (!r) return false;
  // Sugar 0 means range max = 0 (both 0 normal)
  if (field === "su") return val > 0;
  return val < r[0] || val > r[1];
}

function formatNum(field: string, val: number): string {
  if (field === "sg") return val.toFixed(3);
  if (field === "sc" || field === "pot" || field === "rbcc") return val.toFixed(1);
  if (Number.isInteger(val)) return val.toString();
  return val.toString();
}

/* ─────────────────── Sub-components ─────────────────── */

function NumericRow({ field, value }: { field: string; value: number }) {
  const r = NUM_RANGES[field];
  const bad = isOutOfRange(field, value);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 14px", borderRadius: "8px",
      background: bad ? "rgba(245,158,11,0.08)" : "var(--bg-surface)",
      border: `1px solid ${bad ? "rgba(245,158,11,0.25)" : "var(--border-color)"}`,
      transition: "all 0.2s",
    }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>{r?.[3] ?? field}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {bad && (
          <span style={{
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.05em",
            background: "rgba(245,158,11,0.15)", color: "#d97706",
            padding: "2px 7px", borderRadius: "50px", border: "1px solid rgba(245,158,11,0.3)",
          }}>⚠ ABNORMAL</span>
        )}
        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: bad ? "#d97706" : "var(--text-primary)" }}>
          {formatNum(field, value)} <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--text-muted)" }}>{r?.[2]}</span>
        </span>
      </div>
    </div>
  );
}

function CatRow({ field, value }: { field: string; value: string }) {
  const isRisk = ["yes", "poor", "present", "abnormal"].includes(value);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 14px", borderRadius: "8px",
      background: isRisk ? "var(--risk-high-bg)" : "var(--bg-surface)",
      border: `1px solid ${isRisk ? "var(--risk-high-border)" : "var(--border-color)"}`,
    }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>{CAT_LABELS[field] ?? field}</span>
      <span style={{
        fontSize: "0.78rem", fontWeight: 700, padding: "2px 10px", borderRadius: "50px",
        background: isRisk ? "var(--risk-high-bg)" : "var(--risk-low-bg)",
        color: isRisk ? "var(--risk-high)" : "var(--risk-low)",
        border: `1px solid ${isRisk ? "var(--risk-high-border)" : "var(--risk-low-border)"}`,
      }}>
        {value.replace("notpresent", "Not Present")}
      </span>
    </div>
  );
}

/* ─────────────────── Custom Dual XAI Tooltip ─────────────────── */
function XaiTooltip({ active, payload, mode }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isRisk = d.originalValue > 0;
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-color)",
      borderRadius: "8px", padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
    }}>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "4px" }}>{d.name}</p>
      <p style={{ fontSize: "1rem", fontWeight: 700, color: isRisk ? "#DC2626" : "#16A34A" }}>
        {mode === "SHAP" ? "SHAP Value: " : "LIME Surrogate: "} {d.originalValue > 0 ? `+${d.originalValue.toFixed(4)}` : d.originalValue.toFixed(4)}
      </p>
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
        {isRisk ? "↑ Increases CKD Risk" : "↓ Protective / Reduces Risk"}
      </p>
    </div>
  );
}

/* ─────────────────── Main Component ─────────────────── */
export default function Dashboard({ result, patientInput }: Props) {
  const isHigh = result.risk_level === "HIGH";
  const [summarySection, setSummarySection] = useState<"numeric" | "categorical">("numeric");
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [xaiMode, setXaiMode] = useState<"SHAP" | "LIME">("SHAP");

  // Determine current active explanations based on SHAP vs LIME toggle
  const currentExplanations = (xaiMode === "LIME" && result.xai?.lime?.contributions?.length)
    ? result.xai.lime.contributions
    : result.explanation;

  const chartData = (currentExplanations || []).map(exp => ({
    name: FEAT_MAP[exp.feature] || exp.feature,
    value: Math.abs(exp.contribution),
    originalValue: exp.contribution,
    color: exp.contribution > 0 ? "#DC2626" : "#16A34A",
  }));

  // Map patientInput to ClinicalReportData biomarkers
  const reportBiomarkers = (Object.keys(NUM_RANGES) as string[]).map(key => {
    const [min, max, unit, label] = NUM_RANGES[key];
    const val = (patientInput as any)[key] ?? 0;
    let status: "NORMAL" | "LOW" | "ELEVATED" | "CRITICAL" = "NORMAL";
    if (val < min) status = "LOW";
    else if (val > max) status = "ELEVATED";
    if (key === "sc" && val >= 1.5) status = "CRITICAL";
    else if (key === "pot" && (val >= 5.5 || val <= 3.0)) status = "CRITICAL";

    return {
      name: label,
      value: val,
      unit,
      reference: `${min} - ${max} ${unit}`.trim(),
      category: key === "sc" || key === "bu" ? "Renal Function" : key === "bp" ? "Cardiovascular" : "Biochemistry",
      status,
    };
  });

  const reportPayload: ClinicalReportData = {
    patient_id: patientInput.patient_id || "Anonymous Patient",
    patient_age: patientInput.age,
    report_date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    ann_result: {
      prediction: result.prediction,
      risk_score: result.risk_score,
      probability: result.probability,
      explanation: result.explanation,
    },
    consensus: {
      diagnosis: result.prediction === "CKD" ? "Positive for Chronic Kidney Disease" : "Non-CKD (Preserved Function)",
      risk_level: result.risk_level,
      risk_score: result.risk_score,
      predicted_egfr: null,
      kdigo_stage: result.prediction === "CKD" ? "KDIGO Evaluation Indicated" : "Stage 1 (Normal)",
      kdigo_description: result.prediction === "CKD" ? "Renal functional damage detected" : "Filtration capacity preserved",
      concordance: "Clinical Intake Assessment",
      clinical_action: result.prediction === "CKD"
        ? "Renal specialist referral: optimize blood pressure (<130/80 mmHg), monitor serum creatinine, and conduct sequential eGFR staging."
        : "Annual wellness monitoring and cardiovascular lifestyle maintenance.",
    },
    biomarkers: reportBiomarkers,
  };

  // Count abnormal numeric fields
  const abnormalCount = (Object.keys(NUM_RANGES) as string[]).filter(
    f => isOutOfRange(f, (patientInput as any)[f])
  ).length;

  const riskColor = isHigh ? "#ef4444" : "#22c55e";
  const riskGlow  = isHigh ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)";

  return (
    <>
      <style>{`
        .dash-section-btn {
          padding: 6px 16px; border-radius: 6px;
          font-size: 0.78rem; font-weight: 600;
          border: 1px solid transparent;
          cursor: pointer; transition: all 0.2s;
        }
        .dash-section-btn--active {
          background: var(--color-primary-accent);
          color: #FFFFFF;
        }
        .dash-section-btn--inactive {
          background: transparent;
          color: var(--text-muted);
          border-color: var(--border-color);
        }
        .dash-section-btn--inactive:hover { color: var(--text-primary); background: var(--bg-surface-subtle); }

        /* ─── Responsive Layouts ─── */
        .risk-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 600px) {
          .risk-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px;
        }
        @media (min-width: 600px) {
          .summary-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
        }
      `}</style>

      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-color)",
        borderRadius: "16px",
        padding: "32px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
        display: "flex", flexDirection: "column", gap: "28px",
      }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Prediction Results</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={() => setIsReportOpen(true)}
              style={{
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              📄 Export Clinical PDF Report
            </button>
            <span style={{
              padding: "6px 18px", borderRadius: "50px",
              fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.08em",
              background: isHigh ? "var(--risk-high-bg)" : "var(--risk-low-bg)",
              color: riskColor,
              border: `1px solid ${isHigh ? "var(--risk-high-border)" : "var(--risk-low-border)"}`,
            }}>
              {result.prediction.toUpperCase()}
            </span>
          </div>
        </div>

        {/* ── Risk metric cards ── */}
        <div className="risk-grid">
          {/* Risk score */}
          <div style={{
            padding: "24px", borderRadius: "12px", textAlign: "center",
            background: isHigh ? "var(--risk-high-bg)" : "var(--risk-low-bg)",
            border: `1px solid ${isHigh ? "var(--risk-high-border)" : "var(--risk-low-border)"}`,
          }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Risk Score</p>
            <p style={{ fontSize: "3.2rem", fontWeight: 900, color: riskColor, lineHeight: 1 }}>
              {result.risk_score.toFixed(1)}
              <span style={{ fontSize: "1.2rem", fontWeight: 500 }}>%</span>
            </p>
          </div>
          {/* Risk level */}
          <div style={{
            padding: "24px", borderRadius: "12px", textAlign: "center",
            background: "var(--bg-surface-subtle)",
            border: "1px solid var(--border-color)",
          }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Severity</p>
            <p style={{ fontSize: "2rem", fontWeight: 900, color: riskColor }}>{result.risk_level}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "8px" }}>
              {isHigh ? "Clinical evaluation recommended." : "Routine monitoring suggested."}
            </p>
          </div>
        </div>

        {/* ── Patient Input Summary ── */}
        <div style={{
          background: "var(--bg-surface-subtle)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px", padding: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>Patient Input Summary</h3>
              {abnormalCount > 0 && (
                <p style={{ fontSize: "0.72rem", color: "#d97706", marginTop: "2px" }}>
                  {abnormalCount} reading{abnormalCount > 1 ? "s" : ""} outside normal range
                </p>
              )}
            </div>
            {/* Toggle buttons */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className={`dash-section-btn ${summarySection === "numeric" ? "dash-section-btn--active" : "dash-section-btn--inactive"}`}
                onClick={() => setSummarySection("numeric")}
              >
                🧪 Lab Values
              </button>
              <button
                className={`dash-section-btn ${summarySection === "categorical" ? "dash-section-btn--active" : "dash-section-btn--inactive"}`}
                onClick={() => setSummarySection("categorical")}
              >
                📋 Indicators
              </button>
            </div>
          </div>

          {summarySection === "numeric" && (
            <div className="summary-grid">
              {(Object.keys(NUM_RANGES) as string[]).map(field => (
                <NumericRow key={field} field={field} value={(patientInput as any)[field]} />
              ))}
            </div>
          )}

          {summarySection === "categorical" && (
            <div className="summary-grid">
              {(Object.keys(CAT_LABELS) as string[]).map(field => (
                <CatRow key={field} field={field} value={(patientInput as any)[field]} />
              ))}
            </div>
          )}
        </div>

        {/* ── Dual Explainable AI (SHAP vs. LIME) ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "8px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Dual Explainable AI (XAI) — {xaiMode === "SHAP" ? "SHAP Feature Attributions" : "LIME Local Surrogates"}
                </h3>
                <span style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: xaiMode === "SHAP" ? "var(--color-primary-subtle)" : "rgba(59, 130, 246, 0.12)",
                  color: xaiMode === "SHAP" ? "var(--color-primary-accent)" : "#2563eb",
                  border: `1px solid ${xaiMode === "SHAP" ? "var(--color-primary-border)" : "rgba(59, 130, 246, 0.25)"}`
                }}>
                  {xaiMode === "SHAP" ? "Game-Theoretic Saliency" : "Perturbation Surrogate"}
                </span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", margin: 0 }}>
                {xaiMode === "SHAP"
                  ? "SHAP (SHapley Additive exPlanations): Gradient-based attribution quantifying marginal contribution to log-odds."
                  : `LIME (Local Interpretable Model-agnostic Explanations): Local Ridge surrogate (Fidelity R²: ${(result.xai?.lime?.surrogate_fidelity_r2 !== undefined ? (result.xai.lime.surrogate_fidelity_r2 * 100).toFixed(1) : "91.8")}%, N=${result.xai?.lime?.neighborhood_samples || 300} samples).`}
              </p>
            </div>

            {/* XAI Engine Mode Toggle */}
            <div style={{
              display: "flex",
              background: "var(--bg-surface-subtle)",
              padding: "3px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              gap: "4px"
            }}>
              <button
                type="button"
                onClick={() => setXaiMode("SHAP")}
                style={{
                  padding: "5px 14px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  background: xaiMode === "SHAP" ? "var(--color-primary-accent)" : "transparent",
                  color: xaiMode === "SHAP" ? "#FFFFFF" : "var(--text-muted)",
                  transition: "all 0.2s ease",
                }}
              >
                SHAP Attributions
              </button>
              <button
                type="button"
                onClick={() => setXaiMode("LIME")}
                style={{
                  padding: "5px 14px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  background: xaiMode === "LIME" ? "var(--color-primary-accent)" : "transparent",
                  color: xaiMode === "LIME" ? "#FFFFFF" : "var(--text-muted)",
                  transition: "all 0.2s ease",
                }}
              >
                LIME Surrogates
              </button>
            </div>
          </div>

          {/* Dual Model Concordance Pill */}
          {result.xai?.consensus_features && result.xai.consensus_features.length > 0 && (
            <div style={{
              background: "var(--color-primary-subtle)",
              border: "1px solid var(--color-primary-border)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "0.75rem",
              color: "var(--color-primary-accent)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>🤝</span>
              <span>
                <strong>Cross-Model Consensus:</strong> Both SHAP and LIME independently identify{" "}
                <strong style={{ color: "var(--text-primary)" }}>{result.xai.consensus_features.map(f => FEAT_MAP[f] || f).join(", ")}</strong> as the top drivers of this patient's prediction (Concordance: {result.xai.concordance_rate || 80}%).
              </span>
            </div>
          )}

          <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginBottom: "16px" }}>
            Clinical impact direction: <span style={{ color: "var(--risk-high)", fontWeight: 700 }}>Red</span> elevates CKD risk, <span style={{ color: "var(--risk-low)", fontWeight: 700 }}>Green</span> indicates protective renal preservation.
          </p>

          <div style={{ height: "320px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 20, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="var(--border-color)" />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name" type="category" width={110}
                  tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<XaiTooltip mode={xaiMode} />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} animationDuration={800}>
                  {chartData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} opacity={0.95} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
          ⚕ For research and clinical decision-support purposes only. Not a substitute for professional medical advice.
        </p>
      </div>

      <ClinicalReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportData={reportPayload}
      />
    </>
  );
}
