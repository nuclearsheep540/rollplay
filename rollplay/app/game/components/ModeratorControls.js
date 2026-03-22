/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState } from 'react';
import Modal from '@/app/shared/components/Modal';
import {
  MODERATOR_HEADER,
  MODERATOR_CHILD,
  MODERATOR_CHILD_LAST,
  MODERATOR_ARROW,
  MODERATOR_LABEL,
} from '../../styles/constants';

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
  roleChangeTrigger // Timestamp or counter that changes when any role change occurs
}) {
  
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
  const [isKickModalOpen, setIsKickModalOpen] = useState(false);
  const [selectedPlayerToKick, setSelectedPlayerToKick] = useState('');
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Get active players (non-empty seats)
  const activePlayers = gameSeats?.filter(seat => seat.playerName !== "empty") || [];

  const formatCharacterSummary = (characterData) => {
    if (!characterData) return null;
    const classValue = characterData.character_class || characterData.class;
    const className = Array.isArray(classValue) ? classValue.join(' / ') : classValue;
    const level = characterData.level;
    if (!className || level === undefined || level === null) return null;
    return `${className} • Level ${level}`;
  };

  const seatedPlayerNames = new Set(
    activePlayers
      .map((seat) => seat.playerName)
      .filter(Boolean)
      .map((name) => name.toLowerCase())
  );

  const uniqueLobbyUsers = (lobbyUsers || []).filter((user) => {
    const lobbyName = user.player_name || user.name;
    if (!lobbyName) return false;
    return !seatedPlayerNames.has(lobbyName.toLowerCase());
  });

  const playerHasSelectedCharacter = (playerName) => {
    if (!playerName) return false;
    const playerMetadata = roomData?.player_metadata;
    if (!playerMetadata || typeof playerMetadata !== 'object') return false;
    return Boolean(playerMetadata[playerName.toLowerCase()]?.character_id);
  };
  
  // Combine seated players and lobby users for DM/moderator selection
  const allAvailableUsers = [
    ...activePlayers,
    ...uniqueLobbyUsers.map(user => ({
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

  // Refresh room data when any role change occurs (triggered by WebSocket events)
  React.useEffect(() => {
    if (roomId && roleChangeTrigger) {
      fetchRoomRoles();
    }
  }, [roleChangeTrigger, roomId]);

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
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">

      {/* Moderator Management Section */}
      <div className="flex-shrink-0">
        <div 
          className={MODERATOR_HEADER}
          onClick={() => toggleSection('moderators')}
        >
          Manage Moderators
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
              Add Moderator
            </button>
            
            {(isHost || isDM) && (
              <button 
                className={MODERATOR_CHILD}
                onClick={() => openModeratorModal('remove_moderator')}
              >
                Remove Moderator
              </button>
            )}

            {/* Display current moderators */}
            {(roomData?.moderators?.length > 0 || roomData?.room_host) && (
              <div className={MODERATOR_CHILD_LAST}>
                <div>Current Moderators:</div>
                <div>
                  {(() => {
                    // Always include the host, then add other moderators
                    const allModerators = [];
                    
                    // Add host first (they're always a moderator)
                    if (roomData?.room_host) {
                      allModerators.push(`${roomData.room_host} (Host)`);
                    }
                    
                    // Add other moderators (excluding host to avoid duplication)
                    if (roomData?.moderators) {
                      const otherModerators = roomData.moderators.filter(mod => mod !== roomData.room_host);
                      allModerators.push(...otherModerators);
                    }
                    
                    return allModerators.join(', ');
                  })()}
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
          Manage DM
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
                Set Dungeon Master
              </button>
            )}
            
            {roomData?.dungeon_master && (isHost || isDM) && (
              <button 
                className={MODERATOR_CHILD}
                onClick={() => handleRoleAction('unset_dm', roomData.dungeon_master)}
              >
                Remove Dungeon Master
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
      <Modal
        open={isModeratorModalOpen}
        onClose={() => setIsModeratorModalOpen(false)}
        size="md"
        panelClassName="bg-slate-800 border border-emerald-500/30 rounded-lg shadow-2xl"
      >
        <div style={{ padding: 'calc(24px * var(--ui-scale))' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-emerald-300 font-bold">
                {selectedAction === 'add_moderator' ? 'Add Moderator' : 'Remove Moderator'}
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
              
              {(selectedAction === 'add_moderator' ? allAvailableUsers.length > 0 : roomData?.moderators?.length > 0) ? (
                <div className="space-y-2">
                  {(() => {
                    let filteredUsers;
                    
                    if (selectedAction === 'add_moderator') {
                      // Only non-adventurers can be moderators.
                      filteredUsers = allAvailableUsers.filter(user => {
                        return !roomData?.moderators?.includes(user.playerName) 
                               && user.playerName !== roomData?.room_host
                               && !playerHasSelectedCharacter(user.playerName);
                      });
                    } else {
                      // For remove_moderator, create user objects directly from roomData.moderators
                      // Filter out the host to ensure there's always at least one moderator
                      filteredUsers = (roomData?.moderators || [])
                        .filter(moderatorName => moderatorName !== roomData?.room_host)
                        .map(moderatorName => ({
                          playerName: moderatorName,
                          seatId: `moderator_${moderatorName}`,
                          characterData: null,
                          isInLobby: false // We don't know/care if they're in lobby for removal
                        }));
                    }

                    if (selectedAction === 'remove_moderator') {
                      // For remove_moderator, show all moderators in a simple list
                      return (
                        <>
                          <div className="text-orange-400/70 text-xs mb-2 font-medium">CURRENT MODERATORS</div>
                          {filteredUsers.map((moderator) => (
                            <button
                              key={moderator.seatId}
                              className="w-full text-left p-3 bg-orange-500/10 border border-orange-500/30 text-orange-300 rounded transition-colors duration-200 hover:bg-orange-500/20"
                              onClick={() => handleRoleAction(selectedAction, moderator.playerName)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium">{moderator.playerName}</div>
                                  <div className="text-orange-400/70 text-sm">
                                    Moderator
                                  </div>
                                </div>
                                <div className="text-orange-400 text-sm">
                                  Remove
                                </div>
                              </div>
                            </button>
                          ))}
                        </>
                      );
                    }

                    // For add_moderator, use the original seated/lobby filtering
                    const seatedFiltered = filteredUsers.filter(user => !user.isInLobby);
                    const lobbyFiltered = filteredUsers.filter(user => user.isInLobby);

                    return (
                      <>
                        {/* Seated Players Section */}
                        {seatedFiltered.length > 0 && (
                          <>
                            <div className="text-emerald-400/70 text-xs mb-2 font-medium">SEATED PLAYERS</div>
                            {seatedFiltered.map((player) => (
                              <button
                                key={player.seatId}
                                className="w-full text-left p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded transition-colors duration-200 hover:bg-emerald-500/20"
                                onClick={() => handleRoleAction(selectedAction, player.playerName)}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">{player.playerName}</div>
                                    {formatCharacterSummary(player.characterData) && (
                                      <div className="text-gray-400 text-sm">
                                        {formatCharacterSummary(player.characterData)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-emerald-400 text-sm">
                                    Add
                                  </div>
                                </div>
                              </button>
                            ))}
                          </>
                        )}
                        
                        {/* Lobby Users Section - only for add_moderator */}
                        {lobbyFiltered.length > 0 && (
                          <>
                            {seatedFiltered.length > 0 && <div className="my-3 border-t border-emerald-500/20"></div>}
                            <div className="text-emerald-400/70 text-xs mb-2 font-medium">LOBBY USERS</div>
                            {lobbyFiltered.map((user) => (
                              <button
                                key={user.seatId}
                                className="w-full text-left p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded transition-colors duration-200 hover:bg-emerald-500/20"
                                onClick={() => handleRoleAction(selectedAction, user.playerName)}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">{user.playerName}</div>
                                    <div className="text-emerald-400/70 text-sm">
                                      Connected • In Lobby
                                    </div>
                                  </div>
                                  <div className="text-emerald-400 text-sm">
                                    Add
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
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-colors duration-200 hover:bg-gray-500"
                onClick={() => setIsModeratorModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
      </Modal>

      {/* DM Action Modal */}
      <Modal
        open={isDMModalOpen}
        onClose={() => setIsDMModalOpen(false)}
        size="md"
        panelClassName="bg-slate-800 border border-amber-500/30 rounded-lg shadow-2xl"
      >
        <div style={{ padding: 'calc(24px * var(--ui-scale))' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-amber-300 font-bold">
                Set Dungeon Master
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
                      <div className="text-amber-400/70 text-xs mb-2 font-medium">SEATED PLAYERS</div>
                      {activePlayers.map((player) => (
                        <button
                          key={player.seatId}
                          className="w-full text-left p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded transition-colors duration-200 hover:bg-amber-500/20"
                          onClick={() => handleRoleAction('set_dm', player.playerName)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{player.playerName}</div>
                              {formatCharacterSummary(player.characterData) && (
                                <div className="text-gray-400 text-sm">
                                  {formatCharacterSummary(player.characterData)}
                                </div>
                              )}
                            </div>
                            <div className="text-amber-400 text-sm">Set</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  
                  {/* Lobby Users Section */}
                  {uniqueLobbyUsers.length > 0 && (
                    <>
                      {activePlayers.length > 0 && <div className="my-3 border-t border-amber-500/20"></div>}
                      <div className="text-amber-400/70 text-xs mb-2 font-medium">LOBBY USERS</div>
                      {uniqueLobbyUsers.map((user) => (
                        <button
                          key={`lobby_${user.player_name || user.name}`}
                          className="w-full text-left p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded transition-colors duration-200 hover:bg-amber-500/20"
                          onClick={() => handleRoleAction('set_dm', user.player_name || user.name)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{user.player_name || user.name}</div>
                              <div className="text-amber-400/70 text-sm">
                                Connected • In Lobby
                              </div>
                            </div>
                            <div className="text-amber-400 text-sm">Set</div>
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
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-colors duration-200 hover:bg-gray-500"
                onClick={() => setIsDMModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
      </Modal>

      {/* Party Management Section */}
      <div className="flex-shrink-0">
        <div 
          className={MODERATOR_HEADER}
          onClick={() => toggleSection('party')}
        >
          Party Management
          <span className={`${MODERATOR_ARROW} ${expandedSections.party ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.party && (
          <div>
            {/* Seat Count Management */}
            <div className={MODERATOR_CHILD}>
              <div className={MODERATOR_LABEL}>Seat Count (Current: {gameSeats?.length || 0})</div>
              <div>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(count => (
                  <button
                    key={count}
                    className={count === (gameSeats?.length || 0) 
                      ? "m-1 bg-sky-300 hover:bg-sky-800 text-white font-semibold py-2 px-3 border-b-4 border-blue-700 hover:border-blue-500 rounded" 
                      : "m-1 bg-sky-600 hover:bg-sky-800 text-white font-semibold py-2 px-3 border-b-4 border-blue-700 hover:border-blue-500 rounded"
                    }
                    onClick={() => setSeatCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Kick Player */}
            <button 
              className={MODERATOR_CHILD}
              onClick={() => setIsKickModalOpen(true)}
            >
              Kick Player
            </button>

            {/* Clear Messages */}
            <button
              className={`${MODERATOR_CHILD_LAST} ${
                isClearingLogs
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 cursor-not-allowed'
                  : ''
              }`}
              onClick={async () => {
                if (!isClearingLogs) {
                  setIsClearingLogs(true);
                  try {
                    await handleClearSystemMessages();
                  } catch (error) {
                    console.error('Failed to clear system messages:', error);
                    alert('Failed to clear system messages. Please try again.');
                  } finally {
                    setIsClearingLogs(false);
                  }
                }
              }}
              disabled={isClearingLogs}
            >
              {isClearingLogs ? 'Clearing...' : 'Clear System Messages'}
            </button>
          </div>
        )}
      </div>

      {/* Kick Player Modal */}
      <Modal
        open={isKickModalOpen}
        onClose={() => setIsKickModalOpen(false)}
        size="md"
        panelClassName="bg-slate-800 border border-red-500/30 rounded-lg shadow-2xl"
      >
        <div style={{ padding: 'calc(24px * var(--ui-scale))' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-red-300 font-bold">Kick Player</h3>
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
                      className="w-full text-left p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded transition-colors duration-200 hover:bg-red-500/20"
                      onClick={() => {
                        handleKickPlayer(player.playerName);
                        setIsKickModalOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{player.playerName}</div>
                          {formatCharacterSummary(player.characterData) && (
                            <div className="text-gray-400 text-sm">
                              {formatCharacterSummary(player.characterData)}
                            </div>
                          )}
                        </div>
                        <div className="text-red-400 text-sm">Kick</div>
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
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-colors duration-200 hover:bg-gray-500"
                onClick={() => setIsKickModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
      </Modal>
    </div>
  );
}