"""SMTP üzerinden e-posta + PDF eki gönderir. Kimlik bilgileri ortam
değişkenlerinden okunur (GitHub Actions secret'ları): SMTP_HOST, SMTP_PORT,
SMTP_USERNAME, SMTP_PASSWORD, MAIL_FROM.
"""

from __future__ import annotations

import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_report_email(to_addrs: list[str], subject: str, body_text: str, pdf_bytes: bytes, pdf_filename: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ["SMTP_USERNAME"]
    password = os.environ["SMTP_PASSWORD"]
    mail_from = os.environ.get("MAIL_FROM") or username

    msg = MIMEMultipart()
    msg["From"] = mail_from
    msg["To"] = ", ".join(to_addrs)
    msg["Subject"] = subject
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    part = MIMEApplication(pdf_bytes, _subtype="pdf")
    part.add_header("Content-Disposition", "attachment", filename=pdf_filename)
    msg.attach(part)

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        server.login(username, password)
        server.sendmail(mail_from, to_addrs, msg.as_string())
