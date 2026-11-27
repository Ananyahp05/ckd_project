"use client";

import { API_BASE_URL } from "@/lib/api";
import React, { useState, useEffect } from "react";

type UserItem = {
  id: number;
  username: string;
  role: "Doctor" | "Admin" | "Patient";
  is_active: boolean;
};

type AssignmentItem = {
  id: number;
  doctor_id: number;
  doctor_username: string;
  patient_id: string;
  assigned_by: string;
  created_at: string | null;
};

type DoctorSimple = {
  id: number;
  username: string;
};

type UserManagementProps = {
  token: string;
};

export default function UserManagement({ token }: UserManagementProps) {
  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Doctor-Patient assignments state
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [doctorsList, setDoctorsList] = useState<DoctorSimple[]>([]);
  const [patientsList, setPatientsList] = useState<string[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | "">("");
  const [targetPatientId, setTargetPatientId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to load user registry");
      }
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setErrorMsg(err.message ?? "Connection to backend failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    try {
      const [assignRes, docsRes, patientsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/assignments`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/doctors-list`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/patients-list`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (assignRes.ok) {
        const assignData = await assignRes.json();
        setAssignments(assignData);
      }
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDoctorsList(docsData);
        if (docsData.length > 0 && selectedDoctorId === "") {
          setSelectedDoctorId(docsData[0].id);
        }
      }
      if (patientsRes.ok) {
        const patData = await patientsRes.json();
        setPatientsList(patData);
        if (patData.length > 0 && !targetPatientId) {
          setTargetPatientId(patData[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load doctor-patient assignments:", e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchAssignments();
  }, [token]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    setUpdatingId(userId);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to update role");
      }
      const updatedUser = await res.json();
      setUsers(prev => prev.map(u => (u.id === userId ? updatedUser : u)));
      fetchAssignments(); // Refresh doctor list if a doctor was promoted/demoted
    } catch (err: any) {
      alert(`Role update error: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusToggle = async (userId: number, currentStatus: boolean) => {
    setUpdatingId(userId);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to update account status");
      }
      const updatedUser = await res.json();
      setUsers(prev => prev.map(u => (u.id === userId ? updatedUser : u)));
    } catch (err: any) {
      alert(`Status update error: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !targetPatientId.trim()) {
      setAssignMsg({ type: "error", text: "Please select both a physician and a patient identifier." });
      return;
    }
    setAssignLoading(true);
    setAssignMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/assignments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctor_id: Number(selectedDoctorId),
          patient_id: targetPatientId.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to create assignment");
      }

      setAssignMsg({ type: "success", text: data.message || "Assignment granted successfully." });
      fetchAssignments();
    } catch (err: any) {
      setAssignMsg({ type: "error", text: err.message || "Assignment failed." });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRevokeAssignment = async (assignmentId: number) => {
    if (!confirm("Revoke this doctor's authorization to access this patient's records?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/assignments/${assignmentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to revoke assignment");
      }
    } catch (e: any) {
      alert(e.message || "Failed to revoke assignment");
    }
  };

  const filteredUsers = users.filter(
    u =>
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <style>{`
        .user-mgmt-panel {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .mgmt-card {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 20px;
          padding: 26px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .mgmt-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.85rem;
        }
        .mgmt-table th {
          text-align: left;
          padding: 12px 14px;
          color: #94a3b8;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.72rem;
          letter-spacing: 0.05em;
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        }
        .mgmt-table td {
          padding: 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.08);
          color: #cbd5e1;
        }
        .mgmt-table tr:hover td {
          background: rgba(30, 41, 59, 0.35);
        }
        .role-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 50px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.03em;
        }
        .role-badge--Doctor {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }
        .role-badge--Admin {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .role-badge--Patient {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .role-select-inline {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.2);
          color: #e2e8f0;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 0.78rem;
          outline: none;
          cursor: pointer;
        }
        .status-toggle-btn {
          border: none;
          padding: 5px 12px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .status-toggle-btn--active {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .status-toggle-btn--active:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.3);
        }
        .status-toggle-btn--inactive {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .status-toggle-btn--inactive:hover {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border-color: rgba(34, 197, 94, 0.3);
        }
        .assign-input {
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 9px 12px;
          color: var(--text-primary);
          font-size: 0.85rem;
          outline: none;
        }
        .assign-input:focus {
          border-color: var(--color-primary-accent);
          box-shadow: 0 0 0 3px var(--color-primary-subtle);
        }
        .btn-assign-action {
          background: var(--color-primary-accent);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 9px 18px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .btn-assign-action:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }
        .btn-assign-action:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .revoke-btn {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .revoke-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
        }
      `}</style>

      <div className="user-mgmt-panel">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, background: "linear-gradient(135deg, #a5b4fc, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "0 0 6px 0" }}>
              👥 Clinical RBAC & Access Delegation
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
              Hospital Administrator Control: Authorize clinical roles, isolate patient records, and govern doctor-patient assignments.
            </p>
          </div>
        </div>

        {/* ── CARD 1: DOCTOR-PATIENT ACCESS DELEGATION (ADMIN CONTROLLED) ── */}
        <div className="mgmt-card" style={{ borderColor: "rgba(99, 102, 241, 0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "1.3rem" }}>🩺</span>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
              Doctor-Patient Clinical Access Assignments
            </h3>
            <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "12px", background: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc", border: "1px solid rgba(99, 102, 241, 0.4)" }}>
              Strict RBAC Isolation
            </span>
          </div>
          <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "20px" }}>
            Designate authorized physicians to access specific patient records. Doctors are strictly restricted to evaluating and viewing records for their assigned cohort.
          </p>

          {/* Assignment Creation Form */}
          <form onSubmit={handleCreateAssignment} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", background: "rgba(30, 41, 59, 0.4)", padding: "16px", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.1)", marginBottom: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                Select Physician (Doctor)
              </label>
              <select
                value={selectedDoctorId}
                onChange={e => setSelectedDoctorId(Number(e.target.value))}
                className="assign-input"
                required
              >
                {doctorsList.length === 0 && <option value="">No registered doctors</option>}
                {doctorsList.map(d => (
                  <option key={d.id} value={d.id}>Dr. {d.username} (ID: #{d.id})</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "240px", flex: 1 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                Patient Identifier / Medical Record Number
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={targetPatientId}
                  onChange={e => setTargetPatientId(e.target.value)}
                  placeholder="e.g. PT-101 or patient1@gmail.com"
                  className="assign-input"
                  style={{ flex: 1 }}
                  required
                />
                {patientsList.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) setTargetPatientId(e.target.value); }}
                    className="assign-input"
                    style={{ maxWidth: "160px" }}
                  >
                    <option value="">Quick select...</option>
                    {patientsList.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <button type="submit" disabled={assignLoading} className="btn-assign-action">
              {assignLoading ? "Granting..." : "➕ Grant Doctor Access"}
            </button>
          </form>

          {assignMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "0.82rem",
                marginBottom: "16px",
                background: assignMsg.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                border: `1px solid ${assignMsg.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                color: assignMsg.type === "success" ? "#4ade80" : "#f87171",
              }}
            >
              {assignMsg.type === "success" ? "✔" : "⚠"} {assignMsg.text}
            </div>
          )}

          {/* Active Assignments Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th>Authorized Physician</th>
                  <th>Assigned Patient ID</th>
                  <th>Delegated By</th>
                  <th>Date Assigned</th>
                  <th style={{ textAlign: "right" }}>Revoke Access</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "#64748b", padding: "24px" }}>
                      No doctor-patient assignments recorded yet. Use the form above to grant access.
                    </td>
                  </tr>
                ) : (
                  assignments.map(a => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{ color: "#a5b4fc" }}>⚕ Dr. {a.doctor_username}</strong>
                      </td>
                      <td>
                        <span style={{ padding: "3px 8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px", fontFamily: "monospace", color: "#f1f5f9" }}>
                          {a.patient_id}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.76rem", color: "#94a3b8" }}>{a.assigned_by}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                          {a.created_at ? new Date(a.created_at).toLocaleDateString() : "Active"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          onClick={() => handleRevokeAssignment(a.id)}
                          className="revoke-btn"
                          title="Revoke physician access to this patient"
                        >
                          Revoke Access
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── CARD 2: USER REGISTRY & ROLE ASSIGNMENT ── */}
        <div className="mgmt-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px 0" }}>
                User Accounts & Clinical Roles
              </h3>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                Adjust roles between Doctor, Patient, and Admin, or deactivate credentials.
              </p>
            </div>

            <input
              type="text"
              placeholder="Search users or roles..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="assign-input"
              style={{ minWidth: "220px" }}
            />
          </div>

          {errorMsg && (
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", fontSize: "0.85rem", marginBottom: "16px" }}>
              ⚠ {errorMsg}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
              Loading user registry...
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mgmt-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Username</th>
                    <th>Current Role</th>
                    <th>Account Status</th>
                    <th>Reassign Role</th>
                    <th style={{ textAlign: "right" }}>Account Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(userItem => {
                    const isUpdating = updatingId === userItem.id;
                    return (
                      <tr key={userItem.id}>
                        <td>#{userItem.id}</td>
                        <td>
                          <strong>{userItem.username}</strong>
                        </td>
                        <td>
                          <span className={`role-badge role-badge--${userItem.role}`}>
                            {userItem.role === "Doctor" ? "⚕ Doctor" : userItem.role === "Admin" ? "🛡 Admin" : "🩺 Patient"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: userItem.is_active ? "#4ade80" : "#f87171" }}>
                            {userItem.is_active ? "● ACTIVE" : "○ INACTIVE"}
                          </span>
                        </td>
                        <td>
                          <select
                            value={userItem.role}
                            disabled={isUpdating}
                            onChange={e => handleRoleChange(userItem.id, e.target.value)}
                            className="role-select-inline"
                          >
                            <option value="Doctor">Doctor</option>
                            <option value="Admin">Admin</option>
                            <option value="Patient">Patient</option>
                          </select>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            disabled={isUpdating}
                            onClick={() => handleStatusToggle(userItem.id, userItem.is_active)}
                            className={`status-toggle-btn ${userItem.is_active ? "status-toggle-btn--active" : "status-toggle-btn--inactive"}`}
                          >
                            {isUpdating ? "Saving..." : userItem.is_active ? "Deactivate" : "Activate"}
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
      </div>
    </>
  );
}
