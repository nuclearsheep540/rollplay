'use client'
 
import { useState } from 'react'
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter()

  const [roomId, setRoomId] = useState("")
  const [room404, setRoom404] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(1)
  const [playerName, setPlayerName] = useState("")

  const [newRoom, setNewRoom] = useState(false)
  const [existingRoom, setExistingRoom] = useState(false)
  
  const [modalOpen, setModalOpen] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault();
    setRoom404(false);

  
    if (newRoom) {
      console.log(`requesting a new room for ${maxPlayers} players...`);
      var payload = { "max_players": maxPlayers, "player_name": playerName };
  
      try {
        const url = "/api/game/"
        const req = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log(`url = ${url}`)
        console.log("POST succeeded with status:", req.status);
      
        // Attempt to parse JSON (you might want to re-run the request if needed)
        const res = await req.json()
        console.log("response", res)
        console.log("attempting re-direct: " + `/game?roomId=${res["id"]}&playerName=${playerName}`);
        router.push(`/game?roomId=${res["id"]}&playerName=${playerName}`);
      } catch (error) {
        console.error("Error in fetch or JSON parsing:", error);
      }
    } else if (existingRoom) {
      console.log(`fetching room id ${roomId}`);
      const res = await fetch(`/api/game/${roomId}`);
  
      if (res.status === 404) {
        console.log("room id not found");
        setRoom404(true);
        return;
      } else {
        const jsonData = await res.json();
        if (jsonData["_id"] == roomId) {
          console.log(jsonData);
          router.push(`/game?roomId=${roomId}&playerName=${playerName}`);
        }
      }
    }

    
  }

  return (
      <div>
        <div className="hero-container">
          <div className="hero-image"></div>
          
          <nav className="nav-bar">
            <div className="logo">TABLETOP<span>TAVERN</span></div>
          </nav>
          
          <div className="hero-content">
            <h1>Your Virtual D&D Table Awaits</h1>
            <p>Create or join virtual D&D game rooms in seconds. Connect with friends, manage campaigns, and embark on epic adventures together — no downloads required.</p>
            
            <div className="cta-buttons">
                {/* CTA: NEW or EXISTING lobby */}
                <div className="mt-2 flex gap-x-6">
                <button
                    className={"flex-none rounded-md " + (newRoom == true ? 'bg-orange-300' : 'bg-orange-600') + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"}
                    onClick={()=>{setNewRoom(true),setExistingRoom(false),setModalOpen(true),setRoom404(false)}}
                  >
                    Create Game Lobby
                  </button>
                  <button
                    className={"flex-none rounded-md " + (existingRoom == true ? 'bg-orange-300' : 'bg-orange-600') + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"}
                    onClick={()=>{setNewRoom(false),setExistingRoom(true),setModalOpen(true),setRoom404(false)}}
                  >
                    Join Existing Lobby
                  </button>
              </div>
            </div>

            {modalOpen &&
              <section>
                <form className="mt-4 flex gap-x-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="playerName" className="sr-only">
                  Player Name
                  </label>
                  <input
                  className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6"
                  id="playerName"
                  name="playerName"
                  type="text"
                  value={playerName}
                  required
                  placeholder="player name"
                  onChange={(e) => setPlayerName(e.target.value)}
                  />
                </div>
                {
                newRoom &&
                  <input
                    className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6"
                    id="maxPlayers"
                    name="maxPlayers"
                    type="number"
                    min="2"
                    max="10"
                    value={maxPlayers}
                    required
                    placeholder="number of players"
                    onChange={(e) => setMaxPlayers(e.target.value)}
                  />
                }
                {
                existingRoom &&

                <input
                  className={"min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset " + (room404 == false ? "ring-white/10" : "ring-red-400")  + " focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6"}
                  id="roomId"
                  name="roomId"
                  type="text"
                  value={roomId}
                  placeholder="room id"
                  onChange={(e) => setRoomId(e.target.value)}
                />

                }
                <>
                <button
                  className="flex-none rounded-md bg-orange-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500" 
                  type="submit"
                  onClick={()=>{handleSubmit}}
                >Go</button>
                </>
              </form>
              </section>
              }

          </div>
        </div>
        
        <section className="how-it-works">
          <h2>How It Works</h2>
          
          <div className="steps">
            <div className="step">
              <div className="step-icon">1</div>
              <h3>Create a Lobby</h3>
              <p>Set up your game room with customizable settings for your campaign and adventure style.</p>
            </div>
            
            <div className="step">
              <div className="step-icon">2</div>
              <h3>Invite Your Party</h3>
              <p>Share a simple link with friends so they can join your virtual table instantly.</p>
            </div>
            
            <div className="step">
              <div className="step-icon">3</div>
              <h3>Start Your Adventure</h3>
              <p>Use our tools to manage characters, roll dice, and track your epic journey together.</p>
            </div>
          </div>
        </section>
        
        <footer>
          <div className="footer-links">
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Help Center</a>
          </div>
          <div className="px-6 py-6 auto space-y-6 overflow-hidden sm:px-6 lg:px-6">
              <div className="copyright">
                © 2025 Tabletop Tavern. <br />All rights reserved. made with &#x2764; for me and my friends.
              </div>
          </div>
        </footer>
      </div>
  )
}
