# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Optional
import logging

import httpx
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"
EXPIRY_MINUTES = 15


class EmailService:
    """
    Handles email sending for authentication.
    """

    def __init__(self, settings):
        self.settings = settings
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL
        self.api_site_url = settings.API_SITE_INTERNAL_URL
        self.site_url = settings.NEXT_PUBLIC_API_URL
        self._jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

    async def check_user_exists(self, email: str) -> bool:
        """
        Check if an active user with this email exists in api-site.
        Falls back to False (returning-user template) on any error so the email always sends.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.api_site_url}/api/users/internal/check-email",
                    params={"email": email}
                )
                if response.status_code == 200:
                    return response.json().get("exists", False)
                logger.warning(f"check-email endpoint returned {response.status_code} for {email}")
        except Exception as e:
            logger.warning(f"Could not reach api-site to check email existence for {email}: {e}")
        return False

    def _render_template(self, template_name: str, context: dict) -> str:
        return self._jinja_env.get_template(template_name).render(**context)

    async def send_magic_link_email(self, to_email: str, magic_link: str, short_code: Optional[str] = None) -> dict:
        """
        Send a magic link email, selecting the appropriate template based on whether
        the user already exists in the system.
        """
        try:
            is_existing_user = await self.check_user_exists(to_email)
            template_name = (
                "magic_link_returning_user.html" if is_existing_user
                else "magic_link_new_user.html"
            )
            logger.info(f"Sending {'returning' if is_existing_user else 'new'} user template to {to_email}")

            formatted_code = (
                f"{short_code[:3]} {short_code[3:]}" if short_code and len(short_code) == 6
                else (short_code or "")
            )

            context = {
                "magic_link": magic_link,
                "short_code": short_code,
                "formatted_code": formatted_code,
                "expiry_minutes": EXPIRY_MINUTES,
                "site_url": self.site_url,
            }

            subject = "Sign in to Tabletop Tavern" if is_existing_user else "Welcome to Tabletop Tavern!"
            html_body = self._render_template(template_name, context)
            text_body = self._build_text_body(magic_link, formatted_code, is_existing_user)

            smtp_result = await self._send_email(to_email, subject, text_body, html_body)

            logger.info(f"Magic link email sent to {to_email} - SMTP Response: {smtp_result}")
            return {
                "success": True,
                "smtp_response": smtp_result,
                "message": "Magic link email sent successfully"
            }

        except Exception as e:
            logger.error(f"Error sending magic link email to {to_email}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to send magic link email"
            }

    def _build_text_body(self, magic_link: str, formatted_code: str, is_existing_user: bool) -> str:
        greeting = "Welcome back!" if is_existing_user else "Welcome to Tabletop Tavern!"
        intro = (
            "Here's your sign-in link:"
            if is_existing_user
            else "Tabletop Tavern is a virtual platform for running D&D campaigns and tabletop RPG sessions.\n\nClick the link below to sign in and get started:"
        )
        code_section = f"\nAlternative — enter this code on the login page: {formatted_code}\n" if formatted_code else ""
        return (
            f"{greeting}\n\n"
            f"{intro}\n"
            f"{magic_link}\n"
            f"{code_section}\n"
            f"This link will expire in {EXPIRY_MINUTES} minutes for security reasons.\n\n"
            f"If you didn't request this email, you can safely ignore it.\n\n"
            f"Tabletop Tavern — Virtual D&D Gaming Platform"
        )

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
