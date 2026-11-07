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
  Dot,
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

export default function LSTMPredictionForm({ token }: Props) {
  const [patientId, setPatientId] = useState("PT-LSTM-001");
  const [sequence, setSequence] = useState<TimeStep[]>([
    { step: 1, ady: 0, aval: 72.0, base: 72.0 },
    { step: 2, ady: 90, aval: 68.0, base: 72.0 },
    { step: 3, ady: 180, aval: 62.0, base: 72.0 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleStepChange = (
    index: number,
    field: "ady" | "aval" | "base",
    value: number
  ) => {
    setSequence((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // If updating step 1 baseline, optionally keep base aligned
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
        setError(
          `eGFR values cannot be negative (Visit #${i + 1} has negative value).`
        );
        setLoading(false);
        return;
      }
      if (i > 0 && step.ady <= sequence[i - 1].ady) {
        setError(
          `Visit #${i + 1} day (${step.ady}) must be greater than Visit #${i} day (${sequence[i - 1].ady}).`
        );
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
        throw new Error(
          errData.detail || `Server returned error status ${res.status}`
        );
      }

      const data: PredictionResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error("LSTM prediction failed:", err);
      setError(err.message || "Failed to run LSTM prediction.");
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

  return (
    <div className="lstm-container" style={{ maxWidth: "1280px", margin: "0 auto", padding: "8px" }}>
      <style>{`
        .lstm-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
        }
        @media (min-width: 1024px) {
          .lstm-grid {
            grid-template-columns: 1.15fr 0.85fr;
          }
        }
        .glass-card {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        }
        .preset-chip {
          padding: 8px 14px;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }
        .preset-chip:hover {
          background: rgba(99, 102, 241, 0.15);
          border-color: rgba(99, 102, 241, 0.4);
          color: #f1f5f9;
        }
        .step-row {
          background: rgba(30, 41, 59, 0.35);
          border: 1px solid rgba(148, 163, 184, 0.08);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }
        .step-row:hover {
          border-color: rgba(99, 102, 241, 0.25);
        }
        .input-cell {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-cell label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
        }
        .input-cell input {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 10px;
          padding: 8px 12px;
          color: #f8fafc;
          font-size: 0.9rem;
          font-weight: 600;
          outline: none;
          transition: all 0.2s;
        }
        .input-cell input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
        }
        .btn-predict {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 14px 24px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
          transition: all 0.2s;
        }
        .btn-predict:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(99, 102, 241, 0.5);
        }
        .btn-predict:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      {/* Header Banner */}
      <div
        className="glass-card"
        style={{
          marginBottom: "24px",
          background: "linear-gradient(135deg, rgba(30, 27, 75, 0.7), rgba(15, 23, 42, 0.85))",
          borderColor: "rgba(99, 102, 241, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "1.5rem" }}>📈</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                LSTM Sequential eGFR Trend Prediction
              </h2>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#a5b4fc",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                }}
              >
                Regression Task
              </span>
            </div>
            <p style={{ fontSize: "0.86rem", color: "#94a3b8", maxWidth: "800px", lineHeight: "1.5", margin: 0 }}>
              Forecasts the next observed continuous eGFR value (mL/min/1.73m²) from 3 sequential clinical visits using a recurrent Long Short-Term Memory network trained on longitudinal renal biomarkers.
            </p>
          </div>

          <div
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
              fontSize: "0.76rem",
              color: "#cbd5e1",
            }}
          >
            <div><strong>Engine:</strong> LSTM (units: 64, Dropout)</div>
            <div><strong>Parameter Code:</strong> GFRBSCRT</div>
            <div><strong>Benchmark MAE:</strong> 5.815 mL/min/1.73m²</div>
          </div>
        </div>

        {/* Clinical Disclaimer */}
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
          <span>⚠</span>
          <span>
            <strong>Clinical Note:</strong> This feature performs continuous <strong>eGFR regression</strong> (predicting numerical clearance rate in original units), not a binary CKD diagnosis. Predictions represent estimated trends across observed visits and must be interpreted by qualified medical personnel.
          </span>
        </div>
      </div>

      <div className="lstm-grid">
        {/* Left Column: Input Form */}
        <div className="glass-card">
          <form onSubmit={handleSubmit}>
            {/* Preset Selector */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                Load Clinical Presets:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                {PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleLoadPreset(p)}
                    className="preset-chip"
                  >
                    <div style={{ color: "#e2e8f0", fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Patient ID */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                Patient Identifier / Medical Record Number:
              </label>
              <input
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "#f8fafc",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
                required
              />
            </div>

            {/* Timesteps Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
                Longitudinal Clinical Visits (Exactly 3 Timesteps)
              </h3>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Features: [Day (ady), eGFR (aval), Baseline (base)]
              </span>
            </div>

            {/* Timestep Rows */}
            {sequence.map((step, idx) => (
              <div key={idx} className="step-row">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#a5b4fc" }}>
                    Visit #{idx + 1}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    {idx === 0 ? "Initial Baseline Visit" : idx === 1 ? "Follow-Up Visit 1" : "Follow-Up Visit 2"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div className="input-cell">
                    <label>Visit Day (ady)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={step.ady}
                      onChange={(e) => handleStepChange(idx, "ady", parseFloat(e.target.value) || 0)}
                      required
                    />
                    <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Days since start</span>
                  </div>

                  <div className="input-cell">
                    <label>Observed eGFR (aval)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="200"
                      value={step.aval}
                      onChange={(e) => handleStepChange(idx, "aval", parseFloat(e.target.value) || 0)}
                      required
                    />
                    <span style={{ fontSize: "0.68rem", color: "#64748b" }}>mL/min/1.73m²</span>
                  </div>

                  <div className="input-cell">
                    <label>Baseline eGFR (base)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="200"
                      value={step.base}
                      onChange={(e) => handleStepChange(idx, "base", parseFloat(e.target.value) || 0)}
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
                  Processing LSTM Neural Inference...
                </>
              ) : (
                <>
                  <span>⚡</span> Compute Next Observed eGFR Forecast
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Prediction Results & Trajectory */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {result ? (
            <div className="glass-card" style={{ borderColor: result.risk_color === "red" ? "rgba(239, 68, 68, 0.4)" : "rgba(99, 102, 241, 0.3)" }}>
              {/* Top Result Badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Regression Forecast
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
                      ◆ Predicted Next Visit
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
                          border: "1px solid rgba(148, 163, 184, 0.2)",
                          borderRadius: "10px",
                          fontSize: "0.78rem",
                          color: "#f1f5f9",
                        }}
                        formatter={(val: any, name: any, item: any) => [
                          `${val} mL/min/1.73m² (${item.payload.type === "predicted" ? "Predicted" : "Observed"})`,
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

              {/* Explainable AI: Temporal Saliency & Feature Attribution (C.1) */}
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
                      <span>🔍</span> Temporal Saliency & Attribution (C.1 XAI)
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Gradient × Input</span>
                  </div>

                  {/* Clinical Summary */}
                  {result.explanation.clinical_summary && (
                    <div style={{ fontSize: "0.78rem", color: "#cbd5e1", lineHeight: "1.4", marginBottom: "12px" }}>
                      {result.explanation.clinical_summary}
                    </div>
                  )}

                  {/* Visit Attention Bars */}
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

                  {/* Feature Attributions */}
                  {result.explanation.feature_attributions && result.explanation.feature_attributions.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {result.explanation.feature_attributions.map((fa: any, idx: number) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", padding: "4px 8px", background: "rgba(30, 41, 59, 0.3)", borderRadius: "6px" }}>
                          <span style={{ color: "#cbd5e1" }}>{fa.label}</span>
                          <strong style={{ color: fa.total_attribution >= 0 ? "#4ade80" : "#f87171" }}>
                            {fa.total_attribution > 0 ? "+" : ""}{fa.total_attribution} mL/min
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Benchmarks & Model Metadata */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  fontSize: "0.74rem",
                  color: "#94a3b8",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(148, 163, 184, 0.1)",
                }}
              >
                <div>
                  <strong>Model Task:</strong> {result.target_description}
                </div>
                <div>
                  <strong>Benchmark MAE:</strong> ±{result.test_benchmarks?.test_mae ?? 5.82} mL/min
                </div>
              </div>
            </div>
          ) : (
            <div
              className="glass-card"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "360px",
                textAlign: "center",
                color: "#64748b",
                borderStyle: "dashed",
              }}
            >
              <span style={{ fontSize: "3rem", marginBottom: "12px", opacity: 0.7 }}>📊</span>
              <h4 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Awaiting Sequential Data Input
              </h4>
              <p style={{ fontSize: "0.82rem", maxWidth: "320px", lineHeight: "1.5" }}>
                Select a clinical preset or input 3 chronological patient visits to compute the LSTM regression forecast and view the trajectory chart.
              </p>
            </div>
          )}
        </div>
      </div>

      <ClinicalReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportData={{
          patient_id: patientId || "Anonymous",
          report_date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
          lstm_result: result ? {
            predicted_egfr: result.predicted_egfr,
            kdigo_stage: result.kdigo_stage,
            kdigo_description: result.stage_description,
            trajectory: result.predicted_egfr < 60 ? "Renal Decline" : "Stable",
          } : null,
          consensus: result ? {
            diagnosis: result.predicted_egfr < 60 ? `Estimated Renal Impairment (${result.kdigo_stage})` : "Preserved eGFR Filtration",
            risk_level: result.predicted_egfr < 60 ? "HIGH" : "LOW",
            risk_score: result.predicted_egfr < 60 ? 75.0 : 20.0,
            predicted_egfr: result.predicted_egfr,
            kdigo_stage: result.kdigo_stage,
            kdigo_description: result.stage_description,
            concordance: "LSTM Sequential Regression",
            clinical_action: result.clinical_significance,
          } : null,
          biomarkers: sequence.map((s, idx) => ({
            name: `Visit #${idx + 1} Observed eGFR (Day ${s.ady})`,
            value: s.aval,
            unit: "mL/min/1.73m²",
            reference: "> 90 mL/min/1.73m²",
            category: "Sequential Lab Panel",
            status: s.aval >= 90 ? "NORMAL" : s.aval >= 60 ? "LOW" : s.aval >= 30 ? "ELEVATED" : "CRITICAL",
          })),
        }}
      />
    </div>
  );
}
