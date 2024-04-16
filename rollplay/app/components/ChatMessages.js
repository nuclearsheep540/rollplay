import React from 'react';

export default function ChatMessages({message, player, ts}) {

    if (message) return (
    <div className="max-h-24">
        <div className="rounded px-3 bg-slate-100">
            <div>
                <p className="font-semibold text-m text-dark mt-2"> {player}</p>
                <p className="text-sm mt-1">{message}</p>
                <p className="text-right text-xs text-grey-dark mt-1">{ts}</p> 
            </div>
        </div>
    </div>
    )
}
