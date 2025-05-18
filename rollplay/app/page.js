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
  
    // Use the environment variable for the API URL
    const api_url = process.env.NEXT_PUBLIC_API_URL || "https://localhost";
  
    if (newRoom) {
      console.log(`requesting a new room for ${maxPlayers} players...`);
      var payload = { "max_players": maxPlayers, "player_name": playerName };
  
      try {
        const url = `${api_url}/api/game/`
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
      const res = await fetch(`${api_url}/api/game/${roomId}`);
  
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
    <div className="flex min-h-[600px] flex-col isolate overflow-hidden bg-gray-900 py-16 sm:py-24 lg:py-32">
      <div id="imgBg"></div>
      <div className="mx-auto max-w-7x1 px-6 lg:px-8">
        <div className="mx-auto grid max-w-2x2 grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-2">
          <div className="max-w-xl lg:max-w-1g">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Let's get ready to roll!</h2>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Simple game lobby with dice rolling and chat for your role playing adventures!
            </p>
            {/* CTA: NEW or EXISTING lobby */}
              <div className="mt-2 flex gap-x-6">
                <button
                    className={"flex-none rounded-md " + (newRoom == true ? 'bg-indigo-300' : 'bg-indigo-600') + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{setNewRoom(true),setExistingRoom(false),setModalOpen(true),setRoom404(false)}}
                  >
                    New Game
                  </button>
                  <button
                    className={"flex-none rounded-md " + (existingRoom == true ? 'bg-indigo-300' : 'bg-indigo-600') + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{setNewRoom(false),setExistingRoom(true),setModalOpen(true),setRoom404(false)}}
                  >
                    Join Game
                  </button>

              </div>
            {/* Player INPUT */}
              {
                (modalOpen) &&
              <form className="mt-4 flex gap-x-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="playerName" className="sr-only">
                  Player Name
                  </label>
                  <input
                  className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
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
                (newRoom) &&
                  <input
                    className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                    id="maxPlayers"
                    name="maxPlayers"
                    type="number"
                    min="0"
                    max="10"
                    value={maxPlayers}
                    required
                    placeholder="number of players"
                    onChange={(e) => setMaxPlayers(e.target.value)}
                  />
                }
                {
                (existingRoom) &&

                <input
                  className={"min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset " + (room404 == false ? "ring-white/10" : "ring-red-400")  + " focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"}
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
                  className="flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" 
                  type="submit"
                  onClick={()=>{handleSubmit}}
                >Go</button>
                </>
              </form>
              }
              <p className={"" + (room404 == false ? 'hidden' : ' text-red-600 sm:text-m sm:leading-6') + ""}>Error: room not found</p>
              


          </div>
        </div>
      </div>
    </div>
  )
}
