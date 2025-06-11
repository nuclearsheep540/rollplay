from enum import Enum

class LogType(Enum):
    """
    Enum defining the types of adventure log entries.
    
    Used to categorize log messages for filtering, styling, and processing.
    """
    
    # System-generated messages (connections, disconnections, combat state changes)
    SYSTEM = "system"
    
    # Player chat messages
    CHAT = "chat"
    
    # Player-initiated dice rolls and roll-related messages
    PLAYER_ROLL = "player-roll"
    
    # Dungeon Master actions and announcements
    DUNGEON_MASTER = "dungeon-master"
    
    @classmethod
    def get_valid_types(cls):
        """Return a list of all valid log type values."""
        return [log_type.value for log_type in cls]
    
    @classmethod
    def is_valid(cls, log_type_value):
        """Check if a given string is a valid log type."""
        return log_type_value in cls.get_valid_types()
    
    def __str__(self):
        """Return the string value for easy usage."""
        return self.value