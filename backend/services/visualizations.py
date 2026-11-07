from __future__ import annotations

from typing import List, Dict, Any, Optional

def generate_plotly_trajectory_figure(
    patient_id: str,
    longitudinal_points: List[Dict[str, Any]],
    predicted_egfr: Optional[float] = None
) -> Dict[str, Any]:
    """
    Generates an interactive Plotly specification for the patient's eGFR trajectory
    with KDIGO clinical stage reference bands and multi-model forecast projections.
    """
    obs_x = []
    obs_y = []
    obs_text = []

    proj_x = []
    proj_y = []
    proj_text = []

    for pt in longitudinal_points:
        day = pt.get("day", 0)
        label = pt.get("label", f"Day {day}")
        if pt.get("observed_egfr") is not None:
            val = float(pt["observed_egfr"])
            obs_x.append(day)
            obs_y.append(val)
            obs_text.append(f"{label}: {val:.1f} mL/min/1.73m² (Observed)")
        elif pt.get("type") == "projected":
            val = float(pt.get("hybrid_projected") or pt.get("lstm_projected") or (predicted_egfr or 0.0))
            proj_x.append(day)
            proj_y.append(val)
            proj_text.append(f"{label}: {val:.1f} mL/min/1.73m² (Forecast)")

    # If projection not yet in list, connect from last observed
    if predicted_egfr is not None and not proj_x and obs_x:
        last_day = obs_x[-1]
        next_day = last_day + 90
        proj_x = [last_day, next_day]
        proj_y = [obs_y[-1], predicted_egfr]
        proj_text = [obs_text[-1], f"Forecast Day {next_day}: {predicted_egfr:.1f} mL/min/1.73m²"]

    traces = [
        # Observed points
        {
            "x": obs_x,
            "y": obs_y,
            "text": obs_text,
            "type": "scatter",
            "mode": "lines+markers",
            "name": "Observed Clinical eGFR",
            "line": {"color": "#2563eb", "width": 3},
            "marker": {"size": 10, "color": "#1d4ed8", "symbol": "circle"},
            "hoverinfo": "text"
        }
    ]

    if proj_x:
        traces.append({
            "x": proj_x,
            "y": proj_y,
            "text": proj_text,
            "type": "scatter",
            "mode": "lines+markers",
            "name": "AI Model Projected Trajectory",
            "line": {"color": "#7c3aed", "width": 3, "dash": "dash"},
            "marker": {"size": 12, "color": "#6d28d9", "symbol": "diamond"},
            "hoverinfo": "text"
        })

    max_day = max((obs_x + proj_x) or [365]) + 30
    layout = {
        "title": {
            "text": f"<b>Longitudinal eGFR Trajectory & AI Forecast</b> — Patient {patient_id}",
            "font": {"size": 16, "color": "#1e293b"}
        },
        "xaxis": {
            "title": "Study Days from Baseline",
            "range": [0, max_day],
            "gridcolor": "#f1f5f9"
        },
        "yaxis": {
            "title": "eGFR (mL/min/1.73m²)",
            "range": [0, 130],
            "gridcolor": "#f1f5f9"
        },
        "shapes": [
            # Stage 1-2 (Normal/Mild)
            {"type": "rect", "xref": "paper", "yref": "y", "x0": 0, "x1": 1, "y0": 60, "y1": 130, "fillcolor": "rgba(34, 197, 94, 0.08)", "line": {"width": 0}, "layer": "below"},
            # Stage 3a-3b (Moderate)
            {"type": "rect", "xref": "paper", "yref": "y", "x0": 0, "x1": 1, "y0": 30, "y1": 60, "fillcolor": "rgba(245, 158, 11, 0.08)", "line": {"width": 0}, "layer": "below"},
            # Stage 4-5 (Severe/Failure)
            {"type": "rect", "xref": "paper", "yref": "y", "x0": 0, "x1": 1, "y0": 0, "y1": 30, "fillcolor": "rgba(239, 68, 68, 0.08)", "line": {"width": 0}, "layer": "below"}
        ],
        "annotations": [
            {"xref": "paper", "yref": "y", "x": 0.98, "y": 95, "text": "Normal / Stage 1-2", "showarrow": False, "font": {"size": 10, "color": "#15803d"}},
            {"xref": "paper", "yref": "y", "x": 0.98, "y": 45, "text": "Moderate / Stage 3a-3b", "showarrow": False, "font": {"size": 10, "color": "#b45309"}},
            {"xref": "paper", "yref": "y", "x": 0.98, "y": 15, "text": "Severe / Stage 4-5", "showarrow": False, "font": {"size": 10, "color": "#b91c1c"}}
        ],
        "margin": {"l": 50, "r": 30, "t": 50, "b": 40},
        "hovermode": "closest",
        "legend": {"orientation": "h", "y": -0.2}
    }

    return {"data": traces, "layout": layout}


def generate_plotly_temporal_saliency_figure(saliency: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates an interactive Plotly bar figure showing temporal step importance and feature attributions.
    """
    step_data = saliency.get("step_breakdown", [])
    if not step_data:
        # Fallback to temporal weights
        weights = saliency.get("temporal_weights_percent", [25.0, 35.0, 40.0])
        traces = [{
            "x": [f"Visit {i+1}" for i in range(len(weights))],
            "y": weights,
            "type": "bar",
            "marker": {"color": ["#93c5fd", "#60a5fa", "#2563eb"]}
        }]
        layout = {
            "title": {"text": "<b>Sequential Visit Temporal Attention (%)</b>", "font": {"size": 15}},
            "yaxis": {"title": "Attention Weight (%)"},
            "margin": {"l": 40, "r": 20, "t": 40, "b": 40}
        }
        return {"data": traces, "layout": layout}

    # Grouped features by visit
    visits = [f"Visit {s.get('step', i+1)}" for i, s in enumerate(step_data)]
    aval_attrs = []
    ady_attrs = []
    base_attrs = []

    for s in step_data:
        feat_map = {f["feature"]: f["attribution"] for f in s.get("features", [])}
        aval_attrs.append(feat_map.get("aval", 0.0))
        ady_attrs.append(feat_map.get("ady", 0.0))
        base_attrs.append(feat_map.get("base", 0.0))

    traces = [
        {"x": visits, "y": aval_attrs, "name": "eGFR Trajectory (aval)", "type": "bar", "marker": {"color": "#3b82f6"}},
        {"x": visits, "y": ady_attrs, "name": "Elapsed Time (ady)", "type": "bar", "marker": {"color": "#8b5cf6"}},
    ]
    if any(base_attrs):
        traces.append({"x": visits, "y": base_attrs, "name": "Baseline Anchor (base)", "type": "bar", "marker": {"color": "#10b981"}})

    layout = {
        "title": {"text": "<b>Temporal Gradient Attribution by Clinical Visit</b>", "font": {"size": 15, "color": "#1e293b"}},
        "barmode": "group",
        "yaxis": {"title": "Signed Attribution (mL/min/1.73m²)", "gridcolor": "#f1f5f9"},
        "xaxis": {"gridcolor": "#f1f5f9"},
        "margin": {"l": 50, "r": 20, "t": 45, "b": 40},
        "legend": {"orientation": "h", "y": -0.2}
    }
    return {"data": traces, "layout": layout}


def generate_plotly_kdigo_matrix(current_egfr: float, albumin_grade: int = 1) -> Dict[str, Any]:
    """
    Generates an interactive 2D KDIGO 2024 Risk Heatmap matrix (GFR Category vs. Albuminuria Category)
    with a highlighted marker for the patient's clinical coordinate.
    """
    # KDIGO grid values: 1 = Low Risk (Green), 2 = Moderate (Yellow), 3 = High (Orange), 4 = Very High (Red)
    z_matrix = [
        [1, 2, 3],  # G1 (≥ 90)
        [1, 2, 3],  # G2 (60-89)
        [2, 3, 4],  # G3a (45-59)
        [3, 4, 4],  # G3b (30-44)
        [4, 4, 4],  # G4 (15-29)
        [4, 4, 4]   # G5 (< 15)
    ]

    g_stages = ["G1 (≥90)", "G2 (60-89)", "G3a (45-59)", "G3b (30-44)", "G4 (15-29)", "G5 (<15)"]
    a_stages = ["A1: Normal (<30 mg/g)", "A2: Micro (30-300 mg/g)", "A3: Macro (>300 mg/g)"]

    # Invert for heatmap display (top to bottom)
    heatmap_z = list(reversed(z_matrix))
    heatmap_y = list(reversed(g_stages))

    colorscale = [
        [0.0, "#22c55e"],   # Green
        [0.33, "#eab308"],  # Yellow
        [0.66, "#f97316"],  # Orange
        [1.0, "#ef4444"]    # Red
    ]

    # Determine patient coordinate
    if current_egfr >= 90:
        g_idx = 0
    elif current_egfr >= 60:
        g_idx = 1
    elif current_egfr >= 45:
        g_idx = 2
    elif current_egfr >= 30:
        g_idx = 3
    elif current_egfr >= 15:
        g_idx = 4
    else:
        g_idx = 5

    a_idx = min(2, max(0, albumin_grade - 1 if albumin_grade >= 1 else 0))

    traces = [
        {
            "z": heatmap_z,
            "x": a_stages,
            "y": heatmap_y,
            "type": "heatmap",
            "colorscale": colorscale,
            "showscale": False,
            "hoverinfo": "x+y"
        },
        {
            "x": [a_stages[a_idx]],
            "y": [g_stages[g_idx]],
            "type": "scatter",
            "mode": "markers",
            "name": "Patient Position",
            "marker": {
                "size": 22,
                "color": "#ffffff",
                "line": {"color": "#0f172a", "width": 4},
                "symbol": "circle"
            },
            "hovertext": f"Patient Status: eGFR {current_egfr:.1f} mL/min | Albumin Grade {albumin_grade}",
            "hoverinfo": "text"
        }
    ]

    layout = {
        "title": {"text": "<b>KDIGO 2024 Prognosis Matrix Position</b>", "font": {"size": 15, "color": "#1e293b"}},
        "xaxis": {"title": "Persistent Albuminuria Category"},
        "yaxis": {"title": "eGFR Grid Category"},
        "margin": {"l": 100, "r": 30, "t": 50, "b": 60}
    }

    return {"data": traces, "layout": layout}


def generate_plotly_complications_radar(complications: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generates an interactive Plotly Polar / Radar chart showing multi-systemic complication risk.
    """
    categories = [c["name"].split(" (")[0] for c in complications]
    probabilities = [c["probability_pct"] for c in complications]

    # Close the radar loop
    if categories:
        categories.append(categories[0])
        probabilities.append(probabilities[0])

    traces = [{
        "type": "scatterpolar",
        "r": probabilities,
        "theta": categories,
        "fill": "toself",
        "fillcolor": "rgba(220, 38, 38, 0.2)",
        "line": {"color": "#dc2626", "width": 2.5},
        "marker": {"size": 8, "color": "#b91c1c"},
        "name": "Complication Likelihood (%)"
    }]

    layout = {
        "title": {"text": "<b>Multi-Systemic CKD Complication Profile</b>", "font": {"size": 15, "color": "#1e293b"}},
        "polar": {
            "radialaxis": {
                "visible": True,
                "range": [0, 100],
                "ticksuffix": "%",
                "gridcolor": "#e2e8f0"
            },
            "angularaxis": {
                "gridcolor": "#e2e8f0"
            }
        },
        "margin": {"l": 60, "r": 60, "t": 50, "b": 50}
    }

    return {"data": traces, "layout": layout}

