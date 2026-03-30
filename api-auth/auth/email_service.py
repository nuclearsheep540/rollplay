# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pathlib import Path
import logging

import mailtrap as mt
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"
EXPIRY_MINUTES = 15


class EmailService:
    """
    Handles email rendering and sending via Mailtrap.
    Template selection and context building are the caller's responsibility.
    """

    def __init__(self, settings):
        self.from_email = settings.FROM_EMAIL
        self._client = mt.MailtrapClient(token=settings.MAIL_TRAP_API_TOKEN)
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
        Send email via Mailtrap API and return response information.
        """
        logger.info(f"Attempting to send email to {to_email} via Mailtrap")

        mail = mt.Mail(
            sender=mt.Address(email=self.from_email, name="Tabletop Tavern"),
            to=[mt.Address(email=to_email)],
            subject=subject,
            text=text_body,
            html=html_body,
            category="Authentication",
        )

        response = self._client.send(mail)
        logger.info(f"Mailtrap response: {response}")

        return response
