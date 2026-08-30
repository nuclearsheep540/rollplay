/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'

import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from './plateGeometry'

// Parchment is the noticeboard's own skin — the page's single light card.
// Stays local until the news module makes these systemic.
const PARCHMENT = '#FBF7EF'
const PARCHMENT_BORDER = '#E5DECF'

/**
 * The pulse line — a full-width divider under the hero, so the page's
 * ambient layer owns a sliver of space even while it has nothing to say.
 *
 * Quiet is the only state until the activity signals exist: one pill, a
 * breathing dot, no coins and no ticker.
 */
export function PulseDivider() {
  return (
    <div className="flex items-center gap-3.5 pl-1" style={{ minHeight: 34 }}>
      <div
        className="home-breathe h-2.5 w-2.5 flex-none rounded-full"
        style={{ backgroundColor: COLORS.gold }}
      />
      <span
        className="inline-block flex-none text-[12.5px] leading-snug"
        style={{
          backgroundColor: 'rgba(31, 27, 22, 0.055)',
          borderRadius: 8,
          padding: '6px 14px',
          color: '#544E46',
          transform: SKEW_BOX,
        }}
      >
        <span className="inline-block" style={{ transform: SKEW_LABEL }}>
          All is quiet in the tavern...
        </span>
      </span>
      <div
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, #D5CFC5, rgba(213, 207, 197, 0))' }}
      />
    </div>
  )
}

/**
 * Authored news. One hardcoded post until the news module exists — the card
 * is real, its plumbing is not, so likes, read receipts and banner art all
 * wait for the module rather than being faked here.
 */
export function NewsNoticeboard() {
  return (
    <section
      className="flex flex-1 flex-col rounded-xl px-7 py-6"
      style={{
        backgroundColor: PARCHMENT,
        border: `1px solid ${PARCHMENT_BORDER}`,
      }}
    >
      <span className="text-[11px] font-semibold tracking-widest" style={{ color: '#9A7526' }}>
        29 AUG 2026
      </span>
      <h4
        className="mt-1.5 mb-2 text-[22px] leading-snug font-[family-name:var(--font-metamorphous)]"
        style={{ color: '#181512' }}
      >
        A new Home for your table
      </h4>
      <p className="text-[13.5px] leading-relaxed" style={{ color: '#4C463E' }}>
        Signing in now brings you here instead of straight to your campaigns. Home answers the
        questions worth asking on arrival: whether a session is running, what you were last
        building, and who is waiting on you. Your campaigns, characters and library are all
        still a click away.
      </p>
    </section>
  )
}

/**
 * The market shelf — a visible placeholder by decision, never a "coming soon"
 * tile. The slot is designed now and activated when the Market ships.
 *
 * Radius matches the plates, not the noticeboard: it is the same dark material
 * as the cards above it.
 */
export function FeaturedFromMarket() {
  const router = useRouter()

  return (
    <section
      className="rounded-md px-[26px] py-[22px]"
      style={{
        backgroundColor: COLORS.carbon,
        border: '1px solid #34302B',
        color: COLORS.smoke,
        // Cut short so its right edge sits on the vertical line where the
        // working card's slant above lands — a stepped stack.
        marginRight: 42,
      }}
    >
      <div className="flex gap-[18px]">
        <div className="flex-none">
          <div
            className="grid h-[156px] w-[110px] place-items-end justify-center rounded-md pb-3"
            style={{
              background: `
                radial-gradient(90% 60% at 50% 20%, #56504A 0%, rgba(86, 80, 74, 0) 60%),
                linear-gradient(160deg, #2E2B26 10%, #4A443A 55%, #26231E)
              `,
              boxShadow: '0 10px 22px rgba(5, 4, 3, 0.5)',
            }}
          >
            <span
              className="text-center text-[11px] leading-relaxed tracking-widest"
              style={{ color: '#DED7CC' }}
            >
              THE<br />SALT ROAD
            </span>
          </div>
          <div
            className="mt-2.5 h-1.5 w-[110px] rounded-full"
            style={{
              background: 'radial-gradient(50% 100% at 50% 50%, rgba(5, 4, 3, 0.5), rgba(5, 4, 3, 0))',
            }}
          />
        </div>
        <div>
          <h4 className="text-lg font-[family-name:var(--font-metamorphous)]">The Salt Road</h4>
          <div className="mb-2 mt-0.5 text-xs" style={{ color: COLORS.silver }}>by Marrow</div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: '#C9C3BB' }}>
            A grueling hex-crawl survival campaign set in the unforgiving Ash Wastes. Includes
            40+ custom encounters, new survival mechanics, and hand-drawn maps of the
            treacherous trade routes.
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard?tab=market')}
            className="mt-3 text-[12.5px] font-semibold tracking-wider hover:underline"
            style={{ color: COLORS.gold }}
          >
            VIEW IN MARKET →
          </button>
        </div>
      </div>
    </section>
  )
}
