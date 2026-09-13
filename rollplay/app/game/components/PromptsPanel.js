/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState } from 'react';
import { resolveDisplayName } from '../resolveDisplayName';
import {
  DM_CHILD,
  DM_CHILD_LAST,
  DM_ARROW,
  ACTIVE_BACKGROUND,
} from '../../styles/constants';
import PlateButton from '@/app/dashboard/components/home/PlateButton';
import DicePrompt from './DMDicePrompt';

// Local helper for title case (avoids prototype mutation)
const titleCase = (str) =>
  str.replace(/\w\S*/g, (txt) =>
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );

/**
 * The GM's prompts: ask one player for a roll, or the whole table for something in the
 * GM's own words. Nothing here decides what a prompt means.
 */
export default function PromptsPanel({
  promptPlayerRoll,
  promptEveryone,
  gameSeats,
  activePrompts = [],
  clearDicePrompt,
  characterNameMap = {},
  displayNameMap = {},
  quickPicksFor = null,
}) {
  // State for dice roll prompts
  const [selectedPlayerForPrompt, setSelectedPlayerForPrompt] = useState('general');
  const [isPlayerSelectExpanded, setIsPlayerSelectExpanded] = useState(true);
  const [rollPromptModalOpen, setRollPromptModalOpen] = useState(false);
  const [selectedPlayerForModal, setSelectedPlayerForModal] = useState('');
  const [everyoneText, setEveryoneText] = useState('');

  const sendEveryone = () => {
    const text = everyoneText.trim();
    if (!text) return;
    promptEveryone(text);
    setEveryoneText('');
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
          selectedPlayerDisplayName={resolveDisplayName(selectedPlayerForModal, characterNameMap, displayNameMap)}
          onPromptRoll={handlePromptPlayerForRoll}
          quickPicks={quickPicksFor ? quickPicksFor(selectedPlayerForModal) : []}
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
                        {titleCase(resolveDisplayName(prompt.player, characterNameMap, displayNameMap))} • {prompt.rollType}
                        {prompt.groupPromptId && <span className="ml-1 opacity-60">(everyone)</span>}
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

        {/* Prompt everyone — the GM says what for */}
        <div className={`${DM_CHILD} w-full`}>
          <div className="mb-2">Prompt everyone</div>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0 px-2 py-1.5 rounded-sm border border-white/20 bg-black/30 text-sm text-content-on-dark"
              placeholder="What should everyone roll?"
              maxLength={120}
              value={everyoneText}
              onChange={(event) => setEveryoneText(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && sendEveryone()}
            />
            <PlateButton variant="gold" size="sm" onClick={sendEveryone} disabled={!everyoneText.trim()}>
              Prompt all
            </PlateButton>
          </div>
        </div>

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
                    {titleCase(resolveDisplayName(player.userId, characterNameMap, displayNameMap))}
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
