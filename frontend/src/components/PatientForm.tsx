"use client";

import { API_BASE_URL } from "@/lib/api";
import React, { useState } from "react";
import Dashboard from "./Dashboard";
import LongitudinalFollowupForm from "./LongitudinalFollowupForm";

type FormData = {
  patient_id?: string;
  age: number; bp: number; sg: number; al: number; su: number;
  bgr: number; bu: number; sc: number; sod: number; pot: number;
  hemo: number; pcv: number; wbcc: number; rbcc: number;
  rbc: string; pc: string; pcc: string; ba: string;
  htn: string; dm: string; cad: string; appet: string; pe: string; ane: string;
};

const NUMERIC_FIELDS = ["age", "bp", "sg", "al", "su", "bgr", "bu", "sc", "sod", "pot", "hemo", "pcv", "wbcc", "rbcc"];

// Clinical reference ranges: [min_normal, max_normal, unit, label]
const RANGES: Record<string, [number, number, string, string]> = {
  age:  [0,   120,  "years",     "Age"],
  bp:   [60,  90,   "mm Hg",     "Blood Pressure (diastolic)"],
  sg:   [1.005, 1.030, "",       "Specific Gravity"],
  al:   [0,   1,    "(0-5)",     "Albumin"],
  su:   [0,   0,    "(0-5)",     "Sugar"],
  bgr:  [70,  140,  "mg/dL",     "Blood Glucose Random"],
  bu:   [7,   20,   "mg/dL",     "Blood Urea"],
  sc:   [0.6, 1.2,  "mg/dL",     "Serum Creatinine"],
  sod:  [136, 145,  "mEq/L",     "Sodium"],
  pot:  [3.5, 5.0,  "mEq/L",     "Potassium"],
  hemo: [13,  17,   "g/dL",      "Hemoglobin"],
  pcv:  [39,  54,   "%",         "Packed Cell Volume"],
  wbcc: [4000, 11000, "cells/µL", "WBC Count"],
  rbcc: [4.5, 6.0,  "mil/µL",    "RBC Count"],
};

const TABS = [
  { id: "vitals",    label: "Vitals & Demographics",  icon: "🫀" },
  { id: "blood",     label: "Blood Panel",             icon: "🧪" },
  { id: "clinical",  label: "Clinical Indicators",     icon: "📋" },
];

function isOutOfRange(field: string, value: number): boolean {
  const r = RANGES[field];
  if (!r) return false;
  return value < r[0] || value > r[1];
}

function RangeHint({ field, value }: { field: string; value: number }) {
  const r = RANGES[field];
  if (!r) return null;
  const bad = isOutOfRange(field, value);
  return (
    <span className={`text-[10px] mt-0.5 font-medium ${bad ? "text-amber-400" : "text-slate-400"}`}>
      {bad ? "⚠ " : ""}Normal: {r[0]}–{r[1]} {r[2]}
    </span>
  );
}

function NumberInput({
  name, label, value, step, onChange,
}: { name: string; label: string; value: number; step?: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const bad = isOutOfRange(name, value);
  return (
    <div className="form-field-group">
      <label htmlFor={`field-${name}`} className="field-label">{label}</label>
      <input
        id={`field-${name}`}
        type="number"
        step={step ?? "any"}
        name={name}
        value={value}
        onChange={onChange}
        className={`field-input ${bad ? "field-input--warn" : ""}`}
        required
      />
      <RangeHint field={name} value={value} />
    </div>
  );
}

function SelectInput({
  name, label, value, options, onChange,
}: { name: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <div className="form-field-group">
      <label htmlFor={`field-${name}`} className="field-label">{label}</label>
      <select
        id={`field-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        className="field-input field-select"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function PatientForm({
  token,
  externalData,
  externalResult,
  onClearExternal,
  onViewEHR,
}: {
  token?: string;
  externalData?: any;
  externalResult?: any;
  onClearExternal?: () => void;
  onViewEHR?: (patientId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("vitals");
  const [assessmentMode, setAssessmentMode] = useState<"intake" | "followup">("intake");
  const [formData, setFormData] = useState<FormData>({
    patient_id: "Patient #",
    age: 48, bp: 80, sg: 1.020, al: 1, su: 0,
    bgr: 121, bu: 36, sc: 1.2, sod: 138, pot: 4.5,
    hemo: 12.5, pcv: 38, wbcc: 7800, rbcc: 4.5,
    rbc: "normal", pc: "normal", pcc: "notpresent", ba: "notpresent",
    htn: "yes", dm: "no", cad: "no", appet: "good", pe: "no", ane: "no",
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [submittedData, setSubmittedData] = useState<FormData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync reloaded archive records from HistoryDashboard
  React.useEffect(() => {
    if (externalData) {
      setFormData(externalData);
    }
    if (externalResult) {
      setResult(externalResult);
      setSubmittedData(externalData);
    }
  }, [externalData, externalResult]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: NUMERIC_FIELDS.includes(name) ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail ?? `HTTP ${response.status}`);
      }
      const data = await response.json();
      setResult(data);
      setSubmittedData({ ...formData });
    } catch (err: any) {
      setError(err.message ?? "Failed to connect to the prediction server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        /* ─── Design tokens (Respects Day/Dark Mode via CSS variables) ─── */
        :root {
          --glass-bg: var(--bg-surface);
          --glass-border: var(--border-color);
          --accent-1: var(--color-primary-accent);
          --accent-2: #0F766E;
          --accent-glow: rgba(13, 148, 136, 0.25);
          --warn: #f59e0b;
          --warn-bg: rgba(245, 158, 11, 0.08);
        }

        /* ─── Form field helpers ─── */
        .form-field-group { display: flex; flex-direction: column; gap: 2px; }
        .field-label { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
        .field-input {
          margin-top: 4px;
          padding: 10px 14px;
          border-radius: 8px;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-size: 0.92rem;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
          width: 100%;
          -webkit-appearance: none;
        }
        .field-input:focus {
          border-color: var(--color-primary-accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
          background: var(--bg-surface);
        }
        .field-input--warn {
          border-color: var(--warn);
          background: var(--warn-bg);
        }
        .field-input--warn:focus {
          border-color: var(--warn);
          box-shadow: 0 0 0 3px rgba(245,158,11,0.25);
        }
        .field-select { cursor: pointer; }
        option { background: var(--bg-surface); color: var(--text-primary); }

        /* ─── Tab button ─── */
        .tab-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 18px; border-radius: 6px;
          font-size: 0.83rem; font-weight: 600;
          border: 1px solid transparent;
          background: transparent; color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .tab-btn:hover { color: var(--text-primary); background: var(--bg-surface-subtle); }
        .tab-btn--active {
          background: var(--color-primary-accent) !important;
          color: #FFFFFF !important;
          box-shadow: 0 2px 10px rgba(13, 148, 136, 0.35);
        }

        /* ─── Submit button ─── */
        .submit-btn {
          width: 100%; padding: 14px 24px;
          border-radius: 8px;
          border: none; cursor: pointer;
          font-size: 1rem; font-weight: 700; letter-spacing: 0.02em;
          background: var(--color-primary-accent);
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(13, 148, 136, 0.3);
          transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s, background 0.2s;
        }
        .submit-btn:hover:not(:disabled) {
          background: #0F766E;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(13, 148, 136, 0.4);
        }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        .submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        /* ─── Spinner ─── */
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          display: inline-block; width: 18px; height: 18px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          margin-right: 8px; vertical-align: middle;
        }

        /* ─── Error box ─── */
        .error-box {
          border-radius: 12px;
          padding: 12px 16px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          font-size: 0.85rem;
          margin-top: 12px;
        }
        .form-card-panel {
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.05);
          width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 600px) {
          .form-card-panel {
            padding: 16px 14px !important;
            border-radius: 10px !important;
          }
          .assessment-container {
            padding: 0 8px !important;
            gap: 16px !important;
          }
        }
        /* ─── Responsive Layouts ─── */
        .assessment-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .assessment-layout--split {
            grid-template-columns: 1fr 1.1fr;
          }
        }
        
        .input-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 600px) {
          .input-grid {
            grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          }
        }
      `}</style>

      <div className="assessment-container" style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "1400px", margin: "0 auto", padding: "0 20px", width: "100%", boxSizing: "border-box" }}>
        
        {/* ── Clinical Assessment Mode Switcher ── */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "8px",
          background: "var(--bg-surface-subtle)",
          padding: "6px",
          borderRadius: "50px",
          border: "1px solid var(--border-color)",
          width: "fit-content",
          margin: "0 auto",
          flexWrap: "wrap",
        }}>
          <button
            type="button"
            onClick={() => setAssessmentMode("intake")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 22px",
              borderRadius: "50px",
              fontSize: "0.85rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              background: assessmentMode === "intake" ? "var(--color-primary-accent)" : "transparent",
              color: assessmentMode === "intake" ? "#ffffff" : "var(--text-muted)",
              boxShadow: assessmentMode === "intake" ? "0 2px 10px rgba(13, 148, 136, 0.3)" : "none",
            }}
          >
            <span>📋</span> Comprehensive Biomarker Intake
          </button>
          <button
            type="button"
            onClick={() => setAssessmentMode("followup")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 22px",
              borderRadius: "50px",
              fontSize: "0.85rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              background: assessmentMode === "followup" ? "var(--color-primary-accent)" : "transparent",
              color: assessmentMode === "followup" ? "#ffffff" : "var(--text-muted)",
              boxShadow: assessmentMode === "followup" ? "0 2px 10px rgba(13, 148, 136, 0.3)" : "none",
            }}
          >
            <span>📈</span> Longitudinal Follow-Up Encounters
          </button>
        </div>

        {assessmentMode === "followup" ? (
          <LongitudinalFollowupForm
            token={token}
            initialPatientId={formData.patient_id}
            onViewEHR={onViewEHR}
          />
        ) : (
          <>
            {/* ── Main layout row ── */}
            <div className={`assessment-layout ${result ? 'assessment-layout--split' : ''}`}>
          
          {/* ── Form Panel ── */}
          <div className="form-card-panel">
            {/* Header */}
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>
                Clinical Patient Assessment & AI Synthesis
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Enter clinical biomarkers below. The backend deep learning hybrid framework automatically evaluates binary CKD risk, multi-complication likelihood, progression trajectory, and clinical triage urgency.
              </p>
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "28px", flexWrap: "wrap", padding: "6px", background: "var(--bg-surface-subtle)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`tab-btn${activeTab === tab.id ? " tab-btn--active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              {/* Historical reload alert banner */}
              {externalData && (
                <div style={{
                  background: "var(--color-primary-subtle)",
                  border: "1px solid var(--color-primary-border)",
                  borderRadius: "10px", padding: "12px 16px",
                  marginBottom: "20px", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  fontSize: "0.82rem", color: "var(--color-primary-accent)"
                }}>
                  <span>📁 Viewing Saved Record: <strong style={{ color: "var(--text-primary)" }}>{formData.patient_id || "Anonymous"}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onClearExternal) onClearExternal();
                      setResult(null);
                      setSubmittedData(null);
                    }}
                    style={{
                      background: "var(--bg-surface)", border: "1px solid var(--border-color)",
                      borderRadius: "6px", color: "var(--text-primary)", padding: "4px 8px", cursor: "pointer", fontSize: "0.75rem"
                    }}
                  >
                    Reset Form
                  </button>
                </div>
              )}

              {/* ── TAB: Vitals & Demographics ── */}
              {activeTab === "vitals" && (
                <div className="input-grid">
                  <div className="form-field-group">
                    <label htmlFor="field-patient-id" className="field-label">Patient ID</label>
                    <input
                      id="field-patient-id"
                      type="text"
                      name="patient_id"
                      value={formData.patient_id || ""}
                      onChange={handleChange}
                      className="field-input"
                      required
                    />
                  </div>
                  <NumberInput name="age"  label="Age"              value={formData.age}  onChange={handleChange} />
                  <NumberInput name="bp"   label="Blood Pressure"   value={formData.bp}   onChange={handleChange} />
                  <NumberInput name="sg"   label="Specific Gravity" value={formData.sg}   step="0.001" onChange={handleChange} />
                  <NumberInput name="al"   label="Albumin (0–5)"    value={formData.al}   onChange={handleChange} />
                  <NumberInput name="su"   label="Sugar (0–5)"      value={formData.su}   onChange={handleChange} />
                </div>
              )}

              {/* ── TAB: Blood Panel ── */}
              {activeTab === "blood" && (
                <div className="input-grid">
                  <NumberInput name="bgr"  label="Blood Glucose"        value={formData.bgr}  onChange={handleChange} />
                  <NumberInput name="bu"   label="Blood Urea"           value={formData.bu}   onChange={handleChange} />
                  <NumberInput name="sc"   label="Serum Creatinine"     value={formData.sc}   onChange={handleChange} />
                  <NumberInput name="sod"  label="Sodium"               value={formData.sod}  onChange={handleChange} />
                  <NumberInput name="pot"  label="Potassium"            value={formData.pot}  onChange={handleChange} />
                  <NumberInput name="hemo" label="Hemoglobin"           value={formData.hemo} onChange={handleChange} />
                  <NumberInput name="pcv"  label="Packed Cell Volume %"  value={formData.pcv}  onChange={handleChange} />
                  <NumberInput name="wbcc" label="WBC Count"            value={formData.wbcc} onChange={handleChange} />
                  <NumberInput name="rbcc" label="RBC Count"            value={formData.rbcc} onChange={handleChange} />
                </div>
              )}

              {/* ── TAB: Clinical Indicators ── */}
              {activeTab === "clinical" && (
                <div className="input-grid">
                  <SelectInput name="rbc"   label="Red Blood Cells"      value={formData.rbc}   onChange={handleChange}
                    options={[{ value: "normal", label: "Normal" }, { value: "abnormal", label: "Abnormal" }, { value: "unknown", label: "Unknown" }]} />
                  <SelectInput name="pc"    label="Pus Cell"             value={formData.pc}    onChange={handleChange}
                    options={[{ value: "normal", label: "Normal" }, { value: "abnormal", label: "Abnormal" }, { value: "unknown", label: "Unknown" }]} />
                  <SelectInput name="pcc"   label="Pus Cell Clumps"      value={formData.pcc}   onChange={handleChange}
                    options={[{ value: "notpresent", label: "Not Present" }, { value: "present", label: "Present" }]} />
                  <SelectInput name="ba"    label="Bacteria"             value={formData.ba}    onChange={handleChange}
                    options={[{ value: "notpresent", label: "Not Present" }, { value: "present", label: "Present" }]} />
                  <SelectInput name="htn"   label="Hypertension"         value={formData.htn}   onChange={handleChange}
                    options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
                  <SelectInput name="dm"    label="Diabetes Mellitus"    value={formData.dm}    onChange={handleChange}
                    options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
                  <SelectInput name="cad"   label="Coronary Artery Dis." value={formData.cad}   onChange={handleChange}
                    options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
                  <SelectInput name="appet" label="Appetite"             value={formData.appet} onChange={handleChange}
                    options={[{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }, { value: "unknown", label: "Unknown" }]} />
                  <SelectInput name="pe"    label="Pedal Edema"          value={formData.pe}    onChange={handleChange}
                    options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
                  <SelectInput name="ane"   label="Anemia"               value={formData.ane}   onChange={handleChange}
                    options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
                </div>
              )}

              {/* Tab navigation hint */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", marginBottom: "20px" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {activeTab === "vitals" ? "Next: Blood Panel →" : activeTab === "blood" ? "← Vitals  |  Clinical →" : "← Blood Panel"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {activeTab === "vitals" ? "1 / 3" : activeTab === "blood" ? "2 / 3" : "3 / 3"}
                </span>
              </div>

              {/* Error */}
              {error && <div className="error-box">⚠ {error}</div>}

              {/* Submit */}
              <button type="submit" disabled={loading} className="submit-btn" style={{ marginTop: "8px" }}>
                {loading ? <><span className="spinner" />Analyzing Patient Data…</> : "⚡ Run Clinical Assessment & AI Synthesis"}
              </button>
            </form>
          </div>

          {/* ── Dashboard Panel ── */}
          {result && submittedData && (
            <div style={{ animation: "fadeSlideUp 0.6s ease both", display: "flex", flexDirection: "column", gap: "16px" }}>
              <style>{`
                @keyframes fadeSlideUp {
                  from { opacity: 0; transform: translateY(24px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
              {onViewEHR && (
                <div style={{
                  background: "var(--bg-surface-subtle)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                }}>
                  <div>
                    <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>
                      Assessment Synthesized to Patient EHR
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                      Inspect longitudinal eGFR trajectory, Tangri KFRE risk, and complication radar for <strong>{formData.patient_id || "this patient"}</strong>.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewEHR(formData.patient_id || "")}
                    style={{
                      background: "var(--color-primary-accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 18px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    🩺 Open in Unified Patient EHR Chart →
                  </button>
                </div>
              )}
              <Dashboard result={result} patientInput={submittedData} />
            </div>
          )}

          {/* ── Empty state ── */}
          {!result && (
            <div style={{
              display: "none",  /* hidden at single-col layout; only shows when grid is 2 col */
            }} />
          )}
        </div>

        {/* If no result yet, show empty state full-width below form */}
        {!result && (
          <div style={{
            background: "var(--bg-surface-subtle)",
            border: "1px dashed var(--border-color)",
            borderRadius: "16px",
            padding: "60px 40px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}>
            <div style={{ fontSize: "3rem", marginBottom: "16px", opacity: 0.5 }}>📊</div>
            <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>Complete the form and click <strong style={{ color: "var(--color-primary-accent)" }}>Run Clinical Assessment & AI Synthesis</strong> to see results.</p>
            <p style={{ fontSize: "0.82rem", marginTop: "8px", color: "var(--text-muted)" }}>AI-powered prediction with SHAP & LIME feature explanations will appear here.</p>
          </div>
        )}
          </>
        )}
      </div>
    </>
  );
}
