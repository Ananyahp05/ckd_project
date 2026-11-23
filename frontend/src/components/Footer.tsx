"use client";

import React from "react";

export default function Footer() {
  return (
    <footer className="edcif-footer">
      <div>
        🏥 <strong>Clinical Renal & Kidney Health Platform</strong> &bull; EDCIF Clinical Decision Support Platform
      </div>
      <div className="footer-sep">&bull;</div>
      <div>HL7 FHIR R4 Compliant</div>
      <div className="footer-sep">&bull;</div>
      <div>LOINC & SNOMED-CT Coded</div>
      <div className="footer-sep">&bull;</div>
      <div>Hospital Security & Privacy Architecture</div>
    </footer>
  );
}

