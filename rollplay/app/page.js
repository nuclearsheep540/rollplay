'use client'
 
import { useState } from 'react'


export default function Home() {
  const [roomId, setRoomId] = useState("")

  async function getData(e) {
    e.preventDefault()
    console.log("room id: ", roomId)
    const res = await fetch(`http://localhost:8081/game/${roomId}`)
    const jsonData = await res.json()
    console.log(jsonData)
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
            {/* player input for lobby */}
            <form className="mt-2 flex gap-x-6" onSubmit={getData}>
              <label htmlFor="playerName" className="sr-only">
                Player Name
              </label>
              <input
                className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                id="playerName"
                name="playerName"
                type="text"
                required
                placeholder="player name"
              />
              <input
                className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                id="roomId"
                name="roomId"
                type="text"
                value={roomId}
                placeholder="room id"
                onChange={(e) => setRoomId(e.target.value)}
              />
              {/* CTA either new or existing lobby */}
              <div className="mt-2 flex gap-x-6">
                <button
                    className="flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    type="submit"
                  >
                    Create a new lobby
                  </button>
                  <button
                    className="flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    type="submit"
                  >
                    Join an existing lobby
                  </button>

              </div>
            </form>


          </div>
        </div>
      </div>
    </div>
  )
}
