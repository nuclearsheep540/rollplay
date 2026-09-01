/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'

import { COLORS } from '@/app/styles/colorTheme'

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
