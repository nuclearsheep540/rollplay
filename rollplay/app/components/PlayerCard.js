import React from 'react';
import { useState, useEffect } from 'react'

export default function PlayerCard({seatId, seats, thisPlayer, isSitting, sendSeatChange}) {

    useEffect(() => {
        console.log(`Seat ${seatId} updated:`, seats[seatId]);
    }, [seats[seatId]]);

    function sitSeat() {
        //  check the seat is free
        //  if free place player name against this index
        var seatIsFree = seats[seatId] === "empty" ? true : false
        if (seatIsFree) {
            var localSeat = [...seats]
            var oldIndex = seats.indexOf(thisPlayer)
            localSeat[oldIndex] = "empty"
            localSeat[seatId] = thisPlayer

            sendSeatChange(localSeat)
        }
        return
    }

    function leaveSeat() { 
        var localSeat = [...seats]
        var oldIndex = seats.indexOf(thisPlayer)
        localSeat[oldIndex] = "empty"

        var someoneElsesSeat = (seats[seatId] != "empty" && seats[seatId] != thisPlayer )? true : false
        if (someoneElsesSeat) {
            return
        }

        sendSeatChange(localSeat)
        return
    }


    return (
        <div>
            <div key={seatId} className="m-4 p-3 bg-slate-400 grid grid-cols-2 grid-flow-row">
                <button
                    className={"text-sm w-32 rounded-md " + 'bg-indigo-800' + " px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{isSitting ? leaveSeat() : sitSeat()}}>
                        {isSitting ? `${seats[seatId]}` :`Seat ${seatId}`}
                </button>
                <button
                    className={"text-sm w-32 rounded-md " + 'bg-indigo-800' + " px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"}
                    onClick={()=>{console.log(seats[seatId], "rolls the dice")}}>
                        Dice Roll
                </button>
                <div className="w-48">Rolls: </div>
            </div>
        </div>
    )
}