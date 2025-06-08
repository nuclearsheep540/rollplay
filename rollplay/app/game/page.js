'use client'

import { React, useEffect, useState } from 'react'
import { useSearchParams } from "next/navigation";

import PlayerCard from "../components/PlayerCard";
import ChatMessages from '../components/ChatMessages';
import DMControlCenter from '../components/DMControlCenter';
import HorizontalInitiativeTracker from '../components/HorizontalInitiativeTracker';
import AdventureLog from '../components/AdventureLog';
import DiceActionPanel from '../components/DiceActionPanel';
import { useWebSocket } from '../hooks/useWebSocket';

function Params() {
  return useSearchParams()
}

export default function Game() {

  const params = Params(); 

  const [room404, setRoom404] = useState(false)
  const [thisPlayer, setThisPlayer] = useState()
  const [roomId, setRoomId] = useState()

  // chat history
  const [chatLog, setChatLog] = useState([{},])

  // current msg in chat box form
  const [chatMsg, setChatMsg] = useState("")

  // who generated the room
  const [host, setHost] = useState("")

  // UNIFIED STRUCTURE - Replaces both seats and partyMembers
  const [gameSeats, setGameSeats] = useState([]);

  // State management for TabletopInterface
  const [currentTurn, setCurrentTurn] = useState('Thorin');
  const [isDM, setIsDM] = useState(true); // Toggle for DM panel visibility
  const [dicePortalActive, setDicePortalActive] = useState(true);
  const [uiScale, setUIScale] = useState('medium'); // UI Scale state
  const [combatActive, setCombatActive] = useState(true); // Combat state
  const [rollLog, setRollLog] = useState([
    { id: 1, message: 'Welcome to Tabletop Tavern', type: 'system'}
  ]);
  
  const [initiativeOrder, setInitiativeOrder] = useState([]);

  const [currentTrack, setCurrentTrack] = useState('🏰 Tavern Ambience');
  const [isPlaying, setIsPlaying] = useState(true);

  // FIXED: Add roll prompts state for DM targeting
  const [rollPrompts, setRollPrompts] = useState({}); // Store roll prompts by player name

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

  // WebSocket callbacks
  const webSocketCallbacks = {
    onSeatChange: (data) => {
      console.log("received a new message with seat change:", data);
      
      // Convert websocket data back to unified structure
      const updatedSeats = data.map((playerName, index) => ({
        seatId: index,
        playerName: playerName,
        characterData: playerName !== "empty" ? getCharacterData(playerName) : null,
        isActive: false // Reset turn state, will be managed by initiative
      }));
      
      setGameSeats(updatedSeats);
    },

    onSeatCountChange: (data) => {
      console.log("received seat count change:", data);
      const { max_players, new_seats, updated_by } = data;
      
      // Convert to unified structure
      const updatedSeats = new_seats.map((playerName, index) => ({
        seatId: index,
        playerName: playerName,
        characterData: playerName !== "empty" ? getCharacterData(playerName) : null,
        isActive: false
      }));
      
      setGameSeats(updatedSeats);
      
      // Add to adventure log if not the person who made the change
      if (updated_by !== thisPlayer) {
        const currentCount = gameSeats.length;
        const action = max_players > currentCount ? "increased" : "decreased";
        addToLog(`${updated_by} ${action} party seats to ${max_players}`, 'system');
      }
    },

    onChatMessage: (data) => {
      setChatLog([
        ...chatLog,
        {
          "player_name": data["player_name"],
          "chat_message": data["data"],
          "timestamp": data["utc_timestamp"]
        }
      ]);
    },

    onPlayerConnected: (data) => {
      console.log("received player connection:", data);
      const { connected_player } = data;
      
      // Only log if not the current player (avoid logging your own connection)
      if (connected_player !== thisPlayer) {
        addToLog(`${connected_player} connected`, 'system');
      }
    },

    onPlayerKicked: (data) => {
      console.log("received player kick:", data);
      const { kicked_player } = data;
      addToLog(`${kicked_player} has been kicked from the party.`, 'system');

      // If this player was kicked, go back in browser history
      if (kicked_player === thisPlayer) {
        window.history.replaceState(null, '', '/');
        window.history.back();
        return;
      }
    },

    onCombatStateChange: (data) => {
      console.log("received combat state change:", data);
      const { combatActive: newCombatState } = data;
      
      setCombatActive(newCombatState);
      
      // Add to adventure log
      const action = newCombatState ? "initiated" : "ended";
      const message = `Combat ${action}`;
      addToLog(message, 'system');
    },

    onPlayerDisconnected: (data) => {
      console.log("received player disconnect:", data);
      const disconnected_player = data["disconnected_player"];
    
      // Find and empty the seat of the disconnected player
      const updatedSeats = gameSeats.map(seat => 
        seat.playerName === disconnected_player 
          ? { ...seat, playerName: "empty", characterData: null, isActive: false }
          : seat
      );

      // Send updated seat layout to all players
      sendSeatChange(updatedSeats);

      // Update local state
      setGameSeats(updatedSeats);

      if (disconnected_player !== thisPlayer) {
        addToLog(`${disconnected_player} disconnected`, 'system');
      }
    },

    onDiceRoll: (data) => {
      console.log("received dice roll:", data);
      const { player, dice, result } = data;
      addToLog(`${dice}: ${result}`, 'dice', player);
    },

    onSystemMessagesCleared: (data) => {
      console.log("received system messages cleared:", data);
      const { deleted_count, cleared_by } = data;
      
      // Remove all system messages from the current rollLog
      setRollLog(prev => prev.filter(entry => entry.type !== 'system'));
      
      // Add a new system message about the clearing action
      if (cleared_by !== thisPlayer) {
        addToLog(`${cleared_by} cleared ${deleted_count} system messages`, 'system');
      }
    }
  };

  // Initialize WebSocket hook
  const {
    webSocket,
    isConnected,
    sendSeatChange,
    sendSeatCountChange,
    sendCombatStateChange,
    sendPlayerKick,
    sendDiceRoll,
    sendClearSystemMessages
  } = useWebSocket(roomId, thisPlayer, webSocketCallbacks);

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
      
      // Create unified seat structure from database data
      const initialSeats = [];
      for (let i = 0; i < maxPlayers; i++) {
        const playerName = seatLayout[i] || "empty";
        initialSeats.push({
          seatId: i,
          playerName: playerName,
          characterData: playerName !== "empty" ? getCharacterData(playerName) : null,
          isActive: false
        });
      }
      
      console.log("Loaded seat layout from database:", initialSeats);
      setGameSeats(initialSeats);
    })
    
    // Load adventure logs for this room
    await loadAdventureLogs(roomId);
  }
  
  // initialise the game lobby
  useEffect(() => {
    const roomId = params.get('roomId')
    const thisPlayer = params.get('playerName')
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

      // Add to adventure log
      const action = newSeatCount > gameSeats.length ? "increased" : "decreased";
      addToLog(`${thisPlayer} ${action} party seats to ${newSeatCount}`, 'system');

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
          player_name: log.player_name
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
  
      // Add to adventure log
      addToLog(`Player ${playerToKick} was removed from the game`, 'system');
  
    } catch (error) {
      console.error('Error kicking player:', error);
      alert('Failed to kick player. Please try again.');
    }
  };

  const addToLog = (message, type, playerName = null) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newEntry = {
      id: Date.now(),
      message,
      type,
      timestamp,
      player_name: playerName
    };
    
    setRollLog(prev => [...prev, newEntry]);
  };

  // Show dice portal for player rolls
  const showDicePortal = (playerName, promptType = null) => {
    setCurrentTurn(playerName);
    setDicePortalActive(true);
  };

  // Hide dice portal
  const hideDicePortal = () => {
    setDicePortalActive(false);
  };

  // FIXED: Update promptPlayerRoll to handle specific players and store prompts properly
  const promptPlayerRoll = (rollType, targetPlayer = null) => {
    const playerToPrompt = targetPlayer || currentTurn;
    
    // Set the roll prompt for the specific player
    setRollPrompts(prev => ({
      ...prev,
      [playerToPrompt]: rollType
    }));
    
    // Add to adventure log
    addToLog(`DM: ${playerToPrompt}, please roll a ${rollType}`, 'system');
  };

  // FIXED: Handle dice roll with correct player name and prompt clearing
  const handleDiceRoll = (rollData) => {
    // Calculate result based on dice type
    const diceNumber = parseInt(rollData.dice.substring(1));
    const result = Math.floor(Math.random() * diceNumber) + 1;
    const bonus = rollData.bonus ? ` ${rollData.bonus}` : '';
    const rollFor = rollData.rollFor || 'General Roll';
    
    // FIXED: Add to log with roll details using thisPlayer (not hard-coded)
    addToLog(`${rollData.dice}${bonus}: ${result} (${rollFor})`, 'dice', thisPlayer);
    
    // FIXED: Send to websocket using thisPlayer and actual dice info
    sendDiceRoll(thisPlayer, `${rollData.dice}${bonus}`, result);
    
    // FIXED: Clear the roll prompt for this player
    setRollPrompts(prev => {
      const updated = { ...prev };
      delete updated[thisPlayer];
      return updated;
    });
  };

  // FIXED: Handle end turn and clear prompts
  const handleEndTurn = () => {
    // Clear any roll prompts for the current player
    setRollPrompts(prev => {
      const updated = { ...prev };
      delete updated[thisPlayer];
      return updated;
    });
    
    // Add logic to advance to next player in initiative order
    addToLog(`${thisPlayer} ended their turn`, 'system');
    
    // Here you would advance to the next player in initiative
    // This depends on your initiative system implementation
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
      
      // Add confirmation message
      addToLog('System messages cleared', 'system');
      
    } catch (error) {
      console.error('Error clearing system messages:', error);
      alert('Failed to clear system messages. Please try again.');
    }
  };

  // Show loading or 404 states
  if (room404) {
    return <div>Room not found</div>;
  }

  if (!roomId) {
    return <div>Loading...</div>;
  }

  // REMOVED: Old handlePlayerDiceRoll function that was causing hard-coded values
  // This was conflicting with the new DiceActionPanel system

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
            
            return (
              <PlayerCard
                key={seat.seatId}
                seatId={seat.seatId}
                seats={gameSeats}
                thisPlayer={thisPlayer}
                isSitting={isSitting}
                sendSeatChange={sendSeatChange}
                currentTurn={currentTurn}
                playerData={seat.characterData}
              />
            );
          })}

          {/* Clean AdventureLog component */}
          <AdventureLog 
            rollLog={rollLog}
            gameSeats={gameSeats}
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
          />
        </div>

        {/* FIXED: Dice Action Panel - Shows when combat active + player's turn OR when DM prompts player */}
        <DiceActionPanel
          currentTurn={currentTurn}
          thisPlayer={thisPlayer}
          combatActive={combatActive}
          onRollDice={handleDiceRoll}
          onEndTurn={handleEndTurn}
          rollPrompt={rollPrompts[thisPlayer]} // Pass the specific prompt for this player
          uiScale={uiScale}
        />
      </div>
    </div>
  );
}