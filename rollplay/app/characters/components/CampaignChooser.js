/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import { useCampaigns } from '@/app/dashboard/hooks/useCampaigns'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * Which table is this character for?
 *
 * A character is built against a campaign's published config, so there is nothing to build
 * until a GM has published one — a campaign without one is listed and disabled rather than
 * hidden, because "my campaign isn't here" is a worse answer than "your GM hasn't set this
 * up yet".
 */
export default function CampaignChooser() {
  const router = useRouter()
  const { user } = useAuthenticated()
  const { data, isLoading } = useCampaigns(user?.id)

  const joined = data?.campaigns || []
  const invited = data?.invitedCampaigns || []

  if (isLoading) {
    return <div className="px-10 py-12 text-content-muted text-sm">Loading your campaigns…</div>
  }

  if (joined.length === 0 && invited.length === 0) {
    return (
      <div className="max-w-[560px] mx-auto px-10 py-16 text-center">
        <h1 className="font-[family-name:var(--font-metamorphous)] text-[28px] text-content-primary">Nothing to build against yet</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-content-muted">
          Characters are built for a campaign&apos;s table. Accept an invite, or create a campaign and
          publish its character config.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <PlateButton variant="gold" onClick={() => router.push('/campaign/new')}>
            Create a campaign
          </PlateButton>
          <PlateButton variant="light" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </PlateButton>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[760px] mx-auto px-10 py-12">
      <h1 className="font-[family-name:var(--font-metamorphous)] text-[28px] text-content-primary">Which table is this character for?</h1>
      <p className="mt-2 text-[13.5px] text-content-muted">
        Characters are built against a campaign&apos;s character config and join the party at its table.
      </p>

      <div className="mt-8 flex flex-col gap-2.5">
        {joined.map((campaign) => {
          const version = campaign.character_config_version
          const sessionId = campaign.sessions?.[0]?.id
          const ready = !!version && !!sessionId
          const isHost = campaign.host_id === user?.id

          return (
            <div
              key={campaign.id}
              className={`flex items-center justify-between gap-4 rounded-md border px-5 py-4 ${
                ready ? 'border-[#E5DECF] bg-white' : 'border-dashed border-[#E5DECF] bg-[#FBF7EF]'
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm text-content-primary truncate">{campaign.title}</div>
                <div className="mt-0.5 text-[12.5px] text-content-muted">
                  {ready ? (
                    <>run by {campaign.host_screen_name || 'your GM'}</>
                  ) : isHost ? (
                    <>You haven&apos;t published a character config yet.</>
                  ) : (
                    <>The GM hasn&apos;t published a character config yet</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {ready && (
                  <span
                    className="inline-flex px-2 py-[2.5px] rounded bg-[#D9A441] text-[#241C08] text-[9.5px] font-bold tracking-[0.1em]"
                    style={{ transform: SKEW_BOX }}
                  >
                    <span className="inline-block" style={{ transform: SKEW_LABEL }}>v{version}</span>
                  </span>
                )}
                {ready ? (
                  <PlateButton variant="gold" size="sm" onClick={() => router.push(`/character/new?session_id=${sessionId}`)}>
                    Build here
                  </PlateButton>
                ) : isHost ? (
                  <PlateButton variant="light" size="sm" onClick={() => router.push(`/campaign/${campaign.id}?section=character`)}>
                    Configure it
                  </PlateButton>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {invited.length > 0 && (
        <div className="mt-9">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-3">
            Waiting on you
          </div>
          <div className="flex flex-col gap-2.5">
            {invited.map((campaign) => (
              <div key={campaign.id} className="flex items-center justify-between gap-4 rounded-md border border-dashed border-[#E5DECF] px-5 py-4">
                <div className="font-semibold text-sm text-content-primary truncate">{campaign.title}</div>
                <PlateButton variant="light" size="sm" onClick={() => router.push('/dashboard?tab=campaigns')}>
                  Accept invite
                </PlateButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
