'use client'

import { React } from 'react'

export default function LobbyPanel({ lobbyUsers = [] }) {
  
  // Helper function to display player names in title case
  const toTitleCase = (name) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };

  // Don't render if no lobby users
  if (!lobbyUsers || lobbyUsers.length === 0) {
    return null;
  }

  return (
    <div className="lobby-section mt-4 mb-4">
      {/* Lobby Header */}
      <div className="lobby-header text-[calc(14px*var(--ui-scale))] font-semibold text-gray-300 mb-[calc(8px*var(--ui-scale))] flex items-center gap-[calc(6px*var(--ui-scale))]">
        <span>👥</span>
        <span>Lobby</span>
        <span className="text-[calc(10px*var(--ui-scale))] text-gray-500 font-normal">
          ({lobbyUsers.length} connected)
        </span>
      </div>

      {/* Lobby Users List */}
      <div className="lobby-users space-y-[calc(4px*var(--ui-scale))]">
        {lobbyUsers.map((user) => (
          <div
            key={user.id || user.name}
            className="lobby-user-item bg-slate-800/40 rounded-md px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] border border-slate-600/30 flex items-center gap-[calc(8px*var(--ui-scale))] transition-all duration-200 hover:bg-slate-700/40"
          >
            {/* Connection Status Indicator */}
            <div className="connection-indicator">
              <div className="w-[calc(8px*var(--ui-scale))] h-[calc(8px*var(--ui-scale))] bg-green-500 rounded-full shadow-sm shadow-green-500/50 animate-pulse"></div>
            </div>

            {/* User Name */}
            <div className="user-name text-[calc(12px*var(--ui-scale))] text-slate-300 font-medium flex-1">
              {toTitleCase(user.name)}
            </div>

            {/* Optional Status Badge */}
            <div className="status-badge text-[calc(9px*var(--ui-scale))] text-slate-500 bg-slate-700/50 px-[calc(4px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] rounded-full">
              Waiting
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}