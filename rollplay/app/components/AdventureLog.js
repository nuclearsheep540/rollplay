'use client'

import { useEffect, useRef } from 'react'
export default function AdventureLog({ rollLog, playerSeatMap }) {
  const logRef = useRef(null);

  // Auto-scroll log to TOP when new entries are added (newest first)
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0; // Scroll to top for newest messages
    }
  }, [rollLog]);


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
      const hasPlayerName = entry.player_name && entry.player_name !== "";
      const isPlayerMessage = (entry.type === "user" || entry.type === "dice" || entry.type === "player-roll") && hasPlayerName;
      const isSystemMessage = entry.type === "system";

      if (isPlayerMessage) {
        const playerData = playerSeatMap[entry.player_name];
        const playerIsInParty = !!playerData;
        const messageType = playerIsInParty ? "party-member" : "npc";
        
        // Check if this continues the current group
        if (currentGroup && 
            currentGroup.type === messageType && 
            currentGroup.playerName === entry.player_name) {
          // Add to existing group
          currentGroup.messages.push(entry);
        } else {
          // Start new group
          if (currentGroup) groups.push(currentGroup);
          currentGroup = {
            type: messageType,
            playerName: entry.player_name,
            messages: [entry],
            seatColor: playerData?.seatColor || null,
            isPartyMember: playerIsInParty
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
          if (group.type === "party-member") {
            // Party member message group with seat color
            return (
              <div
                key={`group-${groupIndex}`}
                className={`party-message-group bg-slate-900/60 rounded-lg p-[calc(16px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))] shadow-lg backdrop-blur-sm border border-slate-400/10 border-l-4 border-l-${group.seatColor}-500`}
              >
                {/* Party member name header */}
                <div 
                  className={`player-name-header text-[calc(14px*var(--ui-scale))] font-bold mb-[calc(8px*var(--ui-scale))] drop-shadow-sm flex items-center gap-2 text-${group.seatColor}-400`}
                >
                  <span>👥</span>
                  {toTitleCase(group.playerName)}
                </div>
                
                {/* Messages in this group */}
                {group.messages.map((entry, messageIndex) => (
                  <div
                    key={entry.id}
                    className={`grouped-message flex items-start gap-[calc(8px*var(--ui-scale))] ${
                      messageIndex < group.messages.length - 1 ? 'mb-[calc(8px*var(--ui-scale))]' : ''
                    }`}
                  >
                    <span className="text-[calc(14px*var(--ui-scale))] opacity-80">
                      {getMessageIcon(entry)}
                    </span>
                    <div className="flex-1">
                      <div className="text-slate-200 text-[calc(14px*var(--ui-scale))] leading-normal break-words">
                        {formatMessageContent(entry)}
                      </div>
                    </div>
                    <div className="text-white/40 text-[calc(10px*var(--ui-scale))] font-mono flex-shrink-0">
                      {entry.timestamp}
                    </div>
                  </div>
                ))}
              </div>
            );
          } else if (group.type === "npc") {
            // NPC message group with different styling
            return (
              <div
                key={`group-${groupIndex}`}
                className="npc-message-group bg-amber-900/20 rounded-lg p-[calc(16px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))] shadow-md backdrop-blur-sm border border-amber-500/20"
                style={{
                  borderLeft: `4px solid #f59e0b`
                }}
              >
                {/* NPC name header */}
                <div 
                  className="npc-name-header text-[calc(14px*var(--ui-scale))] font-bold mb-[calc(8px*var(--ui-scale))] drop-shadow-sm flex items-center gap-2 text-amber-400"
                >
                  <span>🗨️</span>
                  {toTitleCase(group.playerName)}
                </div>
                
                {/* Messages in this group */}
                {group.messages.map((entry, messageIndex) => (
                  <div
                    key={entry.id}
                    className={`grouped-message flex items-start gap-[calc(8px*var(--ui-scale))] ${
                      messageIndex < group.messages.length - 1 ? 'mb-[calc(8px*var(--ui-scale))]' : ''
                    }`}
                  >
                    <span className="text-[calc(14px*var(--ui-scale))] opacity-80">
                      {getMessageIcon(entry)}
                    </span>
                    <div className="flex-1">
                      <div className="text-amber-100 text-[calc(14px*var(--ui-scale))] leading-normal break-words">
                        {formatMessageContent(entry)}
                      </div>
                    </div>
                    <div className="text-amber-200/40 text-[calc(10px*var(--ui-scale))] font-mono flex-shrink-0">
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
                className="system-message py-[calc(6px*var(--ui-scale))] px-[calc(12px*var(--ui-scale))] mb-[calc(4px*var(--ui-scale))] text-[calc(11px*var(--ui-scale))] text-slate-400 bg-slate-400/5 rounded border border-slate-400/10 flex justify-between items-center italic"
              >
                <span>{formatMessageContent(entry)}</span>
                <span className="text-[calc(9px*var(--ui-scale))] opacity-60 font-mono">
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
                className="py-[calc(12px*var(--ui-scale))] px-[calc(16px*var(--ui-scale))] rounded-md text-[calc(13px*var(--ui-scale))] mb-[calc(8px*var(--ui-scale))] bg-slate-900/30 text-slate-300 border border-slate-400/10"
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