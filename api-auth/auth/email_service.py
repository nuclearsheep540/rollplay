# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
import logging

from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"
EXPIRY_MINUTES = 15


class EmailService:
    """
    Handles email rendering and sending via SMTP.
    Template selection and context building are the caller's responsibility.
    """

    def __init__(self, settings):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL
        self._jinja_env = Environment(
            loader=FileSystemLoader(TEMPLATES_DIR),
            autoescape=select_autoescape(["html"]),
        )

    def _render_template(self, template_name: str, context: dict) -> str:
        return self._jinja_env.get_template(template_name).render(**context)

    async def send_new_user_otp(self, to_email: str, magic_link: str, formatted_code: str, expiry_minutes: int, site_url: str) -> dict:
        """Send welcome OTP email to a new user."""
        try:
            context = {
                "magic_link": magic_link,
                "formatted_code": formatted_code,
                "expiry_minutes": expiry_minutes,
                "site_url": site_url,
            }
            subject = "Welcome to Tabletop Tavern!"
            html_body = self._render_template("magic_link_new_user.html", context)
            text_body = self._render_template("magic_link_new_user.txt", context)

            smtp_result = await self._send_email(to_email, subject, text_body, html_body)

            logger.info(f"New user OTP email sent to {to_email}")
            return {
                "success": True,
                "smtp_response": smtp_result,
                "message": "Email sent successfully",
            }
        except Exception as e:
            logger.error(f"Error sending new user OTP email to {to_email}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to send OTP email",
            }

    async def send_returning_user_otp(self, to_email: str, magic_link: str, formatted_code: str, screen_name: str, expiry_minutes: int, site_url: str) -> dict:
        """Send sign-in OTP email to a returning user. screen_name is required."""
        try:
            context = {
                "magic_link": magic_link,
                "formatted_code": formatted_code,
                "expiry_minutes": expiry_minutes,
                "site_url": site_url,
                "screen_name": screen_name,
            }
            subject = "Sign in to Tabletop Tavern"
            html_body = self._render_template("magic_link_returning_user.html", context)
            text_body = self._render_template("magic_link_returning_user.txt", context)

            smtp_result = await self._send_email(to_email, subject, text_body, html_body)

            logger.info(f"Returning user OTP email sent to {to_email}")
            return {
                "success": True,
                "smtp_response": smtp_result,
                "message": "Email sent successfully",
            }
        except Exception as e:
            logger.error(f"Error sending returning user OTP email to {to_email}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to send OTP email",
            }

    async def _send_email(self, to_email: str, subject: str, text_body: str, html_body: str) -> dict:
        """
        Send email via SMTP and return detailed response information.
        """
        if not all([self.smtp_server, self.from_email]):
            raise ValueError("SMTP configuration incomplete. Check SMTP_SERVER and FROM_EMAIL environment variables.")

        logger.info(f"Attempting to send email to {to_email} via {self.smtp_server}:{self.smtp_port}")

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = self.from_email
        message["To"] = to_email
        message.attach(MIMEText(text_body, "plain"))
        message.attach(MIMEText(html_body, "html"))

        smtp_responses = {}

        with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
            connect_response = server.noop()
            smtp_responses["connection"] = {
                "code": connect_response[0],
                "message": connect_response[1].decode() if isinstance(connect_response[1], bytes) else str(connect_response[1])
            }
            logger.info(f"Connection response: {connect_response}")

            if self.smtp_port in [587, 465]:
                tls_response = server.starttls()
                smtp_responses["starttls"] = {
                    "code": tls_response[0],
                    "message": tls_response[1].decode() if isinstance(tls_response[1], bytes) else str(tls_response[1])
                }
                logger.info(f"TLS response: {tls_response}")
            else:
                logger.info(f"Skipping TLS for port {self.smtp_port}")
                smtp_responses["starttls"] = {"code": "skipped", "message": "TLS not used for this port"}

            if self.smtp_username and self.smtp_password:
                login_response = server.login(self.smtp_username, self.smtp_password)
                smtp_responses["login"] = {
                    "code": login_response[0] if login_response else "authenticated",
                    "message": login_response[1].decode() if login_response and len(login_response) > 1 and isinstance(login_response[1], bytes) else "Login successful"
                }
                logger.info(f"Login response: {login_response}")
            else:
                logger.info("No authentication credentials provided - using open relay")
                smtp_responses["login"] = {"code": "no_auth", "message": "No authentication required"}

            refused_recipients = server.sendmail(self.from_email, to_email, message.as_string())
            if refused_recipients:
                smtp_responses["sendmail"] = {
                    "code": "rejected",
                    "message": f"Refused recipients: {refused_recipients}",
                    "refused_recipients": refused_recipients
                }
                logger.warning(f"Some recipients were refused: {refused_recipients}")
            else:
                smtp_responses["sendmail"] = {
                    "code": "250",
                    "message": "Email accepted for delivery",
                    "refused_recipients": {}
                }
                logger.info("Email sent successfully - all recipients accepted")

            final_response = server.noop()
            smtp_responses["final_status"] = {
                "code": final_response[0],
                "message": final_response[1].decode() if isinstance(final_response[1], bytes) else str(final_response[1])
            }

        return smtp_responses
