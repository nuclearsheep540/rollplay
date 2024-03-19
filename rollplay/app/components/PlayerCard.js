import React from 'react';

export default function PlayerCard({player}) {

    return (
        <div>
            <div className="m-4 p-6 bg-slate-400 grid grid-rows-3 grid-flow-col gap-4">
              <div className="row-span-3 ...">Player: {player}</div>
              <div className="col-span-2 ...">Data 02</div>
              <div className="row-span-2 col-span-2 ...">Data 03</div>
            </div>
        </div>
    )
}