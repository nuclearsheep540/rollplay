"""
Server-side message template system for all log entries.
Provides centralized templates for system messages, DM actions, and other server-generated content.
Frontend handles all user messages and sends them pre-formatted.
"""

def format_message(template: str, **kwargs) -> str:
    """
    Format a message template with provided parameters.
    
    Args:
        template: Message template with {placeholders}
        **kwargs: Values to substitute
    
    Returns:
        Formatted message
    """
    return template.format(**kwargs)

# Centralized message templates for all server-generated log entries
MESSAGE_TEMPLATES = {
    "player_connected": "{player} connected",
    "player_disconnected": "{player} disconnected", 
    "party_updated": "Party updated: {players}",
    "combat_started": "Combat started by {player}",
    "combat_ended": "Combat ended by {player}",
    "messages_cleared": "{player} cleared {count} messages",
    "player_kicked": "{player} was removed from the game",
    "dice_prompt": "DM: {target}, please roll a {roll_type}",
    "initiative_prompt": "DM prompted all players for Initiative: {players}"
}