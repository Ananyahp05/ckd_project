"use client";

import { API_BASE_URL } from "@/lib/api";
import React, { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type FLHistoryEntry = {
  round: number;
  accuracy: number;
  loss: number;
};

type FLStatusResponse = {
  status: "idle" | "running" | "completed" | "failed";
  current_round: number;
  total_rounds: number;
  history: FLHistoryEntry[];
  logs: string[];
  error: string | null;
  final_metrics: {
    rounds_completed?: number;
    final_metrics?: { accuracy: number; loss: number };
    time_elapsed?: number;
  } | null;
  started_at: string | null;
  completed_at: string | null;
};

type Props = {
  token?: string;
};

export default function FederatedDashboard({ token }: Props) {
  const [rounds, setRounds] = useState(3);
  const [clients, setClients] = useState(2);
  const [status, setStatus] = useState<FLStatusResponse>({
    status: "idle",
    current_round: 0,
    total_rounds: 0,
    history: [],
    logs: [],
    error: null,
    final_metrics: null,
    started_at: null,
    completed_at: null,
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll server for updates when simulation is running
  const fetchStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/federated/status`, { headers });
      if (!res.ok) throw new Error("Failed to fetch simulation status");
      const data: FLStatusResponse = await res.json();
      setStatus(data);

      if (data.status === "running") {
        setLoading(true);
      } else {
        setLoading(false);
        if (pollIntervalRef.current && (data.status === "completed" || data.status === "failed")) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const startTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/federated/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rounds, clients }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail ?? "Failed to start training");
      }

      // Immediately fetch status and start polling
      await fetchStatus();
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(fetchStatus, 1000);
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? "Failed to connect to backend server.");
      setLoading(false);
    }
  };

  // Auto scroll terminal logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [status.logs]);

  // Initial status check & cleanup
  useEffect(() => {
    fetchStatus();
    
    // Resume polling if server is currently running simulation
    const checkAndStartPoll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/federated/status`);
        if (res.ok) {
          const data: FLStatusResponse = await res.json();
          setStatus(data);
          if (data.status === "running") {
            setLoading(true);
            pollIntervalRef.current = setInterval(fetchStatus, 1000);
          }
        }
      } catch (err) {}
    };
    checkAndStartPoll();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const progressPercent = status.total_rounds > 0 
    ? Math.min((status.current_round / status.total_rounds) * 100, 100) 
    : 0;

  return (
    <>
      <style>{`
        .fl-grid {
          display: grid;
          grid-template-columns: 1.1fr 1.9fr;
          gap: 28px;
          align-items: start;
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 20px;
        }
        @media (max-width: 1024px) {
          .fl-grid { grid-template-columns: 1fr; }
        }
        .console-box {
          background: #0B1220;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 16px;
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.78rem;
          color: #4ADE80;
          height: 250px;
          overflow-y: auto;
          white-space: pre-wrap;
        }
        .progress-bar-container {
          background: var(--bg-surface-subtle);
          border-radius: 999px;
          height: 10px;
          overflow: hidden;
          position: relative;
          margin-top: 10px;
          border: 1px solid var(--border-color);
        }
        .progress-bar-fill {
          background: var(--color-primary-accent);
          height: 100%;
          transition: width 0.3s ease;
        }
        .console-line {
          margin-bottom: 4px;
          line-height: 1.4;
        }
        .original-vs-fed-box {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          margin-top: 12px;
        }
        @media (min-width: 600px) {
          .original-vs-fed-box { grid-template-columns: 1fr 1fr; }
        }
        .metrics-card {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(148,163,184,0.08);
          border-radius: 14px;
          padding: 16px;
          text-align: center;
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
        .inputs-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 600px) {
          .inputs-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="fl-grid">
        {/* Left Column: Control & Status */}
        <div className="dash-panel">
          <div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, background: "linear-gradient(135deg, #a5b4fc, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "6px" }}>
              Federated Console
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "24px" }}>
              Simulate distributed training across mock hospital clients using the Flower FL framework (FedAvg Strategy).
            </p>
          </div>

          <form onSubmit={startTraining} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="inputs-grid">
              <div className="form-field-group">
                <label className="field-label" htmlFor="rounds-input">Training Rounds</label>
                <input
                  id="rounds-input"
                  type="number"
                  min="1"
                  max="10"
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="field-input"
                  disabled={loading}
                />
              </div>
              <div className="form-field-group">
                <label className="field-label" htmlFor="clients-input">Client Nodes</label>
                <input
                  id="clients-input"
                  type="number"
                  min="2"
                  max="5"
                  value={clients}
                  onChange={(e) => setClients(Number(e.target.value))}
                  className="field-input"
                  disabled={loading}
                />
              </div>
            </div>

            {errorMsg && (
              <div className="error-box" style={{ marginTop: "4px" }}>
                ⚠ {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || status.status === "running"}
              className="submit-btn"
              style={{ marginTop: "12px" }}
            >
              {status.status === "running" ? (
                <>
                  <span className="spinner" />
                  Running Simulation…
                </>
              ) : (
                "⚙ Run FL Simulation"
              )}
            </button>
          </form>

          {/* Status Indicator Panel */}
          {status.status !== "idle" && (
            <div style={{ marginTop: "28px", borderTop: "1px solid rgba(148,163,184,0.08)", paddingTop: "24px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: "12px" }}>
                Status:{" "}
                <span style={{
                  color: status.status === "running" ? "#fbbf24" : status.status === "completed" ? "#4ade80" : "#f87171",
                  textTransform: "uppercase",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                }}>
                  {status.status}
                </span>
              </h3>

              {status.status === "running" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#94a3b8" }}>
                    <span>Progress: Round {status.current_round} / {status.total_rounds}</span>
                    <span>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}

              {status.status === "completed" && status.final_metrics && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
                    Aggregation completed successfully. Model weights consolidated and saved to <code style={{ color: "#a5b4fc" }}>model/ckd_model_federated.keras</code>.
                  </p>
                  <div className="original-vs-fed-box">
                    <div className="metrics-card">
                      <p style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Aggregated Acc</p>
                      <p style={{ fontSize: "1.4rem", fontWeight: 900, color: "#4ade80", marginTop: "4px" }}>
                        {(status.final_metrics.final_metrics?.accuracy ?? 0.0 * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div className="metrics-card">
                      <p style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Consolidated Loss</p>
                      <p style={{ fontSize: "1.4rem", fontWeight: 900, color: "#cbd5e1", marginTop: "4px" }}>
                        {(status.final_metrics.final_metrics?.loss ?? 0.0).toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {status.status === "failed" && (
                <div className="error-box">
                  <strong>Simulation Failed:</strong> {status.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Visualization & Logs */}
        <div className="dash-panel" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f1f5f9" }}>Simulation Analytics</h2>
            <p style={{ fontSize: "0.78rem", color: "#475569", marginTop: "4px" }}>
              Visualizing the aggregation loss and accuracy convergence across federation rounds.
            </p>
          </div>

          {/* Recharts Simulation Performance */}
          <div style={{ height: "240px", width: "100%" }}>
            {status.history && status.history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={status.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="round" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis domain={[0, 1]} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={3} name="Accuracy" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="loss" stroke="#ef4444" strokeWidth={2} name="Loss" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
                alignItems: "center", border: "1px dashed var(--border-color)", borderRadius: "12px",
                color: "var(--text-muted)", fontSize: "0.85rem",
              }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>No simulation history recorded yet.</span>
              </div>
            )}
          </div>

          {/* Console Log Terminal */}
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "10px" }}>Console Logger Output</h3>
            <div className="console-box">
              {status.logs && status.logs.length > 0 ? (
                status.logs.map((logLine, idx) => (
                  <div key={idx} className="console-line">
                    {logLine}
                  </div>
                ))
              ) : (
                <div style={{ color: "#475569", fontStyle: "italic" }}>Console is empty. Run training to view console logs...</div>
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
