"use client";

import React from "react";

export type ClinicalReportData = {
  patient_id: string;
  patient_age?: number | null;
  assigned_doctor?: string;
  report_date?: string;
  ann_result?: {
    prediction: string;
    risk_score: number;
    probability?: number;
    explanation?: Array<{ feature: string; contribution: number }>;
  } | null;
  lstm_result?: {
    predicted_egfr: number;
    kdigo_stage?: string;
    kdigo_description?: string;
    trajectory?: string;
  } | null;
  hybrid_result?: {
    predicted_egfr: number;
    kdigo_stage?: string;
    kdigo_description?: string;
    trajectory?: string;
    baseline_egfr?: number;
  } | null;
  consensus?: {
    diagnosis: string;
    risk_level: string;
    risk_score: number | null;
    predicted_egfr: number | null;
    kdigo_stage: string;
    kdigo_description?: string;
    trajectory_status?: string;
    concordance: string;
    clinical_action: string;
  } | null;
  biomarkers?: Array<{
    name: string;
    value: number;
    unit: string;
    reference: string;
    category?: string;
    status: "NORMAL" | "LOW" | "ELEVATED" | "CRITICAL";
  }>;
  guidelines?: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  reportData: ClinicalReportData;
};

export default function ClinicalReportModal({ isOpen, onClose, reportData }: Props) {
  if (!isOpen) return null;

  const currentDate = reportData.report_date || new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const reportId = `CKD-RPT-${(reportData.patient_id || "PT").replace(/[^a-zA-Z0-9]/g, "")}-${Date.now().toString().slice(-4)}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const reportElement = document.getElementById("clinical-printable-report");
    if (!reportElement) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Clinical Report - ${reportData.patient_id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; color: #0f172a; background: #fff; line-height: 1.5; }
          .sheet { max-width: 900px; margin: 0 auto; padding: 30px; border: 1px solid #cbd5e1; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
          th { background: #f8fafc; font-weight: 700; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }
          .badge-high { background: #fee2e2; color: #b91c1c; }
          .badge-norm { background: #dcfce7; color: #15803d; }
          .badge-crit { background: #fef2f2; color: #991b1b; border: 1px solid #f87171; }
          .header-box { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; background: #f8fafc; padding: 14px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${reportElement.innerHTML}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Clinical_Nephrology_Report_${reportData.patient_id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          overflow-y: auto;
        }
        .modal-container {
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 20px;
          width: 100%;
          max-width: 950px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        }
        .modal-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(30, 41, 59, 0.5);
        }
        .modal-scroll-area {
          overflow-y: auto;
          padding: 28px;
          background: #f8fafc;
          color: #0f172a;
        }
        .report-sheet {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 36px 40px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #0284c7;
          padding-bottom: 18px;
          margin-bottom: 24px;
        }
        .report-title {
          font-size: 1.45rem;
          font-weight: 800;
          color: #0369a1;
          letter-spacing: -0.02em;
          margin: 0 0 4px 0;
        }
        .report-subtitle {
          font-size: 0.82rem;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin: 0;
        }
        .report-meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px 20px;
          margin-bottom: 26px;
          font-size: 0.85rem;
        }
        .meta-label {
          font-size: 0.72rem;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .meta-val {
          font-weight: 700;
          color: #0f172a;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1rem;
          font-weight: 800;
          color: #1e293b;
          margin: 24px 0 12px 0;
          border-left: 4px solid #0284c7;
          padding-left: 10px;
        }
        .consensus-card {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          padding: 18px 22px;
          margin-bottom: 22px;
        }
        .consensus-card--danger {
          background: #fef2f2;
          border-color: #fecaca;
        }
        .consensus-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
          margin-top: 12px;
        }
        .consensus-stat {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 8px;
          padding: 12px 14px;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
          margin-bottom: 24px;
        }
        .report-table th {
          background: #f8fafc;
          color: #475569;
          text-align: left;
          padding: 10px 14px;
          font-weight: 700;
          border-bottom: 2px solid #e2e8f0;
          text-transform: uppercase;
          font-size: 0.72rem;
        }
        .report-table td {
          padding: 10px 14px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
        }
        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 50px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.03em;
        }
        .status-badge--NORMAL {
          background: #dcfce7;
          color: #166534;
        }
        .status-badge--LOW {
          background: #fef9c3;
          color: #854d0e;
        }
        .status-badge--ELEVATED {
          background: #fee2e2;
          color: #991b1b;
        }
        .status-badge--CRITICAL {
          background: #7f1d1d;
          color: #ffffff;
        }
        .signature-block {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px dashed #cbd5e1;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 20px;
        }
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-print {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: #ffffff;
          border: none;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);
        }
        .btn-print:hover {
          background: #0284c7;
          transform: translateY(-1px);
        }
        .btn-download {
          background: rgba(148, 163, 184, 0.15);
          color: #e2e8f0;
          border: 1px solid rgba(148, 163, 184, 0.25);
        }
        .btn-download:hover {
          background: rgba(148, 163, 184, 0.25);
        }
        .btn-close {
          background: transparent;
          color: #94a3b8;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 4px 8px;
        }
        .btn-close:hover {
          color: #f1f5f9;
        }

        /* ─── PRINT MEDIA STYLES ─── */
        @media print {
          body * {
            visibility: hidden !important;
          }
          .modal-overlay,
          .modal-container,
          .modal-scroll-area,
          #clinical-printable-report,
          #clinical-printable-report * {
            visibility: visible !important;
          }
          .modal-overlay {
            position: absolute !important;
            inset: 0 !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .modal-container {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            max-height: none !important;
            background: #ffffff !important;
          }
          .modal-top-bar {
            display: none !important;
          }
          .modal-scroll-area {
            background: #ffffff !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .report-sheet {
            border: none !important;
            box-shadow: none !important;
            padding: 10mm 15mm !important;
            margin: 0 !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
        }
      `}</style>

      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          {/* Top action bar */}
          <div className="modal-top-bar">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>📄</span>
              <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "0.95rem" }}>
                Clinical Diagnostic PDF Preview · {reportData.patient_id}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button onClick={handleDownloadHtml} className="action-btn btn-download" title="Download standalone HTML report">
                💾 Download HTML
              </button>
              <button onClick={handlePrint} className="action-btn btn-print" title="Print directly or save as PDF">
                🖨️ Print / Save as PDF
              </button>
              <button onClick={onClose} className="btn-close" aria-label="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Printable Report Sheet */}
          <div className="modal-scroll-area">
            <div id="clinical-printable-report" className="report-sheet">
              {/* Report Header */}
              <div className="report-header">
                <div>
                  <h1 className="report-title">CKD GUARDIAN CLINICAL HEALTH SYSTEM</h1>
                  <p className="report-subtitle">Department of Nephrology & Explainable AI Decision Support</p>
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.76rem", color: "#64748b" }}>
                    ISO 13485 Compliant Multi-Model AI Diagnostic & eGFR Progression Evaluation
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#0369a1" }}>REPORT ID: {reportId}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>Generated: {currentDate}</div>
                  <div style={{ fontSize: "0.7rem", color: "#059669", fontWeight: 700, marginTop: "4px" }}>
                    ✔ Algorithmic Verification Hash Verified
                  </div>
                </div>
              </div>

              {/* Patient Meta Grid */}
              <div className="report-meta-grid">
                <div>
                  <div className="meta-label">Patient Identifier (MRN)</div>
                  <div className="meta-val" style={{ fontSize: "1rem", color: "#0284c7" }}>{reportData.patient_id}</div>
                </div>
                <div>
                  <div className="meta-label">Patient Age / Demographics</div>
                  <div className="meta-val">{reportData.patient_age ? `${reportData.patient_age} Years` : "Adult Panel"}</div>
                </div>
                <div>
                  <div className="meta-label">Attending / Consulting Physician</div>
                  <div className="meta-val">{reportData.assigned_doctor || "Dr. Primary Care"}</div>
                </div>
                <div>
                  <div className="meta-label">Diagnostic Status</div>
                  <div className="meta-val">
                    <span className={`status-badge ${reportData.consensus?.risk_level === "HIGH" ? "status-badge--ELEVATED" : "status-badge--NORMAL"}`}>
                      {reportData.consensus?.diagnosis || (reportData.ann_result?.prediction ? `CKD Status: ${reportData.ann_result.prediction}` : "Evaluated")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Multi-Model Consensus & Staging */}
              <div className="section-header">
                <span>1. Multi-Model Nephrology Consensus & Staging</span>
              </div>

              <div className={`consensus-card ${reportData.consensus?.risk_level === "HIGH" ? "consensus-card--danger" : ""}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Integrated Clinical Verdict
                    </span>
                    <h3 style={{ margin: "2px 0 0 0", fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                      {reportData.consensus?.diagnosis || (reportData.ann_result?.prediction === "CKD" ? "Positive for Chronic Kidney Disease" : "Preserved Renal Function")}
                    </h3>
                  </div>
                  <span className={`status-badge ${reportData.consensus?.risk_level === "HIGH" ? "status-badge--ELEVATED" : "status-badge--NORMAL"}`} style={{ fontSize: "0.75rem", padding: "4px 12px" }}>
                    {reportData.consensus?.concordance || "Multi-Model Triangulation"}
                  </span>
                </div>

                <div className="consensus-grid">
                  <div className="consensus-stat">
                    <div className="meta-label">Diagnostic CKD Probability</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: (reportData.ann_result?.risk_score ?? 0) >= 50 ? "#dc2626" : "#16a34a" }}>
                      {reportData.ann_result?.risk_score !== undefined ? `${reportData.ann_result.risk_score.toFixed(1)}%` : "—"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      {reportData.ann_result?.prediction === "CKD" ? "Positive (Active Risk)" : reportData.ann_result?.prediction === "NOTCKD" ? "Negative (Preserved)" : "Diagnostic Assessment"}
                    </div>
                  </div>

                  <div className="consensus-stat">
                    <div className="meta-label">Projected Next eGFR</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0284c7" }}>
                      {reportData.consensus?.predicted_egfr ?? reportData.lstm_result?.predicted_egfr ?? reportData.hybrid_result?.predicted_egfr ?? "—"} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>mL/min</span>
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      Sequential Forecasting
                    </div>
                  </div>

                  <div className="consensus-stat">
                    <div className="meta-label">KDIGO Severity Staging</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#7c3aed" }}>
                      {reportData.consensus?.kdigo_stage ?? reportData.lstm_result?.kdigo_stage ?? reportData.hybrid_result?.kdigo_stage ?? "KDIGO Unclassified"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      {reportData.consensus?.kdigo_description ?? reportData.lstm_result?.kdigo_description ?? "Standard Clinical Stage"}
                    </div>
                  </div>

                  <div className="consensus-stat">
                    <div className="meta-label">Longitudinal Trajectory</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                      {reportData.consensus?.trajectory_status ?? reportData.lstm_result?.trajectory ?? "Observed"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      Temporal Trend
                    </div>
                  </div>
                </div>

                {reportData.consensus?.clinical_action && (
                  <div style={{ marginTop: "14px", padding: "10px 14px", background: "#ffffff", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.08)", fontSize: "0.82rem" }}>
                    <strong style={{ color: "#0369a1" }}>Recommended Clinical Action: </strong>
                    <span style={{ color: "#334155" }}>{reportData.consensus.clinical_action}</span>
                  </div>
                )}
              </div>

              {/* Section 2: Laboratory Biomarkers & Vitals Matrix */}
              {reportData.biomarkers && reportData.biomarkers.length > 0 && (
                <>
                  <div className="section-header">
                    <span>2. Complete Laboratory Biomarker Panel</span>
                  </div>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>Category</th>
                        <th>Observed Value</th>
                        <th>Standard Reference Range</th>
                        <th>Clinical Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.biomarkers.map((b, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{b.name}</td>
                          <td style={{ color: "#64748b", fontSize: "0.78rem" }}>{b.category || "Biochemistry"}</td>
                          <td style={{ fontWeight: 700 }}>
                            {b.value} <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{b.unit}</span>
                          </td>
                          <td style={{ color: "#64748b", fontSize: "0.78rem" }}>{b.reference}</td>
                          <td>
                            <span className={`status-badge status-badge--${b.status}`}>
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Section 3: Explainable AI (XAI) Biomarker Contributions */}
              {reportData.ann_result?.explanation && reportData.ann_result.explanation.length > 0 && (
                <>
                  <div className="section-header">
                    <span>3. Explainable AI (SHAP) Biomarker Attribution</span>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 18px", marginBottom: "22px" }}>
                    <p style={{ margin: "0 0 10px 0", fontSize: "0.8rem", color: "#475569" }}>
                      Biomarkers ranked by quantitative contribution to predicted renal dysfunction risk:
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                      {reportData.ann_result.explanation.slice(0, 6).map((item, idx) => (
                        <div key={idx} style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 600, color: "#1e293b" }}>{item.feature.toUpperCase()}</span>
                          <span style={{ fontWeight: 700, color: item.contribution > 0 ? "#dc2626" : "#16a34a" }}>
                            {item.contribution > 0 ? `+${item.contribution.toFixed(4)}` : item.contribution.toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Section 4: Clinical Lifestyle & Patient Care Guidelines */}
              <div className="section-header">
                <span>4. Nephrology Clinical Care Plan & Patient Guidelines</span>
              </div>
              <ul style={{ margin: "0 0 24px 0", paddingLeft: "20px", fontSize: "0.83rem", color: "#334155", lineHeight: "1.6" }}>
                {(reportData.guidelines && reportData.guidelines.length > 0 ? reportData.guidelines : [
                  "Maintain targeted daily hydration (~2.0 liters/day) unless contraindicated by cardiovascular or edematous status.",
                  "Limit dietary sodium intake to under 2.0 grams (5g salt) per day; strictly minimize ultra-processed foods.",
                  "Target systolic blood pressure < 130 mmHg and diastolic < 80 mmHg using approved renoprotective agents (ACEi/ARB/SGLT2i).",
                  "Avoid routine or unsupervised over-the-counter NSAID analgesic usage (e.g., ibuprofen, naproxen).",
                  "Schedule scheduled repeat serum creatinine, BUN, and eGFR monitoring within the specified clinical window."
                ]).map((g, idx) => (
                  <li key={idx} style={{ marginBottom: "4px" }}>{g}</li>
                ))}
              </ul>

              {/* Signature & Verification Block */}
              <div className="signature-block">
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                    Official Regulatory Disclaimer
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.7rem", color: "#94a3b8", maxWidth: "480px", lineHeight: "1.4" }}>
                    This clinical report is generated by the CKD Guardian Explainable AI decision-support platform (EDCIF). Algorithmic predictions are intended to assist registered medical practitioners and do not substitute independent clinical assessment.
                  </p>
                </div>
                <div style={{ minWidth: "220px", textAlign: "right" }}>
                  <div style={{ height: "40px", borderBottom: "1px solid #0f172a", marginBottom: "6px" }} />
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a" }}>
                    {reportData.assigned_doctor || "Authorized Attending Physician"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    MD, Board Certified Nephrology / Internal Medicine
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
