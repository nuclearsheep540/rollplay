/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react';
import Modal from '@/app/shared/components/Modal';
import {
  MODAL_TITLE,
  MODAL_CLOSE_BUTTON,
  BLUE_BUTTON,
  PURPLE_BUTTON,
  BLUE_HEADER,
  PURPLE_HEADER,
  MODAL_INPUT,
  MODAL_LABEL,
  MODAL_CANCEL_BUTTON
} from '../../styles/constants';

export default function DicePrompt({
  isOpen,
  onClose,
  selectedPlayer,
  selectedPlayerDisplayName,
  onPromptRoll,
  quickPicks = [],
}) {
  const displayName = selectedPlayerDisplayName || 'Unknown Adventurer'; // never the raw user_id (PII)

  const handlePromptPlayerForRoll = (userId, rollType) => {
    onPromptRoll(userId, rollType);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="2xl"
      panelClassName="bg-slate-800 border border-amber-500/30 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className={MODAL_TITLE}>
          🎲 Prompt {displayName} to Roll
        </h3>
        <button
          className={MODAL_CLOSE_BUTTON}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Quick picks: the attributes on this player's own sheet. The app knows no rulebook;
          what a roll is called is the campaign's word, taken from the config the GM wrote. */}
      {quickPicks.length > 0 && (
        <div className="mb-6">
          <h4 className={BLUE_HEADER}>
            From their sheet
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {quickPicks.map((label) => (
              <button
                key={label}
                className={BLUE_BUTTON}
                onClick={() => handlePromptPlayerForRoll(selectedPlayer, label)}
              >
                <div className="font-medium">{label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Roll Section */}
      <div className="mb-6">
        <h4 className={PURPLE_HEADER}>
          📝 Anything else
        </h4>
        <div className="space-y-3">
          <div>
            <label className={MODAL_LABEL}>
              What should {displayName} roll for?
            </label>
            <input
              type="text"
              placeholder="e.g., a check to spot the ambush, a roll to recall the old rite..."
              className={MODAL_INPUT}
              id="customRollInput"
            />
          </div>
          <button
            className={PURPLE_BUTTON}
            onClick={() => {
              const customRoll = document.getElementById('customRollInput').value.trim();
              if (customRoll) {
                handlePromptPlayerForRoll(selectedPlayer, customRoll);
              } else {
                alert("Please enter what the player should roll for.");
              }
            }}
          >
            🎲 Send Custom Roll Request
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className={MODAL_CANCEL_BUTTON}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
