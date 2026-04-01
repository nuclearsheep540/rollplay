/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { Suspense } from 'react'
import GameContent from './GameContent'

// Server component — runs at request time to inject an early preload hint
// for the active map image before any client JS executes.
//
// Flow without this:  HTML → JS parse → React hydrate → onLoad → API call → S3 URL known → image fetch
// Flow with preload:  HTML (preload href=S3_url) → browser prefetches image immediately
//                                    → JS parse → React hydrate → image already loading/done
export default async function Game({ searchParams }) {
  const roomId = (await searchParams)?.room_id

  let mapImageUrl = null
  let imageUrl = null
  if (roomId) {
    try {
      // Internal Docker network call — no auth required for this endpoint.
      // Silently fails if api-game is unreachable (e.g. local dev outside Docker).
      // 500ms timeout: container-to-container is sub-ms, but on a constrained
      // EC2 instance under load this gives headroom without blocking the page.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 500)
      const res = await fetch(`http://api-game:8081/game/${roomId}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json()
        mapImageUrl = data.active_map?.file_path ?? null
        imageUrl = data.active_image?.image_config?.file_path ?? null
      }
    } catch {
      // Preload is a progressive enhancement — safe to skip on fetch failure or timeout.
    }
  }

  return (
    <>
      {mapImageUrl && (
        <link rel="preload" as="image" href={mapImageUrl} />
      )}
      {imageUrl && (
        <link rel="preload" as="image" href={imageUrl} />
      )}
      <Suspense fallback={
        <div className="game-loading" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)',
          color: 'white',
          fontSize: '28px'
        }}>
          <div>Loading Tabletop Tavern...</div>
        </div>
      }>
        <GameContent />
      </Suspense>
    </>
  )
}
