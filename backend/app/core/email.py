"""Outgoing email (password reset links).

DEV MOCK: with no SMTP configured, development logs the message and returns it to the caller so flows can be
tested; every other environment raises 503 instead of pretending an email was sent. Configure SMTP_* in .env.
"""
import logging
import smtplib
from email.message import EmailMessage

from fastapi import HTTPException

from app.core.config import get_settings

log = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(get_settings().smtp_host)


def send_email(to: str, subject: str, body: str) -> bool:
    """Sends via SMTP. Returns False when it was only logged (development without SMTP)."""
    s = get_settings()
    if not s.smtp_host:
        if s.app_env == "development":
            log.warning("[DEV MOCK EMAIL] to=%s subject=%s\n%s", to, subject, body)
            return False
        raise HTTPException(503, "Email is not configured")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.smtp_from, to, subject
    msg.set_content(body)
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        smtp.send_message(msg)
    return True
