'use client'

import { useEffect } from 'react'
import { useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import PlayerCard from "../components/PlayerCard";
import ChatMessages from '../components/ChatMessages';

export default function Game() {

  const searchParams = useSearchParams()
  const roomId = searchParams.get('roomId')
  const thisPlayer = searchParams.get('playerName')

  const [room404, setRoom404] = useState(false)
  const [webSocket, setWebSocket] = useState()

  // chat history
  const [chatLog, setChatLog] = useState([{},])

  // current msg in chat box form
  const [chatMsg, setChatMsg] = useState("")

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
    // fetches the room ID, and loads data
    onLoad()

    // establishes websocket for this lobby
    const url = `ws://localhost:8081/ws/${roomId}?player_name=${thisPlayer}`
    setWebSocket(
      new WebSocket(url)
      )
    }, []
  )
  

  if (webSocket) {
    webSocket.onmessage = (event)=>{

      const json_data = JSON.parse(event.data)
      console.log("EVENT TYPEOF", typeof(json_data))
      console.log("EVENT TYPE", json_data)
      
      if (json_data["event_type"] == "seat_change") {
        console.log("updating seats.........")
        setSeats(json_data["data"])
        return
      }

      console.log("webhook event :", json_data["data"])
      setChatLog(
        [...chatLog,
          {
            "player_name": json_data["player_name"],
            "chat_message": json_data["data"],
            "timestamp": json_data["utc_timestamp"]
          }
        ])
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
    webSocket.send(JSON.stringify(
      {"event_type": "seat_change", "data": seat})
    )
  }
  
  return (

    <main>
      {
        (room404) &&
        <h3 className='text-red-500'>{`room id not found: ${roomId}`}</h3>
      }
      {
        (!room404) && 

        <div className="w-full flex-col py-3 lg:px-8">
        
        <div className='text-sm'>
        <p>{`Welcome to room: ${roomId}`} {`Room created by ${host}`}</p>
        </div>

    {/* start of chat */}
        <div className='m-4 bg-slate-400'>
          <div className="m-2 p-2 bg-slate-400 py-2 px-2 flex-1 min-h-48 max-h-48 flex flex-col-reverse overflow-auto">
            <div>
            {
              chatLog.map(
                (msg, index) => <ChatMessages 
                  key={index}
                  message={msg.chat_message}
                  player={msg.player_name}
                  ts={msg.timestamp}
                  />
                )
            }
            </div>
          </div>

          <div className='m-2'>
            <div className='mx-2 w-100% border-t border-slate-800 py-2'>
              <form onSubmit={sendMessage}>
                <input
                  className='w-full rounded bg-slate-100text-gray-700 mr-3 py-1 px-2 focus:outline-none'
                  type="text"
                  id="messageText"
                  value={chatMsg}
                  placeholder='message'
                  onChange={(e) => setChatMsg(e.target.value)}
                  />
              </form>
            </div>
          
          </div>
        </div>
    {/* end of chat */}


      <div className='flex flex-row'>
        <div className='w-2/5'>
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
        <div className='w-3/5 h-min m-4 bg-slate-400'>
          <h1> Map </h1>
          
        </div>
      </div>


    </div>
      }
    </main>
  )
}
