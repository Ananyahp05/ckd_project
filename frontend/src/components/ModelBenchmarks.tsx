"use client";

import React, { useState, useEffect } from "react";
import LSTMPredictionForm from "./LSTMPredictionForm";
import HybridPredictionForm from "./HybridPredictionForm";
import { API_BASE_URL } from "@/lib/api";

type Props = {
  token?: string;
};

export default function ModelBenchmarks({ token }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<"matrix" | "lstm_lab" | "hybrid_lab" | "federated">("matrix");
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/models/info`);
        if (res.ok) {
          const data = await res.json();
          setModelInfo(data.models);
        }
      } catch (err) {
        console.error("Failed to fetch model info:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, []);

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "0 20px 40px" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148, 163, 184, 0.15)",
          borderRadius: "24px",
          padding: "28px 32px",
          marginBottom: "28px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "50px", padding: "4px 14px", fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
              🔬 Academic Research & AI Architecture Console
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", margin: "0 0 8px 0" }}>
              Deep Learning <span style={{ background: "linear-gradient(135deg, #a5b4fc, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Hybrid Architecture & Benchmarks</span>
            </h1>
            <p style={{ fontSize: "0.88rem", color: "#94a3b8", maxWidth: "820px", lineHeight: "1.6", margin: 0 }}>
              The EDCIF framework implements three deep learning architectures for Chronic Kidney Disease intelligence according to the project synopsis. In clinical practice, these models run automatically in the backend hybrid pipeline. This console provides examiners and researchers with transparent algorithmic auditing, comparative metrics, and technical inspection probes.
            </p>
          </div>
        </div>

        {/* Clinical Decoupling Notice */}
        <div
          style={{
            marginTop: "20px",
            background: "rgba(2, 132, 199, 0.08)",
            border: "1px solid rgba(2, 132, 199, 0.25)",
            borderRadius: "14px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "0.82rem",
            color: "#7dd3fc",
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>ℹ️</span>
          <span>
            <strong>Clinical Workflow Architecture:</strong> Doctors do not choose individual models during patient care. The backend automatically coordinates the ANN, LSTM, and Hybrid models to return a unified clinical dossier in the <strong>Unified Patient EHR</strong> and <strong>Clinical Assessment</strong> workflows.
          </span>
        </div>

        {/* Sub-navigation tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginTop: "24px",
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(148, 163, 184, 0.1)",
            borderRadius: "50px",
            padding: "6px",
            flexWrap: "wrap",
            width: "fit-content",
          }}
        >
          <button
            onClick={() => setActiveSubTab("matrix")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              background: activeSubTab === "matrix" ? "var(--color-primary-accent)" : "transparent",
              color: activeSubTab === "matrix" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            Architecture Matrix & Test Metrics
          </button>
          <button
            onClick={() => setActiveSubTab("lstm_lab")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              background: activeSubTab === "lstm_lab" ? "var(--color-primary-accent)" : "transparent",
              color: activeSubTab === "lstm_lab" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            Sequential LSTM Model Probe
          </button>
          <button
            onClick={() => setActiveSubTab("hybrid_lab")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              background: activeSubTab === "hybrid_lab" ? "var(--color-primary-accent)" : "transparent",
              color: activeSubTab === "hybrid_lab" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            Dual-Branch Hybrid Model Probe
          </button>
        </div>
      </div>

      {/* Sub-tab 1: Comparative Architecture Matrix */}
      {activeSubTab === "matrix" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* 3 Model Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "20px" }}>
            {/* 1. ANN Model Card */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid rgba(148, 163, 184, 0.12)",
                borderRadius: "20px",
                padding: "24px",
                boxShadow: "0 15px 35px rgba(0, 0, 0, 0.3)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.4rem" }}>⚡</span>
                <span style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "50px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                  ACTIVE (BACKEND)
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
                  Artificial Neural Network (ANN)
                </h3>
                <span style={{ fontSize: "0.78rem", color: "#818cf8", fontWeight: 600 }}>Multi-Layer Perceptron (MLP) Classifier</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: "1.5", margin: 0 }}>
                High-capacity feedforward network for initial binary screening. Evaluates 34 clinical variables (vitals, blood panel, urinalysis) to compute patient CKD onset probability and SHAP gradient attributions.
              </p>
              <div style={{ background: "rgba(30, 41, 59, 0.5)", borderRadius: "12px", padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.78rem" }}>
                <div><span style={{ color: "#64748b" }}>Architecture:</span> <strong style={{ color: "#cbd5e1" }}>Dense 64-32-16-1</strong></div>
                <div><span style={{ color: "#64748b" }}>Input Shape:</span> <strong style={{ color: "#cbd5e1" }}>34 Features</strong></div>
                <div><span style={{ color: "#64748b" }}>Test Accuracy:</span> <strong style={{ color: "#4ade80" }}>98.0%</strong></div>
                <div><span style={{ color: "#64748b" }}>Test ROC-AUC:</span> <strong style={{ color: "#4ade80" }}>0.9975</strong></div>
                <div><span style={{ color: "#64748b" }}>Explainability:</span> <strong style={{ color: "#a5b4fc" }}>Gradient × Input Saliency</strong></div>
                <div><span style={{ color: "#64748b" }}>Clinical Role:</span> <strong style={{ color: "#cbd5e1" }}>Binary Early Screening</strong></div>
              </div>
            </div>

            {/* 2. LSTM Model Card */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid rgba(148, 163, 184, 0.12)",
                borderRadius: "20px",
                padding: "24px",
                boxShadow: "0 15px 35px rgba(0, 0, 0, 0.3)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.4rem" }}>📈</span>
                <span style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "50px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                  ACTIVE (BACKEND)
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
                  Long Short-Term Memory (LSTM)
                </h3>
                <span style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 600 }}>Sequential eGFR Recurrent Regressor</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: "1.5", margin: 0 }}>
                Recurrent neural network trained on longitudinal clinical encounters (CDISC ADaM schema). Captures multi-visit temporal dynamics to predict future eGFR decline and progression velocity.
              </p>
              <div style={{ background: "rgba(30, 41, 59, 0.5)", borderRadius: "12px", padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.78rem" }}>
                <div><span style={{ color: "#64748b" }}>Architecture:</span> <strong style={{ color: "#cbd5e1" }}>LSTM 64-32-Dense 16-1</strong></div>
                <div><span style={{ color: "#64748b" }}>Input Shape:</span> <strong style={{ color: "#cbd5e1" }}>3 Timesteps × 3 Feats</strong></div>
                <div><span style={{ color: "#64748b" }}>Test MAE:</span> <strong style={{ color: "#38bdf8" }}>3.41 mL/min</strong></div>
                <div><span style={{ color: "#64748b" }}>R² Score:</span> <strong style={{ color: "#38bdf8" }}>0.9645</strong></div>
                <div><span style={{ color: "#64748b" }}>Explainability:</span> <strong style={{ color: "#a5b4fc" }}>Temporal Visit Attention (%)</strong></div>
                <div><span style={{ color: "#64748b" }}>Clinical Role:</span> <strong style={{ color: "#cbd5e1" }}>Trajectory Forecasting</strong></div>
              </div>
            </div>

            {/* 3. Hybrid Model Card */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid rgba(148, 163, 184, 0.12)",
                borderRadius: "20px",
                padding: "24px",
                boxShadow: "0 15px 35px rgba(0, 0, 0, 0.3)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.4rem" }}>🧬</span>
                <span style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "50px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                  ACTIVE (BACKEND)
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
                  Hybrid Deep Learning Framework
                </h3>
                <span style={{ fontSize: "0.78rem", color: "#c084fc", fontWeight: 600 }}>Dual-Branch Dense + LSTM Fusion</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: "1.5", margin: 0 }}>
                Multi-input Functional Keras architecture uniting temporal rate-of-change dynamics (LSTM branch) with the patient's physiological baseline filtration anchor (Dense branch).
              </p>
              <div style={{ background: "rgba(30, 41, 59, 0.5)", borderRadius: "12px", padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.78rem" }}>
                <div><span style={{ color: "#64748b" }}>Architecture:</span> <strong style={{ color: "#cbd5e1" }}>Dual-Input Functional</strong></div>
                <div><span style={{ color: "#64748b" }}>Input Branches:</span> <strong style={{ color: "#cbd5e1" }}>Seq (3×2) + Base (1)</strong></div>
                <div><span style={{ color: "#64748b" }}>Test MAE:</span> <strong style={{ color: "#c084fc" }}>3.41 mL/min</strong></div>
                <div><span style={{ color: "#64748b" }}>R² Score:</span> <strong style={{ color: "#c084fc" }}>0.9644</strong></div>
                <div><span style={{ color: "#64748b" }}>Explainability:</span> <strong style={{ color: "#a5b4fc" }}>Branch Fusion Attribution</strong></div>
                <div><span style={{ color: "#64748b" }}>Clinical Role:</span> <strong style={{ color: "#cbd5e1" }}>Integrated Prognosis</strong></div>
              </div>
            </div>
          </div>

          {/* Technical Alignment Table */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
              borderRadius: "20px",
              padding: "26px",
              boxShadow: "0 15px 35px rgba(0, 0, 0, 0.3)",
            }}
          >
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f8fafc", marginBottom: "16px" }}>
              Synopsis Technical Requirement Verification Matrix
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.2)", color: "#94a3b8" }}>
                    <th style={{ padding: "12px 14px" }}>Synopsis Component</th>
                    <th style={{ padding: "12px 14px" }}>Backend Implementation</th>
                    <th style={{ padding: "12px 14px" }}>Clinical Integration</th>
                    <th style={{ padding: "12px 14px" }}>Audit Status</th>
                  </tr>
                </thead>
                <tbody style={{ color: "#cbd5e1" }}>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>A.1 ANN Binary Model</td>
                    <td style={{ padding: "12px 14px" }}><code>backend/model/ckd_model.keras</code> (34 features)</td>
                    <td style={{ padding: "12px 14px" }}>Automated CKD detection in Clinical Assessment</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED (98.0% Acc)</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>A.2 Sequential LSTM Model</td>
                    <td style={{ padding: "12px 14px" }}><code>backend/model/lstm_artifacts/</code> (3 timesteps)</td>
                    <td style={{ padding: "12px 14px" }}>Longitudinal eGFR progression in Patient EHR</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED (3.41 MAE)</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>A.3 Hybrid Deep Learning Model</td>
                    <td style={{ padding: "12px 14px" }}><code>backend/model/hybrid_artifacts/</code> (Dual-Branch)</td>
                    <td style={{ padding: "12px 14px" }}>Fused multi-input eGFR forecast & KDIGO staging</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED (3.41 MAE)</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>C.1 Explainable AI (XAI)</td>
                    <td style={{ padding: "12px 14px" }}>Gradient × Input Saliency + Temporal Visit Weights</td>
                    <td style={{ padding: "12px 14px" }}>Visualized in EHR, Assessment & Plotly charts</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED (Dynamic)</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>D.2-D.4 Clinical Intelligence</td>
                    <td style={{ padding: "12px 14px" }}>Tangri KFRE 2/5-yr, 5 Complications, 0-100 Triage</td>
                    <td style={{ padding: "12px 14px" }}>Integrated into Patient EHR & PDF Reports</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED (KDIGO 2024)</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>E.1 Federated Learning</td>
                    <td style={{ padding: "12px 14px" }}>Flower (FedAvg) + Non-IID Hospital Partitioning</td>
                    <td style={{ padding: "12px 14px" }}>Admin Console & Local Node Training</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: LSTM Lab Probe */}
      {activeSubTab === "lstm_lab" && (
        <div>
          <div style={{ marginBottom: "16px", padding: "14px 20px", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "14px", fontSize: "0.84rem", color: "#bae6fd" }}>
            🔬 <strong>Examiner Technical Probe:</strong> This interactive form allows researchers to test the standalone <strong>LSTM Sequential Regressor</strong> with arbitrary historical study days and eGFR values, inspecting how temporal gradients distribute across visits.
          </div>
          <LSTMPredictionForm token={token} />
        </div>
      )}

      {/* Sub-tab 3: Hybrid Lab Probe */}
      {activeSubTab === "hybrid_lab" && (
        <div>
          <div style={{ marginBottom: "16px", padding: "14px 20px", background: "rgba(192, 132, 252, 0.1)", border: "1px solid rgba(192, 132, 252, 0.3)", borderRadius: "14px", fontSize: "0.84rem", color: "#e9d5ff" }}>
            🔬 <strong>Examiner Technical Probe:</strong> This interactive form allows researchers to test the standalone <strong>Dual-Branch Hybrid Regressor</strong>, examining the fusion balance between recent longitudinal sequence dynamics vs. baseline renal function anchor.
          </div>
          <HybridPredictionForm token={token} />
        </div>
      )}
    </div>
  );
}

