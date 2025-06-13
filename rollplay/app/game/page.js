  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { React, useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from "next/navigation";
import { getSeatColor } from '../utils/seatColors';

import PlayerCard from "../components/PlayerCard";
import DMControlCenter from '../components/DMControlCenter';
import HorizontalInitiativeTracker from '../components/HorizontalInitiativeTracker';
import AdventureLog from '../components/AdventureLog';
import LobbyPanel from '../components/LobbyPanel';
import DiceActionPanel from '../components/DiceActionPanel'; // NEW IMPORT
import { useWebSocket } from '../hooks/useWebSocket';

function GameContent() {
  const params = useSearchParams(); 

  const [room404, setRoom404] = useState(false)
  const [thisPlayer, setThisPlayer] = useState()
  const [roomId, setRoomId] = useState()

  // chat history
  const [chatLog, setChatLog] = useState([{},])

  // who generated the room
  const [host, setHost] = useState("")

  // UNIFIED STRUCTURE - Replaces both seats and partyMembers
  const [gameSeats, setGameSeats] = useState([]);

  // State for seat colors (loaded from backend)
  const [seatColors, setSeatColors] = useState({});

  // Lobby state for connected users not in party
  const [lobbyUsers, setLobbyUsers] = useState([]);
  
  // Track disconnect timeouts for lobby users
  const [disconnectTimeouts, setDisconnectTimeouts] = useState({});

  // Pre-computed player-to-seat mapping for O(1) lookups
  const playerSeatMap = useMemo(() => {
    const map = {};
    gameSeats.forEach((seat, index) => {
      if (seat.playerName !== "empty") {
        map[seat.playerName] = {
          seatIndex: index,
          seatColor: seatColors[index] || getSeatColor(index) // Use backend color or default
        };
      }
    });
    return map;
  }, [gameSeats, seatColors]);

  // UPDATED: State management for TabletopInterface - REMOVED HARDCODED DEFAULTS
  const [currentTurn, setCurrentTurn] = useState(null); // ❌ Removed 'Thorin' default
  const [isDM, setIsDM] = useState(true); // Toggle for DM panel visibility
  const [dicePortalActive, setDicePortalActive] = useState(true);
  const [uiScale, setUIScale] = useState('medium'); // UI Scale state
  const [combatActive, setCombatActive] = useState(true); // Combat state
  const [rollLog, setRollLog] = useState([
    { id: 1, message: 'Welcome to Tabletop Tavern', type: 'system'}
  ]);
  
  const [initiativeOrder, setInitiativeOrder] = useState([]); // ❌ Removed hardcoded data

  const [currentTrack, setCurrentTrack] = useState('🏰 Tavern Ambience');
  const [isPlaying, setIsPlaying] = useState(true);

  // UPDATED: Multiple dice roll prompts support
  const [activePrompts, setActivePrompts] = useState([]); // Array of {id, player, rollType, promptedBy}
  const [isDicePromptActive, setIsDicePromptActive] = useState(false); // Is any prompt active?
  const [currentInitiativePromptId, setCurrentInitiativePromptId] = useState(null); // Track initiative prompt ID for removal

  // Helper function to get character data
  const getCharacterData = (playerName) => {
    const characterDatabase = {
      'Thorin': { class: 'Dwarf Fighter', level: 3, hp: 34, maxHp: 40 }
    };
    
    return characterDatabase[playerName] || {
      class: 'Adventurer',
      level: 1,
      hp: 10,
      maxHp: 10
    };
  };


  // Copy room code to clipboard
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      
      // Optional: Show a temporary visual feedback
      const roomCodeElement = document.querySelector('.room-code');
      const originalText = roomCodeElement.textContent;
      
      // Change text to show it was copied
      roomCodeElement.textContent = 'Copied!';
      roomCodeElement.style.background = 'rgba(34, 197, 94, 0.3)';
      roomCodeElement.style.borderColor = 'rgba(34, 197, 94, 0.5)';
      
      // Reset after 2 seconds
      setTimeout(() => {
        roomCodeElement.textContent = originalText;
        roomCodeElement.style.background = 'rgba(74, 222, 128, 0.15)';
        roomCodeElement.style.borderColor = 'rgba(74, 222, 128, 0.3)';
      }, 2000);
      
    } catch (err) {
      console.error('Failed to copy room code:', err);
      // Fallback for older browsers
      fallbackCopyTextToClipboard(roomId);
    }
  };

  // Fallback copy function for browsers that don't support navigator.clipboard
  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        // Show feedback
        const roomCodeElement = document.querySelector('.room-code');
        const originalText = roomCodeElement.textContent;
        roomCodeElement.textContent = 'Copied!';
        
        setTimeout(() => {
          roomCodeElement.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Fallback: Unable to copy', err);
    }
    
    document.body.removeChild(textArea);
  };

  // UPDATED onLoad function to use unified structure
  async function onLoad(roomId) {
    const req = await fetch(`api/game/${roomId}`)
    if (req.status === 404) {
      console.log("room id not found")
      setRoom404(true)
      return
    }
  
    await req.json().then((res) => {
      setHost(res["player_name"])
      
      // Use actual seat layout from database if available
      const seatLayout = res["current_seat_layout"] || [];
      const maxPlayers = res["max_players"];
      const backendSeatColors = res["seat_colors"] || {};
      
      // Set seat colors from backend
      setSeatColors(backendSeatColors);
      
      // Initialize CSS variables for seat colors
      Object.keys(backendSeatColors).forEach(seatIndex => {
        document.documentElement.style.setProperty(
          `--seat-color-${seatIndex}`, 
          backendSeatColors[seatIndex]
        );
      });
      
      // Create unified seat structure from database data
      const initialSeats = [];
      for (let i = 0; i < maxPlayers; i++) {
        const playerName = seatLayout[i] || "empty";
        // Normalize player names when loading from database
        const normalizedPlayerName = playerName !== "empty" ? playerName.toLowerCase() : "empty";
        initialSeats.push({
          seatId: i,
          playerName: normalizedPlayerName,
          characterData: normalizedPlayerName !== "empty" ? getCharacterData(normalizedPlayerName) : null,
          isActive: false
        });
      }
      
      console.log("Loaded seat layout from database:", initialSeats);
      console.log("Loaded seat colors from database:", backendSeatColors);
      setGameSeats(initialSeats);
    })
    
    // Load adventure logs for this room
    await loadAdventureLogs(roomId);
  }
  
  // initialise the game lobby
  useEffect(() => {
    const roomId = params.get('roomId')
    const thisPlayer = params.get('playerName')?.toLowerCase() // Normalize once at entry point
    setRoomId(roomId)
    setThisPlayer(thisPlayer)

    // fetches the room ID, and loads data
    onLoad(roomId)
  }, [])

  // UPDATED: Seat count management
  const setSeatCount = async (newSeatCount) => {
    try {
      console.log(`Updating seat count to: ${newSeatCount}`);
      
      // Create new seat array
      const newSeats = [];
      
      // Copy existing seats up to the new count
      for (let i = 0; i < newSeatCount; i++) {
        if (i < gameSeats.length) {
          // Keep existing seat
          newSeats.push(gameSeats[i]);
        } else {
          // Add new empty seat
          newSeats.push({
            seatId: i,
            playerName: "empty",
            characterData: null,
            isActive: false
          });
        }
      }

      // Update MongoDB via API
      const response = await fetch(`/api/game/${roomId}/seats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_players: newSeatCount,
          updated_by: thisPlayer
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update seat count in database');
      }

      // Send websocket update using hook method
      sendSeatCountChange(newSeatCount, newSeats);

      // Update local state
      setGameSeats(newSeats);

      // Adventure log will be handled by server broadcast
      const action = newSeatCount > gameSeats.length ? "increased" : "decreased";

    } catch (error) {
      console.error('Error updating seat count:', error);
      alert('Failed to update seat count. Please try again.');
    }
  };

  const loadAdventureLogs = async (roomId) => {
    try {
      console.log("Loading adventure logs from database...");
      
      const response = await fetch(`/api/game/${roomId}/logs?limit=100`);
      
      if (response.ok) {
        const data = await response.json();
        const dbLogs = data.logs;
        
        console.log(`Loaded ${dbLogs.length} logs from database`);
        
        // Convert database logs to your frontend format
        const formattedLogs = dbLogs.map(log => ({
          id: log.log_id,
          message: log.message,
          type: log.type,
          timestamp: formatTimestamp(log.timestamp),
          player_name: log.player_name,
          prompt_id: log.prompt_id // Include prompt_id for removal matching
        }));
        
        // Replace your initial hardcoded logs with database logs
        setRollLog(formattedLogs.reverse()); // Reverse to show oldest first in state
        
      } else {
        console.log("No existing logs found, starting with empty log");
        // Keep your existing default logs or start empty
        setRollLog([]);
      }
      
    } catch (error) {
      console.error("Error loading adventure logs:", error);
      // Fallback to default logs
      setRollLog([
        { id: 1, message: 'Welcome to the adventure!', type: 'system', timestamp: formatTimestamp(new Date()) }
      ]);
    }
  };
  
  // Helper function to format timestamps
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // UPDATED: Handle player kick
  const handleKickPlayer = async (playerToKick, disconnected) => {
    try {
      
      // Find the seat with this player and empty it
      const updatedSeats = gameSeats.map(seat => 
        seat.playerName === playerToKick 
          ? { ...seat, playerName: "empty", characterData: null, isActive: false }
          : seat
      );
  
      // Send kick event via websocket using hook method
      sendPlayerKick(playerToKick);
  
      // Send updated seat layout using hook method
      sendSeatChange(updatedSeats);
  
      // Update local state
      setGameSeats(updatedSeats);

      if (disconnected) {
        return
      }
  
      // Adventure log will be handled by server broadcast
  
    } catch (error) {
      console.error('Error kicking player:', error);
      alert('Failed to kick player. Please try again.');
    }
  };

  const addToLog = (message, type, playerName = null, promptId = null) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newEntry = {
      id: Date.now(),
      message,
      type,
      timestamp,
      player_name: playerName
    };
    
    // Add prompt_id if provided
    if (promptId) {
      newEntry.prompt_id = promptId;
    }
    
    setRollLog(prev => [...prev, newEntry]);
  };

  // Create a setter function for playerSeatMap updates
  const setPlayerSeatMap = (updaterFunction) => {
    // This is a derived state update - we need to update seatColors instead
    // The updaterFunction expects the current playerSeatMap and returns the new one
    const currentMap = playerSeatMap;
    const newMap = updaterFunction(currentMap);
    
    // Extract seat colors from the updated map
    const newSeatColors = {};
    Object.values(newMap).forEach(playerData => {
      if (playerData.seatIndex !== undefined && playerData.seatColor) {
        newSeatColors[playerData.seatIndex] = playerData.seatColor;
      }
    });
    
    setSeatColors(newSeatColors);
  };

  // Create game context object for WebSocket handlers (after addToLog is defined)
  const gameContext = {
    // State setters
    setGameSeats,
    setChatLog,
    setCombatActive,
    setRollLog,
    setActivePrompts,
    setIsDicePromptActive,
    setPlayerSeatMap,
    setLobbyUsers,
    setDisconnectTimeouts,
    setCurrentInitiativePromptId,
    
    // Current state values
    chatLog,
    gameSeats,
    thisPlayer,
    lobbyUsers,
    disconnectTimeouts,
    currentInitiativePromptId,
    
    // Helper functions
    addToLog,
    getCharacterData
  };

  // Initialize WebSocket hook with game context
  const {
    webSocket,
    isConnected,
    sendSeatChange,
    sendSeatCountChange,
    sendCombatStateChange,
    sendPlayerKick,
    sendDiceRoll,
    sendClearSystemMessages,
    sendClearAllMessages,
    sendDicePrompt,
    sendDicePromptClear,
    sendInitiativePromptAll,
    sendColorChange
  } = useWebSocket(roomId, thisPlayer, gameContext);

  // Show dice portal for player rolls
  const showDicePortal = (playerName, promptType = null) => {
    setCurrentTurn(playerName);
    setDicePortalActive(true);
  };

  // Hide dice portal
  const hideDicePortal = () => {
    setDicePortalActive(false);
  };

  // UPDATED: DM prompts specific player to roll
  const promptPlayerRoll = (playerName, rollType) => {
    if (!playerName) {
      console.log("No player selected for roll prompt");
      return;
    }
    
    // Generate unique prompt ID
    const promptId = `${playerName}_${rollType}_${Date.now()}`;
    
    // Use the updated WebSocket method
    sendDicePrompt(playerName, rollType, promptId);
    
    // Update local state
    const newPrompt = {
      id: promptId,
      player: playerName,
      rollType: rollType,
      promptedBy: thisPlayer
    };
    
    setActivePrompts(prev => {
      // Check if this player already has an active prompt for this roll type
      const existingIndex = prev.findIndex(p => p.player === playerName && p.rollType === rollType);
      if (existingIndex >= 0) {
        // Replace existing prompt
        const updated = [...prev];
        updated[existingIndex] = newPrompt;
        return updated;
      } else {
        // Add new prompt
        return [...prev, newPrompt];
      }
    });
    
    setIsDicePromptActive(true);
    
    // Note: Adventure log entry will be added via the WebSocket broadcast
    // to prevent duplication for the DM who initiated the prompt
  };

  // UPDATED: Clear dice prompt (can clear specific prompt or all prompts)
  const clearDicePrompt = (promptId = null, clearAll = false) => {
    sendDicePromptClear(promptId, clearAll, currentInitiativePromptId);
    
    if (clearAll) {
      setActivePrompts([]);
      setIsDicePromptActive(false);
      setCurrentInitiativePromptId(null); // Clear the tracked initiative prompt ID
    } else if (promptId) {
      setActivePrompts(prev => {
        const filtered = prev.filter(prompt => prompt.id !== promptId);
        setIsDicePromptActive(filtered.length > 0);
        return filtered;
      });
    }
  };

  // NEW: Prompt all players for initiative (collective approach)
  const promptAllPlayersInitiative = () => {
    const activePlayers = gameSeats.filter(seat => seat.playerName !== "empty");
    if (activePlayers.length === 0) {
      alert("No players in the game to prompt for initiative!");
      return;
    }
    
    const playerNames = activePlayers.map(player => player.playerName);
    sendInitiativePromptAll(playerNames);
  };

  // Handle dice roll
  const rollDice = () => {
    const result = Math.floor(Math.random() * 20) + 1;
    // Note: This function appears to be unused in current UI
    
    setTimeout(() => {
      hideDicePortal();
    }, 1000);
  };

  // Handle initiative order clicks
  const handleInitiativeClick = (clickedName) => {
    setInitiativeOrder(prev => 
      prev.map(item => ({
        ...item,
        active: item.name === clickedName
      }))
    );
    
    setCurrentTurn(clickedName);
    
    // Show dice portal for player turns (not NPCs)
    if (clickedName !== 'Bandit #1') {
      showDicePortal(clickedName);
    } else {
      hideDicePortal();
    }
  };

  // Handle audio track changes
  const handleTrackClick = (trackName, btnElement) => {
    const wasPlaying = trackName === currentTrack && isPlaying;
    
    if (!wasPlaying) {
      setCurrentTrack(trackName);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  // Toggle campaign settings
  const toggleCampaignSettings = () => {
    console.log('Opening campaign settings...');
  };

  // Handle clearing system messages
  const handleClearSystemMessages = async () => {
    try {
      await sendClearSystemMessages();
      
      // Remove system messages from local state immediately
      setRollLog(prev => prev.filter(entry => entry.type !== 'system'));
      
      // Adventure log will be handled by server broadcast
      
    } catch (error) {
      console.error('Error clearing system messages:', error);
      alert('Failed to clear system messages. Please try again.');
    }
  };

  // Handle clearing all adventure log messages
  const handleClearAllMessages = async () => {
    try {
      await sendClearAllMessages();
      
      // Clear all messages from local state immediately
      setRollLog([]);
      
      // Adventure log will be handled by server broadcast
      
    } catch (error) {
      console.error('Error clearing all messages:', error);
      alert('Failed to clear all messages. Please try again.');
    }
  };

  // Show loading or 404 states
  if (room404) {
    return <div>Room not found</div>;
  }

  if (!roomId) {
    return <div>Loading...</div>;
  }

  // Helper to format dice notation properly
  const formatDiceNotation = (primaryDice, secondDice) => {
    if (!secondDice) {
      return primaryDice;
    }
    
    // If both dice are the same type, use multiplier notation (e.g., "2d20")
    if (primaryDice === secondDice) {
      return `2${primaryDice.toLowerCase()}`;
    }
    
    // If different dice types, use addition notation (e.g., "d20 + d6")
    return `${primaryDice.toLowerCase()} + ${secondDice.toLowerCase()}`;
  };

  // UPDATED: Handle dice rolls from PlayerCard components or DiceActionPanel
  const handlePlayerDiceRoll = (playerName, rollData) => {
    // Extract rollFor at the top level so it's available throughout the function
    const rollFor = rollData.rollFor;
    
    const { dice, secondDice, advantageMode, bonus } = rollData;
    const bonusValue = bonus ? parseInt(bonus.replace(/[^-\d]/g, '')) || 0 : 0;
    
    // Check if this involves D20s with advantage/disadvantage
    const primaryIsD20 = dice === 'D20';
    const useAdvantage = primaryIsD20 && advantageMode !== 'normal';
    
    let totalResult = 0;
    let allRolls = [];
    let notation = [];
    
    if (useAdvantage) {
      // Advantage/Disadvantage: roll 2d20, apply modifier to each, take higher/lower
      const diceValue = 20;
      const roll1 = Math.floor(Math.random() * diceValue) + 1;
      const roll2 = Math.floor(Math.random() * diceValue) + 1;
      const result1 = roll1 + bonusValue;
      const result2 = roll2 + bonusValue;
      
      totalResult = advantageMode === 'advantage' 
        ? Math.max(result1, result2)
        : Math.min(result1, result2);
      
      allRolls.push(`[${roll1}, ${roll2}] = ${totalResult}`);
      notation.push(`${dice} (${advantageMode})`);
      
      // If there's a second die, roll it normally and add to total
      if (secondDice) {
        const secondDiceValue = parseInt(secondDice.substring(1));
        const secondRoll = Math.floor(Math.random() * secondDiceValue) + 1;
        totalResult += secondRoll;
        allRolls.push(secondRoll);
        notation.push(secondDice);
      }
    } else {
      // Normal rolls for both dice
      
      // Roll primary die
      const primaryDiceValue = parseInt(dice.substring(1));
      const primaryRoll = Math.floor(Math.random() * primaryDiceValue) + 1;
      totalResult += primaryRoll;
      allRolls.push(primaryRoll);
      notation.push(dice);
      
      // Roll second die if present
      if (secondDice) {
        const secondDiceValue = parseInt(secondDice.substring(1));
        const secondRoll = Math.floor(Math.random() * secondDiceValue) + 1;
        totalResult += secondRoll;
        allRolls.push(secondRoll);
        notation.push(secondDice);
      }
      
      // Add bonus once to total for normal rolls
      totalResult += bonusValue;
    }
    
    // Format message
    const bonusText = bonusValue !== 0 ? ` ${bonus}` : '';
    
    // Use proper dice notation formatting
    let diceNotation;
    if (useAdvantage) {
      // For advantage/disadvantage, show as "d20 (advantage)" + any second dice
      diceNotation = `${dice.toLowerCase()} (${advantageMode})`;
      if (secondDice) {
        diceNotation += ` + ${secondDice.toLowerCase()}`;
      }
      diceNotation += bonusText;
    } else {
      // For normal rolls, use the formatDiceNotation helper
      diceNotation = formatDiceNotation(dice, secondDice) + bonusText;
    }
    // Format roll details - just show the final result
    const rollDetails = useAdvantage ? allRolls.join(', ') : `${totalResult}`;
    
    let formattedMessage;
    if (rollFor && rollFor !== "Standard Roll") {
      formattedMessage = ` [${rollFor}]: ${diceNotation}:  ${rollDetails}`;
    } else {
      formattedMessage = `: ${diceNotation}:  ${rollDetails}`;
    }
    
    // Clear prompts for this player if they match the roll type
    const playerPrompts = activePrompts.filter(prompt => 
      prompt.player === playerName && 
      (rollFor === prompt.rollType || rollFor === null) // Match specific roll type or clear if Standard Roll
    );
    
    // Get the prompt_id for adventure log cleanup (use first matching prompt)
    const promptIdForCleanup = playerPrompts.length > 0 ? playerPrompts[0].id : null;
    
    // Send pre-formatted message to backend
    if (sendDiceRoll) {
      sendDiceRoll(playerName, formattedMessage, rollFor, promptIdForCleanup);
    } else {
      console.error("sendDiceRoll function not available - WebSocket may not be connected");
    }
    
    playerPrompts.forEach(prompt => {
      clearDicePrompt(prompt.id, false);
    });
  };

  // NEW: Handle end turn (implement as needed)
  const handleEndTurn = () => {
    console.log(`${currentTurn} ended their turn`);
    // Add logic to move to next player in initiative order
    // This is where you'd implement turn progression
  };

  // Handle color changes from PlayerCard
  const handlePlayerColorChange = (playerName, seatIndex, newColor) => {
    if (!sendColorChange) {
      console.error('sendColorChange function not available');
      return;
    }
    
    console.log(`🎨 ${playerName} changing color (seat ${seatIndex}) to ${newColor}`);
    sendColorChange(playerName, seatIndex, newColor);
  };

  // MAIN RENDER
  return (
    <div className="game-interface" data-ui-scale={uiScale}>
      {/* Top Command Bar */}
      <div className="command-bar">
        <div className="campaign-info">
          <div className="campaign-title">The Curse of Strahd</div>
          <div className="location-breadcrumb">› Barovia Village › The Blood on the Vine Tavern</div>
        </div>
        
        <div className="dm-controls-bar">
          <div 
            className="room-code" 
            onClick={copyRoomCode}
            title="Click to copy room code"
          >
            Room: {roomId}
          </div>
          <button className="control-btn">🔧 Room Settings</button>
          
          {/* UI Scale Toggle */}
          <div className="ui-scale-nav">
            <button 
              className={`scale-btn ${uiScale === 'small' ? 'active' : ''}`}
              onClick={() => setUIScale('small')}
              title="Small UI"
            >
              S
            </button>
            <button 
              className={`scale-btn ${uiScale === 'medium' ? 'active' : ''}`}
              onClick={() => setUIScale('medium')}
              title="Medium UI"
            >
              M
            </button>
            <button 
              className={`scale-btn ${uiScale === 'large' ? 'active' : ''}`}
              onClick={() => setUIScale('large')}
              title="Large UI"
            >
              L
            </button>
          </div>
          
          <button className="control-btn">📝 Notes</button>
          <button className="control-btn" onClick={toggleCampaignSettings}>⚙️ Campaign Settings</button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="main-game-area">
        {/* GRID POSITION 1: Left Column - party-sidebar with adventure log */}
        <div className="party-sidebar">
          <div className="party-header">
            <span>Party</span>
            <span className="seat-indicator">
              {gameSeats.filter(seat => seat.playerName !== "empty").length}/{gameSeats.length} Seats
            </span>
          </div>
          
          {gameSeats.map((seat) => {
            const isSitting = seat.playerName === thisPlayer;
            const currentColor = seatColors[seat.seatId] || getSeatColor(seat.seatId);
            
            return (
              <PlayerCard
                key={seat.seatId}
                seatId={seat.seatId}
                seats={gameSeats}
                thisPlayer={thisPlayer}
                isSitting={isSitting}
                sendSeatChange={sendSeatChange}
                currentTurn={currentTurn}
                onDiceRoll={handlePlayerDiceRoll}
                playerData={seat.characterData}
                onColorChange={handlePlayerColorChange}
                currentColor={currentColor}
              />
            );
          })}

          {/* Lobby Panel - shows connected users not in party */}
          <LobbyPanel 
            lobbyUsers={lobbyUsers}
          />

          {/* Adventure Log component */}
          <AdventureLog 
            rollLog={rollLog}
            playerSeatMap={playerSeatMap}
          />
        </div>

        {/* GRID POSITION 2: Center Column - map-canvas with horizontal initiative */}
        <HorizontalInitiativeTracker 
          initiativeOrder={initiativeOrder}
          handleInitiativeClick={handleInitiativeClick}
          currentTurn={currentTurn}
          combatActive={combatActive}
        />

        {/* GRID POSITION 3: Right Panel - DM Controls (Full Height) */}
        <div className="right-panel">
          <DMControlCenter
            isDM={isDM}
            promptPlayerRoll={promptPlayerRoll}
            promptAllPlayersInitiative={promptAllPlayersInitiative}  // NEW
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            handleTrackClick={handleTrackClick}
            combatActive={combatActive}
            setCombatActive={sendCombatStateChange}
            gameSeats={gameSeats}
            setSeatCount={setSeatCount}
            roomId={roomId}
            handleKickPlayer={handleKickPlayer}
            handleClearSystemMessages={handleClearSystemMessages}
            handleClearAllMessages={handleClearAllMessages}  // NEW
            activePrompts={activePrompts}        // UPDATED: Pass array instead of single prompt
            clearDicePrompt={clearDicePrompt}    // UPDATED: Now accepts prompt ID
          />
        </div>

      </div>

      {/* UPDATED: DiceActionPanel with multiple prompts support */}
      <DiceActionPanel
        currentTurn={currentTurn}
        thisPlayer={thisPlayer}
        combatActive={combatActive}
        onRollDice={handlePlayerDiceRoll}
        onEndTurn={handleEndTurn}
        uiScale={uiScale}
        activePrompts={activePrompts}            // UPDATED: Pass active prompts array
        isDicePromptActive={isDicePromptActive}
      />
    </div>
  );
}

export default function Game() {
  return (
    <Suspense fallback={
      <div className="game-loading" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)',
        color: 'white',
        fontSize: '18px'
      }}>
        <div>🎲 Loading Tabletop Tavern...</div>
      </div>
    }>
      <GameContent />
    </Suspense>
  );
}