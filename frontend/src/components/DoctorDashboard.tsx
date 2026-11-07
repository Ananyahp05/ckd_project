"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import PatientForm from "./PatientForm";
import UnifiedPatientEHR from "./UnifiedPatientEHR";

type Props = {
  token: string;
  doctorProfile?: any;
};

export default function DoctorDashboard({ token, doctorProfile }: Props) {
  const [activeSideNav, setActiveSideNav] = useState<"overview" | "patients" | "assessment" | "ehr" | "lab_request">("patients");
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
        setLabSuccess(`Laboratory test '${labTestType}' requested for ${selectedPatientId}!`);
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
    <div style={{ display: "flex", gap: "24px", minHeight: "82vh", maxWidth: "1500px", margin: "0 auto" }}>
      <style>{`
        /* ── Sidepanel Styles ── */
        .doctor-sidepanel {
          width: 260px;
          flex-shrink: 0;
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          height: fit-content;
        }
        .sidepanel-brand {
          padding: 12px 14px;
          margin-bottom: 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .sidepanel-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 700;
          color: #475569;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          width: 100%;
        }
        .sidepanel-item:hover {
          background: #f0f9ff;
          color: #0284c7;
        }
        .sidepanel-item--active {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: #ffffff !important;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);
        }
        
        /* ── Main Dashboard Content Area ── */
        .doctor-main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        .white-card {
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          padding: 24px;
          color: #0f172a;
        }
        .clickable-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
        }
        .clickable-table th {
          text-align: left;
          padding: 14px 16px;
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          border-bottom: 2px solid #e2e8f0;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .clickable-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          vertical-align: middle;
        }
        .clickable-row {
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .clickable-row:hover {
          background: #f0f9ff !important;
        }
        .badge-chip {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 50px;
          font-size: 0.72rem;
          font-weight: 800;
        }
        .badge-chip--CKD { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .badge-chip--NOTCKD { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-chip--NONE { background: #f1f5f9; color: #64748b; }
      `}</style>

      {/* ── 1. LEFT SIDEPANEL ── */}
      <aside className="doctor-sidepanel">
        <div className="sidepanel-brand">
          <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Physician Workspace
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
            {doctorProfile?.full_name || "Dr. Attending Nephrologist"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
            Nephrology & Renal Dialysis Unit
          </div>
        </div>

        <button
          onClick={() => { setActiveSideNav("patients"); setSelectedPatientId(null); }}
          className={`sidepanel-item ${activeSideNav === "patients" ? "sidepanel-item--active" : ""}`}
        >
          <span>👥</span>
          <span>My Patients ({patients.length})</span>
        </button>

        <button
          onClick={() => setActiveSideNav("overview")}
          className={`sidepanel-item ${activeSideNav === "overview" ? "sidepanel-item--active" : ""}`}
        >
          <span>📊</span>
          <span>Overview Analytics</span>
        </button>

        <button
          onClick={() => setActiveSideNav("assessment")}
          className={`sidepanel-item ${activeSideNav === "assessment" ? "sidepanel-item--active" : ""}`}
        >
          <span>📋</span>
          <span>New Clinical Intake</span>
        </button>

        <button
          onClick={() => setActiveSideNav("ehr")}
          className={`sidepanel-item ${activeSideNav === "ehr" ? "sidepanel-item--active" : ""}`}
        >
          <span>📈</span>
          <span>Longitudinal eGFR Chart</span>
        </button>
      </aside>

      {/* ── 2. MAIN DASHBOARD CONTENT ── */}
      <div className="doctor-main-content">
        
        {/* ── A. PATIENTS DIRECTORY (1 ROW PER UNIQUE PATIENT) ── */}
        {activeSideNav === "patients" && !selectedPatientId && (
          <div className="white-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Assigned Patients Clinical Directory
                </h2>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0 0" }}>
                  Each patient is deduplicated to exactly one row. Click any patient row to open their full clinical dossier, laboratory results, and AI models.
                </p>
              </div>

              {/* Search Bar */}
              <input
                type="text"
                placeholder="🔍 Search by MRN or Patient Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "0.88rem",
                  width: "280px",
                  outline: "none",
                }}
              />
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Loading patients roster...</div>
            ) : filteredPatients.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                No assigned patients matching your query.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="clickable-table">
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
                    {filteredPatients.map((p) => (
                      <tr
                        key={p.patient_id}
                        onClick={() => handleSelectPatientRow(p.patient_id)}
                        className="clickable-row"
                      >
                        <td style={{ fontWeight: 800, color: "#0284c7" }}>{p.patient_id}</td>
                        <td style={{ fontWeight: 700, color: "#0f172a" }}>{p.full_name}</td>
                        <td style={{ color: "#475569" }}>
                          {p.age ? `${p.age} yrs` : "—"} &bull; {p.gender || "Unknown"}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                          {p.last_measurement_date ? new Date(p.last_measurement_date).toLocaleDateString() : "No visits recorded"}
                        </td>
                        <td>
                          <span className={`badge-chip ${p.latest_prediction_status === "ckd" ? "badge-chip--CKD" : p.latest_prediction_status === "notckd" ? "badge-chip--NOTCKD" : "badge-chip--NONE"}`}>
                            {p.latest_prediction_status ? p.latest_prediction_status.toUpperCase() : "NOT EVALUATED"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800, color: p.latest_risk_score && p.latest_risk_score >= 50 ? "#dc2626" : "#0f172a" }}>
                          {p.latest_risk_score !== null && p.latest_risk_score !== undefined ? `${p.latest_risk_score}%` : "—"}
                        </td>
                        <td>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPatientRow(p.patient_id);
                            }}
                            style={{
                              background: "#0284c7",
                              color: "#ffffff",
                              border: "none",
                              padding: "6px 14px",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            View Details &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
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
            <div className="white-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <button
                    onClick={() => setSelectedPatientId(null)}
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      cursor: "pointer",
                      marginBottom: "10px",
                    }}
                  >
                    &larr; Back to Patients List
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                      {patientDetails?.profile?.full_name || `Patient ${selectedPatientId}`}
                    </h2>
                    <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "4px 10px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 800 }}>
                      MRN: {selectedPatientId}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "4px" }}>
                    Assigned Doctor: <strong>{patientDetails?.profile?.assigned_doctor_name || "Dr. Attending"}</strong> &bull; Blood Group: <strong>{patientDetails?.profile?.blood_group || "O+"}</strong> &bull; Status: <strong style={{ color: "#059669" }}>{patientDetails?.profile?.status || "Active"}</strong>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleExportFhir(selectedPatientId)}
                    style={{
                      background: "linear-gradient(135deg, #059669, #047857)",
                      color: "#ffffff",
                      border: "none",
                      padding: "10px 18px",
                      borderRadius: "10px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    📥 Export FHIR R4 JSON
                  </button>
                </div>
              </div>

              {/* Sub-Tabs for Details */}
              <div style={{ display: "flex", gap: "8px", marginTop: "24px", borderBottom: "2px solid #f1f5f9" }}>
                <button
                  onClick={() => setActiveDetailTab("labs")}
                  style={{
                    padding: "10px 18px",
                    border: "none",
                    background: "none",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: activeDetailTab === "labs" ? "#0284c7" : "#64748b",
                    borderBottom: activeDetailTab === "labs" ? "3px solid #0284c7" : "none",
                    cursor: "pointer",
                  }}
                >
                  🧪 Laboratory Biomarkers ({patientDetails?.lab_results?.length || 0})
                </button>
                <button
                  onClick={() => setActiveDetailTab("predictions")}
                  style={{
                    padding: "10px 18px",
                    border: "none",
                    background: "none",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: activeDetailTab === "predictions" ? "#0284c7" : "#64748b",
                    borderBottom: activeDetailTab === "predictions" ? "3px solid #0284c7" : "none",
                    cursor: "pointer",
                  }}
                >
                  🧠 Deep Learning Predictions ({patientDetails?.predictions?.length || 0})
                </button>
                <button
                  onClick={() => setActiveDetailTab("history")}
                  style={{
                    padding: "10px 18px",
                    border: "none",
                    background: "none",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: activeDetailTab === "history" ? "#0284c7" : "#64748b",
                    borderBottom: activeDetailTab === "history" ? "3px solid #0284c7" : "none",
                    cursor: "pointer",
                  }}
                >
                  📋 Medical History & Order Lab Test
                </button>
              </div>
            </div>

            {/* Sub-Tab 1: Lab Biomarkers */}
            {activeDetailTab === "labs" && (
              <div className="white-card">
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "16px" }}>Standardized Renal Biomarker Results</h3>
                {patientDetails?.lab_results?.length === 0 ? (
                  <p style={{ color: "#64748b" }}>No laboratory test measurements recorded yet for this patient.</p>
                ) : (
                  <table className="clickable-table">
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
                      {patientDetails?.lab_results?.map((t: any) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 700 }}>{t.test_name}</td>
                          <td style={{ color: "#64748b" }}>{t.category}</td>
                          <td style={{ fontWeight: 800 }}>{t.test_value} {t.unit}</td>
                          <td style={{ color: "#64748b" }}>{t.reference_range || "—"}</td>
                          <td style={{ color: "#0284c7", fontWeight: 600 }}>{t.loinc_code || "—"}</td>
                          <td>
                            <span className={`badge-chip ${t.status === "CRITICAL" ? "badge-chip--CKD" : t.status === "ELEVATED" ? "badge-chip--CKD" : "badge-chip--NOTCKD"}`}>
                              {t.status}
                            </span>
                          </td>
                          <td>{t.technician_name || "Lab Staff"}</td>
                          <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{new Date(t.recorded_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Sub-Tab 2: Deep Learning Predictions */}
            {activeDetailTab === "predictions" && (
              <div className="white-card">
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "16px" }}>Historical Multi-Model CKD Evaluations</h3>
                {patientDetails?.predictions?.length === 0 ? (
                  <p style={{ color: "#64748b" }}>No historical evaluations recorded yet. Run a New Clinical Intake to evaluate.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {patientDetails?.predictions?.map((pred: any) => (
                      <div key={pred.id} style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>{new Date(pred.created_at).toLocaleString()}</span>
                            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                              Verdict: <span style={{ color: pred.prediction_label === "ckd" ? "#dc2626" : "#16a34a" }}>{pred.prediction_label.toUpperCase()}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: pred.risk_score >= 50 ? "#dc2626" : "#0284c7" }}>
                              {pred.risk_score}%
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Diagnostic Risk Probability</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 3: Medical History & Order Lab Test */}
            {activeDetailTab === "history" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div className="white-card">
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "14px" }}>Patient Profile & Clinical Notes</h3>
                  <p><strong>Medical History:</strong> {patientDetails?.profile?.medical_history || "No documented pre-existing conditions recorded."}</p>
                  <p><strong>Known Allergies:</strong> {patientDetails?.profile?.allergies || "No known drug allergies (NKDA)."}</p>
                  <p><strong>Emergency Contact:</strong> {patientDetails?.profile?.emergency_contact || "+1-800-555-0199"}</p>
                </div>

                <div className="white-card">
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "14px" }}>Order Laboratory Test</h3>
                  {labSuccess && (
                    <div style={{ background: "#dcfce7", color: "#166534", padding: "10px", borderRadius: "8px", marginBottom: "12px", fontSize: "0.85rem" }}>
                      ✅ {labSuccess}
                    </div>
                  )}
                  <form onSubmit={handleLabRequestSubmit}>
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>Test Panel:</label>
                      <select
                        value={labTestType}
                        onChange={(e) => setLabTestType(e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                      >
                        <option value="Comprehensive Renal Panel">Comprehensive Renal Panel (eGFR, Cr, BUN, Na, K)</option>
                        <option value="Serum Creatinine + eGFR">Serum Creatinine + eGFR</option>
                        <option value="Urinary Protein / Albumin Excretion">Urinary Protein / Albumin Excretion</option>
                        <option value="Complete Blood Count (CBC)">Complete Blood Count (CBC)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>Clinical Priority:</label>
                      <select
                        value={labPriority}
                        onChange={(e: any) => setLabPriority(e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                      >
                        <option value="Routine">Routine</option>
                        <option value="Urgent">Urgent</option>
                        <option value="STAT">STAT (Immediate Priority)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>Physician Clinical Notes:</label>
                      <input
                        type="text"
                        placeholder="e.g. Rule out stage 3 progression; re-check electrolytes"
                        value={labNotes}
                        onChange={(e) => setLabNotes(e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                      />
                    </div>

                    <button
                      type="submit"
                      style={{
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: "8px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🚀 Send Order to Lab
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
              <div className="white-card">
                <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Total Assigned Patients</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0284c7", marginTop: "6px" }}>{stats.assigned_patient_count}</div>
              </div>
              <div className="white-card">
                <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>High Risk Patient Alerts</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#dc2626", marginTop: "6px" }}>{stats.high_risk_patient_count}</div>
              </div>
              <div className="white-card">
                <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Pending Lab Orders</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#ea580c", marginTop: "6px" }}>{stats.pending_lab_requests_count}</div>
              </div>
            </div>

            <div className="white-card">
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "14px" }}>Recent Patient Evaluations</h3>
              <table className="clickable-table">
                <thead>
                  <tr>
                    <th>Patient MRN</th>
                    <th>Prediction Verdict</th>
                    <th>Risk Probability</th>
                    <th>Recorded Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_predictions?.map((r: any) => (
                    <tr key={r.id} onClick={() => { setActiveSideNav("patients"); handleSelectPatientRow(r.patient_id); }} className="clickable-row">
                      <td style={{ fontWeight: 800, color: "#0284c7" }}>{r.patient_id}</td>
                      <td>
                        <span className={`badge-chip ${r.prediction_label === "ckd" ? "badge-chip--CKD" : "badge-chip--NOTCKD"}`}>
                          {r.prediction_label.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.risk_score}%</td>
                      <td style={{ color: "#64748b", fontSize: "0.82rem" }}>{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── D. CLINICAL ASSESSMENT (PATIENT FORM) ── */}
        {activeSideNav === "assessment" && (
          <PatientForm token={token} />
        )}

        {/* ── E. LONGITUDINAL EHR CHART ── */}
        {activeSideNav === "ehr" && (
          <UnifiedPatientEHR token={token} />
        )}

      </div>
    </div>
  );
}

