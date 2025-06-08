'use client'

import { useState } from 'react'

export default function DiceActionPanel({
  currentTurn,
  thisPlayer,
  combatActive,
  onRollDice,
  onEndTurn,
  uiScale = 'medium',
  // NEW PROPS for prompts
  promptedPlayer = null,     // Who is prompted to roll
  rollPrompt = null,         // What they're rolling for
  isDicePromptActive = false // Is a prompt currently active
}) {
  const [isDiceModalOpen, setIsDiceModalOpen] = useState(false);
  const [selectedDice, setSelectedDice] = useState('D20');
  const [rollBonus, setRollBonus] = useState('');
  
  // UPDATED: Check if player should see dice interface
  const isMyTurn = currentTurn === thisPlayer && combatActive;
  const isPromptedToRoll = promptedPlayer === thisPlayer && isDicePromptActive;
  const shouldShowDicePanel = isMyTurn || isPromptedToRoll;
  
  // UPDATED: Always show panel, but determine if it's active
  const isPanelActive = shouldShowDicePanel;
  
  // Handle dice roll click
  const handleRollDiceClick = () => {
    setIsDiceModalOpen(true);
  };
  
  // Handle actual dice roll with type, bonus, and what they're rolling for
  const handleDiceRoll = () => {
    const rollData = {
      dice: selectedDice,
      bonus: rollBonus,
      rollFor: rollPrompt || 'General Roll'
    };
    
    if (onRollDice) {
      onRollDice(thisPlayer, rollData); // Pass player name
    }
    setIsDiceModalOpen(false);
    setSelectedDice('D20'); // Reset to default
    setRollBonus(''); // Clear bonus
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
        className={`dice-action-panel transition-all duration-300 ${
          isPanelActive 
            ? 'active-turn' 
            : 'inactive-turn'
        }`}
        style={{
          position: 'fixed',
          bottom: `calc(20px * var(--ui-scale))`,
          left: '50%',
          transform: `translateX(-50%) ${isPanelActive ? 'scale(1)' : 'scale(0.85)'}`,
          zIndex: 100,
          transition: 'all 0.3s ease'
        }}
      >
        <div 
          className={`panel-container ${isPanelActive ? 'my-turn' : 'not-my-turn'}`}
          style={{
            backgroundColor: isPanelActive 
              ? (isPromptedToRoll 
                  ? 'rgba(16, 185, 129, 0.15)' // GREEN for prompts
                  : 'rgba(16, 185, 129, 0.15)') // GREEN for turns
              : 'rgba(100, 116, 139, 0.15)', // Gray when inactive
            border: `2px solid ${isPanelActive 
              ? (isPromptedToRoll 
                  ? 'rgba(16, 185, 129, 0.4)' // GREEN border for prompts
                  : 'rgba(16, 185, 129, 0.4)') // GREEN border for turns
              : 'rgba(100, 116, 139, 0.3)'}`, // Gray border when inactive
            borderRadius: `calc(12px * var(--ui-scale))`,
            padding: `calc(24px * var(--ui-scale)) calc(32px * var(--ui-scale))`, // Bigger padding for bigger button
            backdropFilter: 'blur(8px)',
            boxShadow: isPanelActive 
              ? (isPromptedToRoll 
                  ? '0 8px 32px rgba(16, 185, 129, 0.2)' // GREEN glow for prompts
                  : '0 8px 32px rgba(16, 185, 129, 0.2)') // GREEN glow for turns
              : '0 4px 16px rgba(0, 0, 0, 0.2)',
            minWidth: `calc(400px * var(--ui-scale))`, // Bigger container for bigger button
            textAlign: 'center'
          }}
        >
          {/* Status Indicator */}
          <div 
            className="turn-indicator"
            style={{
              color: isPanelActive 
                ? (isPromptedToRoll ? '#10b981' : '#10b981') // GREEN for both
                : '#64748b',
              fontSize: `calc(14px * var(--ui-scale))`, // Back to original
              fontWeight: 'bold',
              marginBottom: `calc(12px * var(--ui-scale))`, // Back to original
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
            }}
          >
            {isPromptedToRoll 
              ? `Rolling for: ${rollPrompt}` 
              : isMyTurn 
                ? "Your Turn!" 
                : isPanelActive 
                  ? `${currentTurn}'s Turn`
                  : "Waiting..."
            }
          </div>

          {/* REMOVED: Redundant prompt indicator - info now in button */}

          {/* Show turn prompt if it's combat turn and not prompted */}
          {isMyTurn && combatActive && !isPromptedToRoll && (
            <div 
              className="combat-turn-indicator"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: `calc(8px * var(--ui-scale))`,
                padding: `calc(8px * var(--ui-scale))`, // Back to original
                marginBottom: `calc(12px * var(--ui-scale))`, // Back to original
                color: '#10b981',
                fontSize: `calc(12px * var(--ui-scale))`, // Back to original
                fontWeight: 'bold'
              }}
            >
              ⚔️ Combat Turn
            </div>
          )}

          {/* Action Buttons */}
          <div 
            className="action-buttons"
            style={{
              display: 'flex',
              gap: `calc(12px * var(--ui-scale))`, // Back to original
              justifyContent: 'center'
            }}
          >
            {/* Roll Dice Button */}
            <button
              className={`roll-dice-btn ${shouldShowDicePanel ? 'active' : 'inactive'}`}
              onClick={handleRollDiceClick}
              style={{
                backgroundColor: shouldShowDicePanel 
                  ? (isPromptedToRoll 
                      ? 'rgba(249, 115, 22, 0.2)' 
                      : 'rgba(16, 185, 129, 0.2)') 
                  : 'rgba(100, 116, 139, 0.1)',
                border: `2px solid ${shouldShowDicePanel 
                  ? (isPromptedToRoll 
                      ? 'rgba(249, 115, 22, 0.5)' 
                      : 'rgba(16, 185, 129, 0.5)') 
                  : 'rgba(100, 116, 139, 0.3)'}`,
                color: shouldShowDicePanel 
                  ? (isPromptedToRoll ? '#fb923c' : '#10b981') 
                  : '#64748b',
                borderRadius: `calc(8px * var(--ui-scale))`,
                padding: `calc(10px * var(--ui-scale)) calc(20px * var(--ui-scale))`,
                fontSize: `calc(14px * var(--ui-scale))`,
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (shouldShowDicePanel) {
                  e.target.style.backgroundColor = isPromptedToRoll 
                    ? 'rgba(249, 115, 22, 0.3)' 
                    : 'rgba(16, 185, 129, 0.3)';
                  e.target.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (shouldShowDicePanel) {
                  e.target.style.backgroundColor = isPromptedToRoll 
                    ? 'rgba(249, 115, 22, 0.2)' 
                    : 'rgba(16, 185, 129, 0.2)';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              🎲 Roll Dice
            </button>

            {/* End Turn Button - Only show during combat turns (not prompts) */}
            {isMyTurn && combatActive && !isPromptedToRoll && (
              <button
                className="end-turn-btn active"
                onClick={handleEndTurn}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  border: '2px solid rgba(239, 68, 68, 0.5)',
                  color: '#ef4444',
                  borderRadius: `calc(12px * var(--ui-scale))`,
                  padding: `calc(16px * var(--ui-scale)) calc(32px * var(--ui-scale))`, // Bigger to match
                  fontSize: `calc(18px * var(--ui-scale))`, // Bigger font
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                  e.target.style.transform = 'translateY(0)';
                }}
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
          className="dice-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setIsDiceModalOpen(false)}
        >
          <div 
            className="dice-modal"
            style={{
              backgroundColor: '#1e293b',
              border: `2px solid rgba(16, 185, 129, 0.4)`, // GREEN border always
              borderRadius: `calc(16px * var(--ui-scale))`,
              padding: `calc(24px * var(--ui-scale))`,
              maxWidth: `calc(500px * var(--ui-scale))`,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 
                style={{
                  color: '#10b981', // GREEN always
                  fontSize: `calc(20px * var(--ui-scale))`, // Back to original
                  fontWeight: 'bold',
                  margin: 0
                }}
              >
                🎲 Roll Dice
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setIsDiceModalOpen(false)}
                style={{
                  fontSize: `calc(20px * var(--ui-scale))`, // Back to original
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* What you're rolling for */}
            {rollPrompt && (
              <div 
                style={{
                  padding: `calc(12px * var(--ui-scale))`,
                  borderRadius: `calc(8px * var(--ui-scale))`,
                  marginBottom: `calc(24px * var(--ui-scale))`, // Back to original
                  backgroundColor: 'rgba(16, 185, 129, 0.1)', // GREEN background
                  border: '1px solid rgba(16, 185, 129, 0.3)' // GREEN border
                }}
              >
                <div 
                  style={{
                    fontSize: `calc(14px * var(--ui-scale))`, // Back to original
                    color: '#6ee7b7', // GREEN text
                    textAlign: 'center'
                  }}
                >
                  📋 Rolling for: <span className="font-bold">{rollPrompt}</span>
                </div>
              </div>
            )}

            {/* Rest of the modal content - dice selection, bonus input, and roll button */}
            {/* This is the same as before, just keeping existing implementation */}
            
            {/* Dice Selection */}
            <div 
              style={{
                padding: `calc(16px * var(--ui-scale))`,
                borderRadius: `calc(8px * var(--ui-scale))`,
                marginBottom: `calc(24px * var(--ui-scale))`, // Back to original
                backgroundColor: 'rgba(51, 65, 85, 0.5)',
                border: '1px solid #475569'
              }}
            >
              <h4 
                style={{
                  fontSize: `calc(16px * var(--ui-scale))`, // Back to original
                  margin: `0 0 calc(12px * var(--ui-scale)) 0`, // Back to original
                  color: 'white'
                }}
              >
                🎲 Choose Your Dice
              </h4>
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: `calc(8px * var(--ui-scale))` // Back to original
                }}
              >
                {[
                  { name: 'D20', emoji: '🎲', range: '1-20' },
                  { name: 'D12', emoji: '🔷', range: '1-12' },
                  { name: 'D10', emoji: '🔟', range: '1-10' },
                  { name: 'D8', emoji: '🔸', range: '1-8' },
                  { name: 'D6', emoji: '⚀', range: '1-6' },
                  { name: 'D4', emoji: '🔺', range: '1-4' },
                ].map((dice) => (
                  <button
                    key={dice.name}
                    style={{
                      padding: `calc(12px * var(--ui-scale))`, // Back to original
                      borderRadius: `calc(6px * var(--ui-scale))`,
                      fontSize: `calc(11px * var(--ui-scale))`, // Back to original
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      backgroundColor: selectedDice === dice.name 
                        ? 'rgba(16, 185, 129, 0.3)' 
                        : 'rgba(71, 85, 105, 0.3)',
                      border: selectedDice === dice.name 
                        ? '2px solid rgba(16, 185, 129, 0.6)' 
                        : '1px solid #64748b',
                      color: selectedDice === dice.name 
                        ? '#a7f3d0' 
                        : '#cbd5e1'
                    }}
                    onClick={() => setSelectedDice(dice.name)}
                  >
                    <div style={{ fontSize: `calc(16px * var(--ui-scale))`, marginBottom: `calc(4px * var(--ui-scale))` }}> // Back to original
                      {dice.emoji}
                    </div>
                    <div className="font-bold">{dice.name}</div>
                    <div className="text-xs opacity-75">{dice.range}</div>
                  </button>
                ))}

                {/* D100 - Spans 2 columns */}
                <button
                  style={{
                    padding: `calc(12px * var(--ui-scale))`, // Back to original
                    borderRadius: `calc(6px * var(--ui-scale))`,
                    fontSize: `calc(11px * var(--ui-scale))`, // Back to original
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gridColumn: 'span 2',
                    backgroundColor: selectedDice === 'D100' 
                      ? 'rgba(16, 185, 129, 0.3)' 
                      : 'rgba(71, 85, 105, 0.3)',
                    border: selectedDice === 'D100' 
                      ? '2px solid rgba(16, 185, 129, 0.6)' 
                      : '1px solid #64748b',
                    color: selectedDice === 'D100' 
                      ? '#a7f3d0' 
                      : '#cbd5e1'
                  }}
                  onClick={() => setSelectedDice('D100')}
                >
                  <div style={{ fontSize: `calc(16px * var(--ui-scale))`, marginBottom: `calc(4px * var(--ui-scale))` }}> // Back to original
                    🎯
                  </div>
                  <div className="font-bold">D100</div>
                  <div className="text-xs opacity-75">1-100 (Percentile)</div>
                </button>
              </div>
            </div>

            {/* Bonus Input */}
            <div 
              style={{
                padding: `calc(16px * var(--ui-scale))`, // Back to original
                borderRadius: `calc(8px * var(--ui-scale))`,
                marginBottom: `calc(24px * var(--ui-scale))`, // Back to original
                backgroundColor: 'rgba(51, 65, 85, 0.5)',
                border: '1px solid #475569'
              }}
            >
              <h4 
                style={{
                  fontSize: `calc(16px * var(--ui-scale))`, // Back to original
                  margin: `0 0 calc(12px * var(--ui-scale)) 0`,
                  color: 'white'
                }}
              >
                ➕ Add Bonus (Optional)
              </h4>
              <input
                type="text"
                placeholder="e.g., +3, -1, +5"
                value={rollBonus}
                onChange={(e) => setRollBonus(e.target.value)}
                style={{
                  padding: `calc(8px * var(--ui-scale)) calc(12px * var(--ui-scale))`, // Back to original
                  borderRadius: `calc(6px * var(--ui-scale))`,
                  fontSize: `calc(14px * var(--ui-scale))`, // Back to original
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  color: 'white',
                  width: '100%'
                }}
              />
            </div>

            {/* Roll Button */}
            <div 
              style={{
                display: 'flex',
                gap: `calc(16px * var(--ui-scale))`, // Back to original
                justifyContent: 'center'
              }}
            >
              <button
                onClick={handleDiceRoll}
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.2)', // GREEN always
                  border: '2px solid rgba(16, 185, 129, 0.5)', // GREEN border always
                  color: '#10b981', // GREEN text always
                  borderRadius: `calc(12px * var(--ui-scale))`,
                  padding: `calc(16px * var(--ui-scale)) calc(32px * var(--ui-scale))`, // Back to original
                  fontSize: `calc(18px * var(--ui-scale))`, // Back to original
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.3)';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                  e.target.style.transform = 'scale(1)';
                }}
              >
                🎲 Roll {selectedDice}{rollBonus && ` ${rollBonus}`}
              </button>

              <button
                onClick={() => setIsDiceModalOpen(false)}
                style={{
                  backgroundColor: 'rgba(100, 116, 139, 0.2)',
                  border: '2px solid rgba(100, 116, 139, 0.5)',
                  color: '#64748b',
                  borderRadius: `calc(12px * var(--ui-scale))`,
                  padding: `calc(16px * var(--ui-scale)) calc(32px * var(--ui-scale))`, // Back to original
                  fontSize: `calc(18px * var(--ui-scale))`, // Back to original
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(100, 116, 139, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(100, 116, 139, 0.2)';
                }}
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