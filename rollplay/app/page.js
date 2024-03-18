'use client'
 
import { useState } from 'react'

export default function Home() {
  const [roomId, setRoomId] = useState("")
  const [maxPlayers, setMaxPlayers] = useState(1)
  const [playerName, setPlayerName] = useState("")

  const [newRoom, setNewRoom] = useState(false)
  const [existingRoom, setExistingRoom] = useState(false)
  
  const [modalOpen, setModalOpen] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (newRoom) {
      console.log(`requesting a new room for ${maxPlayers} players...`)
      var payload = {"max_players": maxPlayers, "player_name": playerName}

      // Make the request to API for a new room id
      const req = await fetch('http://localhost:8081/game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const res = await req.json()
      console.log(res)
      // todo: once the ID is returned, re-direct to the room
    }
    // Request the API that the room ID is valid
    else if (existingRoom) {
      console.log("room id: ", roomId)
      const res = await fetch(`http://localhost:8081/game/${roomId}`)
      const jsonData = await res.json()
      console.log(jsonData)
      // todo: if the ID comes back in the response, re-direct to the room
    }
  }

  return (
    <div className="flex min-h-screen flex-col isolate overflow-hidden bg-gray-900 py-16 sm:py-24 lg:py-32">
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
                    onClick={()=>{setNewRoom(true),setExistingRoom(false),setModalOpen(true)}}
                  >
                    Create a new lobby
                  </button>
                  <button
                    className={"flex-none rounded-md " + (existingRoom == true ? 'bg-indigo-300' : 'bg-indigo-600') + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{setNewRoom(false),setExistingRoom(true),setModalOpen(true)}}
                  >
                    Join an existing lobby
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
                  className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                  id="roomId"
                  name="roomId"
                  type="text"
                  value={roomId}
                  placeholder="room id"
                  onChange={(e) => setRoomId(e.target.value)}
                />

                }
                <button
                  className="flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" 
                  type="submit"
                  onClick={()=>{handleSubmit}}
                >Go</button>
              </form>
              }
              


          </div>
        </div>
      </div>
    </div>
  )
}
