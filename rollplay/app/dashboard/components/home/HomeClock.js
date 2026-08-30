/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

import { COLORS } from '@/app/styles/colorTheme'

function ordinalSuffix(dayOfMonth) {
  if (dayOfMonth >= 11 && dayOfMonth <= 13) {
    return 'th'
  }
  switch (dayOfMonth % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

function readClock(now) {
  const hours = now.getHours() % 12 || 12
  return {
    date: `${now.toLocaleDateString([], { weekday: 'long' })} ${now.getDate()}${ordinalSuffix(now.getDate())} ${now.toLocaleDateString([], { month: 'long' })}`,
    hours,
    minutes: String(now.getMinutes()).padStart(2, '0'),
    meridiem: now.getHours() < 12 ? 'AM' : 'PM',
    // The colon blinks with the seconds. Driven by the same tick rather than
    // a CSS animation, which would restart on every re-render.
    colonDim: now.getSeconds() % 2 === 1,
  }
}

/**
 * The page clock — date and time sharing the greeting's subtext line.
 * Starts empty so the server render can't disagree with the client's clock.
 */
export default function HomeClock() {
  const [clock, setClock] = useState(null)

  useEffect(() => {
    const tick = () => setClock(readClock(new Date()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!clock) {
    return null
  }

  return (
    <div className="flex items-baseline gap-3.5 flex-shrink-0">
      <span className="text-xl" style={{ color: COLORS.graphite }}>
        {clock.date}
      </span>
      <span className="text-xl" style={{ color: COLORS.silver }}>·</span>
      <span
        className="text-xl tabular-nums tracking-wide"
        style={{ color: COLORS.graphite }}
      >
        {clock.hours}
        <span className={`home-clock-colon${clock.colonDim ? ' dim' : ''}`}>:</span>
        {clock.minutes} {clock.meridiem}
      </span>
    </div>
  )
}
