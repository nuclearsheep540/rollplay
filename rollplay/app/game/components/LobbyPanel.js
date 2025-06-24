'use client'

import { React } from 'react'

export default function LobbyPanel({ lobbyUsers = [] }) {
  
  // Helper function to display player names in title case
  const toTitleCase = (name) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };

  // Calculate connected vs disconnecting counts
  const connectedCount = lobbyUsers.filter(user => user.status !== 'disconnecting').length;
  const disconnectingCount = lobbyUsers.filter(user => user.status === 'disconnecting').length;

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
          ({connectedCount} connected{disconnectingCount > 0 ? ` : ${disconnectingCount} disconnecting` : ''})
        </span>
      </div>

      {/* Lobby Users Grid - 3 rows max, then columns */}
      <div className="lobby-users grid gap-[calc(2px*var(--ui-scale))]" style={{
        gridTemplateRows: `repeat(${Math.min(3, lobbyUsers.length)}, minmax(0, 1fr))`,
        gridAutoFlow: 'column',
        gridAutoColumns: 'minmax(0, 1fr)'
      }}>
        {lobbyUsers.map((user) => (
          <div
            key={user.id || user.name}
            className="lobby-user-item flex items-center gap-[calc(6px*var(--ui-scale))] px-[calc(4px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))]"
          >
            {/* Connection Status Indicator */}
            <div className="connection-indicator">
              {user.status === 'disconnecting' ? (
                <div className="w-[calc(6px*var(--ui-scale))] h-[calc(6px*var(--ui-scale))] bg-red-500 rounded-full"></div>
              ) : (
                <div className="w-[calc(6px*var(--ui-scale))] h-[calc(6px*var(--ui-scale))] bg-green-500 rounded-full"></div>
              )}
            </div>

            {/* User Name */}
            <div className={`user-name text-[calc(11px*var(--ui-scale))] font-medium ${
              user.status === 'disconnecting' ? 'text-slate-400 opacity-60' : 'text-slate-300'
            }`}>
              {toTitleCase(user.name)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}