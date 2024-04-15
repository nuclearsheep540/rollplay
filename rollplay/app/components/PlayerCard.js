import React from 'react';
import { useState, useEffect } from 'react'

export default function PlayerCard({seatId, seats, thisPlayer, setSeats, isSitting}) {
    function sitSeat() {
        //  check the seat is free
        //  if free place player name against this index
        var seatIsFree = seats[seatId] === "empty" ? true : false
        if (seatIsFree) {
            var localSeat = [...seats]
            var oldIndex = seats.indexOf(thisPlayer)
            localSeat[oldIndex] = "empty"
            localSeat[seatId] = thisPlayer
    
            setSeats(localSeat)
        }
        return
    }

    function leaveSeat() { 
        var localSeat = [...seats]
        var oldIndex = seats.indexOf(thisPlayer)
        localSeat[oldIndex] = "empty"

        setSeats(localSeat)
        return
    }


    return (
        <div>
            <div key={seatId} className="m-4 p-6 bg-slate-400 grid grid-rows-2 grid-flow-col gap-4">
            <button
                    className={"flex-none rounded-md " + 'bg-indigo-600' + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{
                        isSitting ? leaveSeat() : sitSeat()
                        }
                    }

                  >{isSitting ? "leave seat":`Sit in seat ${seatId}`}
                
                  </button>
              <div className="row-span-3 ...">Player: {seats[seatId]}</div>
              <div className="col-span-2 ...">Data 02</div>
              <div className="row-span-2 col-span-2 ...">Data 03</div>
            </div>
        </div>
    )
}