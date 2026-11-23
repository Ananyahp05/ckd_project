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
    <div className="clinical-shell-container">
      {/* ── 1. LEFT SIDEPANEL: EXTENDS FLUSH TO FOOTER (NO FLOATING CARD) ── */}
      <aside className="clinical-sidebar">
        <div className="sidebar-brand-block">
          <div className="sidebar-brand-tag">
            Hospital Administration
          </div>
          <div className="sidebar-brand-name">
            Admin Console
          </div>
          <div className="sidebar-brand-dept">
            Clinical Governance & Security
          </div>
        </div>

        <button
          onClick={() => { setActiveSideNav("doctors"); setSelectedDoctorId(null); }}
          className={`sidebar-nav-item ${activeSideNav === "doctors" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>👨‍⚕️</span>
          <span>Doctors ({doctors.length})</span>
        </button>

        <button
          onClick={() => { setActiveSideNav("patients"); setSelectedPatientId(null); }}
          className={`sidebar-nav-item ${activeSideNav === "patients" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>👥</span>
          <span>Patients ({patients.length})</span>
        </button>

        <button
          onClick={() => setActiveSideNav("overview")}
          className={`sidebar-nav-item ${activeSideNav === "overview" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>📊</span>
          <span>Hospital Overview</span>
        </button>

        <button
          onClick={() => setActiveSideNav("techs")}
          className={`sidebar-nav-item ${activeSideNav === "techs" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>🧪</span>
          <span>Lab Technicians ({techs.length})</span>
        </button>

        <button
          onClick={() => setActiveSideNav("invite")}
          className={`sidebar-nav-item ${activeSideNav === "invite" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>➕</span>
          <span>Invite Staff</span>
        </button>

        <button
          onClick={() => setActiveSideNav("federated")}
          className={`sidebar-nav-item ${activeSideNav === "federated" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>⚙</span>
          <span>Federated Learning</span>
        </button>

        <button
          onClick={() => setActiveSideNav("audit")}
          className={`sidebar-nav-item ${activeSideNav === "audit" ? "sidebar-nav-item--active" : ""}`}
        >
          <span style={{ fontSize: "1rem" }}>📁</span>
          <span>Activity & Audit Logs</span>
        </button>
      </aside>

      {/* ── 2. FLUID CLINICAL CONTENT AREA ── */}
      <div className="clinical-content-area">
        
        {/* ── A. DOCTORS ROSTER (1 ROW PER DOCTOR -> CLICK ROW FOR DETAILS) ── */}
        {activeSideNav === "doctors" && !selectedDoctorId && (
          <div className="clinical-panel">
            <div className="clinical-panel-header">
              <div>
                <h2 className="panel-title">
                  Hospital Medical Staff & Doctors Roster
                </h2>
                <p className="panel-description">
                  Each doctor is displayed in a clean row. Click any row to view their profile, active status, and assigned patients.
                </p>
              </div>

              <button
                onClick={() => setActiveSideNav("invite")}
                className="btn-primary-teal"
              >
                + Invite New Doctor
              </button>
            </div>

            <div className="clinical-table-container">
              <table className="clinical-table">
                <thead>
                  <tr>
                    <th>Doctor ID</th>
                    <th>Doctor Name</th>
                    <th>Email Address</th>
                    <th>Status</th>
                    <th>Assigned Patients</th>
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
                      <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                        #{d.id}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {d.full_name}
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>
                        {d.email}
                      </td>
                      <td>
                        <span className={`badge-clinical ${d.is_active ? "badge-clinical--low" : "badge-clinical--high"}`}>
                          {d.account_status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)" }}>
                        {d.assigned_patient_count} patients
                      </td>
                      <td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectDoctorRow(d.id);
                          }}
                          className="btn-secondary"
                          style={{ fontSize: "0.78rem", padding: "5px 12px" }}
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
            <div className="clinical-panel">
              <button
                onClick={() => setSelectedDoctorId(null)}
                className="btn-secondary"
                style={{ marginBottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                &larr; Back to Doctors Roster
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {doctorDetails?.doctor?.full_name}
                  </h2>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    Email: <strong style={{ color: "var(--text-primary)" }}>{doctorDetails?.doctor?.email}</strong> &bull; Total Assigned Patients: <strong style={{ color: "var(--color-primary-accent)" }}>{doctorDetails?.assigned_patients?.length || 0}</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleDoctorStatus(doctorDetails.doctor.id, doctorDetails.doctor.is_active)}
                  className="btn-secondary"
                  style={{
                    color: doctorDetails?.doctor?.is_active ? "var(--risk-high)" : "var(--risk-low)",
                    borderColor: doctorDetails?.doctor?.is_active ? "var(--risk-high-border)" : "var(--risk-low-border)",
                    fontWeight: 600
                  }}
                >
                  {doctorDetails?.doctor?.is_active ? "Deactivate Account" : "Activate Account"}
                </button>
              </div>
            </div>

            {/* Assigned Patients Table for this Doctor */}
            <div className="clinical-panel">
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
                Patients Assigned to {doctorDetails?.doctor?.full_name}
              </h3>

              {doctorDetails?.assigned_patients?.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>No patients currently assigned to this physician.</p>
              ) : (
                <div className="clinical-table-container">
                  <table className="clinical-table">
                    <thead>
                      <tr>
                        <th>Patient MRN</th>
                        <th>Patient Name</th>
                        <th>Age / Gender</th>
                        <th>Latest Diagnosis</th>
                        <th>Risk Score</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctorDetails?.assigned_patients?.map((p: any) => {
                        const isCkd = p.latest_prediction === "ckd";
                        return (
                          <tr key={p.patient_id}>
                            <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                              {p.patient_id}
                            </td>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.full_name}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{p.age} yrs &bull; {p.gender}</td>
                            <td>
                              <span className={`badge-clinical ${isCkd ? "badge-clinical--high" : "badge-clinical--low"}`}>
                                {p.latest_prediction.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                              {p.risk_score !== null ? `${Number(p.risk_score).toFixed(1)}%` : "—"}
                            </td>
                            <td>
                              <span className="badge-clinical badge-clinical--low">{p.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── B. PATIENTS DIRECTORY (1 ROW PER PATIENT -> CLICK ROW FOR DETAILS) ── */}
        {activeSideNav === "patients" && !selectedPatientId && (
          <div className="clinical-panel">
            <div className="clinical-panel-header">
              <div>
                <h2 className="panel-title">
                  Hospital Master Patient Directory
                </h2>
                <p className="panel-description">
                  Comprehensive patient registry. Click any patient row to inspect records and manage physician assignments.
                </p>
              </div>
            </div>

            <div className="clinical-table-container">
              <table className="clinical-table">
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
                      <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                        {p.patient_id}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.full_name}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.age ? `${p.age} yrs` : "—"} &bull; {p.gender}</td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {p.assigned_doctor_name || "Unassigned"}
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                        {p.registration_date ? new Date(p.registration_date).toLocaleDateString() : "—"}
                      </td>
                      <td>
                        <span className="badge-clinical badge-clinical--low">{p.status}</span>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PATIENT DETAILS VIEW (WHEN A PATIENT ROW IS CLICKED) ── */}
        {activeSideNav === "patients" && selectedPatientId && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="clinical-panel">
              <button
                onClick={() => setSelectedPatientId(null)}
                className="btn-secondary"
                style={{ marginBottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                &larr; Back to Patient Directory
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {patientDetails?.profile?.full_name || selectedPatientId}
                  </h2>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    MRN: <strong style={{ color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>{selectedPatientId}</strong> &bull; Attending Physician: <strong style={{ color: "var(--text-primary)" }}>{patientDetails?.profile?.assigned_doctor_name || "Unassigned"}</strong>
                  </div>
                </div>

                {/* Doctor Reassignment Dropdown */}
                <form onSubmit={handleReassignDoctor} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <select
                    value={reassignDocId}
                    onChange={(e) => setReassignDocId(e.target.value)}
                    className="clinical-input"
                    style={{ width: "200px" }}
                  >
                    <option value="">-- Assign Doctor --</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn-primary-teal"
                  >
                    Assign Physician
                  </button>
                </form>
              </div>
            </div>

            {/* Test Results and Predictions for this Patient */}
            <div className="clinical-panel">
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
                Laboratory Tests & Standardized Biomarkers
              </h3>
              {patientDetails?.lab_results?.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>No laboratory records found for this patient.</p>
              ) : (
                <div className="clinical-table-container">
                  <table className="clinical-table">
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
                          <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.test_name}</td>
                          <td style={{ color: "var(--text-muted)" }}>{t.category}</td>
                          <td style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)" }}>
                            {t.test_value} {t.unit}
                          </td>
                          <td style={{ color: "var(--text-muted)" }}>{t.reference_range}</td>
                          <td>
                            <span className="badge-clinical badge-clinical--low">{t.status}</span>
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{new Date(t.recorded_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── C. HOSPITAL OVERVIEW STATS ── */}
        {activeSideNav === "overview" && stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Total Doctors
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--color-primary-accent)", marginTop: "4px" }}>
                  {stats.stats.total_doctors}
                </div>
              </div>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Total Patients
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--risk-low)", marginTop: "4px" }}>
                  {stats.stats.total_patients}
                </div>
              </div>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Lab Technicians
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)", marginTop: "4px" }}>
                  {stats.stats.total_lab_technicians}
                </div>
              </div>
              <div className="clinical-panel">
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Active Users
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)", marginTop: "4px" }}>
                  {stats.stats.active_users}
                </div>
              </div>
            </div>

            <div className="clinical-panel">
              <h3 className="panel-title" style={{ fontSize: "1.1rem", marginBottom: "14px" }}>
                Recent Security & Activity Trail
              </h3>
              <div className="clinical-table-container">
                <table className="clinical-table">
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
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{a.user_email}</td>
                        <td>
                          <span className="badge-clinical badge-clinical--neutral">{a.role}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.action}</td>
                        <td style={{ color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                          {a.resource || "—"}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{a.details}</td>
                        <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{new Date(a.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── D. LAB TECHNICIANS ── */}
        {activeSideNav === "techs" && (
          <div className="clinical-panel">
            <h2 className="panel-title" style={{ marginBottom: "16px" }}>
              Laboratory Staff Roster
            </h2>
            <div className="clinical-table-container">
              <table className="clinical-table">
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
                      <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                        #{t.id}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.full_name}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{t.email}</td>
                      <td>
                        <span className={`badge-clinical ${t.is_active ? "badge-clinical--low" : "badge-clinical--high"}`}>
                          {t.account_status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>{t.role}</td>
                      <td>
                        <button
                          onClick={() => handleToggleDoctorStatus(t.id, t.is_active)}
                          className="btn-secondary"
                          style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                        >
                          {t.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── E. INVITE STAFF ── */}
        {activeSideNav === "invite" && (
          <div className="clinical-panel" style={{ maxWidth: "560px" }}>
            <h2 className="panel-title" style={{ marginBottom: "4px" }}>
              Invite Authorized Clinical Staff
            </h2>
            <p className="panel-description" style={{ marginBottom: "20px" }}>
              Provision an official Doctor or Laboratory Technician account. A one-time, 48-hour secure setup link will be generated.
            </p>

            {inviteError && (
              <div style={{ background: "var(--risk-high-bg)", color: "var(--risk-high)", border: "1px solid var(--risk-high-border)", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontWeight: 600, fontSize: "0.85rem" }}>
                {inviteError}
              </div>
            )}
            {inviteResult && (
              <div style={{ background: "var(--risk-low-bg)", color: "var(--risk-low)", border: "1px solid var(--risk-low-border)", padding: "14px", borderRadius: "6px", marginBottom: "20px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Invitation Successfully Generated</div>
                <div style={{ fontSize: "0.82rem", marginTop: "4px", color: "var(--text-primary)" }}>
                  Staff: <strong>{inviteResult.full_name}</strong> ({inviteResult.email}) &bull; Role: <strong>{inviteResult.role}</strong>
                </div>
                <div style={{ marginTop: "10px" }}>
                  <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>One-Time Password Setup Link:</label>
                  <input
                    type="text"
                    readOnly
                    value={inviteResult.invitation_link}
                    className="clinical-input"
                    style={{ fontSize: "0.8rem", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}
                  />
                </div>
              </div>
            )}

            <form onSubmit={handleInviteSubmit}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Full Legal Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Arthur Pendelton"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="clinical-input"
                  required
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Official Email Address:</label>
                <input
                  type="email"
                  placeholder="e.g. doctor@hospital.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="clinical-input"
                  required
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Assigned Role:</label>
                <select
                  value={inviteRole}
                  onChange={(e: any) => setInviteRole(e.target.value)}
                  className="clinical-input"
                >
                  <option value="doctor">Doctor / Physician</option>
                  <option value="lab_technician">Laboratory Technician</option>
                </select>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Medical Specialization (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. Renal & Kidney Care"
                  value={inviteSpecialization}
                  onChange={(e) => setInviteSpecialization(e.target.value)}
                  className="clinical-input"
                />
              </div>

              <button
                type="submit"
                disabled={inviteLoading}
                className="btn-primary-teal"
                style={{ width: "100%", padding: "10px" }}
              >
                {inviteLoading ? "Generating Invitation..." : "Send Staff Invitation Link"}
              </button>
            </form>
          </div>
        )}

        {/* ── F. FEDERATED LEARNING ── */}
        {activeSideNav === "federated" && (
          <div className="clinical-panel">
            <FederatedDashboard token={token} />
          </div>
        )}

        {/* ── G. AUDIT LOGS ── */}
        {activeSideNav === "audit" && (
          <div className="clinical-panel">
            <h2 className="panel-title" style={{ marginBottom: "16px" }}>
              Hospital Security & Cryptographic Audit Logs
            </h2>
            <div className="clinical-table-container">
              <table className="clinical-table">
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
                      <td style={{ fontWeight: 700, color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                        #{log.id}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{log.user_email || "System"}</td>
                      <td>
                        <span className="badge-clinical badge-clinical--neutral">{log.role}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{log.action}</td>
                      <td style={{ color: "var(--color-primary-accent)", fontFamily: "JetBrains Mono, monospace" }}>
                        {log.resource || "—"}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{log.details}</td>
                      <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
