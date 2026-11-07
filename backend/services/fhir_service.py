"""
fhir_service.py — HL7 FHIR R4 (Fast Healthcare Interoperability Resources) Service.

Translates internal patient records, multi-model AI inferences, and laboratory biomarkers
into fully compliant, standard HL7 FHIR R4 JSON resources and bundles.

Ontology Standard Mappings:
  - LOINC (Logical Observation Identifiers Names and Codes) for Laboratory Observations.
  - SNOMED-CT (Systematized Nomenclature of Medicine -- Clinical Terms) for Diagnoses and KDIGO Staging.
  - HL7 v3 / FHIR R4 CodeSystems for Risk Assessments and Statuses.
"""

from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional


# ── LOINC Code Dictionary for Renal Panel Biomarkers ──────────────────────────

LOINC_MAPPINGS: Dict[str, Dict[str, Any]] = {
    "sc": {
        "code": "2160-0",
        "display": "Creatinine [Mass/volume] in Serum or Plasma",
        "system": "http://loinc.org",
        "unit": "mg/dL",
        "ucum": "mg/dL",
    },
    "bu": {
        "code": "3094-0",
        "display": "Urea nitrogen [Mass/volume] in Serum or Plasma",
        "system": "http://loinc.org",
        "unit": "mg/dL",
        "ucum": "mg/dL",
    },
    "bp": {
        "code": "8462-4",
        "display": "Diastolic blood pressure",
        "system": "http://loinc.org",
        "unit": "mmHg",
        "ucum": "mm[Hg]",
    },
    "bgr": {
        "code": "2345-7",
        "display": "Glucose [Mass/volume] in Serum or Plasma",
        "system": "http://loinc.org",
        "unit": "mg/dL",
        "ucum": "mg/dL",
    },
    "hemo": {
        "code": "718-7",
        "display": "Hemoglobin [Mass/volume] in Blood",
        "system": "http://loinc.org",
        "unit": "g/dL",
        "ucum": "g/dL",
    },
    "pcv": {
        "code": "20570-8",
        "display": "Hematocrit [Volume Fraction] of Blood",
        "system": "http://loinc.org",
        "unit": "%",
        "ucum": "%",
    },
    "sod": {
        "code": "2951-2",
        "display": "Sodium [Moles/volume] in Serum or Plasma",
        "system": "http://loinc.org",
        "unit": "mEq/L",
        "ucum": "meq/L",
    },
    "pot": {
        "code": "2823-3",
        "display": "Potassium [Moles/volume] in Serum or Plasma",
        "system": "http://loinc.org",
        "unit": "mEq/L",
        "ucum": "meq/L",
    },
    "sg": {
        "code": "5811-5",
        "display": "Specific gravity of Urine by Test strip",
        "system": "http://loinc.org",
        "unit": "",
        "ucum": "1",
    },
    "al": {
        "code": "1754-1",
        "display": "Albumin [Presence] in Urine",
        "system": "http://loinc.org",
        "unit": "(0-5)",
        "ucum": "1",
    },
    "su": {
        "code": "25428-4",
        "display": "Glucose [Presence] in Urine",
        "system": "http://loinc.org",
        "unit": "(0-5)",
        "ucum": "1",
    },
    "wbcc": {
        "code": "6690-2",
        "display": "Leukocytes [#/volume] in Blood by Automated count",
        "system": "http://loinc.org",
        "unit": "/µL",
        "ucum": "10*3/uL",
    },
    "rbcc": {
        "code": "789-8",
        "display": "Erythrocytes [#/volume] in Blood by Automated count",
        "system": "http://loinc.org",
        "unit": "M/µL",
        "ucum": "10*6/uL",
    },
    "egfr": {
        "code": "33914-3",
        "display": "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood",
        "system": "http://loinc.org",
        "unit": "mL/min/1.73m2",
        "ucum": "mL/min/{1.73_m2}",
    },
}

# ── SNOMED-CT Code Dictionary for KDIGO CKD Stages ────────────────────────────

SNOMED_KDIGO_MAPPINGS: Dict[str, Dict[str, str]] = {
    "Stage 1": {
        "code": "431855005",
        "display": "Chronic kidney disease stage 1 (disorder)",
    },
    "Stage 2": {
        "code": "431856006",
        "display": "Chronic kidney disease stage 2 (disorder)",
    },
    "Stage 3a": {
        "code": "433144002",
        "display": "Chronic kidney disease stage 3a (disorder)",
    },
    "Stage 3b": {
        "code": "433146000",
        "display": "Chronic kidney disease stage 3b (disorder)",
    },
    "Stage 4": {
        "code": "431857001",
        "display": "Chronic kidney disease stage 4 (disorder)",
    },
    "Stage 5": {
        "code": "433146000",
        "display": "End-stage renal disease (disorder)",
    },
    "General": {
        "code": "709044004",
        "display": "Chronic kidney disease (disorder)",
    },
}


# ── FHIR R4 Resource Builders ────────────────────────────────────────────────

def build_fhir_patient_resource(
    patient_id: str,
    age: Optional[float] = None,
    doctor_name: Optional[str] = None
) -> Dict[str, Any]:
    """Generates an HL7 FHIR R4 Patient Resource."""
    resource: Dict[str, Any] = {
        "resourceType": "Patient",
        "id": patient_id.replace(" ", "-"),
        "identifier": [
            {
                "use": "usual",
                "type": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                            "code": "MR",
                            "display": "Medical Record Number",
                        }
                    ]
                },
                "system": "urn:oid:2.16.840.1.113883.4.1",
                "value": patient_id,
            }
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "text": f"Patient {patient_id}",
                "family": patient_id,
            }
        ],
    }

    if age is not None:
        resource["extension"] = [
            {
                "url": "http://hl7.org/fhir/StructureDefinition/patient-birthTime",
                "valueQuantity": {
                    "value": float(age),
                    "unit": "years",
                    "system": "http://unitsofmeasure.org",
                    "code": "a",
                },
            }
        ]

    if doctor_name:
        resource["generalPractitioner"] = [
            {
                "display": doctor_name,
                "type": "Practitioner",
            }
        ]

    return resource


def build_fhir_observation_resource(
    patient_ref_id: str,
    key: str,
    value: float,
    status_label: str = "NORMAL",
    timestamp: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Generates an individual LOINC-coded FHIR R4 Observation Resource."""
    mapping = LOINC_MAPPINGS.get(key.lower())
    if not mapping:
        return None

    obs_id = f"obs-{key.lower()}-{uuid.uuid4().hex[:8]}"
    obs_time = timestamp or datetime.now(timezone.utc).isoformat()

    return {
        "resourceType": "Observation",
        "id": obs_id,
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "laboratory",
                        "display": "Laboratory",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": mapping["system"],
                    "code": mapping["code"],
                    "display": mapping["display"],
                }
            ],
            "text": mapping["display"],
        },
        "subject": {
            "reference": f"Patient/{patient_ref_id}",
            "display": f"Patient {patient_ref_id}",
        },
        "effectiveDateTime": obs_time,
        "valueQuantity": {
            "value": round(float(value), 3),
            "unit": mapping["unit"],
            "system": "http://unitsofmeasure.org",
            "code": mapping["ucum"],
        },
        "interpretation": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                        "code": "H" if status_label in ["ELEVATED", "CRITICAL"] else "L" if status_label == "LOW" else "N",
                        "display": "Normal" if status_label == "NORMAL" else "High" if status_label in ["ELEVATED", "CRITICAL"] else "Low",
                    }
                ],
                "text": status_label,
            }
        ],
    }


def build_fhir_risk_assessment_resource(
    patient_ref_id: str,
    risk_score_pct: float,
    diagnosis_label: str,
    kdigo_stage: str,
    clinical_action: str,
    basis_obs_refs: List[str],
    timestamp: Optional[str] = None
) -> Dict[str, Any]:
    """Generates an HL7 FHIR R4 RiskAssessment Resource encapsulating Deep Learning inference."""
    snomed_info = SNOMED_KDIGO_MAPPINGS.get(kdigo_stage, SNOMED_KDIGO_MAPPINGS["General"])
    is_high = risk_score_pct >= 50.0 or kdigo_stage in ["Stage 3a", "Stage 3b", "Stage 4", "Stage 5"]
    ra_id = f"risk-assessment-{uuid.uuid4().hex[:8]}"

    return {
        "resourceType": "RiskAssessment",
        "id": ra_id,
        "status": "final",
        "subject": {
            "reference": f"Patient/{patient_ref_id}",
            "display": f"Patient {patient_ref_id}",
        },
        "occurrenceDateTime": timestamp or datetime.now(timezone.utc).isoformat(),
        "method": {
            "coding": [
                {
                    "system": "http://edcif.health/methodology",
                    "code": "HYBRID-XAI-DL",
                    "display": "Explainable Deep Learning Hybrid Clinical Intelligence Framework",
                }
            ],
            "text": "Deep Learning Hybrid Model with Gradient-based Attributions",
        },
        "code": {
            "coding": [
                {
                    "system": "http://snomed.info/sct",
                    "code": "709044004",
                    "display": "Chronic kidney disease (disorder)",
                }
            ],
            "text": "Chronic Kidney Disease Risk Evaluation",
        },
        "basis": [{"reference": f"Observation/{obs_id}"} for obs_id in basis_obs_refs],
        "prediction": [
            {
                "outcome": {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": snomed_info["code"],
                            "display": snomed_info["display"],
                        }
                    ],
                    "text": f"{diagnosis_label} ({kdigo_stage})",
                },
                "probabilityDecimal": round(float(risk_score_pct) / 100.0, 4),
                "qualitativeRisk": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/risk-probability",
                            "code": "high" if is_high else "low",
                            "display": "High Likelihood" if is_high else "Low Likelihood",
                        }
                    ]
                },
                "rationale": clinical_action,
            }
        ],
        "note": [
            {
                "text": f"Consensus Nephrology Protocol: {clinical_action}",
            }
        ],
    }


def build_fhir_diagnostic_report_resource(
    patient_ref_id: str,
    diagnosis_label: str,
    conclusion_text: str,
    result_obs_refs: List[str],
    timestamp: Optional[str] = None
) -> Dict[str, Any]:
    """Generates an HL7 FHIR R4 DiagnosticReport Resource."""
    dr_id = f"diag-report-{uuid.uuid4().hex[:8]}"

    return {
        "resourceType": "DiagnosticReport",
        "id": dr_id,
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                        "code": "LAB",
                        "display": "Laboratory",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "24362-6",
                    "display": "Renal function panel - Serum or Plasma",
                }
            ],
            "text": "Comprehensive Nephrology Panel & AI Diagnostics",
        },
        "subject": {
            "reference": f"Patient/{patient_ref_id}",
        },
        "effectiveDateTime": timestamp or datetime.now(timezone.utc).isoformat(),
        "issued": timestamp or datetime.now(timezone.utc).isoformat(),
        "result": [{"reference": f"Observation/{obs_id}"} for obs_id in result_obs_refs],
        "conclusion": f"{diagnosis_label}: {conclusion_text}",
    }


# ── Full FHIR Document Bundle Assembler ───────────────────────────────────────

def generate_fhir_bundle(ehr_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Assembles a complete, standards-compliant HL7 FHIR R4 Collection Bundle
    from a patient's EHR records, laboratory panel, and AI consensus synthesis.
    """
    patient_id = str(ehr_data.get("patient_id") or "PT-UNKNOWN")
    clean_patient_ref = patient_id.replace(" ", "-")
    timestamp = datetime.now(timezone.utc).isoformat()
    bundle_id = f"bundle-ckd-{uuid.uuid4()}"

    entries: List[Dict[str, Any]] = []
    obs_ids: List[str] = []

    # 1. Add FHIR Patient Resource
    patient_res = build_fhir_patient_resource(
        patient_id=clean_patient_ref,
        age=ehr_data.get("patient_age"),
        doctor_name=ehr_data.get("assigned_doctor"),
    )
    entries.append({
        "fullUrl": f"urn:uuid:{uuid.uuid4()}",
        "resource": patient_res,
    })

    # 2. Add LOINC Observations from Biomarker Panel
    for biomarker in ehr_data.get("biomarkers_panel", []):
        key = biomarker.get("key", "").lower()
        val = biomarker.get("value")
        if val is not None and key in LOINC_MAPPINGS:
            obs = build_fhir_observation_resource(
                patient_ref_id=clean_patient_ref,
                key=key,
                value=float(val),
                status_label=biomarker.get("status", "NORMAL"),
                timestamp=timestamp,
            )
            if obs:
                entries.append({
                    "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                    "resource": obs,
                })
                obs_ids.append(obs["id"])

    # 3. Add Predicted eGFR Observation if present
    consensus = ehr_data.get("consensus") or {}
    pred_egfr = consensus.get("predicted_egfr")
    if pred_egfr is not None:
        egfr_obs = build_fhir_observation_resource(
            patient_ref_id=clean_patient_ref,
            key="egfr",
            value=float(pred_egfr),
            status_label="NORMAL" if float(pred_egfr) >= 90 else "LOW" if float(pred_egfr) >= 60 else "ELEVATED",
            timestamp=timestamp,
        )
        if egfr_obs:
            entries.append({
                "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                "resource": egfr_obs,
            })
            obs_ids.append(egfr_obs["id"])

    # 4. Add FHIR RiskAssessment Resource (AI Decision Support)
    risk_score = float(consensus.get("risk_score") or 0.0)
    diagnosis = consensus.get("diagnosis") or "CKD Evaluation"
    kdigo_stage = consensus.get("kdigo_stage") or "Unclassified"
    clinical_action = consensus.get("clinical_action") or "Standard monitoring."

    risk_assessment = build_fhir_risk_assessment_resource(
        patient_ref_id=clean_patient_ref,
        risk_score_pct=risk_score,
        diagnosis_label=diagnosis,
        kdigo_stage=kdigo_stage,
        clinical_action=clinical_action,
        basis_obs_refs=obs_ids,
        timestamp=timestamp,
    )
    entries.append({
        "fullUrl": f"urn:uuid:{uuid.uuid4()}",
        "resource": risk_assessment,
    })

    # 5. Add FHIR DiagnosticReport Resource
    diag_report = build_fhir_diagnostic_report_resource(
        patient_ref_id=clean_patient_ref,
        diagnosis_label=diagnosis,
        conclusion_text=clinical_action,
        result_obs_refs=obs_ids,
        timestamp=timestamp,
    )
    entries.append({
        "fullUrl": f"urn:uuid:{uuid.uuid4()}",
        "resource": diag_report,
    })

    return {
        "resourceType": "Bundle",
        "id": bundle_id,
        "meta": {
            "versionId": "1",
            "lastUpdated": timestamp,
            "profile": ["http://hl7.org/fhir/StructureDefinition/Bundle"],
        },
        "identifier": {
            "system": "http://edcif.health/bundles",
            "value": bundle_id,
        },
        "type": "collection",
        "timestamp": timestamp,
        "total": len(entries),
        "entry": entries,
    }

