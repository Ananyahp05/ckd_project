"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import { FlaskIcon, ClipboardIcon, FolderIcon, CheckCircleIcon, AlertTriangleIcon } from "./Icons";

type Props = {
  token: string;
};

export default function LabDashboard({ token }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<"enter" | "requests" | "history">("enter");
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lab Entry Form State
  const [patientId, setPatientId] = useState("");
  const [testName, setTestName] = useState("Serum Creatinine");
  const [category, setCategory] = useState("Renal Function");
  const [testValue, setTestValue] = useState<string>("1.2");
  const [unit, setUnit] = useState("mg/dL");
  const [referenceRange, setReferenceRange] = useState("0.7 - 1.3 mg/dL");
  const [loincCode, setLoincCode] = useState("2160-0");
  const [notes, setNotes] = useState("");

  const testPresets: Record<string, { category: string; unit: string; ref: string; loinc: string }> = {
    "Serum Creatinine": { category: "Renal Function", unit: "mg/dL", ref: "0.7 - 1.3 mg/dL", loinc: "2160-0" },
    "Estimated GFR (eGFR)": { category: "Renal Function", unit: "mL/min/1.73m²", ref: "> 60 mL/min/1.73m²", loinc: "33914-3" },
    "Blood Urea Nitrogen (BUN)": { category: "Renal Function", unit: "mg/dL", ref: "7 - 20 mg/dL", loinc: "3094-0" },
    "Urine Albumin / Protein": { category: "Renal Function", unit: "mg/g", ref: "< 30 mg/g", loinc: "1754-1" },
    "Serum Potassium": { category: "Electrolytes", unit: "mEq/L", ref: "3.5 - 5.1 mEq/L", loinc: "2823-3" },
    "Serum Sodium": { category: "Electrolytes", unit: "mEq/L", ref: "136 - 145 mEq/L", loinc: "2951-2" },
    "Random Blood Glucose": { category: "Metabolic", unit: "mg/dL", ref: "70 - 140 mg/dL", loinc: "2345-7" },
    "Hemoglobin": { category: "Hematology", unit: "g/dL", ref: "13.5 - 17.5 g/dL", loinc: "718-7" },
  };

  const handleTestPresetChange = (name: string) => {
    setTestName(name);
    const p = testPresets[name];
    if (p) {
      setCategory(p.category);
      setUnit(p.unit);
      setReferenceRange(p.ref);
      setLoincCode(p.loinc);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Stats
      const resStats = await fetch(`${API_BASE_URL}/lab/overview-stats`, { headers });
      if (resStats.ok) setStats(await resStats.json());

      // Patients list
      const resPts = await fetch(`${API_BASE_URL}/lab/patients`, { headers });
      if (resPts.ok) {
        const pts = await resPts.json();
        setPatients(pts);
        if (!patientId && pts.length > 0) setPatientId(pts[0].patient_id);
      }

      // Requests
      const resReqs = await fetch(`${API_BASE_URL}/lab/requests`, { headers });
      if (resReqs.ok) setRequests(await resReqs.json());

      // History
      const resHist = await fetch(`${API_BASE_URL}/lab/tests/history`, { headers });
      if (resHist.ok) setHistory(await resHist.json());
    } catch (e) {
      console.error("Failed to load lab data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  const handleSubmitResult = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const valNum = parseFloat(testValue);
    if (isNaN(valNum)) {
      setErrorMsg("Please enter a valid numeric test result.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/lab/tests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patient_id: patientId,
          test_name: testName,
          category: category,
          test_value: valNum,
          unit: unit,
          reference_range: referenceRange,
          loinc_code: loincCode,
          notes: notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to record lab result");
      }

      const data = await res.json();
      setSuccessMsg(`Recorded: ${data.test_name} for ${data.patient_id} (Status: ${data.status_flag})`);
      setNotes("");
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save test result");
    }
  };

  const handleCompleteRequest = async (reqId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/lab/requests/${reqId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSuccessMsg("Lab request marked as Completed!");
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "10px" }}>
      <style>{`
        .lab-card {
          background: var(--bg-surface, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          color: var(--text-primary, #0f172a);
          margin-bottom: 24px;
        }
        .lab-nav {
          display: flex;
          gap: 12px;
          border-bottom: 2px solid var(--border-color, #e2e8f0);
          margin-bottom: 20px;
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 2px;
        }
        .lab-tab-btn {
          padding: 10px 16px;
          font-weight: 700;
          font-size: 0.9rem;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          color: var(--text-muted, #64748b);
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          min-height: 44px;
        }
        @media (max-width: 600px) {
          .lab-card {
            padding: 16px 14px;
          }
        }
        .lab-tab-btn--active {
          color: var(--color-primary-accent);
          border-bottom-color: var(--color-primary-accent);
        }
        .lab-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          font-size: 0.9rem;
          color: var(--text-primary);
          background: var(--bg-surface);
          outline: none;
        }
        .lab-input:focus {
          border-color: var(--color-primary-accent);
          box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
        }
        .lab-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
        }
        .lab-table th {
          text-align: left;
          padding: 12px 14px;
          background: var(--bg-surface-subtle);
          color: var(--text-primary);
          font-weight: 600;
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
        }
        .lab-table td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-secondary);
        }
        .badge-status {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.74rem;
          font-weight: 600;
        }
        .badge-status--NORMAL { background: var(--risk-low-bg); color: var(--risk-low); border: 1px solid var(--risk-low-border); }
        .badge-status--ELEVATED { background: var(--risk-high-bg); color: var(--risk-high); border: 1px solid var(--risk-high-border); }
        .badge-status--CRITICAL { background: var(--risk-high-bg); color: var(--risk-high); border: 1px solid var(--risk-high-border); }
        .badge-status--LOW { background: #fef9c3; color: #854d0e; }
      `}</style>

      {/* Header */}
      <div className="lab-card" style={{ background: "var(--color-primary-accent)", color: "#ffffff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <FlaskIcon size={24} />
              <h2 style={{ fontSize: "1.45rem", fontWeight: 600, margin: 0, color: "#ffffff" }}>
                Laboratory Information System & Diagnostic Entry
              </h2>
            </div>
            <p style={{ margin: "6px 0 0 0", color: "rgba(255, 255, 255, 0.88)", fontSize: "0.88rem" }}>
              Authorized laboratory technician console for verifying renal biomarkers, recording standardized LOINC measurements, and managing doctor orders.
            </p>
          </div>
          <button
            onClick={loadData}
            style={{
              background: "rgba(255, 255, 255, 0.16)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {/* Stats Row */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginTop: "24px" }}>
            <div style={{ background: "rgba(255, 255, 255, 0.14)", padding: "14px", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(255, 255, 255, 0.85)" }}>Pending Orders</div>
              <div className="tabular-figure" style={{ fontSize: "1.6rem", fontWeight: 600 }}>{stats.pending_requests_count}</div>
            </div>
            <div style={{ background: "rgba(255, 255, 255, 0.14)", padding: "14px", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(255, 255, 255, 0.85)" }}>Completed Orders</div>
              <div className="tabular-figure" style={{ fontSize: "1.6rem", fontWeight: 600 }}>{stats.completed_requests_count}</div>
            </div>
            <div style={{ background: "rgba(255, 255, 255, 0.14)", padding: "14px", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(255, 255, 255, 0.85)" }}>Total Tests Recorded</div>
              <div className="tabular-figure" style={{ fontSize: "1.6rem", fontWeight: 600 }}>{stats.total_tests_entered}</div>
            </div>
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="lab-card">
        <div className="lab-nav">
          <button
            onClick={() => setActiveSubTab("enter")}
            className={`lab-tab-btn ${activeSubTab === "enter" ? "lab-tab-btn--active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <FlaskIcon size={15} />
            <span>Enter New Lab Result</span>
          </button>
          <button
            onClick={() => setActiveSubTab("requests")}
            className={`lab-tab-btn ${activeSubTab === "requests" ? "lab-tab-btn--active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <ClipboardIcon size={15} />
            <span>Doctor Orders & Requests ({requests.filter(r => r.status === "Pending").length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab("history")}
            className={`lab-tab-btn ${activeSubTab === "history" ? "lab-tab-btn--active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <FolderIcon size={15} />
            <span>Historical Test Log ({history.length})</span>
          </button>
        </div>

        {successMsg && (
          <div style={{ background: "var(--risk-low-bg)", color: "var(--risk-low)", border: "1px solid var(--risk-low-border)", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircleIcon size={16} />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div style={{ background: "var(--risk-high-bg)", color: "var(--risk-high)", border: "1px solid var(--risk-high-border)", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangleIcon size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: Enter Result */}
        {activeSubTab === "enter" && (
          <form onSubmit={handleSubmitResult}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "18px", marginBottom: "18px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Select Patient (MRN):
                </label>
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="lab-input"
                  required
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.patient_id} value={p.patient_id}>
                      {p.patient_id} — {p.full_name} ({p.gender || "Unknown"}, Age {p.age || "?"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Test / Biomarker Name:
                </label>
                <select
                  value={testName}
                  onChange={(e) => handleTestPresetChange(e.target.value)}
                  className="lab-input"
                >
                  {Object.keys(testPresets).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Biomarker Category:
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="lab-input"
                  required
                >
                </input>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Measured Value:
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={testValue}
                  onChange={(e) => setTestValue(e.target.value)}
                  className="lab-input"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Unit of Measurement:
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="lab-input"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Standard Clinical Reference Range:
                </label>
                <input
                  type="text"
                  value={referenceRange}
                  onChange={(e) => setReferenceRange(e.target.value)}
                  className="lab-input"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  LOINC Standard Code:
                </label>
                <input
                  type="text"
                  value={loincCode}
                  onChange={(e) => setLoincCode(e.target.value)}
                  className="lab-input"
                />
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Analyzer / Equipment & Clinical Notes:
              </label>
              <input
                type="text"
                placeholder="e.g. Roche Cobas 6000 kinetic alkaline picrate assay. Fasting sample verified."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="lab-input"
              />
            </div>

            <button
              type="submit"
              style={{
                background: "var(--theme-navy, #1E3A8A)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "12px 28px",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(30, 58, 138, 0.25)",
              }}
            >
              💾 Record & Validate Lab Result
            </button>
          </form>
        )}

        {/* Tab 2: Requests */}
        {activeSubTab === "requests" && (
          <div style={{ overflowX: "auto" }}>
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Patient MRN</th>
                  <th>Ordering Physician</th>
                  <th>Test Requested</th>
                  <th>Priority</th>
                  <th>Clinical Notes</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#64748b", padding: "30px" }}>
                      No doctor lab orders currently pending.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>#{r.id}</td>
                      <td style={{ fontWeight: 700, color: "var(--theme-navy, #1E3A8A)" }}>{r.patient_id}</td>
                      <td>{r.doctor_name || `Dr. #${r.doctor_id}`}</td>
                      <td>{r.test_type}</td>
                      <td>
                        <span style={{
                          color: r.priority === "STAT" ? "#DC2626" : r.priority === "Urgent" ? "#ea580c" : "var(--theme-navy, #1E3A8A)",
                          fontWeight: 700,
                          fontSize: "0.8rem"
                        }}>
                          {r.priority}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{r.clinical_notes || "—"}</td>
                      <td>
                        <span className={`badge-status badge-status--${r.status === "Completed" ? "NORMAL" : "LOW"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.status === "Pending" ? (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => {
                                setPatientId(r.patient_id);
                                handleTestPresetChange("Serum Creatinine");
                                setActiveSubTab("enter");
                              }}
                              style={{ background: "var(--theme-navy, #1E3A8A)", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer" }}
                            >
                              Enter Result
                            </button>
                            <button
                              onClick={() => handleCompleteRequest(r.id)}
                              style={{ background: "#16A34A", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer" }}
                            >
                              Done
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "#16A34A" }}>✓ Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: History */}
        {activeSubTab === "history" && (
          <div style={{ overflowX: "auto" }}>
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Patient MRN</th>
                  <th>Test Name</th>
                  <th>Measured Value</th>
                  <th>Reference Range</th>
                  <th>Status</th>
                  <th>Recorded By</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#64748b", padding: "30px" }}>
                      No laboratory test entries recorded yet.
                    </td>
                  </tr>
                ) : (
                  history.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, color: "var(--theme-navy, #1E3A8A)" }}>{t.patient_id}</td>
                      <td style={{ fontWeight: 600 }}>{t.test_name}</td>
                      <td style={{ fontWeight: 700 }}>
                        {t.test_value} <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{t.unit}</span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{t.reference_range || "—"}</td>
                      <td>
                        <span className={`badge-status badge-status--${t.status}`}>
                          {t.status}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{t.technician_name || "Lab Staff"}</td>
                      <td style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        {t.recorded_at ? new Date(t.recorded_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

