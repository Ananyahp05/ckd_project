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

type SequenceStep = {
  step: number;
  ady: number;
  aval: number;
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
  sequence_features_used: string[];
  baseline_features_used: string[];
  baseline_egfr: number;
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

const HYBRID_PRESETS = [
  {
    name: "Accelerated CKD Progression",
    desc: "Baseline 70.0 mL/min with steep drop across visits",
    patient_id: "PT-HYB-PROG-01",
    baseline_egfr: 70.0,
    sequence: [
      { step: 1, ady: 0, aval: 70.0 },
      { step: 2, ady: 90, aval: 58.0 },
      { step: 3, ady: 180, aval: 46.0 },
    ],
  },
  {
    name: "Preserved Renal Function",
    desc: "Healthy baseline >100 mL/min with minimal slope",
    patient_id: "PT-HYB-HEALTHY-02",
    baseline_egfr: 105.0,
    sequence: [
      { step: 1, ady: 0, aval: 105.0 },
      { step: 2, ady: 120, aval: 102.0 },
      { step: 3, ady: 240, aval: 100.0 },
    ],
  },
  {
    name: "Moderate Impairment (Stage 3a)",
    desc: "Baseline 55.0 mL/min drifting to Stage 3b",
    patient_id: "PT-HYB-STAGE3-03",
    baseline_egfr: 55.0,
    sequence: [
      { step: 1, ady: 0, aval: 55.0 },
      { step: 2, ady: 90, aval: 51.0 },
      { step: 3, ady: 180, aval: 47.0 },
    ],
  },
];

export default function HybridPredictionForm({ token }: Props) {
  const [patientId, setPatientId] = useState("PT-HYB-001");
  const [baselineEgfr, setBaselineEgfr] = useState<number>(72.0);
  const [sequence, setSequence] = useState<SequenceStep[]>([
    { step: 1, ady: 0, aval: 72.0 },
    { step: 2, ady: 90, aval: 68.0 },
    { step: 3, ady: 180, aval: 64.0 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleStepChange = (
    index: number,
    field: "ady" | "aval",
    value: number
  ) => {
    setSequence((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleLoadPreset = (preset: (typeof HYBRID_PRESETS)[0]) => {
    setPatientId(preset.patient_id);
    setBaselineEgfr(preset.baseline_egfr);
    setSequence(preset.sequence);
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isNaN(baselineEgfr) || baselineEgfr < 0) {
      setError("Please provide a valid non-negative baseline eGFR value.");
      setLoading(false);
      return;
    }

    // Validate sequence
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      if (isNaN(step.ady) || isNaN(step.aval)) {
        setError(`Please enter valid numbers for Visit #${i + 1}.`);
        setLoading(false);
        return;
      }
      if (step.aval < 0) {
        setError(`Observed eGFR cannot be negative (Visit #${i + 1}).`);
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
        baseline_egfr: Number(baselineEgfr),
        sequence: sequence.map((s, idx) => ({
          step: idx + 1,
          ady: Number(s.ady),
          aval: Number(s.aval),
        })),
      };

      const res = await fetch(`${API_BASE_URL}/predict/hybrid`, {
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
      console.error("Hybrid prediction failed:", err);
      setError(err.message || "Failed to run Hybrid model prediction.");
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
    <div className="hybrid-container" style={{ maxWidth: "1280px", margin: "0 auto", padding: "8px" }}>
      <style>{`
        .hybrid-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
        }
        @media (min-width: 1024px) {
          .hybrid-grid {
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
          background: rgba(168, 85, 247, 0.15);
          border-color: rgba(168, 85, 247, 0.4);
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
          border-color: rgba(168, 85, 247, 0.25);
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
          border-color: #a855f7;
          box-shadow: 0 0 12px rgba(168, 85, 247, 0.3);
        }
        .btn-predict-hybrid {
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
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
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
          transition: all 0.2s;
        }
        .btn-predict-hybrid:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(139, 92, 246, 0.5);
        }
        .btn-predict-hybrid:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      {/* Header Banner */}
      <div
        className="glass-card"
        style={{
          marginBottom: "24px",
          background: "linear-gradient(135deg, rgba(46, 16, 101, 0.6), rgba(15, 23, 42, 0.85))",
          borderColor: "rgba(168, 85, 247, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "1.5rem" }}>🧬</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                Hybrid Dense + LSTM eGFR Prediction
              </h2>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                  background: "rgba(168, 85, 247, 0.2)",
                  color: "#d8b4fe",
                  border: "1px solid rgba(168, 85, 247, 0.4)",
                }}
              >
                Multi-Input Architecture
              </span>
            </div>
            <p style={{ fontSize: "0.86rem", color: "#94a3b8", maxWidth: "800px", lineHeight: "1.5", margin: 0 }}>
              Fuses patient baseline renal status through a Dense Feedforward branch with longitudinal temporal sequence features via an LSTM recurrent branch to forecast next observed eGFR.
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
            <div><strong>Dual Inputs:</strong> Dense(base) + LSTM(aval, ady)</div>
            <div><strong>Benchmark MAE:</strong> 5.801 mL/min/1.73m²</div>
            <div><strong>Benchmark RMSE:</strong> 7.290 mL/min/1.73m²</div>
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
            <strong>Clinical Note:</strong> This feature provides continuous <strong>eGFR regression</strong> in original clinical units (mL/min/1.73m²), not a binary diagnosis. It should be used as an assistive trajectory forecast for nephrology research and clinical monitoring.
          </span>
        </div>
      </div>

      <div className="hybrid-grid">
        {/* Left Column: Multi-Input Form */}
        <div className="glass-card">
          <form onSubmit={handleSubmit}>
            {/* Presets */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                Load Clinical Presets:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                {HYBRID_PRESETS.map((p, idx) => (
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

            {/* Patient ID & Baseline Card */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                  Patient Identifier:
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

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#d8b4fe", marginBottom: "6px" }}>
                  ★ Baseline eGFR (Dense Input):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="250"
                  value={baselineEgfr}
                  onChange={(e) => setBaselineEgfr(parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "rgba(88, 28, 135, 0.15)",
                    border: "1px solid rgba(168, 85, 247, 0.4)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    color: "#f5d0fe",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    outline: "none",
                  }}
                  required
                />
              </div>
            </div>

            {/* Sequence Timesteps Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
                Longitudinal Sequence (LSTM Branch - 3 Visits)
              </h3>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Sequence Features: [Visit Day (ady), Observed eGFR (aval)]
              </span>
            </div>

            {/* Timestep Rows */}
            {sequence.map((step, idx) => (
              <div key={idx} className="step-row">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#c084fc" }}>
                    Visit #{idx + 1}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    {idx === 0 ? "First Observation" : idx === 1 ? "Follow-Up 1" : "Follow-Up 2"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
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

            <button type="submit" disabled={loading} className="btn-predict-hybrid">
              {loading ? (
                <>
                  <span className="spinner" style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Running Multi-Input Hybrid Inference...
                </>
              ) : (
                <>
                  <span>⚡</span> Compute Hybrid Multi-Input eGFR Forecast
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Prediction Results & Trajectory */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {result ? (
            <div className="glass-card" style={{ borderColor: result.risk_color === "red" ? "rgba(239, 68, 68, 0.4)" : "rgba(168, 85, 247, 0.35)" }}>
              {/* Top Result Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Hybrid Dense+LSTM Forecast
                  </div>
                  <div style={{ fontSize: "2.4rem", fontWeight: 900, color: "#f8fafc", lineHeight: "1.1", marginTop: "4px" }}>
                    {result.predicted_egfr}{" "}
                    <span style={{ fontSize: "1rem", fontWeight: 500, color: "#94a3b8" }}>
                      {result.unit}
                    </span>
                  </div>
                </div>

                {/* KDIGO Stage Pill & PDF Button */}
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
                    Longitudinal Trajectory
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "0.72rem" }}>
                    <span style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: "4px" }}>
                      ● Observed Visits
                    </span>
                    <span style={{ color: "#f472b6", display: "flex", alignItems: "center", gap: "4px" }}>
                      ◆ Hybrid Forecast
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
                          `${val} mL/min/1.73m² (${item.payload.type === "predicted" ? "Hybrid Forecast" : "Observed"})`,
                          "eGFR",
                        ]}
                        labelFormatter={(day) => `Visit Day: ${day}`}
                      />
                      <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "CKD Threshold (60)", fill: "#f59e0b", fontSize: 10 }} />
                      <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Failure (15)", fill: "#ef4444", fontSize: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="egfr"
                        stroke="#c084fc"
                        strokeWidth={2.5}
                        dot={(props: any) => {
                          const isPred = props.payload.type === "predicted";
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={isPred ? 6 : 4}
                              fill={isPred ? "#ec4899" : "#38bdf8"}
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

              {/* Explainable AI: Multi-Branch Fusion Attribution (C.1 XAI) */}
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
                      <span>🔍</span> Multi-Branch Fusion Attribution (C.1 XAI)
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Dual-Branch Saliency</span>
                  </div>

                  {/* Clinical Summary */}
                  {result.explanation.clinical_summary && (
                    <div style={{ fontSize: "0.78rem", color: "#cbd5e1", lineHeight: "1.4", marginBottom: "12px" }}>
                      {result.explanation.clinical_summary}
                    </div>
                  )}

                  {/* Branch Weights */}
                  {result.explanation.branch_attribution && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#94a3b8", marginBottom: "4px" }}>
                        <span>Sequence Branch: {result.explanation.branch_attribution.sequence_branch_percent}%</span>
                        <span>Baseline Anchor: {result.explanation.branch_attribution.baseline_branch_percent}%</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "rgba(148, 163, 184, 0.15)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${result.explanation.branch_attribution.sequence_branch_percent}%`, height: "100%", background: "#a855f7" }} />
                        <div style={{ width: `${result.explanation.branch_attribution.baseline_branch_percent}%`, height: "100%", background: "#38bdf8" }} />
                      </div>
                    </div>
                  )}

                  {/* Visit Attention Bars */}
                  {result.explanation.temporal_weights_percent && (
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600, marginBottom: "6px" }}>
                        Temporal Dynamics Attention (Sequence Branch):
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        {result.explanation.temporal_weights_percent.map((wt: number, idx: number) => (
                          <div key={idx} style={{ background: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Visit {idx + 1}</div>
                            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#c084fc", margin: "2px 0" }}>{wt}%</div>
                            <div style={{ height: "4px", background: "rgba(148, 163, 184, 0.2)", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{ width: `${wt}%`, height: "100%", background: "#a855f7" }} />
                            </div>
                          </div>
                        ))}
                      </div>
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
                  <strong>Baseline Used:</strong> {result.baseline_egfr} mL/min
                </div>
                <div>
                  <strong>Benchmark MAE:</strong> ±{result.test_benchmarks?.test_mae ?? 5.80} mL/min
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
              <span style={{ fontSize: "3rem", marginBottom: "12px", opacity: 0.7 }}>🧬</span>
              <h4 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Awaiting Multi-Branch Inputs
              </h4>
              <p style={{ fontSize: "0.82rem", maxWidth: "320px", lineHeight: "1.5" }}>
                Supply the patient baseline eGFR and 3 visit measurements or load a preset to execute the Hybrid Dense + LSTM neural regression.
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
          hybrid_result: result ? {
            predicted_egfr: result.predicted_egfr,
            kdigo_stage: result.kdigo_stage,
            kdigo_description: result.stage_description,
            trajectory: result.predicted_egfr < 60 ? "Renal Decline" : "Stable",
            baseline_egfr: baselineEgfr,
          } : null,
          consensus: result ? {
            diagnosis: result.predicted_egfr < 60 ? `Estimated Renal Impairment (${result.kdigo_stage})` : "Preserved eGFR Filtration",
            risk_level: result.predicted_egfr < 60 ? "HIGH" : "LOW",
            risk_score: result.predicted_egfr < 60 ? 75.0 : 20.0,
            predicted_egfr: result.predicted_egfr,
            kdigo_stage: result.kdigo_stage,
            kdigo_description: result.stage_description,
            concordance: "Hybrid Dense + LSTM Multi-Branch Engine",
            clinical_action: result.clinical_significance,
          } : null,
          biomarkers: [
            {
              name: "Static Baseline eGFR",
              value: baselineEgfr,
              unit: "mL/min/1.73m²",
              reference: "> 90 mL/min/1.73m²",
              category: "Baseline Assessment",
              status: baselineEgfr >= 90 ? "NORMAL" : baselineEgfr >= 60 ? "LOW" : "ELEVATED",
            },
            ...sequence.map((s, idx) => ({
              name: `Visit #${idx + 1} Observed eGFR (Day ${s.ady})`,
              value: s.aval,
              unit: "mL/min/1.73m²",
              reference: "> 90 mL/min/1.73m²",
              category: "Sequential Lab Panel",
              status: (s.aval >= 90 ? "NORMAL" : s.aval >= 60 ? "LOW" : s.aval >= 30 ? "ELEVATED" : "CRITICAL") as any,
            }))
          ],
        }}
      />
    </div>
  );
}
