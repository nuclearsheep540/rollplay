'use client'
 
import { useState } from 'react'
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter()

  const [roomId, setRoomId] = useState("")
  const [room404, setRoom404] = useState(false)
  const [playerName, setPlayerName] = useState("")
  const [newRoom, setNewRoom] = useState(false)
  const [existingRoom, setExistingRoom] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault();
    setRoom404(false);
    setIsLoading(true);

  
    if (newRoom) {
      var payload = { 
        "max_players": 1,
        "player_name": playerName,
        "seat_layout": [""],
        "created_at": new Date().toISOString() 
      };
  
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
        setIsLoading(false);
      }
    } else if (existingRoom) {
      console.log(`fetching room id ${roomId}`);
      
      try {
        const res = await fetch(`/api/game/${roomId}`);
    
        if (res.status === 404) {
          console.log("room id not found");
          setRoom404(true);
          setIsLoading(false);
          return;
        } else {
          const jsonData = await res.json();
          if (jsonData["_id"] == roomId) {
            console.log(jsonData);
            router.push(`/game?roomId=${roomId}&playerName=${playerName}`);
          }
        }
      } catch (error) {
        console.error("Error fetching room:", error);
        setIsLoading(false);
      }
    }
  }

  return (
      <div style={{backgroundColor: '#1e293b', minHeight: '100vh'}}>
        <div className="hero-container">
          <div className="hero-image"></div>
          
          <nav className="nav-bar">
            <div className="logo">TABLETOP<span>TAVERN</span></div>
          </nav>
          
          <div className="hero-content" style={{transform: 'translateY(-10vh)'}}>
            <h1>Your Virtual D&D Table Awaits</h1>
            <p>Create or join virtual D&D game rooms in seconds. Connect with friends, manage campaigns, and embark on epic adventures together — no downloads required.</p>
            
            <div className="cta-buttons">
                {/* ENHANCED CTA: Column layout with D&D theming */}
                <div className="mt-6 flex flex-col gap-y-4 items-center max-w-md mx-auto">
                <button
                    className={`
                      group relative px-8 py-4 text-lg font-bold text-white rounded-lg
                      transition-all duration-300 transform hover:scale-105 hover:shadow-2xl
                      ${newRoom 
                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 shadow-amber-500/50' 
                        : 'bg-gradient-to-r from-slate-700 to-slate-800 hover:from-amber-600 hover:to-orange-600'
                      }
                      border-2 border-amber-400/30 shadow-lg
                      before:absolute before:inset-0 before:rounded-lg 
                      before:bg-gradient-to-r before:from-amber-500/20 before:to-orange-500/20 
                      before:opacity-0 hover:before:opacity-100 before:transition-opacity
                    `}
                    onClick={()=>{setNewRoom(true),setExistingRoom(false),setModalOpen(true),setRoom404(false),setIsLoading(false)}}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      🏰 Create New Campaign
                    </span>
                  </button>
                  
                  <button
                    className={`
                      group relative px-8 py-4 text-lg font-bold text-white rounded-lg
                      transition-all duration-300 transform hover:scale-105 hover:shadow-2xl
                      ${existingRoom 
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/50' 
                        : 'bg-gradient-to-r from-slate-700 to-slate-800 hover:from-emerald-600 hover:to-teal-600'
                      }
                      border-2 border-emerald-400/30 shadow-lg
                      before:absolute before:inset-0 before:rounded-lg 
                      before:bg-gradient-to-r before:from-emerald-500/20 before:to-teal-500/20 
                      before:opacity-0 hover:before:opacity-100 before:transition-opacity
                    `}
                    onClick={()=>{setNewRoom(false),setExistingRoom(true),setModalOpen(true),setRoom404(false),setIsLoading(false)}}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      ⚔️ Join Adventure
                    </span>
                  </button>
              </div>
            </div>

            {/* Always render section to prevent layout shift, but control visibility */}
            <section className="mt-6" style={{ minHeight: '60px' }}>
              <div 
                className={`backdrop-blur-sm bg-black/10 p-4 rounded-lg border border-white/10 mx-auto transition-opacity duration-300 ${
                  existingRoom ? 'max-w-3xl' : 'max-w-md'
                } ${
                  modalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <form className="flex gap-3" onSubmit={handleSubmit}>
                  <input
                    className="flex-1 rounded-md border-0 bg-white/10 px-4 py-3 text-white text-base placeholder-white/60 shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-amber-400 backdrop-blur-sm"
                    id="playerName"
                    name="playerName"
                    type="text"
                    value={playerName}
                    required
                    placeholder="Your name"
                    onChange={(e) => setPlayerName(e.target.value)}
                  />
                  
                  {existingRoom && (
                    <input
                      className={`flex-1 rounded-md border-0 bg-white/10 px-4 py-3 text-white text-base placeholder-white/60 shadow-sm ring-1 ring-inset ${
                        room404 ? "ring-red-400" : "ring-white/20"
                      } focus:ring-2 focus:ring-inset focus:ring-emerald-400 backdrop-blur-sm`}
                      id="roomId"
                      name="roomId"
                      type="text"
                      value={roomId}
                      placeholder="Campaign code"
                      onChange={(e) => setRoomId(e.target.value)}
                    />
                  )}
                  
                  <button
                    className={`
                      px-5 py-3 text-base font-semibold text-white rounded-md
                      transition-all duration-200 min-w-[140px]
                      ${isLoading 
                        ? 'bg-gray-500 cursor-not-allowed' 
                        : newRoom 
                          ? 'bg-amber-600 hover:bg-amber-500' 
                          : 'bg-emerald-600 hover:bg-emerald-500'
                      }
                      shadow-sm
                    `}
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading 
                      ? (newRoom ? 'Creating...' : 'Joining...') 
                      : 'Go'
                    }
                  </button>
                </form>
                {room404 && (
                  <p className="mt-2 text-xs text-red-400 text-center">Campaign not found</p>
                )}
              </div>
            </section>
          </div>
        </div>
        
        <section className="how-it-works">
          <h2 style={{color: '#1e293b', fontSize: '2.5rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '3rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>How It Works</h2>
          
          <div className="steps" style={{display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2rem', maxWidth: '1200px', margin: '0 auto', padding: '0 2rem'}}>
            <div className="step" style={{backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '2px solid #3b82f6', textAlign: 'center', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)', maxWidth: '300px', flex: '1', minWidth: '280px'}}>
              <div className="step-icon" style={{fontSize: '3rem', marginBottom: '1rem'}}>🏰</div>
              <h3 style={{color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Create a Campaign</h3>
              <p style={{color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500'}}>Set up your game room with customizable settings for your adventure style and party size.</p>
            </div>
            
            <div className="step" style={{backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '2px solid #8b5cf6', textAlign: 'center', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)', maxWidth: '300px', flex: '1', minWidth: '280px'}}>
              <div className="step-icon" style={{fontSize: '3rem', marginBottom: '1rem'}}>🗡️</div>
              <h3 style={{color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Gather Your Party</h3>
              <p style={{color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500'}}>Share a simple campaign code with friends so they can join your virtual table instantly.</p>
            </div>
            
            <div className="step" style={{backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '2px solid #10b981', textAlign: 'center', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)', maxWidth: '300px', flex: '1', minWidth: '280px'}}>
              <div className="step-icon" style={{fontSize: '3rem', marginBottom: '1rem'}}>🎲</div>
              <h3 style={{color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Begin Your Quest</h3>
              <p style={{color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500'}}>Use our tools to manage characters, roll dice, and track your epic journey together.</p>
            </div>
          </div>
        </section>
        
        <footer style={{backgroundColor: '#0f172a', borderTop: '1px solid rgba(148, 163, 184, 0.2)'}}>
          <div className="footer-links" style={{textAlign: 'center', padding: '2rem 0'}}>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Terms of Service</a>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Privacy Policy</a>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Help Center</a>
          </div>
          <div className="px-6 py-6 auto space-y-6 overflow-hidden sm:px-6 lg:px-6">
              <div className="copyright" style={{textAlign: 'center', color: '#64748b', fontSize: '0.9rem'}}>
                © 2025 Tabletop Tavern. <br />All rights reserved. made with &#x2764; for me and my friends.
              </div>
          </div>
        </footer>
      </div>
  )
}