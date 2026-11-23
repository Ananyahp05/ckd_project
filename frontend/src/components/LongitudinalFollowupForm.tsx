"use client";

import React, { useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import ClinicalReportModal, { ClinicalReportData } from "./ClinicalReportModal";

type TimeStep = {
  step: number;
  ady: number;
  aval: number;
  base: number;
};

type PredictionResponse = {
  model_type: string;
  patient_id?: string;
  predicted_egfr: number;
  unit: string;
  target_description: string;
  parameter_code: string;
  kdigo_stage: string;
  stage_description: string;
  kdigo_description?: string;
  clinical_significance: string;
  risk_color: string;
  timesteps_used: number;
  features_used: string[];
  trajectory: {
    step: number;
    day: number;
    egfr: number;
    type: "observed" | "predicted";
  }[];
  test_benchmarks?: {
    test_mae: number;
    test_rmse: number;
    test_r2: number;
  };
  explanation?: any;
};

type Props = {
  token?: string;
  initialPatientId?: string;
  onViewEHR?: (patientId: string) => void;
};

const PRESETS = [
  {
    name: "CKD Progression (Rapid Decline)",
    desc: "Longitudinal loss from 75 down to 56 mL/min across 6 months",
    patient_id: "PT-DECLINE-01",
    steps: [
      { step: 1, ady: 0, aval: 75.0, base: 75.0 },
      { step: 2, ady: 90, aval: 64.0, base: 75.0 },
      { step: 3, ady: 180, aval: 56.0, base: 75.0 },
    ],
  },
  {
    name: "Stable Mild Impairment",
    desc: "Steady readings around 65 mL/min (Stage 2 boundary)",
    patient_id: "PT-STABLE-02",
    steps: [
      { step: 1, ady: 0, aval: 66.0, base: 66.0 },
      { step: 2, ady: 90, aval: 65.0, base: 66.0 },
      { step: 3, ady: 180, aval: 64.0, base: 66.0 },
    ],
  },
  {
    name: "Preserved Function (Normal)",
    desc: "Healthy adult trajectory around 95-100 mL/min",
    patient_id: "PT-HEALTHY-03",
    steps: [
      { step: 1, ady: 0, aval: 98.0, base: 98.0 },
      { step: 2, ady: 120, aval: 97.0, base: 98.0 },
      { step: 3, ady: 240, aval: 95.0, base: 98.0 },
    ],
  },
];

export default function LongitudinalFollowupForm({ token, initialPatientId, onViewEHR }: Props) {
  const [patientId, setPatientId] = useState(initialPatientId || "PT-LSTM-001");
  const [sequence, setSequence] = useState<TimeStep[]>([
    { step: 1, ady: 0, aval: 72.0, base: 72.0 },
    { step: 2, ady: 90, aval: 68.0, base: 72.0 },
    { step: 3, ady: 180, aval: 62.0, base: 72.0 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Sync if initialPatientId changes
  React.useEffect(() => {
    if (initialPatientId && initialPatientId.trim()) {
      setPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  const handleStepChange = (
    index: number,
    field: "ady" | "aval" | "base",
    value: number
  ) => {
    setSequence((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (index === 0 && field === "base") {
        updated[1].base = value;
        updated[2].base = value;
      }
      return updated;
    });
  };

  const handleLoadPreset = (preset: (typeof PRESETS)[0]) => {
    setPatientId(preset.patient_id);
    setSequence(preset.steps);
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate inputs
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      if (isNaN(step.ady) || isNaN(step.aval) || isNaN(step.base)) {
        setError(`Please enter valid numbers for Visit #${i + 1}.`);
        setLoading(false);
        return;
      }
      if (step.aval < 0 || step.base < 0) {
        setError(`eGFR values cannot be negative (Visit #${i + 1} has negative value).`);
        setLoading(false);
        return;
      }
      if (i > 0 && step.ady <= sequence[i - 1].ady) {
        setError(`Visit #${i + 1} day (${step.ady}) must be greater than Visit #${i} day (${sequence[i - 1].ady}).`);
        setLoading(false);
        return;
      }
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const payload = {
        patient_id: patientId || "Anonymous",
        sequence: sequence.map((s, idx) => ({
          step: idx + 1,
          ady: Number(s.ady),
          aval: Number(s.aval),
          base: Number(s.base),
        })),
      };

      const res = await fetch(`${API_BASE_URL}/predict/lstm`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned error status ${res.status}`);
      }

      const data: PredictionResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error("Longitudinal analysis failed:", err);
      setError(err.message || "Failed to run longitudinal trajectory analysis.");
    } finally {
      setLoading(false);
    }
  };

  const getStageBadgeStyle = (stage: string) => {
    switch (stage) {
      case "Stage 1":
        return { bg: "rgba(34, 197, 94, 0.15)", border: "#22c55e", text: "#4ade80" };
      case "Stage 2":
        return { bg: "rgba(59, 130, 246, 0.15)", border: "#3b82f6", text: "#60a5fa" };
      case "Stage 3a":
        return { bg: "rgba(234, 179, 8, 0.15)", border: "#eab308", text: "#facc15" };
      case "Stage 3b":
        return { bg: "rgba(249, 115, 22, 0.15)", border: "#f97316", text: "#fb923c" };
      case "Stage 4":
        return { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444", text: "#f87171" };
      case "Stage 5":
        return { bg: "rgba(220, 38, 38, 0.25)", border: "#dc2626", text: "#fca5a5" };
      default:
        return { bg: "rgba(148, 163, 184, 0.15)", border: "#94a3b8", text: "#cbd5e1" };
    }
  };

  const reportData: ClinicalReportData = {
    patient_id: result?.patient_id || patientId,
    patient_age: undefined,
    report_date: new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    ann_result: null,
    lstm_result: result ? {
      predicted_egfr: result.predicted_egfr,
      kdigo_stage: result.kdigo_stage,
      kdigo_description: result.stage_description,
      trajectory: result.predicted_egfr < 60 ? "Renal Decline" : "Stable",
    } : null,
    consensus: result ? {
      diagnosis: result.kdigo_stage === "Stage 1" ? "Preserved Renal Function" : `${result.kdigo_stage} Impairment`,
      risk_level: result.predicted_egfr < 60 ? "HIGH" : "LOW",
      risk_score: result.predicted_egfr,
      predicted_egfr: result.predicted_egfr,
      kdigo_stage: result.kdigo_stage,
      kdigo_description: result.stage_description,
      trajectory_status: result.predicted_egfr < 60 ? "Progressive Decline" : "Stable Trajectory",
      concordance: "Longitudinal Clinical Sequence",
      clinical_action: result.clinical_significance,
    } : null,
    biomarkers: sequence.map((s, idx) => ({
      name: `Visit #${idx + 1} (Day ${s.ady})`,
      value: s.aval,
      unit: "mL/min/1.73m²",
      reference: "> 90 mL/min/1.73m²",
      category: "Longitudinal eGFR",
      status: s.aval >= 90 ? "NORMAL" : s.aval >= 60 ? "LOW" : "ELEVATED",
    })),
  };

  return (
    <div style={{ maxWidth: "1350px", margin: "0 auto" }}>
      <style>{`
        .followup-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        @media (min-width: 1024px) {
          .followup-grid {
            grid-template-columns: 1.05fr 1fr;
          }
        }
        .step-row {
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }
        .step-row:hover {
          border-color: var(--color-primary-accent);
        }
        .preset-chip {
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 10px 14px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        .preset-chip:hover {
          background: var(--color-primary-subtle);
          border-color: var(--color-primary-border);
        }
        .btn-predict {
          background: var(--color-primary-accent);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 14px 24px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          box-shadow: 0 2px 10px rgba(13, 148, 136, 0.25);
          transition: all 0.2s;
        }
        .btn-predict:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }
        .btn-predict:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      {/* Header Banner */}
      <div
        style={{
          marginBottom: "24px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "24px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "1.5rem" }}>📈</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                Longitudinal Follow-Up Encounters & eGFR Trajectory
              </h2>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                  background: "var(--color-primary-subtle)",
                  color: "var(--color-primary-accent)",
                  border: "1px solid var(--color-primary-border)",
                }}
              >
                Sequential Encounters
              </span>
            </div>
            <p style={{ fontSize: "0.86rem", color: "var(--text-muted)", maxWidth: "800px", lineHeight: "1.5", margin: 0 }}>
              Record sequential outpatient checkups (observed eGFR and elapsed days) to analyze renal functional loss, determine KDIGO trajectory staging, and forecast subsequent clearance capacity.
            </p>
          </div>
        </div>

        {/* Clinical Note */}
        <div
          style={{
            marginTop: "16px",
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "0.8rem",
            color: "#fde68a",
          }}
        >
          <span>ℹ️</span>
          <span>
            <strong>Clinical Workflow:</strong> Sequential encounter entries are logged into the patient's medical history. Submitting this form updates the longitudinal eGFR curve and KDIGO staging in the <strong>Unified Patient EHR</strong>.
          </span>
        </div>
      </div>

      <div className="followup-grid">
        {/* Left Column: Input Form */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(148, 163, 184, 0.12)",
            borderRadius: "20px",
            padding: "24px",
          }}
        >
          <form onSubmit={handleSubmit}>
            {/* Preset Selector */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                Load Clinical Evaluation Presets:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                {PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleLoadPreset(p)}
                    className="preset-chip"
                  >
                    <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.82rem" }}>{p.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Patient ID */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                Patient Identifier / Medical Record Number:
              </label>
              <input
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
                required
              />
            </div>

            {/* Timesteps Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Longitudinal Clinical Visits (Sequential Consultations)
              </h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Features: [Day (ady), eGFR (aval), Baseline (base)]
              </span>
            </div>

            {/* Timestep Rows */}
            {sequence.map((step, idx) => (
              <div key={idx} className="step-row">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-primary-accent)" }}>
                    Visit #{step.step}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {idx === 0 ? "Initial Baseline Visit" : `Follow-Up Visit ${idx}`}
                  </span>
                </div>

                <div className="responsive-three-col">
                  <div>
                    <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Visit Day (ady)
                    </label>
                    <input
                      type="number"
                      value={step.ady}
                      onChange={(e) => handleStepChange(idx, "ady", parseFloat(e.target.value) || 0)}
                      min={0}
                      style={{
                        width: "100%",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "var(--text-primary)",
                        fontSize: "0.85rem",
                      }}
                      required
                    />
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Days since start</span>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Observed eGFR (aval)
                    </label>
                    <input
                      type="number"
                      value={step.aval}
                      onChange={(e) => handleStepChange(idx, "aval", parseFloat(e.target.value) || 0)}
                      min={0}
                      max={160}
                      step="0.1"
                      style={{
                        width: "100%",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "var(--text-primary)",
                        fontSize: "0.85rem",
                      }}
                      required
                    />
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>mL/min/1.73m²</span>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Baseline eGFR (base)
                    </label>
                    <input
                      type="number"
                      value={step.base}
                      onChange={(e) => handleStepChange(idx, "base", parseFloat(e.target.value) || 0)}
                      min={0}
                      max={160}
                      step="0.1"
                      style={{
                        width: "100%",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "var(--text-primary)",
                        fontSize: "0.85rem",
                      }}
                      required
                    />
                    <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Study entry value</span>
                  </div>
                </div>
              </div>
            ))}

            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#f87171",
                  fontSize: "0.85rem",
                  marginBottom: "16px",
                }}
              >
                ❌ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-predict">
              {loading ? (
                <>
                  <span className="spinner" style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Analyzing Progression & Forecasting Trajectory...
                </>
              ) : (
                <>
                  <span>⚡</span> Analyze Longitudinal Progression & Project Next eGFR
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Prediction Results & Trajectory */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {result ? (
            <div
              style={{
                background: "rgba(15, 23, 42, 0.75)",
                backdropFilter: "blur(20px)",
                border: result.risk_color === "red" ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "20px",
                padding: "24px",
              }}
            >
              {/* Post-assessment CTA banner */}
              {onViewEHR && (
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))",
                    border: "1px solid rgba(99, 102, 241, 0.35)",
                    borderRadius: "16px",
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "20px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                  }}
                >
                  <div>
                    <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: "0.95rem" }}>
                      Follow-Up Encounter Recorded to EHR
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                      Trajectory updated for <strong>{patientId || "this patient"}</strong>. Open EHR chart to view longitudinal analysis, Tangri KFRE risk, and complication radar.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewEHR(patientId || "")}
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 18px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    🩺 Open in Unified Patient EHR Chart →
                  </button>
                </div>
              )}

              {/* Top Result Badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Projected Subsequent eGFR
                  </div>
                  <div style={{ fontSize: "2.4rem", fontWeight: 900, color: "#f8fafc", lineHeight: "1.1", marginTop: "4px" }}>
                    {result.predicted_egfr}{" "}
                    <span style={{ fontSize: "1rem", fontWeight: 500, color: "#94a3b8" }}>
                      {result.unit}
                    </span>
                  </div>
                </div>

                {/* KDIGO Stage Pill & PDF Action */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                  {(() => {
                    const style = getStageBadgeStyle(result.kdigo_stage);
                    return (
                      <div
                        style={{
                          padding: "8px 16px",
                          borderRadius: "12px",
                          background: style.bg,
                          border: `1px solid ${style.border}`,
                          color: style.text,
                          fontWeight: 800,
                          fontSize: "0.95rem",
                          textAlign: "right",
                        }}
                      >
                        <div>{result.kdigo_stage}</div>
                        <div style={{ fontSize: "0.68rem", fontWeight: 600, opacity: 0.9 }}>
                          KDIGO Criteria
                        </div>
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setIsReportOpen(true)}
                    style={{
                      background: "linear-gradient(135deg, #0284c7, #0369a1)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "6px 14px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    📄 Export Clinical PDF
                  </button>
                </div>
              </div>

              {/* Stage Description & Clinical Significance */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(148, 163, 184, 0.1)",
                  marginBottom: "20px",
                }}
              >
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "4px" }}>
                  {result.stage_description}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", lineHeight: "1.4" }}>
                  {result.clinical_significance}
                </div>
              </div>

              {/* Trajectory Chart */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1" }}>
                    Longitudinal Trajectory (Days vs. eGFR)
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "0.72rem" }}>
                    <span style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: "4px" }}>
                      ● Observed Visits
                    </span>
                    <span style={{ color: "#a855f7", display: "flex", alignItems: "center", gap: "4px" }}>
                      ◆ Projected Next Visit
                    </span>
                  </div>
                </div>

                <div style={{ width: "100%", height: 210, background: "rgba(15, 23, 42, 0.4)", borderRadius: "12px", padding: "8px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.trajectory} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                      <XAxis
                        dataKey="day"
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `Day ${v}`}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        domain={["auto", "auto"]}
                        unit=""
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(val: any) => [
                          `${Number(val).toFixed(1)} ${result.unit}`,
                          "eGFR",
                        ]}
                        labelFormatter={(day) => `Visit Day: ${day}`}
                      />
                      <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "CKD Threshold (60)", fill: "#f59e0b", fontSize: 10 }} />
                      <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Failure (15)", fill: "#ef4444", fontSize: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="egfr"
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        dot={(props: any) => {
                          const isPred = props.payload.type === "predicted";
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={isPred ? 6 : 4}
                              fill={isPred ? "#c084fc" : "#38bdf8"}
                              stroke={isPred ? "#ffffff" : "#0284c7"}
                              strokeWidth={2}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Explainable AI: Temporal Saliency & Attribution */}
              {result.explanation && (
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.7)",
                    borderRadius: "12px",
                    padding: "14px",
                    border: "1px solid rgba(148, 163, 184, 0.12)",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#38bdf8", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>🔍</span> Clinical Encounter Influence & Attention Weights
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Temporal Saliency</span>
                  </div>

                  {result.explanation.clinical_summary && (
                    <div style={{ fontSize: "0.78rem", color: "#cbd5e1", lineHeight: "1.4", marginBottom: "12px" }}>
                      {result.explanation.clinical_summary}
                    </div>
                  )}

                  {result.explanation.temporal_weights_percent && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
                        Sequential Visit Attention Weights:
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        {result.explanation.temporal_weights_percent.map((wt: number, idx: number) => (
                          <div key={idx} style={{ background: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Visit {idx + 1}</div>
                            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#a5b4fc", margin: "2px 0" }}>{wt}%</div>
                            <div style={{ height: "4px", background: "rgba(148, 163, 184, 0.2)", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{ width: `${wt}%`, height: "100%", background: "#6366f1" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "360px",
                background: "rgba(15, 23, 42, 0.4)",
                border: "1px dashed rgba(148, 163, 184, 0.2)",
                borderRadius: "20px",
                padding: "30px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              <div style={{ fontSize: "2.8rem", marginBottom: "12px", opacity: 0.7 }}>📈</div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Awaiting Sequential Encounter Submission
              </h4>
              <p style={{ fontSize: "0.82rem", maxWidth: "340px", lineHeight: "1.5", margin: 0 }}>
                Select a clinical evaluation preset or input 3 patient consultations to project future eGFR trajectory and examine visit attention attributions.
              </p>
            </div>
          )}
        </div>
      </div>

      <ClinicalReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportData={reportData}
      />
    </div>
  );
}

