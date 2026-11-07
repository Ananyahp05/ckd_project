"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import FederatedDashboard from "./FederatedDashboard";

type Props = {
  token: string;
};

export default function AdminDashboard({ token }: Props) {
  const [activeSideNav, setActiveSideNav] = useState<"overview" | "doctors" | "patients" | "techs" | "invite" | "audit" | "federated">("doctors");
  const [stats, setStats] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [techs, setTechs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Selected Doctor details state
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [doctorDetails, setDoctorDetails] = useState<any>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);

  // Selected Patient details state
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetails, setPatientDetails] = useState<any>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [reassignDocId, setReassignDocId] = useState<string>("");

  // Staff Invite Form state
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"doctor" | "lab_technician">("doctor");
  const [inviteSpecialization, setInviteSpecialization] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Stats
      const resStats = await fetch(`${API_BASE_URL}/admin/overview-stats`, { headers });
      if (resStats.ok) setStats(await resStats.json());

      // Doctors
      const resDocs = await fetch(`${API_BASE_URL}/admin/doctors`, { headers });
      if (resDocs.ok) setDoctors(await resDocs.json());

      // Patients
      const resPts = await fetch(`${API_BASE_URL}/admin/patients`, { headers });
      if (resPts.ok) setPatients(await resPts.json());

      // Techs
      const resTechs = await fetch(`${API_BASE_URL}/admin/lab-technicians`, { headers });
      if (resTechs.ok) setTechs(await resTechs.json());

      // Audit
      const resAudit = await fetch(`${API_BASE_URL}/admin/audit-logs`, { headers });
      if (resAudit.ok) setAuditLogs(await resAudit.json());
    } catch (e) {
      console.error("Failed to load admin data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  // Click on a Doctor Row -> Load details & assigned patients
  const handleSelectDoctorRow = async (docId: number) => {
    setSelectedDoctorId(docId);
    setDoctorLoading(true);
    setDoctorDetails(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/doctors/${docId}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDoctorDetails(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDoctorLoading(false);
    }
  };

  // Click on a Patient Row -> Load details
  const handleSelectPatientRow = async (pId: string) => {
    setSelectedPatientId(pId);
    setPatientLoading(true);
    setPatientDetails(null);
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/patient/${encodeURIComponent(pId)}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPatientDetails(data);
        if (data.profile?.assigned_doctor_id) {
          setReassignDocId(String(data.profile.assigned_doctor_id));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPatientLoading(false);
    }
  };

  // Reassign Doctor to Patient
  const handleReassignDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !reassignDocId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/patients/${encodeURIComponent(selectedPatientId)}/assign-doctor`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ doctor_id: parseInt(reassignDocId) }),
      });
      if (res.ok) {
        alert("Patient successfully assigned to new attending physician!");
        loadData();
        handleSelectPatientRow(selectedPatientId);
      }
    } catch (e) {
      alert("Failed to reassign doctor");
    }
  };

  // Toggle Doctor Active / Deactivated Status
  const handleToggleDoctorStatus = async (userId: number, currentActive: boolean) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        loadData();
        if (selectedDoctorId === userId) handleSelectDoctorRow(userId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Submit Staff Invitation
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/invite-staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
          specialization: inviteSpecialization.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to invite staff member");
      }
      const data = await res.json();
      setInviteResult(data);
      setInviteName("");
      setInviteEmail("");
      setInviteSpecialization("");
      loadData();
    } catch (err: any) {
      setInviteError(err.message || "Failed to process invitation");
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: "24px", minHeight: "82vh", maxWidth: "1500px", margin: "0 auto" }}>
      <style>{`
        .admin-sidepanel {
          width: 270px;
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
        .admin-side-item {
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
        .admin-side-item:hover {
          background: #f0f9ff;
          color: #0284c7;
        }
        .admin-side-item--active {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: #ffffff !important;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);
        }
        .admin-content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        .admin-white-card {
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          padding: 24px;
          color: #0f172a;
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
        }
        .admin-table th {
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
        .admin-table td {
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
        .status-badge-active { background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 50px; font-weight: 700; font-size: 0.72rem; }
        .status-badge-deact { background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 50px; font-weight: 700; font-size: 0.72rem; }
        .status-badge-pending { background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 50px; font-weight: 700; font-size: 0.72rem; }
      `}</style>

      {/* ── 1. LEFT SIDEPANEL ── */}
      <aside className="admin-sidepanel">
        <div className="sidepanel-brand">
          <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Hospital Governance
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
            Admin Console
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
            MetroHealth Institute
          </div>
        </div>

        <button
          onClick={() => { setActiveSideNav("doctors"); setSelectedDoctorId(null); }}
          className={`admin-side-item ${activeSideNav === "doctors" ? "admin-side-item--active" : ""}`}
        >
          <span>👨‍⚕️</span>
          <span>Doctors ({doctors.length})</span>
        </button>

        <button
          onClick={() => { setActiveSideNav("patients"); setSelectedPatientId(null); }}
          className={`admin-side-item ${activeSideNav === "patients" ? "admin-side-item--active" : ""}`}
        >
          <span>👥</span>
          <span>Patients ({patients.length})</span>
        </button>

        <button
          onClick={() => setActiveSideNav("overview")}
          className={`admin-side-item ${activeSideNav === "overview" ? "admin-side-item--active" : ""}`}
        >
          <span>📊</span>
          <span>Hospital Overview</span>
        </button>

        <button
          onClick={() => setActiveSideNav("techs")}
          className={`admin-side-item ${activeSideNav === "techs" ? "admin-side-item--active" : ""}`}
        >
          <span>🧪</span>
          <span>Lab Technicians ({techs.length})</span>
        </button>

        <button
          onClick={() => setActiveSideNav("invite")}
          className={`admin-side-item ${activeSideNav === "invite" ? "admin-side-item--active" : ""}`}
        >
          <span>➕</span>
          <span>Invite Staff</span>
        </button>

        <button
          onClick={() => setActiveSideNav("federated")}
          className={`admin-side-item ${activeSideNav === "federated" ? "admin-side-item--active" : ""}`}
        >
          <span>⚙</span>
          <span>Federated Learning</span>
        </button>

        <button
          onClick={() => setActiveSideNav("audit")}
          className={`admin-side-item ${activeSideNav === "audit" ? "admin-side-item--active" : ""}`}
        >
          <span>📁</span>
          <span>Activity & Audit Logs</span>
        </button>
      </aside>

      {/* ── 2. MAIN ADMIN CONTENT AREA ── */}
      <div className="admin-content-area">
        
        {/* ── A. DOCTORS ROSTER (1 ROW PER DOCTOR -> CLICK ROW FOR DETAILS) ── */}
        {activeSideNav === "doctors" && !selectedDoctorId && (
          <div className="admin-white-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Hospital Medical Staff & Doctors Roster
                </h2>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0 0" }}>
                  Each doctor is displayed in a clean row. <strong>Click any doctor row</strong> to view their full profile and assigned patients list.
                </p>
              </div>

              <button
                onClick={() => setActiveSideNav("invite")}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                ➕ Invite New Doctor
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Doctor ID</th>
                    <th>Doctor Name</th>
                    <th>Email Address</th>
                    <th>Status</th>
                    <th>Assigned Patients Count</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => handleSelectDoctorRow(d.id)}
                      className="clickable-row"
                    >
                      <td style={{ fontWeight: 800, color: "#0284c7" }}>#{d.id}</td>
                      <td style={{ fontWeight: 700, color: "#0f172a" }}>{d.full_name}</td>
                      <td style={{ color: "#475569" }}>{d.email}</td>
                      <td>
                        <span className={d.is_active ? "status-badge-active" : "status-badge-deact"}>
                          {d.account_status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: "#0284c7" }}>
                        {d.assigned_patient_count} patients
                      </td>
                      <td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectDoctorRow(d.id);
                          }}
                          style={{
                            background: "#f1f5f9",
                            color: "#0369a1",
                            border: "1px solid #cbd5e1",
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
          </div>
        )}

        {/* ── DOCTOR DETAILS VIEW (WHEN A DOCTOR ROW IS CLICKED) ── */}
        {activeSideNav === "doctors" && selectedDoctorId && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="admin-white-card">
              <button
                onClick={() => setSelectedDoctorId(null)}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "#334155",
                  cursor: "pointer",
                  marginBottom: "12px",
                }}
              >
                &larr; Back to Doctors Roster
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    {doctorDetails?.doctor?.full_name}
                  </h2>
                  <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                    Email: <strong>{doctorDetails?.doctor?.email}</strong> &bull; Total Assigned Patients: <strong>{doctorDetails?.assigned_patients?.length || 0}</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleDoctorStatus(doctorDetails.doctor.id, doctorDetails.doctor.is_active)}
                  style={{
                    background: doctorDetails?.doctor?.is_active ? "#fee2e2" : "#dcfce7",
                    color: doctorDetails?.doctor?.is_active ? "#991b1b" : "#166534",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "10px",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {doctorDetails?.doctor?.is_active ? "🚫 Deactivate Account" : "✅ Activate Account"}
                </button>
              </div>
            </div>

            {/* Assigned Patients Table for this Doctor */}
            <div className="admin-white-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", marginBottom: "14px" }}>
                Patients Assigned to {doctorDetails?.doctor?.full_name}
              </h3>

              {doctorDetails?.assigned_patients?.length === 0 ? (
                <p style={{ color: "#64748b" }}>No patients currently assigned to this physician.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Patient MRN</th>
                      <th>Patient Name</th>
                      <th>Age / Gender</th>
                      <th>Latest Diagnosis Status</th>
                      <th>Risk Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorDetails?.assigned_patients?.map((p: any) => (
                      <tr key={p.patient_id}>
                        <td style={{ fontWeight: 800, color: "#0284c7" }}>{p.patient_id}</td>
                        <td style={{ fontWeight: 700 }}>{p.full_name}</td>
                        <td>{p.age} yrs &bull; {p.gender}</td>
                        <td style={{ fontWeight: 700, color: p.latest_prediction === "ckd" ? "#dc2626" : "#166534" }}>
                          {p.latest_prediction.toUpperCase()}
                        </td>
                        <td style={{ fontWeight: 800 }}>{p.risk_score !== null ? `${p.risk_score}%` : "—"}</td>
                        <td><span className="status-badge-active">{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── B. PATIENTS DIRECTORY (1 ROW PER PATIENT -> CLICK ROW FOR DETAILS) ── */}
        {activeSideNav === "patients" && !selectedPatientId && (
          <div className="admin-white-card">
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>
              Hospital Master Patient Directory
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 20px 0" }}>
              Comprehensive patient registry. <strong>Click any patient row</strong> to inspect clinical records and manage attending physician assignments.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Patient MRN / ID</th>
                    <th>Full Legal Name</th>
                    <th>Age / Gender</th>
                    <th>Attending Physician</th>
                    <th>Registration Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr
                      key={p.patient_id}
                      onClick={() => handleSelectPatientRow(p.patient_id)}
                      className="clickable-row"
                    >
                      <td style={{ fontWeight: 800, color: "#0284c7" }}>{p.patient_id}</td>
                      <td style={{ fontWeight: 700, color: "#0f172a" }}>{p.full_name}</td>
                      <td>{p.age ? `${p.age} yrs` : "—"} &bull; {p.gender}</td>
                      <td style={{ fontWeight: 600, color: "#0369a1" }}>
                        {p.assigned_doctor_name || "Unassigned"}
                      </td>
                      <td style={{ color: "#64748b", fontSize: "0.82rem" }}>
                        {p.registration_date ? new Date(p.registration_date).toLocaleDateString() : "—"}
                      </td>
                      <td><span className="status-badge-active">{p.status}</span></td>
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
          </div>
        )}

        {/* ── PATIENT DETAILS VIEW (WHEN A PATIENT ROW IS CLICKED) ── */}
        {activeSideNav === "patients" && selectedPatientId && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="admin-white-card">
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
                  marginBottom: "12px",
                }}
              >
                &larr; Back to Patient Directory
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    {patientDetails?.profile?.full_name || selectedPatientId}
                  </h2>
                  <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                    MRN: <strong>{selectedPatientId}</strong> &bull; Attending Physician: <strong>{patientDetails?.profile?.assigned_doctor_name || "Unassigned"}</strong>
                  </div>
                </div>

                {/* Doctor Reassignment Dropdown */}
                <form onSubmit={handleReassignDoctor} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <select
                    value={reassignDocId}
                    onChange={(e) => setReassignDocId(e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  >
                    <option value="">-- Assign Doctor --</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    style={{
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Assign Physician
                  </button>
                </form>
              </div>
            </div>

            {/* Test Results and Predictions for this Patient */}
            <div className="admin-white-card">
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "14px" }}>Laboratory Tests & Biomarkers</h3>
              {patientDetails?.lab_results?.length === 0 ? (
                <p style={{ color: "#64748b" }}>No laboratory records found for this patient.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Biomarker Test</th>
                      <th>Category</th>
                      <th>Measured Value</th>
                      <th>Reference Range</th>
                      <th>Status</th>
                      <th>Recorded At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientDetails?.lab_results?.map((t: any) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 700 }}>{t.test_name}</td>
                        <td>{t.category}</td>
                        <td style={{ fontWeight: 800 }}>{t.test_value} {t.unit}</td>
                        <td>{t.reference_range}</td>
                        <td><span className="status-badge-active">{t.status}</span></td>
                        <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{new Date(t.recorded_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── C. HOSPITAL OVERVIEW STATS ── */}
        {activeSideNav === "overview" && stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div className="admin-white-card">
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Total Doctors</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0284c7", marginTop: "4px" }}>{stats.stats.total_doctors}</div>
              </div>
              <div className="admin-white-card">
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Total Patients</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#059669", marginTop: "4px" }}>{stats.stats.total_patients}</div>
              </div>
              <div className="admin-white-card">
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Lab Technicians</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#d97706", marginTop: "4px" }}>{stats.stats.total_lab_technicians}</div>
              </div>
              <div className="admin-white-card">
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Active Users</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#4f46e5", marginTop: "4px" }}>{stats.stats.active_users}</div>
              </div>
            </div>

            <div className="admin-white-card">
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "14px" }}>Recent Security & Activity Trail</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Details</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_activities?.map((a: any) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 700 }}>{a.user_email}</td>
                      <td><span className="status-badge-active">{a.role}</span></td>
                      <td style={{ fontWeight: 600 }}>{a.action}</td>
                      <td style={{ color: "#0284c7" }}>{a.resource || "—"}</td>
                      <td style={{ fontSize: "0.82rem", color: "#475569" }}>{a.details}</td>
                      <td style={{ fontSize: "0.78rem", color: "#64748b" }}>{new Date(a.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── D. LAB TECHNICIANS ── */}
        {activeSideNav === "techs" && (
          <div className="admin-white-card">
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", marginBottom: "16px" }}>
              Laboratory Staff Roster
            </h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Staff ID</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {techs.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 800, color: "#0284c7" }}>#{t.id}</td>
                    <td style={{ fontWeight: 700 }}>{t.full_name}</td>
                    <td>{t.email}</td>
                    <td><span className={t.is_active ? "status-badge-active" : "status-badge-deact"}>{t.account_status.toUpperCase()}</span></td>
                    <td>{t.role}</td>
                    <td>
                      <button
                        onClick={() => handleToggleDoctorStatus(t.id, t.is_active)}
                        style={{
                          background: t.is_active ? "#fee2e2" : "#dcfce7",
                          color: t.is_active ? "#991b1b" : "#166534",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {t.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── E. INVITE STAFF ── */}
        {activeSideNav === "invite" && (
          <div className="admin-white-card" style={{ maxWidth: "600px" }}>
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", marginBottom: "6px" }}>
              Invite Authorized Clinical Staff
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "20px" }}>
              Provision an official Doctor or Laboratory Technician account. A one-time, 48-hour secure setup link will be generated.
            </p>

            {inviteError && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontWeight: 600 }}>
                ⚠️ {inviteError}
              </div>
            )}
            {inviteResult && (
              <div style={{ background: "#dcfce7", color: "#166534", padding: "16px", borderRadius: "10px", marginBottom: "20px" }}>
                <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>✅ Invitation Successfully Generated!</div>
                <div style={{ fontSize: "0.85rem", marginTop: "6px" }}>
                  Staff: <strong>{inviteResult.full_name}</strong> ({inviteResult.email}) &bull; Role: <strong>{inviteResult.role}</strong>
                </div>
                <div style={{ marginTop: "10px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>One-Time Password Setup Link:</label>
                  <input
                    type="text"
                    readOnly
                    value={inviteResult.invitation_link}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #86efac", background: "#f0fdf4", fontSize: "0.82rem", marginTop: "4px" }}
                  />
                </div>
              </div>
            )}

            <form onSubmit={handleInviteSubmit}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "4px" }}>Full Legal Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Arthur Pendelton"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "4px" }}>Official Email Address:</label>
                <input
                  type="email"
                  placeholder="e.g. arthur.p@metrohealth.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "4px" }}>Assigned Role:</label>
                <select
                  value={inviteRole}
                  onChange={(e: any) => setInviteRole(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                >
                  <option value="doctor">Doctor / Physician</option>
                  <option value="lab_technician">Laboratory Technician</option>
                </select>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "4px" }}>Medical Specialization (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. Nephrology & Renal Care"
                  value={inviteSpecialization}
                  onChange={(e) => setInviteSpecialization(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <button
                type="submit"
                disabled={inviteLoading}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                {inviteLoading ? "Generating Invitation..." : "Send Staff Invitation Link"}
              </button>
            </form>
          </div>
        )}

        {/* ── F. FEDERATED LEARNING ── */}
        {activeSideNav === "federated" && (
          <FederatedDashboard token={token} />
        )}

        {/* ── G. AUDIT LOGS ── */}
        {activeSideNav === "audit" && (
          <div className="admin-white-card">
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", marginBottom: "16px" }}>
              Hospital Security & Cryptographic Audit Logs
            </h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>User Identity</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Target Resource</th>
                  <th>Details</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 800, color: "#0284c7" }}>#{log.id}</td>
                    <td style={{ fontWeight: 700 }}>{log.user_email || "System"}</td>
                    <td><span className="status-badge-active">{log.role}</span></td>
                    <td style={{ fontWeight: 600 }}>{log.action}</td>
                    <td style={{ color: "#0284c7" }}>{log.resource || "—"}</td>
                    <td style={{ fontSize: "0.82rem", color: "#475569" }}>{log.details}</td>
                    <td style={{ fontSize: "0.78rem", color: "#64748b" }}>{new Date(log.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}

