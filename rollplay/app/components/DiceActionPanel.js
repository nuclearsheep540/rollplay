'use client'

import { useState } from 'react'

export default function DiceActionPanel({
  currentTurn,
  thisPlayer,
  combatActive,
  onRollDice,
  onEndTurn,
  uiScale = 'medium',
  // UPDATED PROPS for multiple prompts
  activePrompts = [],        // Array of active prompts
  isDicePromptActive = false // Is any prompt currently active
}) {
  const [isDiceModalOpen, setIsDiceModalOpen] = useState(false);
  const [selectedDice, setSelectedDice] = useState('D20'); // Keep for backwards compatibility
  const [rollBonus, setRollBonus] = useState('');
  
  // Simplified dice system - just primary and optional secondary die
  const [secondDice, setSecondDice] = useState(''); // Empty string means no second die
  const [showSecondDice, setShowSecondDice] = useState(false); // Collapsible second dice section
  
  // Advantage/Disadvantage state (separate from dice)
  const [advantageMode, setAdvantageMode] = useState('normal'); // 'normal', 'advantage', 'disadvantage'
  
  // UPDATED: Check if player should see dice interface
  const isMyTurn = currentTurn === thisPlayer && combatActive;
  const myPrompts = activePrompts.filter(prompt => prompt.player === thisPlayer);
  const isPromptedToRoll = myPrompts.length > 0;
  const shouldShowDicePanel = isMyTurn || isPromptedToRoll;
  
  // UPDATED: Always show panel, but determine if it's active
  const isPanelActive = shouldShowDicePanel;
  
  // Handle dice roll click
  const handleRollDiceClick = () => {
    setIsDiceModalOpen(true);
  };
  
  // Helper function to add/remove second die
  const toggleSecondDie = (diceType) => {
    if (secondDice === diceType) {
      setSecondDice(''); // Remove if same type selected
    } else {
      setSecondDice(diceType); // Set new second die
    }
  };

  // Helper to toggle second dice section
  const toggleSecondDiceSection = () => {
    setShowSecondDice(!showSecondDice);
    if (showSecondDice) {
      setSecondDice(''); // Clear second die when collapsing
    }
  };

  // UPDATED: Handle actual dice roll with prompt context
  const handleDiceRoll = (rollFor = null) => {
    // Ensure rollFor is a string, not an event object
    let rollType = null;
    if (rollFor && typeof rollFor === 'string') {
      rollType = rollFor;
    } else if (!rollFor && myPrompts.length > 0) {
      // If rollFor is not specified and player has prompts, use the first prompt
      rollType = myPrompts[0].rollType;
    }
    
    const rollData = {
      dice: selectedDice,
      secondDice: secondDice,
      bonus: rollBonus,
      rollFor: rollType || 'Standard Roll',
      advantageMode: advantageMode
    };
    
    if (onRollDice) {
      onRollDice(thisPlayer, rollData); // Pass player name
    }
    setIsDiceModalOpen(false);
    // Reset states
    setSelectedDice('D20');
    setSecondDice('');
    setShowSecondDice(false);
    setRollBonus('');
    setAdvantageMode('normal');
  };
  
  // Handle end turn
  const handleEndTurn = () => {
    if (onEndTurn) {
      onEndTurn();
    }
  };

  // Don't render if player shouldn't see dice panel
  // UPDATED: Always render, just change styling based on active state
  // if (!shouldShowDicePanel) {
  //   return null;
  // }

  return (
    <>
      <div 
        className={`dice-action-panel transition-all duration-300 fixed bottom-[calc(24px*var(--ui-scale))] left-1/2 z-[100] ${
          isPanelActive 
            ? 'active-turn transform -translate-x-1/2 scale-100' 
            : 'inactive-turn transform -translate-x-1/2 scale-85'
        }`}
      >
        <div 
          className={`panel-container rounded-xl p-6 px-8 backdrop-blur-lg text-center min-w-[400px] border-2 ${
            isPanelActive 
              ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_8px_32px_rgba(16,185,129,0.2)]'
              : 'bg-slate-500/15 border-slate-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.2)]'
          } ${isPanelActive ? 'my-turn' : 'not-my-turn'}`}
        >
          {/* Status Indicator */}
          <div 
            className={`turn-indicator text-sm font-bold mb-3 drop-shadow-sm ${
              isPanelActive ? 'text-emerald-500' : 'text-slate-500'
            }`}
          >
            {isPromptedToRoll 
              ? myPrompts.length === 1 
                ? `Rolling for: ${myPrompts[0].rollType}` 
                : `${myPrompts.length} rolls requested`
              : isMyTurn 
                ? "Your Turn!" 
                : isPanelActive 
                  ? `${currentTurn}'s Turn`
                  : "Waiting..."
            }
          </div>

          {/* UPDATED: Show list of prompts if multiple */}
          {isPromptedToRoll && myPrompts.length > 1 && (
            <div className="prompts-list mb-3 space-y-1">
              {myPrompts.map((prompt) => (
                <div 
                  key={prompt.id}
                  className="bg-amber-500/20 border border-amber-500/40 rounded-lg p-2 text-amber-200 text-xs"
                >
                  🎯 {prompt.rollType}
                </div>
              ))}
            </div>
          )}

          {/* REMOVED: Redundant prompt indicator - info now in button */}

          {/* Show turn prompt if it's combat turn and not prompted */}
          {isMyTurn && combatActive && !isPromptedToRoll && (
            <div 
              className="combat-turn-indicator bg-emerald-500/15 border border-emerald-500/30 rounded-lg p-2 mb-3 text-emerald-500 text-xs font-bold"
            >
              ⚔️ Combat Turn
            </div>
          )}

          {/* Action Buttons */}
          <div 
            className="action-buttons flex gap-3 justify-center"
          >
            {/* Roll Dice Button */}
            <button
              className={`roll-dice-btn rounded-lg px-8 py-2.5 text-lg font-bold cursor-pointer transition-all duration-200 border-2 ${
                shouldShowDicePanel 
                  ? (isPromptedToRoll 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 hover:-translate-y-0.5' 
                      : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/30 hover:-translate-y-0.5') 
                  : 'bg-slate-500/10 border-slate-500/30 text-slate-500'
              } ${shouldShowDicePanel ? 'active' : 'inactive'}`}
              onClick={handleRollDiceClick}
            >
              🎲 Roll Dice
            </button>

            {/* End Turn Button - Only show during combat turns (not prompts) */}
            {isMyTurn && combatActive && !isPromptedToRoll && (
              <button
                className="end-turn-btn active bg-red-500/20 border-2 border-red-500/50 text-red-500 rounded-xl px-8 py-4 text-lg font-bold cursor-pointer transition-all duration-200 hover:bg-red-500/30 hover:-translate-y-0.5"
                onClick={handleEndTurn}
              >
                ⏭️ End Turn
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dice Roll Modal - Enhanced for prompts */}
      {isDiceModalOpen && (
        <div 
          className="dice-modal-overlay fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[1000]"
          onClick={() => setIsDiceModalOpen(false)}
        >
          <div 
            className="dice-modal bg-slate-800 border-2 border-emerald-500/40 rounded-2xl p-[calc(24px*var(--ui-scale))] max-w-[calc(500px*var(--ui-scale))] w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-emerald-500 text-[calc(20px*var(--ui-scale))] font-bold m-0">
                🎲 Roll Dice
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors text-[calc(20px*var(--ui-scale))] bg-transparent border-none cursor-pointer"
                onClick={() => setIsDiceModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* UPDATED: Compact prompts section */}
            {myPrompts.length > 0 && (
              <div className="p-3 rounded-lg mb-4 bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-xs text-emerald-200 text-center mb-2">
                  Roll For:
                </div>
                <div className="space-y-1">
                  {myPrompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="w-full p-2 text-white rounded-lg text-lg font-bold text-center"
                    >
                      {prompt.rollType}
                    </div>
                  ))}
                </div>
                {myPrompts.length > 1 && (
                  <div className="text-center mt-2 text-amber-400/70 text-xs">
                    Rolling will fulfill all prompts above
                  </div>
                )}
              </div>
            )}

            {/* Primary Dice Selection */}
            <div className="p-3 rounded-lg mb-3 bg-slate-600/50 border border-slate-500">
              <h4 className="text-sm mb-2 text-white">
                🎲 Choose Your Dice
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { name: 'D20', emoji: '🎲' },
                  { name: 'D12', emoji: '🔷' },
                  { name: 'D10', emoji: '🔟' },
                  { name: 'D8', emoji: '🔸' },
                  { name: 'D6', emoji: '⚀' },
                  { name: 'D4', emoji: '🔺' },
                ].map((dice) => (
                  <button
                    key={dice.name}
                    className={`p-3 rounded-md text-sm cursor-pointer flex flex-col items-center transition-all border-2 ${
                      selectedDice === dice.name 
                        ? 'bg-emerald-500/30 border-emerald-500/60 text-emerald-200' 
                        : 'bg-slate-600/30 border-slate-500 text-slate-300 hover:bg-slate-500/30'
                    }`}
                    onClick={() => setSelectedDice(dice.name)}
                  >
                    <div className="text-lg mb-1">
                      {dice.emoji}
                    </div>
                    <div className="font-bold text-xs">{dice.name}</div>
                  </button>
                ))}

                {/* D100 - Spans 2 columns */}
                <button
                  className={`p-3 rounded-md text-sm cursor-pointer flex flex-col items-center col-span-2 transition-all border-2 ${
                    selectedDice === 'D100' 
                      ? 'bg-emerald-500/30 border-emerald-500/60 text-emerald-200' 
                      : 'bg-slate-600/30 border-slate-500 text-slate-300 hover:bg-slate-500/30'
                  }`}
                  onClick={() => setSelectedDice('D100')}
                >
                  <div className="text-lg mb-1">
                    🎯
                  </div>
                  <div className="font-bold text-xs">D100</div>
                </button>
              </div>
            </div>

            {/* Collapsible Second Dice Section */}
            <div className="mb-3">
              <button
                onClick={toggleSecondDiceSection}
                className="w-full p-3 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-300 hover:bg-slate-600/50 transition-all flex items-center justify-between"
              >
                <span className="text-sm font-medium">
                  {showSecondDice ? '➖ Hide Second Die' : '➕ Add Second Die'}
                </span>
                <span className="text-slate-400">
                  {secondDice ? `(${secondDice} selected)` : '(Optional)'}
                </span>
              </button>
              
              {showSecondDice && (
                <div className="mt-3 p-3 rounded-lg bg-slate-600/50 border border-slate-500">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { name: 'D20', emoji: '🎲' },
                      { name: 'D12', emoji: '🔷' },
                      { name: 'D10', emoji: '🔟' },
                      { name: 'D8', emoji: '🔸' },
                      { name: 'D6', emoji: '⚀' },
                      { name: 'D4', emoji: '🔺' },
                    ].map((dice) => (
                      <button
                        key={dice.name}
                        className={`p-3 rounded-md text-sm cursor-pointer flex flex-col items-center transition-all border-2 ${
                          secondDice === dice.name 
                            ? 'bg-blue-500/30 border-blue-500/60 text-blue-200' 
                            : 'bg-slate-600/30 border-slate-500 text-slate-300 hover:bg-slate-500/30'
                        }`}
                        onClick={() => toggleSecondDie(dice.name)}
                      >
                        <div className="text-lg mb-1">
                          {dice.emoji}
                        </div>
                        <div className="font-bold text-xs">{dice.name}</div>
                      </button>
                    ))}

                    {/* D100 - Spans 2 columns */}
                    <button
                      className={`p-3 rounded-md text-sm cursor-pointer flex flex-col items-center col-span-2 transition-all border-2 ${
                        secondDice === 'D100' 
                          ? 'bg-blue-500/30 border-blue-500/60 text-blue-200' 
                          : 'bg-slate-600/30 border-slate-500 text-slate-300 hover:bg-slate-500/30'
                      }`}
                      onClick={() => toggleSecondDie('D100')}
                    >
                      <div className="text-lg mb-1">
                        🎯
                      </div>
                      <div className="font-bold text-xs">D100</div>
                    </button>
                  </div>
                  
                  {secondDice && (
                    <div className="mt-3 text-center">
                      <button
                        onClick={() => setSecondDice('')}
                        className="text-sm text-slate-400 hover:text-slate-300"
                      >
                        ✕ Remove Second Die
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Advantage/Disadvantage Buttons - Universal for D20 rolls */}
            <div className="p-3 rounded-lg mb-4 bg-slate-600/50 border border-slate-500">
              <div className="flex gap-4 justify-center">
                <button
                  className={`px-6 py-2 rounded-lg text-base font-medium transition-all border-2 flex-1 max-w-[200px] ${
                    advantageMode === 'advantage'
                      ? 'bg-green-500/30 border-green-500/60 text-green-300 shadow-lg shadow-green-500/20'
                      : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50 hover:border-slate-500'
                  }`}
                  onClick={() => setAdvantageMode(advantageMode === 'advantage' ? 'normal' : 'advantage')}
                >
                  📈 Advantage
                </button>
                <button
                  className={`px-6 py-2 rounded-lg text-base font-medium transition-all border-2 flex-1 max-w-[200px] ${
                    advantageMode === 'disadvantage'
                      ? 'bg-red-500/30 border-red-500/60 text-red-300 shadow-lg shadow-red-500/20'
                      : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50 hover:border-slate-500'
                  }`}
                  onClick={() => setAdvantageMode(advantageMode === 'disadvantage' ? 'normal' : 'disadvantage')}
                >
                  📉 Disadvantage
                </button>
              </div>
            </div>

            {/* Bonus Input */}
            <div className="p-3 rounded-lg mb-4 bg-slate-600/50 border border-slate-500">
              <div className="flex items-center gap-4">
                <h4 className="text-sm text-white whitespace-nowrap">
                  ➕ Add Bonus
                </h4>
                <input
                  type="text"
                  placeholder="e.g., +3, -1, +5"
                  value={rollBonus}
                  onChange={(e) => setRollBonus(e.target.value)}
                  className="py-2 px-3 rounded-md text-sm bg-slate-800 border border-slate-500 text-white flex-1"
                />
              </div>
            </div>

            {/* Roll Preview */}
            <div className="mb-3 p-2 bg-slate-700/30 rounded-lg border border-slate-600">
              <div className="text-sm text-slate-300 text-center">
                <strong>Roll Preview:</strong> {selectedDice}{secondDice ? ` + ${secondDice}` : ''}{advantageMode !== 'normal' ? ` (${advantageMode})` : ''}{rollBonus ? ` ${rollBonus}` : ''}
              </div>
            </div>

            {/* Roll Button */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => handleDiceRoll()}
                className="bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-500 rounded-xl px-6 py-3 text-base font-bold cursor-pointer transition-all duration-200 hover:bg-emerald-500/30 hover:scale-105"
              >
                🎲 Roll {selectedDice}{secondDice ? ` + ${secondDice}` : ''}{rollBonus ? ` ${rollBonus}` : ''}
                {myPrompts.length > 0 && (
                  <div className="text-xs text-emerald-400 mt-1">
                    {myPrompts.length === 1 
                      ? `for ${myPrompts[0].rollType}` 
                      : `for ${myPrompts.length} prompts`
                    }
                  </div>
                )}
              </button>

              <button
                onClick={() => setIsDiceModalOpen(false)}
                className="bg-slate-500/20 border-2 border-slate-500/50 text-slate-500 rounded-xl px-6 py-3 text-base font-bold cursor-pointer transition-all duration-200 hover:bg-slate-500/30"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}