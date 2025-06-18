'use client'

import { useEffect, useRef } from 'react'
export default function AdventureLog({ rollLog, playerSeatMap }) {
  const logRef = useRef(null);

  // Auto-scroll to top to show newest messages (with flex-col-reverse)
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0; // Scroll to top to show newest messages
    }
  }, [rollLog]);


  // Helper function to format player name in title case
  const toTitleCase = (name) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };

  // Helper function to group consecutive player messages
  const groupMessages = (messages) => {
    const groups = [];
    const reversedMessages = [...messages].reverse(); // Work with newest first
    let currentGroup = null;

    reversedMessages.forEach((entry, index) => {
      const hasPlayerName = entry.player_name && entry.player_name !== "";
      const isPlayerMessage = (entry.type === "user" || entry.type === "dice" || entry.type === "player-roll") && hasPlayerName;
      const isSystemMessage = entry.type === "system";
      const isDungeonMasterMessage = entry.type === "dungeon-master";

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
            seatIndex: playerData?.seatIndex || 0,
            isPartyMember: playerIsInParty
          };
        }
      } else if (isDungeonMasterMessage) {
        // Dungeon Master messages are always individual and special
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({
          type: "dungeon-master",
          messages: [entry]
        });
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
        
      case "dungeon-master":
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
      case "dungeon-master":
        return "🔮";
      default:
        return "";
    }
  };

  const messageGroups = groupMessages(rollLog);

  return (
    <div className="adventure-log-section mt-6 w-full">
      <div className="log-header">
        📜 Adventure Log
        <span style={{ fontSize: '10px', color: '#6b7280' }}>(Live)</span>
      </div>
      <div className="log-entries flex flex-col-reverse" ref={logRef}>
        {messageGroups.map((group, groupIndex) => {
          if (group.type === "party-member") {
            // Party member message group with seat color
            return (
              <div
                key={`group-${groupIndex}`}
                className="party-message-group bg-slate-900/60 rounded-lg p-[calc(8px*var(--ui-scale))] shadow-lg backdrop-blur-sm border border-slate-400/10 border-l-4"
                style={{
                  borderLeftColor: `var(--seat-color-${group.seatIndex || 0})`,
                  marginBottom: 'calc(2px * var(--ui-scale))'
                }}
              >
                {/* Party member name header with timestamp */}
                <div 
                  className="player-name-header text-[calc(14px*var(--ui-scale))] font-bold mb-[calc(4px*var(--ui-scale))] drop-shadow-sm flex items-center justify-between"
                  style={{
                    color: `var(--seat-color-${group.seatIndex || 0})`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span>👥</span>
                    {toTitleCase(group.playerName)}
                  </div>
                  <span className="text-white/40 text-[calc(10px*var(--ui-scale))] font-mono">
                    {group.messages[0].timestamp}
                  </span>
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
                  </div>
                ))}
              </div>
            );
          } else if (group.type === "npc") {
            // NPC message group with different styling
            return (
              <div
                key={`group-${groupIndex}`}
                className="npc-message-group bg-amber-900/20 rounded-lg p-[calc(8px*var(--ui-scale))] shadow-md backdrop-blur-sm border border-amber-500/20"
                style={{
                  borderLeft: `4px solid #f59e0b`,
                  marginBottom: 'calc(2px * var(--ui-scale))'
                }}
              >
                {/* NPC name header with timestamp */}
                <div 
                  className="npc-name-header text-[calc(14px*var(--ui-scale))] font-bold mb-[calc(4px*var(--ui-scale))] drop-shadow-sm flex items-center justify-between text-amber-400"
                >
                  <div className="flex items-center gap-2">
                    <span>🗨️</span>
                    {toTitleCase(group.playerName)}
                  </div>
                  <span className="text-white/40 text-[calc(10px*var(--ui-scale))] font-mono">
                    {group.messages[0].timestamp}
                  </span>
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
                  </div>
                ))}
              </div>
            );
          } else if (group.type === "dungeon-master") {
            // Special Dungeon Master message - should stand out!
            const entry = group.messages[0];
            return (
              <div
                key={entry.id}
                className="dm-message bg-gradient-to-r from-purple-900/40 to-indigo-900/40 rounded-lg p-[calc(8px*var(--ui-scale))] border-2 border-purple-500/50 shadow-lg shadow-purple-500/20 backdrop-blur-sm"
                style={{ marginBottom: 'calc(2px * var(--ui-scale))' }}
              >
                {/* DM Header with special styling */}
                <div className="dm-header flex items-center gap-[calc(8px*var(--ui-scale))] mb-[calc(4px*var(--ui-scale))]">
                  <span className="text-[calc(18px*var(--ui-scale))] drop-shadow-lg">🔮</span>
                  <span className="text-purple-300 font-bold text-[calc(14px*var(--ui-scale))] drop-shadow-sm uppercase tracking-wider">
                    Dungeon Master
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-purple-500/50 to-transparent"></div>
                  <span className="text-purple-200/60 text-[calc(10px*var(--ui-scale))] font-mono">
                    {entry.timestamp}
                  </span>
                </div>
                
                {/* DM Message Content */}
                <div className="dm-content text-purple-100 text-[calc(14px*var(--ui-scale))] leading-relaxed font-medium">
                  {formatMessageContent(entry)}
                </div>
              </div>
            );
          } else if (group.type === "system") {
            // Minimal system message
            const entry = group.messages[0];
            return (
              <div
                key={entry.id}
                className="system-message py-[calc(6px*var(--ui-scale))] px-[calc(12px*var(--ui-scale))] text-[calc(11px*var(--ui-scale))] text-slate-400 bg-slate-400/5 rounded border border-slate-400/10 flex justify-between items-center italic"
                style={{ marginBottom: '0px' }}
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