'use client'

import { React, useEffect, useState, useRef } from 'react'
import { useSearchParams } from "next/navigation";

import PlayerCard from "../components/PlayerCard";
import ChatMessages from '../components/ChatMessages';
import DMControlCenter from '../components/DMControlCenter';

function Params() {
  return useSearchParams()
}

export default function Game() {

  const params = Params(); 

  const [room404, setRoom404] = useState(false)
  const [webSocket, setWebSocket] = useState()
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
  const [rollLog, setRollLog] = useState([
    { id: 1, message: 'Combat initiated', type: 'system', timestamp: '2:34 PM' },
    { id: 2, message: '<strong>Thorin:</strong> Initiative d20: 19', type: 'player-roll', timestamp: '2:34 PM' },
    { id: 3, message: '<strong>DM:</strong> Bandit Initiative d20: 15', type: 'dm-roll', timestamp: '2:34 PM' },
    { id: 4, message: '<strong>Elara:</strong> Initiative d20: 14', type: 'player-roll', timestamp: '2:35 PM' },
    { id: 5, message: 'Turn order established', type: 'system', timestamp: '2:35 PM' },
    { id: 6, message: '<strong>DM:</strong> Thorin, please roll an Attack Roll', type: 'system', timestamp: '2:36 PM' }
  ]);
  
  const [initiativeOrder, setInitiativeOrder] = useState([
    { name: 'Thorin', initiative: 19, active: true },
    { name: 'Bandit #1', initiative: 15, active: false },
    { name: 'Elara', initiative: 14, active: false },
    { name: 'Finn', initiative: 12, active: false },
    { name: 'Sister Meredith', initiative: 8, active: false }
  ]);

  const [currentTrack, setCurrentTrack] = useState('🏰 Tavern Ambience');
  const [isPlaying, setIsPlaying] = useState(true);

  const logRef = useRef(null);

  // Helper function to get character data
  const getCharacterData = (playerName) => {
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
      
      // Create unified seat structure
      const initialSeats = [];
      for (let i = 0; i < res["max_players"]; i++) {
        initialSeats.push({
          seatId: i,
          playerName: "empty",
          characterData: null,
          isActive: false
        });
      }
      
      setGameSeats(initialSeats);
    })
  }
  
  // initialise the game lobby
  useEffect(() => {
    const roomId = params.get('roomId')
    const thisPlayer = params.get('playerName')
    setRoomId(roomId)
    setThisPlayer(thisPlayer)

    // fetches the room ID, and loads data
    onLoad(roomId)

    // establishes websocket for this lobby
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.host}/ws/`;

    const url = `${socketUrl}${roomId}?player_name=${thisPlayer}`
    setWebSocket(
      new WebSocket(url)
    )
  }, [])

  // Auto-scroll log to bottom when new entries are added
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [rollLog]);

  // UPDATED websocket handler for unified structure
  if (webSocket) {
    webSocket.onmessage = (event) => {
      const json_data = JSON.parse(event.data)
      const event_type = json_data["event_type"]
      console.log("NEW EVENT", json_data)
      
      if (event_type == "seat_change") {
        console.log("received a new message with seat change: ", json_data["data"])
        
        // Convert websocket data back to unified structure
        const updatedSeats = json_data["data"].map((playerName, index) => ({
          seatId: index,
          playerName: playerName,
          characterData: playerName !== "empty" ? getCharacterData(playerName) : null,
          isActive: false // Reset turn state, will be managed by initiative
        }));
        
        setGameSeats(updatedSeats);
        return
      }

      if (event_type == "chat_message") {
        setChatLog([
          ...chatLog,
          {
            "player_name": json_data["player_name"],
            "chat_message": json_data["data"],
            "timestamp": json_data["utc_timestamp"]
          }
        ])
        return
      }
    }
  }

  function sendMessage(e) {
    e.preventDefault()
    webSocket.send(JSON.stringify(
      {"event_type": "chat_message", "data": chatMsg})
    )
    setChatMsg("")
  }

  // UPDATED sendSeatChange function
  function sendSeatChange(newSeats) {
    console.log("Sending seat layout to WS: ", newSeats)
    
    // Convert to your current websocket format (array of player names)
    const seatArray = newSeats.map(seat => seat.playerName);
    
    webSocket.send(JSON.stringify({
      "event_type": "seat_change", 
      "data": seatArray
    }));
    
    // Update local state
    setGameSeats(newSeats);
  }

  // Add entry to roll log
  const addToLog = (message, type) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newEntry = {
      id: Date.now(),
      message,
      type,
      timestamp
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

  // DM prompts player to roll
  const promptPlayerRoll = (rollType) => {
    addToLog(`<strong>DM:</strong> ${currentTurn}, please roll a ${rollType}`, 'system');
    showDicePortal(currentTurn, rollType);
  };

  // Handle dice roll
  const rollDice = () => {
    const result = Math.floor(Math.random() * 20) + 1;
    addToLog(`<strong>${currentTurn}:</strong> d20: ${result}`, 'player-roll');
    
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

  // Show loading or 404 states
  if (room404) {
    return <div>Room not found</div>;
  }

  if (!roomId) {
    return <div>Loading...</div>;
  }

  // Handle dice rolls from PlayerCard components
  const handlePlayerDiceRoll = (playerName, seatId) => {
    // This replaces your dice portal logic
    if (playerName === currentTurn) {
      // Trigger dice roll
      const result = Math.floor(Math.random() * 20) + 1;
      addToLog(`<strong>${playerName}:</strong> d20: ${result}`, 'player-roll');
      
      // Send to websocket
      if (webSocket) {
        webSocket.send(JSON.stringify({
          "event_type": "dice_roll",
          "data": {
            "player": playerName,
            "dice": "d20",
            "result": result
          }
        }));
      }
    } else {
      console.log(`It's not ${playerName}'s turn!`);
    }
  };

  // MAIN RENDER - FIXED STRUCTURE
  return (
    <div className="game-interface">
      {/* Top Command Bar */}
      <div className="command-bar">
        <div className="campaign-info">
          <div className="campaign-title">The Curse of Strahd</div>
          <div className="location-breadcrumb">› Barovia Village › The Blood on the Vine Tavern</div>
          <div 
            className="room-code" 
            onClick={copyRoomCode}
            title="Click to copy room code"
          >
            Room: {roomId}
          </div>
        </div>
        
        <div className="dm-controls-bar">
          <button className="control-btn">📝 Notes</button>
          <button className="control-btn" onClick={toggleCampaignSettings}>⚙️ Campaign Settings</button>
          <button className="control-btn">🔧 Room Settings</button>
        </div>
      </div>

      {/* Main Game Area - CORRECTED ORDER */}
      <div className="main-game-area">
        {/* GRID POSITION 1: Left Column, Top Row - party-sidebar */}
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
                onDiceRoll={handlePlayerDiceRoll}
                playerData={seat.characterData}
              />
            );
          })}
        </div>

        {/* GRID POSITION 2: Center Column, Top Row - map-canvas */}
        <div className="map-canvas">
          <div className="map-placeholder">
            <div className="map-placeholder-icon">🗺️</div>
            <div>The Blood on the Vine Tavern</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: '0.7' }}>
              Upload a battle map to begin
            </div>
          </div>
        </div>

        {/* GRID POSITION 3: Right Column, Top Row - initiative-tracker */}
        <div className="initiative-tracker">
          <div className="initiative-header">⚡ Initiative Order</div>
          <div className="turn-order">
            {initiativeOrder.map((item, index) => (
              <div 
                key={index}
                className={`turn-item ${item.active ? 'active' : 'upcoming'}`}
                onClick={() => handleInitiativeClick(item.name)}
              >
                <span>{item.name}</span>
                <span>{item.initiative}</span>
              </div>
            ))}
          </div>
        </div>

        {/* GRID POSITION 4: Left Column, Bottom Row - dice-portal */}
        <div className="dice-portal">
          {dicePortalActive ? (
            <div className="dice-container active prompt">
              <div className="dice-header">🎲 {currentTurn}'s Turn!</div>
              <div className="dice-prompt">Roll for your action</div>
              <button className="dice-cta" onClick={rollDice}>
                Choose Dice & Roll
              </button>
            </div>
          ) : (
            <div className="dice-inactive">
              Waiting for turn...
            </div>
          )}
        </div>

        {/* GRID POSITION 5: Center Column, Bottom Row - roll-log */}
        <div className="roll-log">
          <div className="log-header">
            📜 Adventure Log
            <span style={{ fontSize: '10px', color: '#6b7280' }}>(Live)</span>
          </div>
          <div className="log-entries" ref={logRef}>
            {rollLog.map((entry) => (
              <div key={entry.id} className={`log-entry ${entry.type}`}>
                <div 
                  className="log-entry-content"
                  dangerouslySetInnerHTML={{ __html: entry.message }}
                />
                <div className="log-entry-timestamp">{entry.timestamp}</div>
              </div>
            ))}
          </div>
        </div>

        {/* GRID POSITION 6: Right Column, Bottom Row - dm-control-center */}
        <DMControlCenter
          isDM={isDM}
          promptPlayerRoll={promptPlayerRoll}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          handleTrackClick={handleTrackClick}
        />
      </div>
    </div>
  );
}