/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react';
import Modal from '@/app/shared/components/Modal';
import {
  MODAL_TITLE,
  MODAL_CLOSE_BUTTON,
  EMERALD_BUTTON,
  BLUE_BUTTON,
  RED_BUTTON,
  PURPLE_BUTTON,
  EMERALD_HEADER,
  BLUE_HEADER,
  RED_HEADER,
  PURPLE_HEADER,
  MODAL_INPUT,
  MODAL_LABEL,
  MODAL_CANCEL_BUTTON
} from '../../styles/constants';

export default function DicePrompt({
  isOpen,
  onClose,
  selectedPlayer,
  onPromptRoll
}) {
  const handlePromptPlayerForRoll = (playerName, rollType) => {
    onPromptRoll(playerName, rollType);
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
          🎲 Prompt {selectedPlayer} to Roll
        </h3>
        <button
          className={MODAL_CLOSE_BUTTON}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Attack Rolls Section */}
      <div className="mb-6">
        <h4 className={EMERALD_HEADER}>
          Attack Rolls
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <button
            className={EMERALD_BUTTON}
            onClick={() => handlePromptPlayerForRoll(selectedPlayer, "Attack Roll")}
          >
            <div className="font-medium">Attack Roll</div>
            <div className="text-emerald-400/70 text-sm">Roll to hit target (d20 + modifiers)</div>
          </button>
          <button
            className={EMERALD_BUTTON}
            onClick={() => handlePromptPlayerForRoll(selectedPlayer, "Damage Roll")}
          >
            <div className="font-medium">Damage Roll</div>
            <div className="text-emerald-400/70 text-sm">Roll for damage if attack hits</div>
          </button>
        </div>
      </div>

      {/* Ability Checks Section */}
      <div className="mb-6">
        <h4 className={BLUE_HEADER}>
          Ability Checks
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: "Strength Check", desc: "Lifting, pushing, breaking" },
            { name: "Dexterity Check", desc: "Acrobatics, stealth" },
            { name: "Constitution Check", desc: "Endurance, holding breath" },
            { name: "Intelligence Check", desc: "Recall lore, solve puzzles" },
            { name: "Wisdom Check", desc: "Perception, insight" },
            { name: "Charisma Check", desc: "Persuasion, deception" }
          ].map((check, index) => (
            <button
              key={index}
              className={BLUE_BUTTON}
              onClick={() => handlePromptPlayerForRoll(selectedPlayer, check.name)}
            >
              <div className="font-medium">{check.name}</div>
              <div className="text-blue-400/70 text-sm">{check.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Saving Throws Section */}
      <div className="mb-6">
        <h4 className={RED_HEADER}>
          Saving Throws
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: "Strength Save", desc: "Resist being moved or grappled" },
            { name: "Dexterity Save", desc: "Avoid traps and area effects" },
            { name: "Constitution Save", desc: "Resist poison and disease" },
            { name: "Intelligence Save", desc: "Resist mental effects" },
            { name: "Wisdom Save", desc: "Resist charm and fear" },
            { name: "Charisma Save", desc: "Resist banishment" }
          ].map((save, index) => (
            <button
              key={index}
              className={RED_BUTTON}
              onClick={() => handlePromptPlayerForRoll(selectedPlayer, save.name)}
            >
              <div className="font-medium">{save.name}</div>
              <div className="text-red-400/70 text-sm">{save.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Roll Section */}
      <div className="mb-6">
        <h4 className={PURPLE_HEADER}>
          📝 Custom Roll
        </h4>
        <div className="space-y-3">
          <div>
            <label className={MODAL_LABEL}>
              What should {selectedPlayer} roll for?
            </label>
            <input
              type="text"
              placeholder="e.g., Arcana check to identify the rune, History to recall ancient lore..."
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
