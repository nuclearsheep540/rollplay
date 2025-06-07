import { React, useEffect, useState, useRef } from 'react'

export default function PlayerCard({
    seatId, 
    seats,
    thisPlayer, 
    isSitting, 
    sendSeatChange,
    currentTurn = null,
    onDiceRoll = null,
    playerData = null
  }) {
  
    useEffect(() => {
      console.log(`Seat ${seatId} updated:`, seats[seatId]);
    }, [seats[seatId]]);
  
    const currentSeat = seats[seatId];
    const isOccupied = currentSeat.playerName !== "empty";
    const occupantName = currentSeat.playerName;
    const isMyTurn = currentTurn === occupantName;
    const isThisPlayerSeat = currentSeat.playerName === thisPlayer;
    
    // NEW: Check if player is already sitting somewhere
    const playerAlreadySeated = seats.some(seat => seat.playerName === thisPlayer);
  
    function sitSeat() {
      // Only allow sitting if seat is empty AND player isn't already seated
      if (!isOccupied && !playerAlreadySeated) {
        const newSeats = [...seats];
        
        // Sit in the new seat
        newSeats[seatId] = {
          ...newSeats[seatId],
          playerName: thisPlayer,
          characterData: getCharacterData(thisPlayer),
          isActive: false
        };
        
        sendSeatChange(newSeats);
      }
    }
  
    function leaveSeat() {
      if (isThisPlayerSeat) {
        const newSeats = [...seats];
        newSeats[seatId] = {
          ...newSeats[seatId],
          playerName: "empty",
          characterData: null,
          isActive: false
        };
        
        sendSeatChange(newSeats);
      }
    }
  
 
    function getCharacterData(playerName) {
      const characterDatabase = {
        'Thorin': { class: 'Dwarf Fighter', level: 3, hp: 34, maxHp: 40 },
        'Elara': { class: 'Elf Wizard', level: 3, hp: 18, maxHp: 30 },
        'Finn': { class: 'Halfling Rogue', level: 2, hp: 23, maxHp: 24 },
        'Sister Meredith': { class: 'Human Cleric', level: 3, hp: 12, maxHp: 30 }
      };
      
      return characterDatabase[playerName] || {
        class: 'Adventurer',
        level: 1,
        hp: 10,
        maxHp: 10
      };
    }
  
    // Render empty seat - WITH IMPROVED LOGIC
    if (!isOccupied) {
      return (
        <div 
          className={`empty-seat ${playerAlreadySeated ? 'disabled' : ''}`} 
          onClick={playerAlreadySeated ? null : sitSeat}
        >
          <div className="empty-seat-text">
            {playerAlreadySeated 
              ? `🪑 Seat ${seatId + 1} - Leave current seat first`
              : `🪑 Seat ${seatId + 1} - Click to Join`
            }
          </div>
        </div>
      );
    }
  
    // Rest of component stays the same...
    return (
      <div className={`party-member ${isMyTurn ? 'current-turn' : ''} ${isThisPlayerSeat ? 'my-seat' : ''}`}>
        <div className="member-header">
          <div className="member-name">{occupantName}</div>
          {isMyTurn && <div className="turn-indicator">🎯 Active</div>}
        </div>
        
        {playerData ? (
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
          <div className="member-class">Player • Seat {seatId + 1}</div>
        )}
  
        <div className="seat-actions">
          {isThisPlayerSeat && (
            <button className="seat-btn leave-btn" onClick={leaveSeat}>
              🚪 Leave Seat
            </button>
          )}
          
        </div>
      </div>
    );
  }