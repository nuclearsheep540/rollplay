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
  dungeonMaster = null,
  gameSeats,
  lobbyUsers,
  roomId,
  thisUserId,
  currentUser,
  onRoleChange, // Callback when roles are changed
  setSeatCount, // Function to change seat count
  handleKickPlayer, // Function to kick players
  handleClearSystemMessages, // Function to clear system messages
  displayNameMap = {},
  playerMetadata = {},
}) {
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    moderators: true,
    party: true
  });

  // State for modals
  const [isModeratorModalOpen, setIsModeratorModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(''); // 'add_moderator', 'remove_moderator'
  
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

  // Get active players (non-empty seats) — identity is seat.userId
  const activePlayers = gameSeats?.filter(seat => seat.userId && seat.userId !== "empty") || [];

  const formatCharacterSummary = (characterData) => {
    if (!characterData) return null;
    const classValue = characterData.character_class || characterData.class;
    const className = Array.isArray(classValue) ? classValue.join(' / ') : classValue;
    const level = characterData.level;
    if (!className || level === undefined || level === null) return null;
    return `${className} • Level ${level}`;
  };

  const seatedUserIds = new Set(
    activePlayers
      .map((seat) => seat.userId)
      .filter(Boolean)
  );

  const uniqueLobbyUsers = (lobbyUsers || []).filter((user) => {
    const lobbyUserId = user.user_id || user.id;
    if (!lobbyUserId) return false;
    return !seatedUserIds.has(lobbyUserId);
  });

  const playerHasSelectedCharacter = (userId) => {
    if (!userId) return false;
    if (!playerMetadata || typeof playerMetadata !== 'object') return false;
    return Boolean(playerMetadata[userId]?.character_id);
  };
  
  // Combine seated players and lobby users for DM/moderator selection
  const allAvailableUsers = [
    ...activePlayers,
    ...uniqueLobbyUsers.map(user => ({
      userId: user.user_id || user.id,
      playerName: user.player_name || user.name,
      seatId: `lobby_${user.user_id || user.id}`,
      characterData: null,
      isInLobby: true
    }))
  ];
  
  // Derive moderator IDs from playerMetadata (kept live via WebSocket broadcast)
  const roomModeratorIds = React.useMemo(() => {
    if (!playerMetadata || typeof playerMetadata !== 'object') return [];
    return Object.entries(playerMetadata)
      .filter(([_, meta]) => meta.campaign_role === 'mod')
      .map(([uid]) => uid);
  }, [playerMetadata]);

  // Handle role changes — sends userId to api-game
  const handleRoleAction = async (action, userId) => {
    try {
      let endpoint = '';
      let method = 'POST';
      let body = {};

      switch (action) {
        case 'add_moderator':
          endpoint = `/api/game/${roomId}/moderators`;
          body = { user_id: userId, requesting_user_id: thisUserId };
          break;
        case 'remove_moderator':
          endpoint = `/api/game/${roomId}/moderators`;
          method = 'DELETE';
          body = { user_id: userId, requesting_user_id: thisUserId };
          break;
      }

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        if (onRoleChange) {
          onRoleChange(action, userId);
        }
        
        // Close modals
        setIsModeratorModalOpen(false);
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
            {roomModeratorIds.length > 0 && (
              <div className={MODERATOR_CHILD_LAST}>
                <div>Current Moderators:</div>
                <div>
                  {roomModeratorIds.map(modId => displayNameMap[modId] || modId).join(', ')}
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
        showBackdrop={false}
        panelClassName="bg-slate-800 border border-blue-500/30 rounded-lg shadow-2xl"
      >
        <div style={{ padding: 'calc(24px * var(--ui-scale))' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-blue-300 font-bold">
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
              
              {(selectedAction === 'add_moderator' ? allAvailableUsers.length > 0 : roomModeratorIds.length > 0) ? (
                <div className="space-y-2">
                  {(() => {
                    let filteredUsers;

                    if (selectedAction === 'add_moderator') {
                      // Only non-adventurers can be moderators — compare by userId
                      filteredUsers = allAvailableUsers.filter(user => {
                        return !roomModeratorIds.includes(user.userId)
                               && user.userId !== dungeonMaster?.user_id
                               && !playerHasSelectedCharacter(user.userId);
                      });
                    } else {
                      // For remove_moderator, build user objects from derived moderator IDs
                      filteredUsers = roomModeratorIds.map(modUserId => ({
                          userId: modUserId,
                          playerName: displayNameMap[modUserId] || modUserId,
                          seatId: `moderator_${modUserId}`,
                          characterData: null,
                          isInLobby: false
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
                              onClick={() => handleRoleAction(selectedAction, moderator.userId)}
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
                        <div className="text-blue-400/70 text-xs mb-2 font-medium">SEATED PLAYERS</div>
                            {seatedFiltered.map((player) => (
                              <button
                                key={player.seatId}
                                className="w-full text-left p-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded transition-colors duration-200 hover:bg-blue-500/20"
                                onClick={() => handleRoleAction(selectedAction, player.userId)}
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
                                  <div className="text-blue-400 text-sm">
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
                            {seatedFiltered.length > 0 && <div className="my-3 border-t border-blue-500/20"></div>}
                            <div className="text-blue-400/70 text-xs mb-2 font-medium">LOBBY USERS</div>
                            {lobbyFiltered.map((user) => (
                              <button
                                key={user.seatId}
                                className="w-full text-left p-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded transition-colors duration-200 hover:bg-blue-500/20"
                                onClick={() => handleRoleAction(selectedAction, user.userId)}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">{user.playerName}</div>
                                    <div className="text-blue-400/70 text-sm">
                                      Connected • In Lobby
                                    </div>
                                  </div>
                                  <div className="text-blue-400 text-sm">
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
                        handleKickPlayer(player.userId);
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