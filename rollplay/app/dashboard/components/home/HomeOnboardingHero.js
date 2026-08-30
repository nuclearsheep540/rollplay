/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { COLORS } from '@/app/styles/colorTheme'
import { PLATE_HEIGHT_PX, platePolygon, seamContactShadow, seamPanelPolygon, HERO_SEAM_PERCENT } from './plateGeometry'

const ONBOARDING_ART_BASE = `
  radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107, 74, 46, 0) 34%),
  radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36, 52, 79, 0) 55%),
  linear-gradient(115deg, #0A0D16 20%, #131B2E 55%, #0C1020 100%)
`

/**
 * The hero with nothing to show.
 *
 * Deliberately not a create-a-campaign pitch: most people arrive as players,
 * and this is where their invites land. Building has its own door in the
 * card below.
 */
export default function HomeOnboardingHero({ hasCampaigns = false }) {
  return (
    <div className="relative" style={{ minHeight: PLATE_HEIGHT_PX }}>
      <div
        className="absolute inset-0 overflow-hidden rounded-md"
        style={{
          backgroundColor: COLORS.carbon,
          clipPath: `polygon(${platePolygon()})`,
        }}
      >
        <div className="absolute inset-0" style={{ background: ONBOARDING_ART_BASE }} />
        <div
          className="absolute inset-0"
          style={{ background: seamContactShadow(HERO_SEAM_PERCENT) }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: COLORS.carbon,
            clipPath: `polygon(${seamPanelPolygon(HERO_SEAM_PERCENT)})`,
          }}
        />
      </div>

      <div
        className="relative z-[3] flex flex-col justify-center gap-3.5 px-[42px]"
        style={{ minHeight: PLATE_HEIGHT_PX, color: COLORS.smoke }}
      >
        <h2 className="max-w-[420px] text-[38px] leading-tight font-[family-name:var(--font-metamorphous)]">
          {hasCampaigns ? 'Nothing at the table yet' : 'Your adventures will live here'}
        </h2>
        <p className="max-w-[420px] text-[14.5px] leading-relaxed" style={{ color: '#CFC9C2' }}>
          {hasCampaigns
            ? 'None of your campaigns have a session ready to play. Start one from the card below, and it will take its place here.'
            : 'When a game master invites you to a campaign, the invitation arrives right here — and anything you build shows up below.'}
        </p>
      </div>
    </div>
  )
}
