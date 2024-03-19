'use client'

import { useEffect } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

import PlayerCard from "../components/PlayerCard";

export default function Game() {

  const searchParams = useSearchParams()
  const roomId = searchParams.get('roomId')

  const [room404, setRoom404] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(1)
  const [playerName, setPlayerName] = useState("")  
  const [host, setHost] = useState("")
  const [players, setPlayers] = useState(["",])

  async function onLoad() {
    const req = await fetch(`http://localhost:8081/game/${roomId}`)
    if (req.status === 404) {
      console.log("room id not found")
      setRoom404(true)
      return
    } else {
      await req.json().then((res)=>{
        setMaxPlayers(res["max_players"]),
        setPlayerName(res["player_name"])
        setHost(res["player_name"])

        var plyrs = [res["player_name"],]
        for (let i=1; i < res["max_players"]; i++) {
          plyrs = [...plyrs, "empty"]
        }
        setPlayers([...plyrs])
      })
    }

  }
  
  useEffect(() => {
    onLoad()
  }, []
  )

  
  console.log("players: ",players, "max players: ", maxPlayers)
  
  return (

    <main className="min-h-screen isolate overflow-hidden p-8 sm:py-12 lg:py-12">
      {
        (room404) &&
        <h3 className='text-red-500'>{`room id not found: ${roomId}`}</h3>
      }
      {
        (!room404) && 
        <>
        <h1>{`Welcome to room ${roomId}`}</h1>
          <div className="container mx-auto mx-auto max-w-7x1 p-24 lg:px-8">

            { 
              players.map((player) => <PlayerCard player={player} />)

            }
            
          </div>
        </>
      }
    </main>
  )
}
