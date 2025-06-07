'use client'

import { React, useEffect, useState, useRef } from 'react'
import { useSearchParams } from "next/navigation";

import PlayerCard from "../components/PlayerCard";
import ChatMessages from '../components/ChatMessages';

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

  // max number of available spots in a lobby
  const [seats, setSeats] = useState(["",]) 

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

  const [partyMembers] = useState([
    { name: 'Thorin Ironbeard', class: 'Dwarf Fighter', level: 3, hp: 34, maxHp: 40 },
    { name: 'Elara Moonwhisper', class: 'Elf Wizard', level: 3, hp: 18, maxHp: 30 },
    { name: 'Finn Lightfoot', class: 'Halfling Rogue', level: 2, hp: 23, maxHp: 24 },
    { name: 'Sister Meredith', class: 'Human Cleric', level: 3, hp: 12, maxHp: 30 }
  ]);

  const [currentTrack, setCurrentTrack] = useState('🏰 Tavern Ambience');
  const [isPlaying, setIsPlaying] = useState(true);

  const logRef = useRef(null);

  async function onLoad(roomId) {
    const req = await fetch(`api/game/${roomId}`)
    if (req.status === 404) {
      console.log("room id not found")
      setRoom404(true)
      return
    }

    await req.json().then((res)=>{
      setHost(res["player_name"])

      // TODO: get current seats
      // TODO: limit seat changes?

      var plyrs = ["empty",]
      for (let i=1; i < res["max_players"]; i++) {
        plyrs = [...plyrs, "empty"]
      }
      setSeats([...plyrs])
    })
  }
  
  // initialise the game lobby
  useEffect(() => {

    // cant use SearchParams in a use effect
    // or revert and ignore https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout

    const roomId = params.get('roomId')
    const thisPlayer = params.get('playerName')
    setRoomId(roomId)
    setThisPlayer(thisPlayer)

    // fetches the room ID, and loads data
    onLoad(roomId)

    // establishes websocket for this lobby
    // Determine the appropriate protocol based on the current page
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Build the URL dynamically using the window host
    const socketUrl = `${socketProtocol}//${window.location.host}/ws/`;

    const url = `${socketUrl}${roomId}?player_name=${thisPlayer}`
    setWebSocket(
      new WebSocket(url)
      )
    },[]
  )

  // Auto-scroll log to bottom when new entries are added
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [rollLog]);

  if (webSocket) {
    webSocket.onmessage = (event)=>{
      const json_data = JSON.parse(event.data)
      const event_type = json_data["event_type"]
      console.log("NEW EVENT", json_data)
      
      if (event_type == "seat_change") {
        console.log("recieved a new message with seat change: ", json_data["data"])
        setSeats([...json_data["data"]]);
        return
      }

      if (event_type == "chat_message") {
        setChatLog(
          [...chatLog,
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

  function sendSeatChange(seat) {
    console.log("Sending seat layout to WS: ", seat)
    webSocket.send(JSON.stringify(
      {"event_type": "seat_change", "data": seat})
    )
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

  // Helper logic for PlayerCard
  // Get player character data (replace with your actual data source)
  const getPlayerData = (playerName) => {
    // This is where you'd fetch from your backend or state
    // For now, return some default data or null
    const playerCharacters = {
      'Thorin': { class: 'Dwarf Fighter', level: 3, hp: 34, maxHp: 40 },
      'Elara': { class: 'Elf Wizard', level: 3, hp: 18, maxHp: 30 },
      'Finn': { class: 'Halfling Rogue', level: 2, hp: 23, maxHp: 24 },
      'Sister Meredith': { class: 'Human Cleric', level: 3, hp: 12, maxHp: 30 }
    };
    
    return playerCharacters[playerName] || null;
  };

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


  // MAIN RENDER - Fixed structure
  return (
    <div className="game-interface">
      {/* Top Command Bar */}
      <div className="command-bar">
        <div className="campaign-info">
          <div className="campaign-title">The Curse of Strahd</div>
          <div className="location-breadcrumb">› Barovia Village › The Blood on the Vine Tavern</div>
          <div className="room-code">Room: {roomId}</div>
        </div>
        
        <div className="dm-controls-bar">
          <button className="control-btn">📝 Notes</button>
          <button className="control-btn" onClick={toggleCampaignSettings}>⚙️ Campaign Settings</button>
          <button className="control-btn">🔧 Room Settings</button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="main-game-area">
        {/* Left Sidebar - Party Overview */}
        <div className="party-sidebar">
          <div className="party-header">
            <span>Party</span>
            <span className="seat-indicator">
              {seats.filter(seat => seat !== "empty").length}/{seats.length} Seats
            </span>
          </div>
          
          {/* Render all seats using your PlayerCard component */}
          {partyMembers.map((seat, index) => {
            // Check if this player is sitting in this seat
            const isSitting = seat === thisPlayer;
            
            // Get character data if available (you might want to fetch this from your backend)
            const playerData = seat !== "empty" ? getPlayerData(seat) : null;
            
            return (
              <PlayerCard
                key={index}
                seatId={index}
                seats={seats}
                thisPlayer={thisPlayer}
                isSitting={isSitting}
                sendSeatChange={sendSeatChange}
                currentTurn={currentTurn}
                onDiceRoll={handlePlayerDiceRoll}
                playerData={playerData}
              />
            );
          })}
        </div>

        {/* Central Map Canvas */}
        <div className="map-canvas">
          <div className="map-placeholder">
            <div className="map-placeholder-icon">🗺️</div>
            <div>The Blood on the Vine Tavern</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: '0.7' }}>
              Upload a battle map to begin
            </div>
          </div>
        </div>

        {/* Right Sidebar - DM Control Center */}
        <div className={`dm-control-center ${!isDM ? 'hidden' : ''}`}>
          <div className="dm-header">
            🎭 DM Command Center
          </div>

          {/* Initiative Order - At the top */}
          <div className="initiative-section">
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

          <div className="control-section">
            <div className="section-title">🗺️ Map Controls</div>
            <button className="dm-btn map-control-btn">📁 Upload Map</button>
            <button className="dm-btn map-control-btn">💾 Load Map</button>
            <button className="dm-btn map-control-btn">📏 Grid Settings</button>
          </div>

          <div className="control-section">
            <div className="section-title">🎲 Roll Management</div>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Ability Check')}>
              🎯 Prompt Ability Check
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Saving Throw')}>
              🛡️ Prompt Saving Throw
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Attack Roll')}>
              ⚔️ Prompt Attack Roll
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Damage Roll')}>
              💥 Prompt Damage Roll
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Initiative')}>
              ⚡ Prompt Initiative
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Skill Check')}>
              📊 Prompt Skill Check
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Hit Dice')}>
              ❤️ Prompt Hit Dice
            </button>
            <button className="dm-btn roll-prompt-btn" onClick={() => promptPlayerRoll('Death Save')}>
              💀 Prompt Death Save
            </button>
          </div>

          <div className="control-section">
            <div className="section-title">🎵 Audio Tracks</div>
            <div className="audio-player">
              {[
                { name: '🏰 Tavern Ambience', duration: '3:42 / 8:15' },
                { name: '⚔️ Combat Music', duration: '0:00 / 4:32' },
                { name: '🌲 Forest Sounds', duration: '0:00 / 12:08' }
              ].map((track, index) => (
                <div 
                  key={index}
                  className={`track-item ${currentTrack === track.name && isPlaying ? 'active' : ''}`}
                >
                  <div className="track-info">
                    <div className="track-name">{track.name}</div>
                    <div className="track-duration">{track.duration}</div>
                  </div>
                  <div className="track-controls">
                    <button 
                      className={`audio-btn ${currentTrack === track.name && isPlaying ? 'pause' : 'play'}`}
                      onClick={() => handleTrackClick(track.name)}
                    >
                      {currentTrack === track.name && isPlaying ? '⏸️' : '▶️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="dm-btn">📁 Upload Audio</button>
            <button className="dm-btn">💾 Load Audio</button>
          </div>

          <div className="control-section">
            <div className="section-title">👥 Party Management</div>
            <button className="dm-btn">🪑 Manage Seats</button>
            <button className="dm-btn">🚪 Kick Player</button>
            <button className="dm-btn">💊 Adjust HP</button>
          </div>
        </div>

        {/* Dice Portal - Bottom Left */}
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

        {/* Roll Log - Bottom Center */}
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
      </div>
    </div>
  );
}