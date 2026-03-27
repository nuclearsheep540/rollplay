/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState } from 'react';
import {
  DM_CHILD,
  DM_CHILD_LAST,
  DM_ARROW,
  COMBAT_TOGGLE_ACTIVE,
  COMBAT_TOGGLE_INACTIVE,
  ACTIVE_BACKGROUND,
} from '../../styles/constants';
import DicePrompt from './DMDicePrompt';

// Local helper for title case (avoids prototype mutation)
const titleCase = (str) =>
  str.replace(/\w\S*/g, (txt) =>
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );

export default function CombatControlsPanel({
  promptPlayerRoll,
  promptAllPlayersInitiative,
  combatActive = true,
  setCombatActive,
  gameSeats,
  activePrompts = [],
  clearDicePrompt,
  characterNameMap = {},
  displayNameMap = {},
}) {
  // State for dice roll prompts
  const [selectedPlayerForPrompt, setSelectedPlayerForPrompt] = useState('general');
  const [isPlayerSelectExpanded, setIsPlayerSelectExpanded] = useState(true);
  const [rollPromptModalOpen, setRollPromptModalOpen] = useState(false);
  const [selectedPlayerForModal, setSelectedPlayerForModal] = useState('');

  const toggleCombat = () => {
    setCombatActive(!combatActive);
  };

  // Handle prompting specific player for specific roll type — uses userId
  const handlePromptPlayerForRoll = (userId, rollType) => {
    promptPlayerRoll(userId, rollType);
  };

  // Get list of players currently in seats (excluding empty seats) — identity is seat.userId
  const activePlayers = gameSeats?.filter(seat => seat.userId && seat.userId !== "empty") || [];


  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
        <DicePrompt
          isOpen={rollPromptModalOpen}
          onClose={() => setRollPromptModalOpen(false)}
          selectedPlayer={selectedPlayerForModal}
          selectedPlayerDisplayName={characterNameMap[selectedPlayerForModal] || displayNameMap[selectedPlayerForModal] || selectedPlayerForModal}
          onPromptRoll={handlePromptPlayerForRoll}
        />

        {/* Active Dice Prompts Status */}
        {activePrompts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                🎯 Active Prompts ({activePrompts.length})
              </div>
              {activePrompts.length > 1 && (
                <button
                  className={DM_CHILD + " max-w-32 text-center"}
                  onClick={() => clearDicePrompt(null, true)}
                >
                  Clear All
                </button>
              )}
            </div>

            <div>
              {activePrompts.map((prompt) => (
                <div key={prompt.id} className={DM_CHILD}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div>
                        {titleCase(characterNameMap[prompt.player] || displayNameMap[prompt.player] || prompt.player)} • {prompt.rollType}
                      </div>
                    </div>
                    <button
                      onClick={() => clearDicePrompt(prompt.id, false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Initiate Combat Toggle */}
        <div
          className={`${DM_CHILD} w-full flex items-center justify-between cursor-pointer`}
          onClick={toggleCombat}
        >
          ⚔️ Toggle Combat

          <div
            className={`rounded-full border-2 transition-colors duration-200 w-14 h-7 ${
              combatActive
                ? COMBAT_TOGGLE_ACTIVE
                : COMBAT_TOGGLE_INACTIVE
            }`}
          >
            <div
              className={`inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 w-4 h-4 m-1 ${
                combatActive ? 'translate-x-6' : 'translate-x-0'
              }`}
            ></div>
          </div>
        </div>

        <button
          className={`${DM_CHILD} w-full text-left`}
          onClick={() => {
            promptAllPlayersInitiative();
          }}
        >
          ⚡ Prompt All Players - Initiative
        </button>

        {/* Prompt Dice Throw - shows player selection */}
        <div>
          <button
            className={`${DM_CHILD} ${
              isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' ? ACTIVE_BACKGROUND : DM_CHILD_LAST
            }`}
            onClick={() => {
              setIsPlayerSelectExpanded(!isPlayerSelectExpanded);
              setSelectedPlayerForPrompt('general');
            }}
          >
            <span className={`${DM_ARROW} transform transition-transform ${isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' ? 'rotate-180' : ''}`}>
              ▼
            </span>
            🎲 Prompt Player Roll
          </button>

          {/* Player Selection (inline expansion) */}
          {isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' && (
            <div className="ml-4 mb-6">
              {activePlayers.length > 0 ? (
                activePlayers.map((player) => (
                  <button
                    key={player.seatId}
                    className={DM_CHILD}
                    onClick={() => {
                      setSelectedPlayerForModal(player.userId);
                      setRollPromptModalOpen(true);
                    }}
                  >
                    {titleCase(characterNameMap[player.userId] || displayNameMap[player.userId] || player.userId)}
                  </button>
                ))
              ) : (
                <div className={DM_CHILD_LAST}>
                  No players in game
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
}
