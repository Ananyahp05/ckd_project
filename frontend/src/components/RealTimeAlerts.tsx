"use client";

import React, { useEffect, useState, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { WS_BASE_URL } from "@/lib/api";

type AlertMessage = {
  id: string;
  timestamp: string;
  prediction: string;
  risk_level: string;
  risk_score: number;
  patient_age: number | null;
  top_features: Array<{
    feature: string;
    contribution: number;
    direction: "risk" | "protective";
  }>;
  message: string;
};

const FEAT_LABEL_MAP: Record<string, string> = {
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

export default function RealTimeAlerts() {
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(1000);

  const connectWS = () => {
  if (wsRef.current) return;

  setWsStatus("connecting");

  const ws = new WebSocket(`${WS_BASE_URL}/ws/alerts`);
  wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      reconnectDelayRef.current = 1000; // Reset reconnect delay on successful connection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "HIGH_RISK_ALERT") {
          const newAlert: AlertMessage = {
            id: Math.random().toString(36).substring(2, 9),
            ...data,
          };
          // Add to alert list
          setAlerts((prev) => [newAlert, ...prev].slice(0, 5)); // Keep last 5 alerts
          
          // Play a gentle notify sound if supported
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
          } catch (e) {
            // Audio context blocked or not supported
          }
        }
      } catch (err) {
        console.error("Error parsing WebSocket alert message:", err);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setWsStatus("disconnected");
      triggerReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  const triggerReconnect = () => {
    if (reconnectTimeoutRef.current) return;
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      // Exponential backoff capped at 30 seconds
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 30000);
      connectWS();
    }, reconnectDelayRef.current);
  };

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const removeAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <>
      <style>{`
        .alerts-container {
          position: fixed;
          bottom: calc(24px + env(safe-area-inset-bottom));
          right: 24px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 420px;
          width: calc(100% - 48px);
          pointer-events: none;
        }
        @media (max-width: 768px) {
          .alerts-container {
            bottom: calc(90px + env(safe-area-inset-bottom));
            right: 20px;
            width: calc(100% - 40px);
          }
        }
        .ws-status-indicator {
          position: fixed;
          top: 100px;
          right: 24px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 50px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.05);
          pointer-events: auto;
        }
        .status--connected {
          background: rgba(34,197,94,0.12);
          color: #4ade80;
          border-color: rgba(34,197,94,0.2);
        }
        .status--connecting {
          background: rgba(245,158,11,0.12);
          color: #fbbf24;
          border-color: rgba(245,158,11,0.2);
        }
        .status--disconnected {
          background: rgba(239,68,68,0.12);
          color: #f87171;
          border-color: rgba(239,68,68,0.2);
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .alert-toast {
          pointer-events: auto;
          background: rgba(20, 10, 15, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(239,68,68,0.3);
          border-left: 5px solid #ef4444;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 15px rgba(239,68,68,0.15);
          animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
          color: #f1f5f9;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .alert-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .alert-title {
          font-weight: 800;
          font-size: 0.85rem;
          color: #f87171;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .alert-close {
          border: none;
          background: transparent;
          color: #64748b;
          font-size: 1.1rem;
          cursor: pointer;
          padding: 2px;
          line-height: 1;
          transition: color 0.2s;
        }
        .alert-close:hover { color: #f1f5f9; }
        .alert-desc {
          font-size: 0.82rem;
          line-height: 1.4;
          color: #cbd5e1;
          margin-bottom: 10px;
        }
        .alert-features {
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-top: 1px solid rgba(239,68,68,0.15);
          padding-top: 8px;
        }
        .alert-feat-title {
          font-size: 0.68rem;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 2px;
        }
        .alert-feat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.72rem;
        }
        .alert-feat-name { color: #94a3b8; }
        .alert-feat-val { font-weight: 700; color: #ef4444; }
      `}</style>

      {/* Floating Status Indicator */}
      <div className={`ws-status-indicator status--${wsStatus}`}>
        <span className="status-dot" />
        <span>Alert Stream: {wsStatus}</span>
      </div>

      {/* Toasts list */}
      <div className="alerts-container">
        {alerts.map((alert) => (
          <div key={alert.id} className="alert-toast">
            <div className="alert-header">
              <span className="alert-title">🚨 Critical Alert: High CKD Risk</span>
              <button onClick={() => removeAlert(alert.id)} className="alert-close">
                ×
              </button>
            </div>
            <p className="alert-desc">
              A high risk of Chronic Kidney Disease ({alert.risk_score.toFixed(1)}%) was detected for a patient
              {alert.patient_age ? ` (Age: ${alert.patient_age})` : ""}. Immediate clinical evaluation is advised.
            </p>
            {alert.top_features && alert.top_features.length > 0 && (
              <div className="alert-features">
                <div className="alert-feat-title">Primary Risk Drivers</div>
                {alert.top_features.map((feat, idx) => (
                  <div key={idx} className="alert-feat-row">
                    <span className="alert-feat-name">{FEAT_LABEL_MAP[feat.feature] || feat.feature}</span>
                    <span className="alert-feat-val">+{feat.contribution.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
