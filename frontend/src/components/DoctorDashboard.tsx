"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import PatientForm from "./PatientForm";
import UnifiedPatientEHR from "./UnifiedPatientEHR";

type Props = {
  token: string;
  doctorProfile?: any;
};

// Helper for professional clinical formatting (fixes raw 16-decimal floats)
function formatRiskScore(score: any): string {
  if (score === null || score === undefined || score === "") return "—";
  const num = typeof score === "number" ? score : parseFloat(score);
  if (isNaN(num)) return "—";
  if (num > 0 && num < 0.1) return "<0.1%";
  return `${num.toFixed(1)}%`;
}

export default function DoctorDashboard({ token, doctorProfile }: Props) {
  const [activeSideNav, setActiveSideNav] = useState<"overview" | "patients" | "assessment" | "ehr">("patients");
  const [patients, setPatients] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Patient Detail State
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetails, setPatientDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<"labs" | "predictions" | "history">("labs");

  // Lab Request Form
  const [labTestType, setLabTestType] = useState("Comprehensive Renal Panel");
  const [labPriority, setLabPriority] = useState<"Routine" | "Urgent" | "STAT">("Routine");
  const [labNotes, setLabNotes] = useState("");
  const [labSuccess, setLabSuccess] = useState<string | null>(null);

  // Load Doctor's Overview Stats and Patients
  const loadDoctorData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Stats
      const resStats = await fetch(`${API_BASE_URL}/doctor/overview-stats`, { headers });
      if (resStats.ok) setStats(await resStats.json());

      // Deduplicated Patients (1 row per patient)
      const resPatients = await fetch(`${API_BASE_URL}/doctor/my-patients`, { headers });
      if (resPatients.ok) {
        const data = await resPatients.json();
        setPatients(data);
      }
    } catch (e) {
      console.error("Failed to load doctor clinical data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadDoctorData();
  }, [token]);

  // Load patient details when a row is clicked
  const handleSelectPatientRow = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setDetailsLoading(true);
    setPatientDetails(null);
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/patient/${encodeURIComponent(patientId)}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const details = await res.json();
        setPatientDetails(details);
      }
    } catch (e) {
      console.error("Failed to load patient details:", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  // FHIR R4 JSON Export
  const handleExportFhir = async (pId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/fhir/patient/${encodeURIComponent(pId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const bundle = await res.json();
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fhir_r4_${pId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      alert("FHIR export failed");
    }
  };

  // Lab Request Submit
  const handleLabRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/lab-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          test_type: labTestType,
          priority: labPriority,
          clinical_notes: labNotes,
        }),
      });
      if (res.ok) {
        setLabSuccess(`Laboratory test '${labTestType}' requested for ${selectedPatientId}`);
        setLabNotes("");
        handleSelectPatientRow(selectedPatientId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredPatients = patients.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.patient_id || "").toLowerCase().includes(q) ||
      (p.full_name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="clinical-shell-container">
      {/* ── 1. LEFT SIDEPANEL: EXTENDS FLUSH TO FOOTER (NO FLOATING CARD) ── */}
      <aside className="clinical-sidebar">
        <div className="sidebar-brand-block">
          <div className="sidebar-brand-tag">
            Physician Workspace
          </div>
          <div className="sidebar-brand-name">
            {doctorProfile?.full_name || "Dr. Attending Physician"}
          </div>
          <div className="sidebar-brand-dept">
            Renal Care & Dialysis Unit
          </div>
        </div>

        <button
          onClick={() => { setActiveSideNav("patients"); setSelectedPatientId(null); }}
          className={`sidebar-nav-item ${activeSideNav === "patients" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>👥</span>
          <span>My Patients ({patients.length})</span>
        </button>

        <button
          onClick={() => setActiveSideNav("overview")}
          className={`sidebar-nav-item ${activeSideNav === "overview" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>📊</span>
          <span>Overview Analytics</span>
        </button>

        <button
          onClick={() => setActiveSideNav("assessment")}
          className={`sidebar-nav-item ${activeSideNav === "assessment" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>📋</span>
          <span>New Clinical Intake</span>
        </button>

        <button
          onClick={() => setActiveSideNav("ehr")}
          className={`sidebar-nav-item ${activeSideNav === "ehr" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>📈</span>
          <span>Longitudinal eGFR Chart</span>
        </button>
      </aside>

      {/* ── 2. FLUID CLINICAL CONTENT AREA ── */}
      <div className="clinical-content-area">
        
        {/* ── A. PATIENTS DIRECTORY (1 ROW PER UNIQUE PATIENT) ── */}
        {activeSideNav === "patients" && !selectedPatientId && (
          <div className="clinical-panel">
            <div className="clinical-panel-header">
              <div>
                <h2 className="panel-title">
                  Assigned Patients Clinical Directory
                </h2>
                <p className="panel-description">
                  Each patient is deduplicated to exactly one row. Click any row to inspect their full clinical dossier, laboratory results, and AI models.
                </p>
              </div>

              {/* Clean Clinical Search Input */}
              <input
                type="text"
                placeholder="Search by MRN or Patient Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="clinical-input"
                style={{ width: "260px" }}
              />
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                Loading patients roster...
              </div>
            ) : filteredPatients.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                No assigned patients matching your query.
              </div>
            ) : (
              <div className="clinical-table-container">
                <table className="clinical-table">
                  <thead>
                    <tr>
                      <th>Patient MRN / ID</th>
                      <th>Patient Name</th>
                      <th>Age / Gender</th>
                      <th>Last Recorded Date</th>
                      <th>Latest Diagnosis Status</th>
                      <th>Risk Score</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((p) => {
                      const isCkd = p.latest_prediction_status === "ckd";
                      const isNotCkd = p.latest_prediction_status === "notckd";
                      return (
                        <tr
                          key={p.patient_id}
                          onClick={() => handleSelectPatientRow(p.patient_id)}
                          className="clickable-row"
                        >
                          <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                            {p.patient_id}
                          </td>
                          <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {p.full_name}
                          </td>
                          <td style={{ color: "var(--text-secondary)" }}>
                            {p.age ? `${p.age} yrs` : "—"} &bull; {p.gender || "Unknown"}
                          </td>
                          <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                            {p.last_measurement_date ? new Date(p.last_measurement_date).toLocaleDateString() : "No visits recorded"}
                          </td>
                          <td>
                            <span className={`badge-clinical ${isCkd ? "badge-clinical--high" : isNotCkd ? "badge-clinical--low" : "badge-clinical--neutral"}`}>
                              {p.latest_prediction_status ? p.latest_prediction_status.toUpperCase() : "NOT EVALUATED"}
                            </span>
                          </td>
                          <td style={{
                            fontWeight: 600,
                            fontFamily: "JetBrains Mono, monospace",
                            color: p.latest_risk_score && p.latest_risk_score >= 50 ? "var(--risk-high)" : "var(--risk-low)"
                          }}>
                            {formatRiskScore(p.latest_risk_score)}
                          </td>
                          <td>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPatientRow(p.patient_id);
                              }}
                              className="btn-secondary"
                              style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                            >
                              View Details &rarr;
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── B. PATIENT DETAIL DOSSIER (OPENS ON ROW CLICK) ── */}
        {activeSideNav === "patients" && selectedPatientId && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Header & Back Button */}
            <div className="clinical-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <button
                    onClick={() => setSelectedPatientId(null)}
                    className="btn-secondary"
                    style={{ marginBottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    &larr; Back to Patients List
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <h2 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                      {patientDetails?.profile?.full_name || `Patient ${selectedPatientId}`}
                    </h2>
                    <span style={{
                      background: "var(--color-primary-subtle)",
                      color: "var(--color-primary-accent)",
                      border: "1px solid var(--color-primary-border)",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      fontFamily: "JetBrains Mono, monospace"
                    }}>
                      MRN: {selectedPatientId}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    Assigned Physician: <strong style={{ color: "var(--text-primary)" }}>{patientDetails?.profile?.assigned_doctor_name || "Dr. Attending"}</strong> &bull; Blood Group: <strong>{patientDetails?.profile?.blood_group || "O+"}</strong> &bull; Status: <strong style={{ color: "var(--risk-low)" }}>{patientDetails?.profile?.status || "Active"}</strong>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleExportFhir(selectedPatientId)}
                    className="btn-primary-teal"
                  >
                    Export FHIR R4 JSON
                  </button>
                </div>
              </div>

              {/* Sub-Tabs for Details (Touch-friendly & Horizontal Scrolling on Mobile) */}
              <div style={{
                display: "flex",
                gap: "8px",
                marginTop: "20px",
                borderBottom: "1px solid var(--border-color)",
                overflowX: "auto",
                whiteSpace: "nowrap",
                WebkitOverflowScrolling: "touch",
                paddingBottom: "2px"
              }}>
                <button
                  onClick={() => setActiveDetailTab("labs")}
                  style={{
                    padding: "9px 16px",
                    border: "none",
                    background: "none",
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    color: activeDetailTab === "labs" ? "var(--color-primary-accent)" : "var(--text-muted)",
                    borderBottom: activeDetailTab === "labs" ? "2px solid var(--color-primary-accent)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  Laboratory Biomarkers ({patientDetails?.lab_results?.length || 0})
                </button>
                <button
                  onClick={() => setActiveDetailTab("predictions")}
                  style={{
                    padding: "9px 16px",
                    border: "none",
                    background: "none",
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    color: activeDetailTab === "predictions" ? "var(--color-primary-accent)" : "var(--text-muted)",
                    borderBottom: activeDetailTab === "predictions" ? "2px solid var(--color-primary-accent)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  Deep Learning Predictions ({patientDetails?.predictions?.length || 0})
                </button>
                <button
                  onClick={() => setActiveDetailTab("history")}
                  style={{
                    padding: "9px 16px",
                    border: "none",
                    background: "none",
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    color: activeDetailTab === "history" ? "var(--color-primary-accent)" : "var(--text-muted)",
                    borderBottom: activeDetailTab === "history" ? "2px solid var(--color-primary-accent)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  Medical Profile & Order Lab
                </button>
              </div>
            </div>

            {/* Sub-Tab 1: Lab Biomarkers */}
            {activeDetailTab === "labs" && (
              <div className="clinical-panel">
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>
                  Standardized Renal Biomarker Measurements
                </h3>
                {patientDetails?.lab_results?.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    No laboratory test measurements recorded yet for this patient.
                  </p>
                ) : (
                  <div className="clinical-table-container">
                    <table className="clinical-table">
                      <thead>
                        <tr>
                          <th>Biomarker Test</th>
                          <th>Category</th>
                          <th>Measured Value</th>
                          <th>Standard Reference</th>
                          <th>LOINC Code</th>
                          <th>Status</th>
                          <th>Technician</th>
                          <th>Recorded At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientDetails?.lab_results?.map((t: any) => {
                          const isCritical = t.status === "CRITICAL" || t.status === "ELEVATED";
                          return (
                            <tr key={t.id}>
                              <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.test_name}</td>
                              <td style={{ color: "var(--text-muted)" }}>{t.category}</td>
                              <td style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)" }}>
                                {t.test_value} {t.unit}
                              </td>
                              <td style={{ color: "var(--text-muted)" }}>{t.reference_range || "—"}</td>
                              <td style={{ color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
                                {t.loinc_code || "—"}
                              </td>
                              <td>
                                <span className={`badge-clinical ${isCritical ? "badge-clinical--high" : "badge-clinical--low"}`}>
                                  {t.status}
                                </span>
                              </td>
                              <td style={{ color: "var(--text-secondary)" }}>{t.technician_name || "Lab Staff"}</td>
                              <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {new Date(t.recorded_at).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 2: Deep Learning Predictions */}
            {activeDetailTab === "predictions" && (
              <div className="clinical-panel">
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>
                  Historical Multi-Model CKD Evaluations
                </h3>
                {patientDetails?.predictions?.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    No historical evaluations recorded yet. Run a New Clinical Intake to evaluate.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {patientDetails?.predictions?.map((pred: any) => {
                      const isCkd = pred.prediction_label === "ckd";
                      return (
                        <div key={pred.id} style={{
                          background: "var(--bg-surface-subtle)",
                          padding: "16px 20px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <div>
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                              {new Date(pred.created_at).toLocaleString()}
                            </span>
                            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                              Verdict: <span style={{ color: isCkd ? "var(--risk-high)" : "var(--risk-low)" }}>{pred.prediction_label.toUpperCase()}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{
                              fontSize: "1.35rem",
                              fontWeight: 700,
                              fontFamily: "JetBrains Mono, monospace",
                              color: pred.risk_score >= 50 ? "var(--risk-high)" : "var(--risk-low)"
                            }}>
                              {formatRiskScore(pred.risk_score)}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Risk Probability</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 3: Medical History & Order Lab Test */}
            {activeDetailTab === "history" && (
              <div className="responsive-two-col">
                <div className="clinical-panel">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
                    Patient Profile & Clinical Notes
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                    <p><strong style={{ color: "var(--text-primary)" }}>Medical History:</strong> {patientDetails?.profile?.medical_history || "No documented pre-existing conditions recorded."}</p>
                    <p><strong style={{ color: "var(--text-primary)" }}>Known Allergies:</strong> {patientDetails?.profile?.allergies || "No known drug allergies (NKDA)."}</p>
                    <p><strong style={{ color: "var(--text-primary)" }}>Emergency Contact:</strong> {patientDetails?.profile?.emergency_contact || "+1-800-555-0199"}</p>
                  </div>
                </div>

                <div className="clinical-panel">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
                    Order Laboratory Test
                  </h3>
                  {labSuccess && (
                    <div style={{ background: "var(--risk-low-bg)", color: "var(--risk-low)", border: "1px solid var(--risk-low-border)", padding: "10px", borderRadius: "6px", marginBottom: "12px", fontSize: "0.85rem", fontWeight: 600 }}>
                      {labSuccess}
                    </div>
                  )}
                  <form onSubmit={handleLabRequestSubmit}>
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                        Test Panel:
                      </label>
                      <select
                        value={labTestType}
                        onChange={(e) => setLabTestType(e.target.value)}
                        className="clinical-input"
                      >
                        <option value="Comprehensive Renal Panel">Comprehensive Renal Panel (eGFR, Cr, BUN, Na, K)</option>
                        <option value="Serum Creatinine + eGFR">Serum Creatinine + eGFR</option>
                        <option value="Urinary Protein / Albumin Excretion">Urinary Protein / Albumin Excretion</option>
                        <option value="Complete Blood Count (CBC)">Complete Blood Count (CBC)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                        Clinical Priority:
                      </label>
                      <select
                        value={labPriority}
                        onChange={(e: any) => setLabPriority(e.target.value)}
                        className="clinical-input"
                      >
                        <option value="Routine">Routine</option>
                        <option value="Urgent">Urgent</option>
                        <option value="STAT">STAT (Immediate Priority)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                        Physician Clinical Notes:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rule out stage 3 progression; re-check electrolytes"
                        value={labNotes}
                        onChange={(e) => setLabNotes(e.target.value)}
                        className="clinical-input"
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn-primary-teal"
                      style={{ width: "100%", padding: "10px" }}
                    >
                      Send Order to Laboratory
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── C. OVERVIEW STATS VIEW ── */}
        {activeSideNav === "overview" && stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Total Assigned Patients
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--color-primary-accent)", marginTop: "6px" }}>
                  {stats.assigned_patient_count}
                </div>
              </div>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  High Risk Patient Alerts
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--risk-high)", marginTop: "6px" }}>
                  {stats.high_risk_patient_count}
                </div>
              </div>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Pending Lab Orders
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)", marginTop: "6px" }}>
                  {stats.pending_lab_requests_count}
                </div>
              </div>
            </div>

            <div className="clinical-panel">
              <h3 className="panel-title" style={{ fontSize: "1.1rem", marginBottom: "14px" }}>
                Recent Patient Evaluations
              </h3>
              <div className="clinical-table-container">
                <table className="clinical-table">
                  <thead>
                    <tr>
                      <th>Patient MRN</th>
                      <th>Prediction Verdict</th>
                      <th>Risk Probability</th>
                      <th>Recorded Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_predictions?.map((r: any) => {
                      const isCkd = r.prediction_label === "ckd";
                      return (
                        <tr key={r.id} onClick={() => { setActiveSideNav("patients"); handleSelectPatientRow(r.patient_id); }} className="clickable-row">
                          <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                            {r.patient_id}
                          </td>
                          <td>
                            <span className={`badge-clinical ${isCkd ? "badge-clinical--high" : "badge-clinical--low"}`}>
                              {r.prediction_label.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                            {formatRiskScore(r.risk_score)}
                          </td>
                          <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── D. CLINICAL ASSESSMENT (PATIENT FORM) ── */}
        {activeSideNav === "assessment" && (
          <div style={{ width: "100%" }}>
            <PatientForm
              token={token}
              onViewEHR={(pId) => {
                if (pId) setSelectedPatientId(pId);
                setActiveSideNav("ehr");
              }}
            />
          </div>
        )}

        {/* ── E. LONGITUDINAL EHR CHART ── */}
        {activeSideNav === "ehr" && (
          <div style={{ width: "100%" }}>
            <UnifiedPatientEHR
              token={token}
              initialPatientId={selectedPatientId || undefined}
              onNavigateToForm={(target, pId) => {
                if (target === "assessment") setActiveSideNav("assessment");
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
