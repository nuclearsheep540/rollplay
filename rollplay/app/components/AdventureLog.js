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

  // Helper function to get seat color for a player (hardcoded blue for now)
  const getPlayerSeatColor = (playerName) => {
    // For now, everyone gets blue - later you can assign different colors per seat
    return "#3b82f6"; // Blue color
    
    // Future implementation could be:
    // const seatIndex = gameSeats.findIndex(seat => seat.playerName === playerName);
    // const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];
    // return colors[seatIndex % colors.length] || "#3b82f6";
  };

  // Helper function to format player name in title case
  const toTitleCase = (name) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };

  // Helper function to format log message based on type
  const formatLogMessage = (entry) => {
    const { message, type, player_name } = entry;
    
    switch (type) {
      case "user":
      case "dice":
        // Prefix with player name in title case
        if (player_name) {
          return `${toTitleCase(player_name)}: ${message}`;
        }
        return message;
        
      case "system":
        // No prefix for system messages
        return message;
        
      default:
        return message;
    }
  };

  // Helper function to get message styling classes
  const getLogEntryClasses = (entry) => {
    const { type, message, player_name } = entry;
    let classes = `log-entry ${type}`;
    
    // Add backdrop for user and dice messages
    if (type === "user" || type === "dice") {
      classes += " has-backdrop";
    }
    
    // Special styling for system messages
    if (type === "system") {
      if (message.toLowerCase().includes("disconnected")) {
        classes += " system-disconnect";
      } else if (message.toLowerCase().includes("connected")) {
        classes += " system-connect";
      } else {
        classes += " system-default";
      }
    }
    
    return classes;
  };

  // Helper function to get left border color style
  const getLogEntryBorderStyle = (entry) => {
    const { type, player_name } = entry;
    
    if ((type === "user" || type === "dice") && player_name) {
      const playerColor = getPlayerSeatColor(player_name);
      return {
        borderLeftColor: playerColor,
        borderLeftWidth: 'calc(3px * var(--ui-scale))',
        borderLeftStyle: 'solid'
      };
    }
    
    return {};
  };

  return (
    <div className="adventure-log-section mt-6">
      <div className="log-header">
        📜 Adventure Log
        <span style={{ fontSize: '10px', color: '#6b7280' }}>(Live)</span>
      </div>
      <div className="log-entries" ref={logRef}>
        {rollLog.slice().reverse().map((entry) => (
          <div 
            key={entry.id} 
            className={getLogEntryClasses(entry)}
            style={{
              ...getLogEntryBorderStyle(entry),
              padding: `calc(12px * var(--ui-scale)) calc(16px * var(--ui-scale))`,
              borderRadius: `calc(6px * var(--ui-scale))`,
              fontSize: `calc(13px * var(--ui-scale))`,
              position: 'relative',
              minHeight: `calc(44px * var(--ui-scale))`,
              display: 'flex',
              alignItems: 'flex-start',
              marginBottom: `calc(8px * var(--ui-scale))`,
              transition: 'all 0.2s ease'
            }}
          >
            <div 
              className="log-entry-content"
              style={{
                flex: 1,
                lineHeight: 1.5,
                wordBreak: 'break-word'
              }}
            >
              {formatLogMessage(entry)}
            </div>
            <div 
              className="log-entry-timestamp"
              style={{
                position: 'absolute',
                top: `calc(6px * var(--ui-scale))`,
                right: `calc(8px * var(--ui-scale))`,
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: `calc(9px * var(--ui-scale))`,
                fontFamily: 'monospace'
              }}
            >
              {entry.timestamp}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}