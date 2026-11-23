"use client";

import React, { useEffect, useState, useRef } from "react";

interface PlotlyVisualizerProps {
  patientId: string;
  token?: string | null;
}

declare global {
  interface Window {
    Plotly?: any;
  }
}

export default function PlotlyVisualizer({ patientId, token }: PlotlyVisualizerProps) {
  const [activeTab, setActiveTab] = useState<"trajectory" | "saliency" | "kdigo" | "radar">("trajectory");
  const [chartsData, setChartsData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [plotlyLoaded, setPlotlyLoaded] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Dynamically load Plotly.js CDN
  useEffect(() => {
    if (window.Plotly) {
      setPlotlyLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plot.ly/plotly-2.35.2.min.js";
    script.async = true;
    script.onload = () => setPlotlyLoaded(true);
    script.onerror = () => {
      console.warn("Could not load Plotly.js from primary CDN, attempting fallback...");
      const fallbackScript = document.createElement("script");
      fallbackScript.src = "https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.35.2/plotly.min.js";
      fallbackScript.onload = () => setPlotlyLoaded(true);
      fallbackScript.onerror = () => setError("Failed to load Plotly charting engine. Please check internet connection.");
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  }, []);

  // 2. Fetch Plotly figures from backend
  useEffect(() => {
    if (!patientId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchCharts = async () => {
      try {
        const authToken = token || localStorage.getItem("token") || "";
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const res = await fetch(`${apiUrl}/visualizations/patient-plotly/${encodeURIComponent(patientId)}`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch visualization data: HTTP ${res.status}`);
        }

        const data = await res.json();
        if (isMounted) {
          setChartsData(data.charts);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load visualizations.");
          setLoading(false);
        }
      }
    };

    fetchCharts();

    return () => {
      isMounted = false;
    };
  }, [patientId, token]);

  // 3. Render active chart in DOM
  useEffect(() => {
    if (!plotlyLoaded || !chartsData || !containerRef.current || !window.Plotly) return;

    let figKey = "trajectory";
    if (activeTab === "saliency") figKey = "temporal_saliency";
    else if (activeTab === "kdigo") figKey = "kdigo_matrix";
    else if (activeTab === "radar") figKey = "complications_radar";

    const fig = chartsData[figKey];
    if (fig && fig.data && fig.layout) {
      const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"]
      };

      // Clone layout to inject responsive styling
      const layout = {
        ...fig.layout,
        autosize: true,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#64748b", family: "inherit" }
      };

      window.Plotly.newPlot(containerRef.current, fig.data, layout, config);
    }
  }, [plotlyLoaded, chartsData, activeTab]);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        padding: "20px",
        marginTop: "20px"
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem" }}>📈</span>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Plotly / Dash Clinical Intelligence Suite
            </h3>
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "6px",
                background: "var(--color-primary-subtle)",
                color: "var(--color-primary-accent)",
                border: "1px solid var(--color-primary-border)"
              }}
            >
              Synopsis H.4
            </span>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            High-fidelity interactive analytics with pan, zoom, coordinate hovers, and KDIGO prognostic zones.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "flex", background: "var(--bg-surface-subtle)", border: "1px solid var(--border-color)", padding: "3px", borderRadius: "8px", gap: "4px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("trajectory")}
            style={{
              padding: "6px 12px",
              borderRadius: "5px",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              background: activeTab === "trajectory" ? "var(--color-primary-accent)" : "transparent",
              color: activeTab === "trajectory" ? "#ffffff" : "var(--text-muted)"
            }}
          >
            eGFR Trajectory
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("saliency")}
            style={{
              padding: "6px 12px",
              borderRadius: "5px",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              background: activeTab === "saliency" ? "var(--color-primary-accent)" : "transparent",
              color: activeTab === "saliency" ? "#ffffff" : "var(--text-muted)"
            }}
          >
            Temporal Attention
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("kdigo")}
            style={{
              padding: "6px 12px",
              borderRadius: "5px",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              background: activeTab === "kdigo" ? "var(--color-primary-accent)" : "transparent",
              color: activeTab === "kdigo" ? "#ffffff" : "var(--text-muted)"
            }}
          >
            KDIGO 2D Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("radar")}
            style={{
              padding: "6px 12px",
              borderRadius: "5px",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              background: activeTab === "radar" ? "var(--color-primary-accent)" : "transparent",
              color: activeTab === "radar" ? "#ffffff" : "var(--text-muted)"
            }}
          >
            Complications Radar
          </button>
        </div>
      </div>

      {/* Main Chart Canvas */}
      {loading ? (
        <div style={{ height: "380px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: "10px" }}>
          <div style={{ width: "20px", height: "20px", border: "2px solid #38bdf8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span>Generating interactive Plotly vector schemas...</span>
        </div>
      ) : error ? (
        <div style={{ height: "380px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#f87171" }}>
          <span>⚠ {error}</span>
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "400px",
            minHeight: "400px"
          }}
        />
      )}
    </div>
  );
}

