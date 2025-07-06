# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """
    Handles email sending for authentication
    """
    
    def __init__(self, settings):
        self.settings = settings
        self.smtp_server = settings.smtp_server
        self.smtp_port = settings.smtp_port
        self.smtp_username = settings.smtp_username
        self.smtp_password = settings.smtp_password
        self.from_email = settings.from_email
        
    async def send_magic_link_email(self, to_email: str, magic_link: str) -> dict:
        """
        Send magic link email to user
        Returns dict with success status and SMTP response details
        """
        try:
            # Create email content
            subject = "Sign in to Tabletop Tavern"
            
            # HTML email template
            html_body = f"""
            <html>
            <head></head>
            <body>
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Welcome to Tabletop Tavern!</h2>
                    
                    <p>Click the link below to sign in to your account:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{magic_link}" 
                           style="background-color: #2563eb; color: white; padding: 12px 24px; 
                                  text-decoration: none; border-radius: 6px; display: inline-block;">
                            Sign In to Tabletop Tavern
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        This link will expire in 15 minutes for security reasons.
                    </p>
                    
                    <p style="color: #666; font-size: 14px;">
                        If you didn't request this email, you can safely ignore it.
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    
                    <p style="color: #999; font-size: 12px;">
                        Tabletop Tavern - Virtual D&D Gaming Platform
                    </p>
                </div>
            </body>
            </html>
            """
            
            # Plain text fallback
            text_body = f"""
            Welcome to Tabletop Tavern!
            
            Click the link below to sign in to your account:
            {magic_link}
            
            This link will expire in 15 minutes for security reasons.
            
            If you didn't request this email, you can safely ignore it.
            
            Tabletop Tavern - Virtual D&D Gaming Platform
            """
            
            # Send email and get SMTP response
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
    
    async def _send_email(self, to_email: str, subject: str, text_body: str, html_body: str) -> dict:
        """
        Send email via SMTP and return detailed response information
        """
        try:
            # Validate SMTP configuration - only server and from_email are required
            if not all([self.smtp_server, self.from_email]):
                raise ValueError("SMTP configuration incomplete. Check SMTP_SERVER and FROM_EMAIL environment variables.")
            
            logger.info(f"Attempting to send email to {to_email} via {self.smtp_server}:{self.smtp_port}")
            
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = subject
            message["From"] = self.from_email
            message["To"] = to_email
            
            # Add text and HTML parts
            text_part = MIMEText(text_body, "plain")
            html_part = MIMEText(html_body, "html")
            
            message.attach(text_part)
            message.attach(html_part)
            
            # Send actual email and capture SMTP responses
            smtp_responses = {}
            logger.info(f"Connecting to SMTP server {self.smtp_server}:{self.smtp_port}")
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                # Capture connection response
                connect_response = server.noop()
                smtp_responses["connection"] = {
                    "code": connect_response[0],
                    "message": connect_response[1].decode() if isinstance(connect_response[1], bytes) else str(connect_response[1])
                }
                logger.info(f"Connection response: {connect_response}")
                
                # Optional TLS encryption
                if self.smtp_port in [587, 465]:  # Standard TLS ports
                    logger.info("Starting TLS encryption")
                    tls_response = server.starttls()
                    smtp_responses["starttls"] = {
                        "code": tls_response[0],
                        "message": tls_response[1].decode() if isinstance(tls_response[1], bytes) else str(tls_response[1])
                    }
                    logger.info(f"TLS response: {tls_response}")
                else:
                    logger.info(f"Skipping TLS for port {self.smtp_port}")
                    smtp_responses["starttls"] = {"code": "skipped", "message": "TLS not used for this port"}
                
                # Optional authentication
                if self.smtp_username and self.smtp_password:
                    logger.info(f"Logging in with username: {self.smtp_username}")
                    login_response = server.login(self.smtp_username, self.smtp_password)
                    smtp_responses["login"] = {
                        "code": login_response[0] if login_response else "authenticated",
                        "message": login_response[1].decode() if login_response and len(login_response) > 1 and isinstance(login_response[1], bytes) else "Login successful"
                    }
                    logger.info(f"Login response: {login_response}")
                else:
                    logger.info("No authentication credentials provided - using open relay")
                    smtp_responses["login"] = {"code": "no_auth", "message": "No authentication required"}
                
                text = message.as_string()
                logger.info(f"Sending email from {self.from_email} to {to_email}")
                
                # sendmail returns a dictionary of refused recipients (empty if all successful)
                refused_recipients = server.sendmail(self.from_email, to_email, text)
                
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
                
                # Get final server status
                final_response = server.noop()
                smtp_responses["final_status"] = {
                    "code": final_response[0],
                    "message": final_response[1].decode() if isinstance(final_response[1], bytes) else str(final_response[1])
                }
                
                return smtp_responses
                
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            logger.error(f"SMTP Config - Server: {self.smtp_server}, Port: {self.smtp_port}, Username: {self.smtp_username}, From: {self.from_email}")
            raise
    
    def _extract_magic_link(self, html_body: str) -> str:
        """
        Extract magic link from HTML body for development logging
        """
        try:
            # Simple extraction for logging purposes
            start = html_body.find('href="') + 6
            end = html_body.find('"', start)
            return html_body[start:end]
        except:
            return "Could not extract magic link"