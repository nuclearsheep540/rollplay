/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState } from 'react';

export default function ModeratorControls({
  isModerator,
  isHost,
  isDM,
  gameSeats,
  lobbyUsers,
  roomId,
  thisPlayer,
  onRoleChange, // Callback when roles are changed
  sendRoleChange, // WebSocket function to broadcast role changes
  setSeatCount, // Function to change seat count
  handleKickPlayer, // Function to kick players
  handleClearSystemMessages, // Function to clear system messages
  handleClearAllMessages // Function to clear all messages
}) {
  
  // State for main panel collapse
  const [isCollapsed, setIsCollapsed] = useState(false);

  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    moderators: true,
    dm: true,
    party: true
  });

  // State for modals
  const [isModeratorModalOpen, setIsModeratorModalOpen] = useState(false);
  const [isDMModalOpen, setIsDMModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(''); // 'add_moderator', 'remove_moderator', 'set_dm'
  
  // State for party management
  const [isSeatManagement, setIsSeatManagement] = useState(false);
  const [isKickModalOpen, setIsKickModalOpen] = useState(false);
  const [selectedPlayerToKick, setSelectedPlayerToKick] = useState('');
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isClearingAllLogs, setIsClearingAllLogs] = useState(false);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Get active players (non-empty seats)
  const activePlayers = gameSeats?.filter(seat => seat.playerName !== "empty") || [];
  
  // Combine seated players and lobby users for DM/moderator selection
  const allAvailableUsers = [
    ...activePlayers,
    ...(lobbyUsers || []).map(user => ({
      playerName: user.player_name || user.name,
      seatId: `lobby_${user.player_name || user.name}`,
      characterData: null,
      isInLobby: true
    }))
  ];
  
  // Get current room data for displaying roles
  const [roomData, setRoomData] = useState(null);
  
  // Function to fetch current room roles
  const fetchRoomRoles = async () => {
    try {
      const response = await fetch(`/api/game/${roomId}`);
      if (response.ok) {
        const data = await response.json();
        setRoomData(data);
      }
    } catch (error) {
      console.error('Error fetching room data:', error);
    }
  };

  // Fetch room data on component mount
  React.useEffect(() => {
    if (roomId) {
      fetchRoomRoles();
    }
  }, [roomId]);

  // Handle role changes
  const handleRoleAction = async (action, playerName) => {
    try {
      let endpoint = '';
      let method = 'POST';
      let body = {};

      switch (action) {
        case 'add_moderator':
          endpoint = `/api/game/${roomId}/moderators`;
          body = { player_name: playerName, action: 'add' };
          break;
        case 'remove_moderator':
          endpoint = `/api/game/${roomId}/moderators`;
          method = 'DELETE';
          body = { player_name: playerName };
          break;
        case 'set_dm':
          endpoint = `/api/game/${roomId}/dm`;
          body = { player_name: playerName };
          break;
        case 'unset_dm':
          endpoint = `/api/game/${roomId}/dm`;
          method = 'DELETE';
          break;
      }

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        // Refresh room data and notify parent
        await fetchRoomRoles();
        if (onRoleChange) {
          onRoleChange(action, playerName);
        }
        
        // Broadcast role change via WebSocket (if sendRoleChange is available)
        if (sendRoleChange) {
          sendRoleChange(action, playerName);
        }
        
        // Close modals
        setIsModeratorModalOpen(false);
        setIsDMModalOpen(false);
      } else {
        const error = await response.json();
        alert(`Error: ${error.detail || 'Failed to update role'}`);
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role. Please try again.');
    }
  };

  const openModeratorModal = (action) => {
    setSelectedAction(action);
    setIsModeratorModalOpen(true);
  };

  const openDMModal = (action) => {
    setSelectedAction(action);
    setIsDMModalOpen(true);
  };

  // Show only if user is a moderator or host
  if (!isModerator && !isHost) {
    return null;
  }

  return (
    <div className="mb-3">
      {/* Collapsible Header */}
      <div 
        className="flex items-center justify-between cursor-pointer hover:bg-emerald-500/10 transition-all duration-200"
        style={{
          padding: 'calc(16px * var(--ui-scale))',
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="text-emerald-300 font-bold uppercase tracking-wide flex items-center gap-2" style={{
          fontSize: 'calc(14px * var(--ui-scale))',
        }}>
          ⚖️ Moderator Controls
          <div className="text-emerald-500/70 text-xs normal-case">
            ({isHost ? 'Host' : 'Moderator'})
          </div>
        </div>
        <div className={`text-emerald-500 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div style={{
          padding: '0 calc(16px * var(--ui-scale)) calc(16px * var(--ui-scale))',
        }}>

      {/* Moderator Management Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer bg-emerald-500/10 rounded transition-all duration-200 hover:bg-emerald-500/15 mb-0"
          style={{
            padding: 'calc(12px * var(--ui-scale))',
            borderRadius: 'calc(4px * var(--ui-scale))',
          }}
          onClick={() => toggleSection('moderators')}
        >
          <span className="text-emerald-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            👥 Manage Moderators
          </span>
          <span className={`text-emerald-500 transition-transform duration-200 ${expandedSections.moderators ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ▼
          </span>
        </div>
        {expandedSections.moderators && (
          <div className="mt-2 space-y-2">
            <button 
              className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-left transition-all duration-200 hover:bg-emerald-500/20" 
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
              }}
              onClick={() => openModeratorModal('add_moderator')}
            >
              ➕ Add Moderator
            </button>
            
            {(isHost || isDM) && (
              <button 
                className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-left transition-all duration-200 hover:bg-emerald-500/20" 
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  borderRadius: 'calc(4px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                }}
                onClick={() => openModeratorModal('remove_moderator')}
              >
                ➖ Remove Moderator
              </button>
            )}

            {/* Display current moderators */}
            {roomData?.moderators?.length > 0 && (
              <div className="mt-2 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded text-xs">
                <div className="text-emerald-400 mb-1">Current Moderators:</div>
                <div className="text-emerald-300/70">
                  {roomData.moderators.join(', ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DM Management Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer bg-emerald-500/10 border border-emerald-500/20 rounded transition-all duration-200 hover:bg-emerald-500/15 hover:border-emerald-500/30 mb-0 p-3"
          onClick={() => toggleSection('dm')}
        >
          <span className="text-emerald-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            🎲 Manage DM
          </span>
          <span className={`text-emerald-500 transition-transform duration-200 ${expandedSections.dm ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ▼
          </span>
        </div>
        {expandedSections.dm && (
          <div className="mt-2 space-y-2">
            {!roomData?.dungeon_master && (
              <button 
                className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-left transition-all duration-200 hover:bg-emerald-500/20" 
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  borderRadius: 'calc(4px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                }}
                onClick={() => openDMModal('set_dm')}
              >
                👑 Set Dungeon Master
              </button>
            )}
            
            {roomData?.dungeon_master && (isHost || isDM) && (
              <button 
                className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-left transition-all duration-200 hover:bg-emerald-500/20" 
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  borderRadius: 'calc(4px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                }}
                onClick={() => handleRoleAction('unset_dm', roomData.dungeon_master)}
              >
                🚫 Remove Dungeon Master
              </button>
            )}

            {/* Display current DM */}
            {roomData?.dungeon_master && (
              <div className="mt-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded text-xs">
                <div className="text-amber-400 mb-1">Current DM:</div>
                <div className="text-amber-300/70">
                  {roomData.dungeon_master}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Moderator Action Modal */}
      {isModeratorModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div 
            className="bg-slate-800 border border-emerald-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4"
            style={{
              padding: 'calc(24px * var(--ui-scale))',
              borderRadius: 'calc(12px * var(--ui-scale))',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-emerald-300 font-bold">
                {selectedAction === 'add_moderator' ? '➕ Add Moderator' : '➖ Remove Moderator'}
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setIsModeratorModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                {selectedAction === 'add_moderator' 
                  ? 'Select a player to promote to moderator:'
                  : 'Select a moderator to remove:'}
              </p>
              
              {allAvailableUsers.length > 0 ? (
                <div className="space-y-2">
                  {(() => {
                    // Filter users based on the action
                    const filteredUsers = allAvailableUsers.filter(user => {
                      if (selectedAction === 'add_moderator') {
                        // Only show users who aren't already moderators and aren't the host
                        return !roomData?.moderators?.includes(user.playerName) 
                               && user.playerName !== roomData?.room_host;
                      } else {
                        // Only show current moderators (not the host)
                        return roomData?.moderators?.includes(user.playerName);
                      }
                    });

                    const seatedFiltered = filteredUsers.filter(user => !user.isInLobby);
                    const lobbyFiltered = filteredUsers.filter(user => user.isInLobby);

                    return (
                      <>
                        {/* Seated Players Section */}
                        {seatedFiltered.length > 0 && (
                          <>
                            <div className={`text-xs mb-2 font-medium ${
                              selectedAction === 'add_moderator' ? 'text-emerald-400/70' : 'text-orange-400/70'
                            }`}>🪑 SEATED PLAYERS</div>
                            {seatedFiltered.map((player) => (
                              <button
                                key={player.seatId}
                                className={`w-full text-left p-3 rounded transition-all duration-200 ${
                                  selectedAction === 'add_moderator'
                                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                                    : 'bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20'
                                }`}
                                onClick={() => handleRoleAction(selectedAction, player.playerName)}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">{player.playerName}</div>
                                    {player.characterData && (
                                      <div className="text-gray-400 text-sm">
                                        {player.characterData.class} • Level {player.characterData.level}
                                      </div>
                                    )}
                                  </div>
                                  <div className={selectedAction === 'add_moderator' ? 'text-emerald-400' : 'text-orange-400'}>
                                    {selectedAction === 'add_moderator' ? '➕' : '➖'}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </>
                        )}
                        
                        {/* Lobby Users Section */}
                        {lobbyFiltered.length > 0 && (
                          <>
                            {seatedFiltered.length > 0 && <div className={`my-3 border-t ${
                              selectedAction === 'add_moderator' ? 'border-emerald-500/20' : 'border-orange-500/20'
                            }`}></div>}
                            <div className={`text-xs mb-2 font-medium ${
                              selectedAction === 'add_moderator' ? 'text-emerald-400/70' : 'text-orange-400/70'
                            }`}>🏛️ LOBBY USERS</div>
                            {lobbyFiltered.map((user) => (
                              <button
                                key={user.seatId}
                                className={`w-full text-left p-3 rounded transition-all duration-200 ${
                                  selectedAction === 'add_moderator'
                                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                                    : 'bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20'
                                }`}
                                onClick={() => handleRoleAction(selectedAction, user.playerName)}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">{user.playerName}</div>
                                    <div className={`text-sm ${
                                      selectedAction === 'add_moderator' ? 'text-emerald-400/70' : 'text-orange-400/70'
                                    }`}>
                                      📡 Connected • In Lobby
                                    </div>
                                  </div>
                                  <div className={selectedAction === 'add_moderator' ? 'text-emerald-400' : 'text-orange-400'}>
                                    {selectedAction === 'add_moderator' ? '➕' : '➖'}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </>
                        )}
                        
                        {filteredUsers.length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <p>No players available for this action</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No players available for this action</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-all duration-200 hover:bg-gray-500"
                onClick={() => setIsModeratorModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DM Action Modal */}
      {isDMModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div 
            className="bg-slate-800 border border-amber-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4"
            style={{
              padding: 'calc(24px * var(--ui-scale))',
              borderRadius: 'calc(12px * var(--ui-scale))',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-amber-300 font-bold">
                👑 Set Dungeon Master
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setIsDMModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Select a player to set as Dungeon Master:
              </p>
              
              {allAvailableUsers.length > 0 ? (
                <div className="space-y-2">
                  {/* Seated Players Section */}
                  {activePlayers.length > 0 && (
                    <>
                      <div className="text-amber-400/70 text-xs mb-2 font-medium">🪑 SEATED PLAYERS</div>
                      {activePlayers.map((player) => (
                        <button
                          key={player.seatId}
                          className="w-full text-left p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded transition-all duration-200 hover:bg-amber-500/20"
                          onClick={() => handleRoleAction('set_dm', player.playerName)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{player.playerName}</div>
                              {player.characterData && (
                                <div className="text-gray-400 text-sm">
                                  {player.characterData.class} • Level {player.characterData.level}
                                </div>
                              )}
                            </div>
                            <div className="text-amber-400">👑</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  
                  {/* Lobby Users Section */}
                  {lobbyUsers && lobbyUsers.length > 0 && (
                    <>
                      {activePlayers.length > 0 && <div className="my-3 border-t border-amber-500/20"></div>}
                      <div className="text-amber-400/70 text-xs mb-2 font-medium">🏛️ LOBBY USERS</div>
                      {lobbyUsers.map((user) => (
                        <button
                          key={`lobby_${user.player_name || user.name}`}
                          className="w-full text-left p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded transition-all duration-200 hover:bg-amber-500/20"
                          onClick={() => handleRoleAction('set_dm', user.player_name || user.name)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{user.player_name || user.name}</div>
                              <div className="text-amber-400/70 text-sm">
                                📡 Connected • In Lobby
                              </div>
                            </div>
                            <div className="text-amber-400">👑</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No players available</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-all duration-200 hover:bg-gray-500"
                onClick={() => setIsDMModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Party Management Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer bg-emerald-500/10 border border-emerald-500/20 rounded transition-all duration-200 hover:bg-emerald-500/15 hover:border-emerald-500/30 mb-0 p-3"
          onClick={() => toggleSection('party')}
        >
          <span className="text-emerald-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            👥 Party Management
          </span>
          <span className={`text-emerald-500 transition-transform duration-200 ${expandedSections.party ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ▼
          </span>
        </div>
        {expandedSections.party && (
          <div style={{ marginTop: 'calc(8px * var(--ui-scale))', display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--ui-scale))' }}>
            {/* Seat Count Management */}
            <div style={{ marginBottom: 'calc(8px * var(--ui-scale))' }}>
              <div className="text-emerald-300 font-medium mb-2" style={{
                fontSize: 'calc(11px * var(--ui-scale))',
              }}>🪑 Seat Count</div>
              <div className="flex items-center gap-2">
                <button 
                  className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded transition-all duration-200 hover:bg-emerald-500/20"
                  style={{
                    padding: 'calc(8px * var(--ui-scale))',
                    borderRadius: 'calc(4px * var(--ui-scale))',
                    fontSize: 'calc(12px * var(--ui-scale))',
                  }}
                  onClick={() => setIsSeatManagement(!isSeatManagement)}
                >
                  {isSeatManagement ? '📝' : '⚙️'} {isSeatManagement ? 'Set' : 'Manage'}
                </button>
                
                {isSeatManagement && (
                  <div className="flex items-center gap-2">
                    {[2, 3, 4, 5, 6, 7, 8].map(count => (
                      <button
                        key={count}
                        className={`border rounded transition-all duration-200 ${
                          gameSeats?.length === count
                            ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                        }`}
                        style={{
                          padding: 'calc(4px * var(--ui-scale)) calc(6px * var(--ui-scale))',
                          fontSize: 'calc(10px * var(--ui-scale))',
                        }}
                        onClick={() => {
                          setSeatCount(count);
                          setIsSeatManagement(false);
                        }}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                )}
                
                {!isSeatManagement && (
                  <span className="text-emerald-400/70" style={{
                    fontSize: 'calc(10px * var(--ui-scale))',
                  }}>
                    Current: {gameSeats?.length || 0}
                  </span>
                )}
              </div>
            </div>

            {/* Kick Player */}
            <button 
              className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-left transition-all duration-200 hover:bg-emerald-500/20"
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
              }}
              onClick={() => setIsKickModalOpen(true)}
            >
              🚫 Kick Player
            </button>

            {/* Clear Messages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--ui-scale))' }}>
              <button 
                className={`w-full border text-left rounded transition-all duration-200 ${
                  isClearingLogs 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 cursor-not-allowed'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                }`}
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  borderRadius: 'calc(4px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                }}
                onClick={() => {
                  if (!isClearingLogs) {
                    setIsClearingLogs(true);
                    handleClearSystemMessages().finally(() => setIsClearingLogs(false));
                  }
                }}
                disabled={isClearingLogs}
              >
                {isClearingLogs ? '🔄 Clearing...' : '🧹 Clear System Messages'}
              </button>
              
              <button 
                className={`w-full border text-left rounded transition-all duration-200 ${
                  isClearingAllLogs 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 cursor-not-allowed'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                }`}
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  borderRadius: 'calc(4px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                }}
                onClick={() => {
                  if (!isClearingAllLogs) {
                    setIsClearingAllLogs(true);
                    handleClearAllMessages().finally(() => setIsClearingAllLogs(false));
                  }
                }}
                disabled={isClearingAllLogs}
              >
                {isClearingAllLogs ? '🔄 Clearing...' : '💥 Clear All Messages'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Kick Player Modal */}
      {isKickModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div 
            className="bg-slate-800 border border-red-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4"
            style={{
              padding: 'calc(24px * var(--ui-scale))',
              borderRadius: 'calc(12px * var(--ui-scale))',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-red-300 font-bold">🚫 Kick Player</h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setIsKickModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">Select a player to remove from the game:</p>
              
              {activePlayers.length > 0 ? (
                <div className="space-y-2">
                  {activePlayers.map((player) => (
                    <button
                      key={player.seatId}
                      className="w-full text-left p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded transition-all duration-200 hover:bg-red-500/20"
                      onClick={() => {
                        handleKickPlayer(player.playerName);
                        setIsKickModalOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{player.playerName}</div>
                          {player.characterData && (
                            <div className="text-gray-400 text-sm">
                              {player.characterData.class} • Level {player.characterData.level}
                            </div>
                          )}
                        </div>
                        <div className="text-red-400">🚫</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No players to kick</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-all duration-200 hover:bg-gray-500"
                onClick={() => setIsKickModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}