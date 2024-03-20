import React from 'react';
import { useState } from 'react'

export default function PlayerCard({seatId, seats, thisPlayer, setSeats}) {
    // todo: add state to sit and leave

    var seatsProps = seats
    return (
        <div>
            <div id={seatId} className="m-4 p-6 bg-slate-400 grid grid-rows-2 grid-flow-col gap-4">
            <button
                    className={"flex-none rounded-md " + 'bg-indigo-600' + " px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{
                        var seats = [...seatsProps]
                        var oldIndex = seats.indexOf(thisPlayer)
                        seats[oldIndex] = "empty"
                        seats[seatId] = thisPlayer
                        setSeats(seats), console.log(thisPlayer)}
                    }
                  >
                    Sit in seat {seatId}
                  </button>
              <div className="row-span-3 ...">Player: {seats[seatId]}</div>
              <div className="col-span-2 ...">Data 02</div>
              <div className="row-span-2 col-span-2 ...">Data 03</div>
            </div>
        </div>
    )
}