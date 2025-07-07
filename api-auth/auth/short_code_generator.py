# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import random
import string
import time
from typing import Set

class ShortCodeGenerator:
    """
    Generates short, human-readable codes for OTP authentication
    """
    
    def __init__(self):
        # Use uppercase letters and numbers, excluding confusing characters
        self.characters = string.ascii_uppercase + string.digits
        # Remove confusing characters: 0, O, I, 1, L
        self.characters = self.characters.replace('0', '').replace('O', '').replace('I', '').replace('1', '').replace('L', '')
        self.used_codes: Set[str] = set()
    
    def generate_code(self, length: int = 6) -> str:
        """
        Generate a random short code
        Default length of 6 characters provides good balance of usability and security
        """
        max_attempts = 100
        attempts = 0
        
        while attempts < max_attempts:
            # Generate random code
            code = ''.join(random.choice(self.characters) for _ in range(length))
            
            # Ensure uniqueness (at least for this session)
            if code not in self.used_codes:
                self.used_codes.add(code)
                
                # Clean up old codes periodically to prevent memory growth
                if len(self.used_codes) > 10000:
                    self.used_codes.clear()
                
                return code
            
            attempts += 1
        
        # Fallback: use timestamp-based code if we can't generate unique one
        timestamp = str(int(time.time()))[-4:]  # Last 4 digits of timestamp
        random_suffix = ''.join(random.choice(self.characters) for _ in range(2))
        return f"{timestamp}{random_suffix}"
    
    def validate_code_format(self, code: str) -> bool:
        """
        Validate that a code matches the expected format
        """
        if not code:
            return False
        
        # Check length (should be 6 characters)
        if len(code) != 6:
            return False
        
        # Check that all characters are valid
        return all(c in self.characters for c in code.upper())
    
    def format_code_for_display(self, code: str) -> str:
        """
        Format code for display (e.g., add spacing: AB3 XYZ)
        """
        if len(code) == 6:
            return f"{code[:3]} {code[3:]}"
        return code