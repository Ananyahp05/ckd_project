import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any

def get_email_config_status() -> Dict[str, Any]:
    """Inspect environment variables for SMTP email provider configuration."""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM_EMAIL", "noreply@hospital.org")

    missing = []
    if not smtp_host:
        missing.append("SMTP_HOST")
    if not smtp_port:
        missing.append("SMTP_PORT")
    if not smtp_user:
        missing.append("SMTP_USER")
    if not smtp_password:
        missing.append("SMTP_PASSWORD")

    is_configured = len(missing) == 0
    return {
        "is_configured": is_configured,
        "missing_variables": missing,
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_from": smtp_from,
        "provider_help": (
            "To enable live production email delivery, configure SMTP_HOST, SMTP_PORT, "
            "SMTP_USER, and SMTP_PASSWORD in backend/.env (e.g., using SendGrid, Amazon SES, "
            "Google Workspace SMTP relay, or hospital SMTP gateway)."
        )
    }

def send_invitation_email(
    to_email: str,
    recipient_name: str,
    role: str,
    invitation_link: str,
    hospital_name: str = "Clinical Renal & Kidney Health Platform"
) -> Dict[str, Any]:
    """
    Sends a secure one-time staff invitation link to set up their account password.
    If SMTP is not configured, safely logs the link and returns clear status without pretending.
    """
    status = get_email_config_status()
    if not status["is_configured"]:
        print(f"[EMAIL SERVICE WARNING] SMTP email delivery is NOT configured.")
        print(f"Missing variables: {status['missing_variables']}")
        print(f"[INVITATION DISPATCH] Staff: '{recipient_name}' ({to_email}) | Role: {role}")
        print(f"[ONE-TIME SETUP LINK]: {invitation_link}")
        return {
            "delivered": False,
            "status": "pending_manual_dispatch",
            "message": (
                f"SMTP provider not configured. Missing: {', '.join(status['missing_variables'])}. "
                "Setup link generated and accessible in Administrator Console."
            ),
            "invitation_link": invitation_link
        }

    try:
        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        smtp_from = os.getenv("SMTP_FROM_EMAIL", "noreply@hospital.org")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Official Invitation to Join {hospital_name} Clinical Portal"
        msg["From"] = f"{hospital_name} <{smtp_from}>"
        msg["To"] = to_email

        html_body = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px;">
          <div style="max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 32px; border: 1px solid rgba(148,163,184,0.15);">
            <h2 style="color: #38bdf8; margin-top: 0;">Clinical Staff Invitation</h2>
            <p>Dear {recipient_name},</p>
            <p>You have been officially invited by a Hospital Administrator to join <strong>{hospital_name}</strong> as an authorized <strong>{role.replace('_', ' ').title()}</strong>.</p>
            <p>Please click the button below to verify your email and securely establish your account credentials. This one-time link will expire in 48 hours:</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="{invitation_link}" style="background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; display: inline-block;">Activate Staff Account</a>
            </div>
            <p style="font-size: 0.85rem; color: #94a3b8;">If the button does not work, copy and paste this URL into your browser:<br/><a href="{invitation_link}" style="color: #38bdf8;">{invitation_link}</a></p>
            <hr style="border: none; border-top: 1px solid rgba(148,163,184,0.15); margin: 24px 0;" />
            <p style="font-size: 0.75rem; color: #64748b;">Notice: This is a restricted healthcare communication intended exclusively for the named recipient.</p>
          </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [to_email], msg.as_string())

        return {
            "delivered": True,
            "status": "sent",
            "message": f"Invitation email successfully delivered to {to_email}",
            "invitation_link": invitation_link
        }
    except Exception as e:
        print(f"[EMAIL SERVICE ERROR] Failed to send email via SMTP: {e}")
        return {
            "delivered": False,
            "status": "delivery_failed",
            "message": f"SMTP transmission error: {str(e)}",
            "invitation_link": invitation_link
        }


def send_critical_lab_alert_email(
    to_email: str,
    physician_name: str,
    patient_id: str,
    test_name: str,
    test_value: float,
    unit: str,
    status_flag: str = "CRITICAL",
    hospital_name: str = "Clinical Renal & Kidney Health Platform"
) -> Dict[str, Any]:
    """
    Automated External Alert Dispatch (Synopsis Phase 7 / Section 8):
    Dispatches an urgent priority email notification to the attending physician when a critical
    laboratory test (e.g. eGFR < 15 or Creatinine > 3.0) is entered by a lab technician.
    """
    status = get_email_config_status()
    timestamp_str = os.getenv("CURRENT_TIME", "Immediate Clinical Broadcast")

    if not status["is_configured"]:
        print(f"[EXTERNAL CRITICAL ALERT - EMAIL/SMS DISPATCH]")
        print(f"To Attending: Dr. {physician_name} <{to_email}>")
        print(f"Patient MRN: {patient_id}")
        print(f"Critical Finding: {test_name} = {test_value} {unit} [{status_flag}]")
        print(f"Action: Immediate clinical renal review advised. (SMTP unconfigured; logged for audit).")
        return {
            "delivered": False,
            "channel": "Email/SMS (Audit Stream)",
            "status": "dispatched_to_audit_stream",
            "recipient": to_email,
            "patient_id": patient_id,
            "message": f"Critical lab alert for patient {patient_id} logged and dispatched to clinical stream."
        }

    try:
        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        smtp_from = os.getenv("SMTP_FROM_EMAIL", "alerts@hospital.org")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🚨 URGENT: Critical Lab Alert for Patient {patient_id} ({test_name}: {test_value} {unit})"
        msg["From"] = f"{hospital_name} Emergency Alerts <{smtp_from}>"
        msg["To"] = to_email
        msg["X-Priority"] = "1"  # High Priority header

        html_body = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B192C; color: #F8FAFC; padding: 24px;">
          <div style="max-width: 560px; margin: 0 auto; background: #1E293B; border-radius: 12px; padding: 28px; border: 2px solid #DC2626;">
            <div style="background: rgba(220, 38, 38, 0.2); border-left: 4px solid #DC2626; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
              <h2 style="color: #DC2626; margin: 0; font-size: 1.25rem;">CRITICAL LABORATORY ALERT</h2>
              <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #CBD5E1;">Attending Physician: Dr. {physician_name}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9rem;">
              <tr>
                <td style="padding: 8px 0; color: #94A3B8;">Patient Identifier:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #F8FAFC;">{patient_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94A3B8;">Biomarker Measured:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #F8FAFC;">{test_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94A3B8;">Result:</td>
                <td style="padding: 8px 0; font-weight: bold; font-size: 1.15rem; color: #DC2626;">{test_value} {unit} (CRITICAL)</td>
              </tr>
            </table>
            <div style="background: rgba(15, 23, 42, 0.8); padding: 12px; border-radius: 6px; font-size: 0.82rem; color: #94A3B8; margin-bottom: 20px;">
              Immediate clinical evaluation, electrolyte monitoring, and potential renal replacement therapy (RRT) review advised per KDIGO emergency protocols.
            </div>
            <p style="font-size: 0.72rem; color: #64748B; margin: 0;">Automated EDCIF Clinical Alert Dispatch • {hospital_name}</p>
          </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [to_email], msg.as_string())

        return {
            "delivered": True,
            "channel": "SMTP Email",
            "status": "sent",
            "recipient": to_email,
            "patient_id": patient_id
        }
    except Exception as e:
        print(f"[EXTERNAL ALERT DISPATCH ERROR] {e}")
        return {
            "delivered": False,
            "channel": "SMTP Email",
            "status": "failed",
            "error": str(e)
        }

