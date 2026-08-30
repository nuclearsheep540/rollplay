/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'

import { useHeroImage } from '@/app/dashboard/hooks/useHeroImage'
import { formatRelativeTime } from '@/app/shared/utils/formatTime'
import { COLORS } from '@/app/styles/colorTheme'
import PlateButton from './PlateButton'
import {
  PLATE_HEIGHT_PX,
  platePolygon,
  seamArtPolygon,
  seamContactShadow,
  WORKING_SEAM_PERCENT,
} from './plateGeometry'

const WORKING_ART_BASE = `
  radial-gradient(90% 80% at 80% 100%, #4A2C10 0%, rgba(74, 44, 16, 0) 55%),
  linear-gradient(115deg, #17100A 30%, #2B1C0E 70%, #170F08 100%)
`

/**
 * The campaign being built — the workbench, not the table. Shows the most
 * recently edited owned campaign; with none owned it becomes Home's one and
 * only create affordance.
 *
 * May show the same campaign as the hero: different job, different verbs.
 */
export default function WorkingOnCard({ campaign }) {
  const router = useRouter()
  const { url: artUrl } = useHeroImage(campaign)

  if (!campaign) {
    return (
      <div
        className="relative rounded-md flex flex-col items-center justify-center gap-4"
        style={{
          minHeight: PLATE_HEIGHT_PX,
          backgroundColor: 'rgba(55, 50, 47, 0.25)',
          clipPath: `polygon(${platePolygon()})`,
        }}
      >
        <FontAwesomeIcon
          icon={faPlus}
          className="text-5xl"
          style={{ color: COLORS.graphite, opacity: 0.5 }}
        />
        <h4
          className="text-2xl font-[family-name:var(--font-metamorphous)]"
          style={{ color: COLORS.graphite }}
        >
          Create your first campaign
        </h4>
        <p className="max-w-[320px] text-center text-[13.5px]" style={{ color: COLORS.graphite }}>
          Build a world, then invite your players to it.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard?tab=campaigns&create_campaign=1')}
          className="mt-1 rounded-lg border px-5 py-2.5 text-[13px] font-semibold tracking-wider transition-colors hover:bg-black/5"
          style={{ borderColor: COLORS.graphite, color: COLORS.graphite }}
        >
          CREATE CAMPAIGN
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-md"
      style={{
        minHeight: PLATE_HEIGHT_PX,
        backgroundColor: COLORS.carbon,
        clipPath: `polygon(${platePolygon()})`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{ clipPath: `polygon(${seamArtPolygon(WORKING_SEAM_PERCENT)})` }}
      >
        <div className="absolute inset-0" style={{ background: WORKING_ART_BASE }} />
        {artUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${artUrl})` }}
          />
        )}
        {/* Moodier than the hero: this is the workbench, not the table. */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(11, 10, 9, 0.45)' }} />
        <div
          className="absolute inset-0"
          style={{ background: seamContactShadow(WORKING_SEAM_PERCENT) }}
        />
      </div>

      <div
        className="relative flex flex-col gap-2.5 px-[30px] py-[26px]"
        style={{ minHeight: PLATE_HEIGHT_PX, color: COLORS.smoke }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h4 className="text-[28px] font-[family-name:var(--font-metamorphous)]">
            {campaign.title}
          </h4>
          <span className="text-[12.5px] flex-shrink-0" style={{ color: COLORS.silver }}>
            Last edited {formatRelativeTime(campaign.updated_at)}
          </span>
        </div>
        {campaign.description && (
          <p
            className="max-w-[260px] text-[13.5px] leading-relaxed line-clamp-4"
            style={{ color: '#C9C3BB' }}
          >
            {campaign.description}
          </p>
        )}
      </div>

      <div className="absolute right-[60px] bottom-[26px] flex gap-2">
        <PlateButton
          size="sm"
          variant="outline"
          onClick={() => router.push(`/dashboard?tab=library&campaign=${campaign.id}`)}
        >
          ASSETS
        </PlateButton>
        <PlateButton
          size="sm"
          variant="outline"
          onClick={() => router.push('/dashboard?tab=workshop')}
        >
          WORKSHOP
        </PlateButton>
        <PlateButton
          size="sm"
          variant="outline"
          onClick={() => router.push(`/dashboard?tab=campaigns&expand_campaign_id=${campaign.id}`)}
        >
          CAMPAIGN EDITOR
        </PlateButton>
      </div>
    </div>
  )
}
