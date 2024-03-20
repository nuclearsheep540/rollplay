'use client'

import { useEffect } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

import PlayerCard from "../components/PlayerCard";

export default function Game() {

  const searchParams = useSearchParams()
  const roomId = searchParams.get('roomId')
  const thisPlayer = searchParams.get('playerName')
  const [room404, setRoom404] = useState(false)

  // state for each seat

  // who generated the room
  const [host, setHost] = useState("")

  // max number of available spots in a lobby
  const [seats, setSeats] = useState(["",]) 

  async function onLoad() {
    const req = await fetch(`http://localhost:8081/game/${roomId}`)
    if (req.status === 404) {
      console.log("room id not found")
      setRoom404(true)
      return
    } else {
      await req.json().then((res)=>{
        setHost(res["player_name"])

        var plyrs = ["empty",]
        for (let i=1; i < res["max_players"]; i++) {
          plyrs = [...plyrs, "empty"]
        }
        setSeats([...plyrs])
      })
    }

  }
  
  useEffect(() => {
    onLoad()
  }, []
  )
  
  const [chatLog, setChatLog] = useState(["welcome",])
  const [chatMsg, setChatMsg] = useState("")
  
  let ws = new WebSocket(`ws://localhost:8081/ws/${roomId}`)
  ws.onmessage = (event)=>{
    console.log("from websocket :", event["data"])
    setChatLog([...chatLog, event["data"]])
    console.log("chatlog: ", chatLog)
  }


  function sendMessage(e) {
    e.preventDefault()
    console.log("sending to websocket: ", chatMsg)
    ws.send(chatMsg)
    setChatMsg("")
}


  
  console.log("seats: ", seats)
  
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
        <h1>{`Room created by: ${host}`}</h1>

          <div className="container mx-auto mx-auto max-w-7x1 p-24 lg:px-8">

            <div>
              <h1>Chat</h1>
              <form action='' onSubmit={sendMessage}>
                <input
                  type="text"
                  id="messageText"
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  />
                <button>Send</button>
              </form>
              {
                chatLog.map((msg, index) => <ul id={index}>{msg}</ul>)
              }

            </div>

            { 
              seats.map((_, index) => <PlayerCard 
                seatId={index}
                seats={seats}
                thisPlayer={thisPlayer}
                setSeats={setSeats}
                isSitting={seats[index] === thisPlayer}
                />)

            }
            
          </div>
        </>
      }
    </main>
  )
}
