/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState } from 'react';
import { 
  MODERATOR_TITLE, 
  MODERATOR_HEADER, 
  MODERATOR_SUB_HEADER, 
  MODERATOR_CHILD,
  MODERATOR_CHILD_LAST,
  MODERATOR_ARROW,
  MODERATOR_SUBTITLE,
  MODERATOR_LABEL
} from '../styles/constants';

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
    <div>
      {/* Collapsible Header */}
      <div 
        className={MODERATOR_TITLE}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div>
          ⚖️ Moderator Controls
          <div className={MODERATOR_SUBTITLE} />
        </div>
        <div className={`${MODERATOR_ARROW} ${isCollapsed ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div>

      {/* Moderator Management Section */}
      <div className="flex-shrink-0">
        <div 
          className={MODERATOR_HEADER}
          onClick={() => toggleSection('moderators')}
        >
          👥 Manage Moderators
          <span className={`${MODERATOR_ARROW} ${expandedSections.moderators ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.moderators && (
          <div>
            <button 
              className={MODERATOR_CHILD} 
              onClick={() => openModeratorModal('add_moderator')}
            >
              ➕ Add Moderator
            </button>
            
            {(isHost || isDM) && (
              <button 
                className={MODERATOR_CHILD}
                onClick={() => openModeratorModal('remove_moderator')}
              >
                ➖ Remove Moderator
              </button>
            )}

            {/* Display current moderators */}
            {roomData?.moderators?.length > 0 && (
              <div className={MODERATOR_CHILD_LAST}>
                <div>Current Moderators:</div>
                <div>
                  {roomData.moderators.join(', ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DM Management Section */}
      <div className="flex-shrink-0">
        <div 
          className={MODERATOR_HEADER}
          onClick={() => toggleSection('dm')}
        >
          🎲 Manage DM
          <span className={`${MODERATOR_ARROW} ${expandedSections.dm ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.dm && (
          <div>
            {!roomData?.dungeon_master && (
              <button 
                className={MODERATOR_CHILD}
                onClick={() => openDMModal('set_dm')}
              >
                👑 Set Dungeon Master
              </button>
            )}
            
            {roomData?.dungeon_master && (isHost || isDM) && (
              <button 
                className={MODERATOR_CHILD}
                onClick={() => handleRoleAction('unset_dm', roomData.dungeon_master)}
              >
                🚫 Remove Dungeon Master
              </button>
            )}

            {/* Display current DM */}
            {roomData?.dungeon_master && (
              <div className={MODERATOR_CHILD_LAST}>
                <div>Current DM:</div>
                <div>
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
      <div className="flex-shrink-0">
        <div 
          className={MODERATOR_HEADER}
          onClick={() => toggleSection('party')}
        >
          👥 Party Management
          <span className={`${MODERATOR_ARROW} ${expandedSections.party ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.party && (
          <div>
            {/* Seat Count Management */}
            <div className={MODERATOR_CHILD}>
              <div className={MODERATOR_LABEL}>🪑 Seat Count</div>
              <div>
                <button 
                  className={MODERATOR_CHILD}
                  onClick={() => setIsSeatManagement(!isSeatManagement)}
                >
                  {isSeatManagement ? '📝' : '⚙️'} {isSeatManagement ? 'Set' : 'Manage'}
                </button>
                
                {isSeatManagement && (
                  <div>
                    {[2, 3, 4, 5, 6, 7, 8].map(count => (
                      <button
                        key={count}
                        className={MODERATOR_CHILD}
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
                  <span>
                    Current: {gameSeats?.length || 0}
                  </span>
                )}
              </div>
            </div>

            {/* Kick Player */}
            <button 
              className={MODERATOR_CHILD}
              onClick={() => setIsKickModalOpen(true)}
            >
              🚫 Kick Player
            </button>

            {/* Clear Messages */}
            <div>
              <button 
                className={`${MODERATOR_CHILD} ${
                  isClearingLogs 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 cursor-not-allowed'
                    : ''
                }`}
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
                className={`${MODERATOR_CHILD_LAST} ${
                  isClearingAllLogs 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 cursor-not-allowed'
                    : ''
                }`}
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