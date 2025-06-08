'use client'

import { useEffect, useRef } from 'react'

export default function AdventureLog({ rollLog, gameSeats }) {
  const logRef = useRef(null);

  // Auto-scroll log to TOP when new entries are added (newest first)
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0; // Scroll to top for newest messages
    }
  }, [rollLog]);

  // Helper function to get seat color for a player
  const getPlayerSeatColor = (playerName) => {
    const seatIndex = gameSeats.findIndex(seat => seat.playerName === playerName);
    const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];
    return colors[seatIndex % colors.length] || "#3b82f6";
  };

  // Helper function to format player name in title case
  const toTitleCase = (name) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };

  // Helper function to group consecutive player messages
  const groupMessages = (messages) => {
    const reversedMessages = [...messages].reverse(); // Work with newest first
    const groups = [];
    let currentGroup = null;

    reversedMessages.forEach((entry, index) => {
      const isPlayerMessage = (entry.type === "user" || entry.type === "dice" || entry.type === "player-roll") && entry.player_name;
      const isSystemMessage = entry.type === "system";

      if (isPlayerMessage) {
        // Check if this continues the current player group
        if (currentGroup && 
            currentGroup.type === "player" && 
            currentGroup.playerName === entry.player_name) {
          // Add to existing group
          currentGroup.messages.push(entry);
        } else {
          // Start new player group
          if (currentGroup) groups.push(currentGroup);
          currentGroup = {
            type: "player",
            playerName: entry.player_name,
            messages: [entry],
            color: getPlayerSeatColor(entry.player_name)
          };
        }
      } else if (isSystemMessage) {
        // System messages are always individual
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({
          type: "system",
          messages: [entry]
        });
      } else {
        // Other message types (individual)
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({
          type: "individual",
          messages: [entry]
        });
      }
    });

    // Don't forget the last group
    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  };

  // Helper function to format message content
  const formatMessageContent = (entry) => {
    const { message, type, player_name } = entry;
    
    switch (type) {
      case "user":
      case "chat":
        return message; // Don't prefix player name for grouped messages
        
      case "dice":
      case "player-roll":
        return message; // Just show the roll result
        
      case "system":
        return message;
        
      default:
        return message;
    }
  };

  // Helper function to get message type icon
  const getMessageIcon = (entry) => {
    switch (entry.type) {
      case "dice":
      case "player-roll":
        return "🎲";
      case "user":
      case "chat":
        return "💬";
      case "system":
        return "";
      default:
        return "";
    }
  };

  const messageGroups = groupMessages(rollLog);

  return (
    <div className="adventure-log-section mt-6">
      <div className="log-header">
        📜 Adventure Log
        <span style={{ fontSize: '10px', color: '#6b7280' }}>(Live)</span>
      </div>
      <div className="log-entries" ref={logRef}>
        {messageGroups.map((group, groupIndex) => {
          if (group.type === "player") {
            // Player message group with visual wrapper
            return (
              <div
                key={`group-${groupIndex}`}
                className="player-message-group"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  borderLeft: `4px solid ${group.color}`,
                  borderRadius: `calc(8px * var(--ui-scale))`,
                  padding: `calc(16px * var(--ui-scale))`,
                  marginBottom: `calc(12px * var(--ui-scale))`,
                  boxShadow: `0 2px 8px rgba(0, 0, 0, 0.15)`,
                  backdropFilter: 'blur(4px)',
                  border: `1px solid rgba(148, 163, 184, 0.1)`
                }}
              >
                {/* Player name header */}
                <div 
                  className="player-name-header"
                  style={{
                    color: group.color,
                    fontSize: `calc(14px * var(--ui-scale))`,
                    fontWeight: 'bold',
                    marginBottom: `calc(8px * var(--ui-scale))`,
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
                  }}
                >
                  {toTitleCase(group.playerName)}
                </div>
                
                {/* Messages in this group */}
                {group.messages.map((entry, messageIndex) => (
                  <div
                    key={entry.id}
                    className="grouped-message"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      marginBottom: messageIndex < group.messages.length - 1 ? `calc(8px * var(--ui-scale))` : '0',
                      gap: `calc(8px * var(--ui-scale))`
                    }}
                  >
                    <span style={{ fontSize: `calc(14px * var(--ui-scale))`, opacity: 0.8 }}>
                      {getMessageIcon(entry)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div 
                        style={{
                          color: '#e2e8f0',
                          fontSize: `calc(14px * var(--ui-scale))`,
                          lineHeight: 1.4,
                          wordBreak: 'break-word'
                        }}
                      >
                        {formatMessageContent(entry)}
                      </div>
                    </div>
                    <div 
                      style={{
                        color: 'rgba(255, 255, 255, 0.4)',
                        fontSize: `calc(10px * var(--ui-scale))`,
                        fontFamily: 'monospace',
                        flexShrink: 0
                      }}
                    >
                      {entry.timestamp}
                    </div>
                  </div>
                ))}
              </div>
            );
          } else if (group.type === "system") {
            // Minimal system message
            const entry = group.messages[0];
            return (
              <div
                key={entry.id}
                className="system-message"
                style={{
                  padding: `calc(6px * var(--ui-scale)) calc(12px * var(--ui-scale))`,
                  marginBottom: `calc(4px * var(--ui-scale))`,
                  fontSize: `calc(11px * var(--ui-scale))`,
                  color: '#94a3b8',
                  backgroundColor: 'rgba(148, 163, 184, 0.05)',
                  borderRadius: `calc(4px * var(--ui-scale))`,
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontStyle: 'italic'
                }}
              >
                <span>{formatMessageContent(entry)}</span>
                <span 
                  style={{
                    fontSize: `calc(9px * var(--ui-scale))`,
                    opacity: 0.6,
                    fontFamily: 'monospace'
                  }}
                >
                  {entry.timestamp}
                </span>
              </div>
            );
          } else {
            // Individual message (fallback)
            const entry = group.messages[0];
            return (
              <div
                key={entry.id}
                style={{
                  padding: `calc(12px * var(--ui-scale)) calc(16px * var(--ui-scale))`,
                  borderRadius: `calc(6px * var(--ui-scale))`,
                  fontSize: `calc(13px * var(--ui-scale))`,
                  marginBottom: `calc(8px * var(--ui-scale))`,
                  backgroundColor: 'rgba(15, 23, 42, 0.3)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148, 163, 184, 0.1)'
                }}
              >
                {formatMessageContent(entry)}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}