"""
Ultra-simple message formatter - just handles server-side system messages.
Frontend handles all user messages and sends them pre-formatted.
"""

def format_system_message(template: str, **kwargs) -> str:
    """
    Simple string formatting for server-side system messages only.
    
    Args:
        template: Message template with {placeholders}
        **kwargs: Values to substitute
    
    Returns:
        Formatted message
    """
    return template.format(**kwargs)

# System message templates
SYSTEM_TEMPLATES = {
    "player_connected": "{player} connected",
    "player_disconnected": "{player} disconnected", 
    "party_updated": "Party updated: {players}",
    "combat_started": "Combat started by {player}",
    "combat_ended": "Combat ended by {player}",
    "messages_cleared": "{player} cleared {count} messages",
    "party_size_changed": "{player} changed party size to {size} seats",
    "player_kicked": "{player} was removed from the game",
    "dice_prompt": "DM: {target}, please roll a {roll_type}",
    "initiative_prompt": "DM prompted all players for Initiative: {players}"
}