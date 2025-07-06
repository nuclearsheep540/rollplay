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
        
    async def send_magic_link_email(self, to_email: str, magic_link: str) -> bool:
        """
        Send magic link email to user
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
            
            # Send email
            await self._send_email(to_email, subject, text_body, html_body)
            
            logger.info(f"Magic link email sent to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending magic link email to {to_email}: {str(e)}")
            return False
    
    async def _send_email(self, to_email: str, subject: str, text_body: str, html_body: str):
        """
        Send email via SMTP
        """
        try:
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
            
            # Development mode - just log the email
            if self.settings.environment == "dev":
                logger.info(f"[DEV MODE] Email that would be sent to {to_email}:")
                logger.info(f"Subject: {subject}")
                logger.info(f"Magic link: {self._extract_magic_link(html_body)}")
                return
            
            # Production mode - send actual email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                text = message.as_string()
                server.sendmail(self.from_email, to_email, text)
                
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
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