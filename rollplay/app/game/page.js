'use client'

import { useEffect } from 'react'
import { useState, useRef } from 'react'
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

        // TODO: get current seats
        // TODO: limit seat changes?

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
    setWebSocket(new WebSocket(`ws://localhost:8081/ws/${roomId}?player_name=${thisPlayer}`))
  }, []
  )
  
  const [chatLog, setChatLog] = useState(["welcome",])
  const [chatMsg, setChatMsg] = useState("")
  const [webSocket, setWebSocket] = useState()
  
  if (webSocket) {
    webSocket.onmessage = (event)=>{

      const json_data = JSON.parse(event.data)
      console.log("EVENT TYPEOF", typeof(json_data))
      console.log("EVENT TYPE", json_data)
      
      if (json_data["event_type"] == "seat_change") {
        console.log("updating seats.........")
        setSeats(json_data["data"])
      }
      console.log("webhook event :", json_data["data"])
      setChatLog([...chatLog, json_data["data"]])
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
    console.log("changing seats")
    console.log("b4 send ", seat)
    webSocket.send(JSON.stringify(
      {"event_type": "seat_change", "data": seat})
    )

  }
  
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
                chatLog.map((msg, index) => <ul key={index}>{msg}</ul>)
              }
            </div>

            { 
              seats.map((_, index) => <PlayerCard
                key={index} 
                seatId={index}
                seats={seats}
                thisPlayer={thisPlayer}
                setSeats={setSeats}
                isSitting={seats[index] === thisPlayer}
                sendSeatChange={sendSeatChange}
                />)

            }
            
          </div>
        </>
      }
    </main>
  )
}
