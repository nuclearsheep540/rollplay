import React from 'react';
import { useState, useEffect } from 'react'

export default function PlayerCard({
  seatId, 
  seats, 
  thisPlayer, 
  sendSeatChange,
  currentTurn = null,
  onDiceRoll = null,
  playerData = null // Optional: for HP, class, level data
}) {

  useEffect(() => {
    console.log(`Seat ${seatId} updated:`, seats[seatId]);
  }, [seats[seatId]]);

  const isOccupied = seats[seatId] !== "empty";
  const occupantName = seats[seatId];
  const isMyTurn = currentTurn === occupantName;
  const isThisPlayerSeat = seats[seatId] === thisPlayer;

  function sitSeat() {
    // Check the seat is free
    // If free place player name against this index
    var seatIsFree = seats[seatId] === "empty" ? true : false
    if (seatIsFree) {
      var localSeat = [...seats]
      var oldIndex = seats.indexOf(thisPlayer)
      if (oldIndex !== -1) {
        localSeat[oldIndex] = "empty"
      }
      localSeat[seatId] = thisPlayer

      sendSeatChange(localSeat)
    }
    return
  }

  function leaveSeat() { 
    var localSeat = [...seats]
    var oldIndex = seats.indexOf(thisPlayer)
    if (oldIndex !== -1) {
      localSeat[oldIndex] = "empty"
    }

    var someoneElsesSeat = (seats[seatId] != "empty" && seats[seatId] != thisPlayer) ? true : false
    if (someoneElsesSeat) {
      return
    }

    sendSeatChange(localSeat)
    return
  }

  function handleDiceRoll() {
    if (onDiceRoll) {
      onDiceRoll(occupantName, seatId);
    } else {
      console.log(seats[seatId], "rolls the dice");
    }
  }

  // Render empty seat
  if (!isOccupied) {
    return (
      <div className="empty-seat" onClick={sitSeat}>
        <div className="empty-seat-text">
          🪑 Seat {seatId} - Click to Join
        </div>
        <style jsx>{`
          .empty-seat {
            margin-bottom: 12px;
            padding: 12px;
            border-radius: 6px;
            background: rgba(74, 222, 128, 0.05);
            border: 1px dashed rgba(74, 222, 128, 0.3);
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .empty-seat:hover {
            background: rgba(74, 222, 128, 0.1);
            border-color: rgba(74, 222, 128, 0.5);
          }

          .empty-seat-text {
            color: #4ade80;
            font-size: 12px;
            font-weight: 500;
          }
        `}</style>
      </div>
    );
  }

  // Render occupied seat
  return (
    <div className={`party-member ${isMyTurn ? 'current-turn' : ''} ${isThisPlayerSeat ? 'my-seat' : ''}`}>
      <div className="member-header">
        <div className="member-name">{occupantName}</div>
        {isMyTurn && <div className="turn-indicator">🎯 Active</div>}
      </div>
      
      {playerData ? (
        // If we have character data, show it
        <>
          <div className="member-class">{playerData.class} • Level {playerData.level}</div>
          <div className="hp-display">
            <div className="hp-bar">
              <div 
                className="hp-fill" 
                style={{ width: `${(playerData.hp / playerData.maxHp) * 100}%` }}
              ></div>
            </div>
            <div className="hp-text">{playerData.hp}/{playerData.maxHp}</div>
          </div>
        </>
      ) : (
        // Basic player info
        <div className="member-class">Player • Seat {seatId}</div>
      )}

      <div className="seat-actions">
        {isThisPlayerSeat && (
          <button className="seat-btn leave-btn" onClick={leaveSeat}>
            🚪 Leave Seat
          </button>
        )}
        
        <button 
          className={`seat-btn dice-btn ${!isMyTurn ? 'disabled' : ''}`}
          onClick={handleDiceRoll}
          disabled={!isMyTurn}
        >
          🎲 Roll Dice
        </button>
      </div>

      <style jsx>{`
        .party-member {
          margin-bottom: 12px;
          padding: 12px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.3s ease;
        }

        .party-member.current-turn {
          background: rgba(74, 222, 128, 0.1);
          border-color: rgba(74, 222, 128, 0.3);
          box-shadow: 0 0 15px rgba(74, 222, 128, 0.2);
        }

        .party-member.my-seat {
          background: rgba(96, 165, 250, 0.1);
          border-color: rgba(96, 165, 250, 0.3);
        }

        .member-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .member-name {
          font-weight: 600;
          color: #60a5fa;
          font-size: 14px;
        }

        .turn-indicator {
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .member-class {
          font-size: 11px;
          color: #9ca3af;
          margin-bottom: 8px;
        }

        .hp-display {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          margin-bottom: 10px;
        }

        .hp-bar {
          flex: 1;
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .hp-fill {
          height: 100%;
          background: linear-gradient(90deg, #22c55e 0%, #fbbf24 70%, #ef4444 100%);
          transition: width 0.3s ease;
        }

        .hp-text {
          color: #9ca3af;
          min-width: 40px;
          text-align: right;
        }

        .seat-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .seat-btn {
          background: transparent;
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: #a78bfa;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 10px;
          transition: all 0.2s ease;
          flex: 1;
          min-width: 70px;
        }

        .seat-btn:hover:not(.disabled) {
          background: rgba(139, 92, 246, 0.1);
          border-color: #8b5cf6;
        }

        .leave-btn {
          border-color: rgba(239, 68, 68, 0.4);
          color: #f87171;
        }

        .leave-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: #ef4444;
        }

        .dice-btn {
          border-color: rgba(245, 158, 11, 0.4);
          color: #fbbf24;
        }

        .dice-btn:hover:not(.disabled) {
          background: rgba(245, 158, 11, 0.1);
          border-color: #f59e0b;
        }

        .dice-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
          border-color: rgba(107, 114, 128, 0.4);
          color: #6b7280;
        }

        @keyframes turn-pulse {
          0%, 100% { 
            box-shadow: 0 0 15px rgba(74, 222, 128, 0.2);
          }
          50% { 
            box-shadow: 0 0 25px rgba(74, 222, 128, 0.4);
          }
        }

        .party-member.current-turn {
          animation: turn-pulse 2s infinite;
        }
      `}</style>
    </div>
  );
}