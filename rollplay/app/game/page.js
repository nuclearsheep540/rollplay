'use client'

import { useEffect } from 'react'
import { useState, useRef } from 'react'
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
    const url = `ws://localhost/ws/${roomId}?player_name=${thisPlayer}`
    setWebSocket(
      new WebSocket(url)
      )
    },[]
  )


  

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
  
  return (

    <main className=''>
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
            isSitting={seats[index] !== "empty"}
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
