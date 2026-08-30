/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'

import { useHeroImage } from '@/app/dashboard/hooks/useHeroImage'
import { useStartSession } from '@/app/dashboard/hooks/mutations/useSessionMutations'
import { findCurrentSession } from '@/app/dashboard/utils/homeRanking'
import { COLORS } from '@/app/styles/colorTheme'
import PlateButton from './PlateButton'
import {
  HERO_SEAM_PERCENT,
  PLATE_HEIGHT_PX,
  platePolygon,
  seamContactShadow,
  seamPanelPolygon,
  SKEW_BOX,
  SKEW_LABEL,
  TEXT_SHADOW_ON_ART,
} from './plateGeometry'

// The plate's own art, painted under any campaign image — so a campaign with
// no art still reads as designed rather than as a missing asset.
const HERO_ART_BASE = `
  radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107, 74, 46, 0) 34%),
  radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36, 52, 79, 0) 55%),
  linear-gradient(115deg, #0A0D16 20%, #131B2E 55%, #0C1020 100%)
`

const LIVE_GREEN = '#16A34A'

function sessionStatusLabel(session) {
  switch (session?.status) {
    case 'active': return 'Session live'
    case 'starting': return 'Starting…'
    case 'stopping': return 'Ending…'
    default: return 'No session running'
  }
}

/**
 * The ranked campaign — answers "is my game on, and what do I do next?".
 * Actions are role-conditional: the game master starts and runs the session,
 * the player joins it.
 */
export default function HomeHeroCard({ campaign, user, playerCharacter }) {
  const router = useRouter()
  const { url: artUrl } = useHeroImage(campaign)
  const startSession = useStartSession()

  const session = findCurrentSession(campaign)
  const isGameMaster = campaign.host_id === user?.id
  const isLive = session?.status === 'active'
  const isTransitioning = session?.status === 'starting' || session?.status === 'stopping'
  const hasPlayed = Boolean(session?.started_at)

  const enterSession = () => router.push(`/game?room_id=${session.id}`)
  const openCampaignDrawer = () =>
    router.push(`/dashboard?tab=campaigns&expand_campaign_id=${campaign.id}`)

  const renderPrimaryAction = () => {
    if (isLive) {
      return (
        <PlateButton variant="gold" live onClick={enterSession}>
          {isGameMaster ? 'ENTER SESSION' : 'JOIN SESSION'}
        </PlateButton>
      )
    }

    if (!isGameMaster) {
      return <PlateButton disabled>WAITING FOR GM</PlateButton>
    }

    return (
      <PlateButton
        variant="gold"
        disabled={isTransitioning || startSession.isPending}
        onClick={() => startSession.mutate(session.id)}
      >
        {startSession.isPending ? 'STARTING…' : hasPlayed ? 'RESUME SESSION' : 'START SESSION'}
      </PlateButton>
    )
  }

  return (
    <div className="relative" style={{ minHeight: PLATE_HEIGHT_PX }}>
      {/* The plate captures clicks, and its clip bounds them exactly — so a
          card tucked underneath keeps its exposed band clickable. */}
      <div
        className="absolute inset-0 rounded-md overflow-hidden pointer-events-auto"
        style={{
          backgroundColor: COLORS.carbon,
          clipPath: `polygon(${platePolygon()})`,
        }}
      >
        <div className="absolute inset-0" style={{ background: HERO_ART_BASE }} />
        {artUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${artUrl})` }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: seamContactShadow(HERO_SEAM_PERCENT) }}
        />
        {/* Content sits on flat carbon, left of the seam the art breaks through. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: COLORS.carbon,
            clipPath: `polygon(${seamPanelPolygon(HERO_SEAM_PERCENT)})`,
          }}
        />
      </div>

      <div
        className="relative z-[3] flex flex-col gap-3.5 px-[42px] pt-11 pb-9 pointer-events-none"
        style={{ minHeight: PLATE_HEIGHT_PX, color: COLORS.smoke }}
      >
        <div className="flex items-center gap-3 text-[13px]">
          <span
            className="inline-block rounded-sm border px-2.5 py-0.5 text-[11px] font-semibold tracking-widest"
            style={{ borderColor: 'rgba(247, 244, 243, 0.4)', transform: SKEW_BOX }}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>
              {isGameMaster ? 'Game Master' : 'Player'}
            </span>
          </span>
          <span className="flex items-center gap-1.5" style={{ color: '#D9D4CD' }}>
            {isLive && (
              <span
                className="home-breathe inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: LIVE_GREEN,
                  '--breath': '1.6s',
                  '--breathe-glow': 'rgba(22, 163, 74, 0.5)',
                }}
              />
            )}
            {sessionStatusLabel(session)}
          </span>
        </div>

        <h2
          className="text-[44px] leading-tight font-[family-name:var(--font-metamorphous)]"
          style={{ textShadow: TEXT_SHADOW_ON_ART }}
        >
          {campaign.title}
        </h2>

        {campaign.description && (
          <p
            className="max-w-[460px] text-[14.5px] leading-relaxed line-clamp-3"
            style={{ color: '#CFC9C2' }}
          >
            {campaign.description}
          </p>
        )}
      </div>

      {/* right-[60px] clears the plate's leaning face at the buttons' depth */}
      <div className="absolute z-[3] right-[60px] bottom-9 flex gap-3.5 pointer-events-auto">
        {isGameMaster ? (
          <>
            <PlateButton onClick={() => router.push(`/notes?campaign_id=${campaign.id}`)}>
              NOTES
            </PlateButton>
            <PlateButton onClick={openCampaignDrawer}>INVITE PLAYER</PlateButton>
          </>
        ) : (
          <PlateButton
            onClick={() =>
              playerCharacter
                ? router.push(`/character/${playerCharacter.id}`)
                : openCampaignDrawer()
            }
          >
            MANAGE CHARACTER
          </PlateButton>
        )}
        {renderPrimaryAction()}
      </div>
    </div>
  )
}
