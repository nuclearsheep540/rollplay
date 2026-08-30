/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamation } from '@fortawesome/free-solid-svg-icons'

import { useAcceptInvite, useDeclineInvite } from '@/app/dashboard/hooks/mutations/useCampaignMutations'
import { useHeroImage } from '@/app/dashboard/hooks/useHeroImage'
import { COLORS } from '@/app/styles/colorTheme'
import PlateButton from './PlateButton'
import { PLATE_HEIGHT_PX, platePolygon } from '@/app/styles/plateGeometry'

// Green is the invite's own colour, and all you can see of it while tucked is
// a band — so the card identifies itself as an invite rather than as a
// campaign. The campaign's art fades in once the switcheroo brings it forward.
const INVITE_ART_BASE = `
  radial-gradient(90% 110% at 22% 0%, #3D5A45 0%, rgba(61, 90, 69, 0) 55%),
  radial-gradient(80% 80% at 80% 90%, #22402C 0%, rgba(34, 64, 44, 0) 60%),
  linear-gradient(115deg, #0B120D 15%, #1D3024 60%, #0B120D 100%)
`
const INVITE_SCRIM = 'linear-gradient(100deg, rgba(6, 10, 7, 0.85) 25%, rgba(6, 10, 7, 0.3) 70%)'
// Neutral once real art is showing, so the campaign's colours aren't tinted.
const PROMOTED_SCRIM = 'linear-gradient(100deg, rgba(5, 4, 3, 0.82) 25%, rgba(5, 4, 3, 0.28) 70%)'

// The two slots are places, not states: whichever card is tucked sits here
// and carries the shadow, exposing a constant band along the other's slant.
const TUCK_OFFSET_X = 56
const TUCK_OFFSET_Y = 24
const TUCKED_SHADOW = 'drop-shadow(0 12px 18px rgba(5, 4, 3, 0.35))'
const PRIMARY_SHADOW = 'drop-shadow(0 0 0 rgba(5, 4, 3, 0))'
const SWAP_MS = 350
const DISMISS_MS = 380

function slotStyle(isTucked) {
  return {
    transform: isTucked
      ? `translate(${TUCK_OFFSET_X}px, ${TUCK_OFFSET_Y}px)`
      : 'translate(0, 0)',
    filter: isTucked ? TUCKED_SHADOW : PRIMARY_SHADOW,
    transition: `transform ${SWAP_MS}ms, filter ${SWAP_MS}ms, opacity ${SWAP_MS}ms`,
  }
}

/**
 * The hero and any pending invite, dealt as one deck.
 *
 * At rest the hero owns the primary slot and is never occluded — an invite
 * tucks beneath its bottom-right corner, marked by a wiggling "!" on the
 * exposed corner. Clicking a tucked card swaps the two exactly: neither is
 * ever disabled beneath the other, only waiting in the deck.
 */
export default function InviteDeck({ invites = [], children }) {
  const [promoted, setPromoted] = useState(false)
  const [confirmingDecline, setConfirmingDecline] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dismissedIds, setDismissedIds] = useState([])
  const [actionError, setActionError] = useState(null)

  const acceptInvite = useAcceptInvite()
  const declineInvite = useDeclineInvite()

  // dismissedIds only bridges the exit animation until the refetch drops the
  // invite from the server data. Pruning it once that happens means a later
  // re-invite to the same campaign shows up again.
  useEffect(() => {
    setDismissedIds((ids) => ids.filter((id) => invites.some((inv) => inv.id === id)))
  }, [invites])

  const pending = invites.filter((invite) => !dismissedIds.includes(invite.id))
  const invite = pending[0]
  // Called before the early return so hook order stays stable; handles undefined.
  const { url: artUrl } = useHeroImage(invite)

  if (!invite) {
    return <div className="relative" style={{ minHeight: PLATE_HEIGHT_PX }}>{children}</div>
  }

  // The card lifts away while the hero slides home beneath it.
  const dismiss = () => {
    setLeaving(true)
    setPromoted(false)
    setTimeout(() => {
      setDismissedIds((ids) => [...ids, invite.id])
      setLeaving(false)
      setConfirmingDecline(false)
    }, DISMISS_MS)
  }

  // The card only leaves once the server has confirmed — a failed request
  // keeps an actionable invite on the table instead of vanishing it.
  const accept = async () => {
    setActionError(null)
    try {
      await acceptInvite.mutateAsync(invite.id)
      dismiss()
    } catch (error) {
      setActionError(error.message || 'Could not accept the invite — try again')
    }
  }

  const confirmDecline = async () => {
    setActionError(null)
    try {
      await declineInvite.mutateAsync(invite.id)
      dismiss()
    } catch (error) {
      setActionError(error.message || 'Could not decline the invite — try again')
    }
  }

  const actionPending = acceptInvite.isPending || declineInvite.isPending

  const inviteStyle = leaving
    ? {
        transform: `translate(0, -40px)`,
        opacity: 0,
        filter: PRIMARY_SHADOW,
        transition: `transform ${SWAP_MS}ms, filter ${SWAP_MS}ms, opacity ${SWAP_MS}ms`,
      }
    : slotStyle(!promoted)

  return (
    <div className="relative" style={{ minHeight: PLATE_HEIGHT_PX }}>
      {/* Deeper invites show only as depth behind the top one. */}
      {pending.slice(1, 3).map((deeper, index) => (
        <div
          key={deeper.id}
          aria-hidden="true"
          className="absolute inset-0 rounded-md"
          style={{
            zIndex: 0,
            backgroundColor: COLORS.carbon,
            clipPath: `polygon(${platePolygon()})`,
            transform: `translate(${TUCK_OFFSET_X + (index + 1) * 10}px, ${TUCK_OFFSET_Y + (index + 1) * 10}px)`,
            filter: TUCKED_SHADOW,
          }}
        />
      ))}

      {/* Hero deck. Inert at rest so the tucked invite keeps its band; when
          demoted it becomes one big target that swaps the cards back. */}
      <div
        className={`relative ${promoted ? 'home-deck-demoted' : ''}`}
        style={{
          zIndex: promoted ? 1 : 2,
          cursor: promoted ? 'pointer' : 'default',
          pointerEvents: promoted ? 'auto' : 'none',
          ...slotStyle(promoted),
        }}
        onClick={promoted ? () => setPromoted(false) : undefined}
      >
        {children}
      </div>

      <div
        className="absolute inset-0"
        style={{
          zIndex: promoted || leaving ? 2 : 1,
          cursor: promoted ? 'default' : 'pointer',
          // While promoted the unclipped wrapper would swallow clicks meant
          // for the tucked hero, so hits route through the clipped plate.
          pointerEvents: promoted || leaving ? 'none' : 'auto',
          ...inviteStyle,
        }}
        onClick={promoted || leaving ? undefined : () => setPromoted(true)}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-md"
          style={{
            backgroundColor: COLORS.carbon,
            clipPath: `polygon(${platePolygon()})`,
            pointerEvents: promoted && !leaving ? 'auto' : 'none',
          }}
        >
          <div className="absolute inset-0" style={{ background: INVITE_ART_BASE }} />
          {artUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${artUrl})`,
                opacity: promoted ? 1 : 0,
                transition: `opacity ${SWAP_MS}ms`,
              }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: promoted ? PROMOTED_SCRIM : INVITE_SCRIM,
              transition: `background ${SWAP_MS}ms`,
            }}
          />

          <div
            className="relative flex h-full flex-col justify-end gap-1 px-[42px] py-[38px]"
            style={{ minHeight: PLATE_HEIGHT_PX, color: COLORS.smoke }}
          >
            <div className="text-xs font-semibold tracking-widest" style={{ color: COLORS.gold }}>
              CAMPAIGN INVITE
            </div>
            <h3 className="mt-1 mb-0.5 text-[34px] font-[family-name:var(--font-metamorphous)]">
              {invite.title}
            </h3>

            {confirmingDecline ? (
              <>
                <p className="mb-3.5 max-w-[420px] text-[14.5px]" style={{ color: '#D9D4CD' }}>
                  Decline this invite? {invite.host_screen_name || 'The game master'} would need
                  to invite you again.
                </p>
                <div className="flex gap-3.5">
                  <PlateButton variant="danger" disabled={actionPending} onClick={confirmDecline}>
                    {declineInvite.isPending ? 'DECLINING…' : 'YES, DECLINE'}
                  </PlateButton>
                  <PlateButton disabled={actionPending} onClick={() => setConfirmingDecline(false)}>
                    KEEP IT
                  </PlateButton>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 text-sm" style={{ color: '#CFC9C2' }}>
                  {invite.host_screen_name || 'A game master'} invited you to this campaign
                </div>
                <div className="flex gap-3.5">
                  <PlateButton variant="gold" disabled={actionPending} onClick={accept}>
                    {acceptInvite.isPending ? 'ACCEPTING…' : 'ACCEPT'}
                  </PlateButton>
                  <PlateButton disabled={actionPending} onClick={() => setConfirmingDecline(true)}>
                    DECLINE
                  </PlateButton>
                </div>
              </>
            )}
            {actionError && (
              <div className="mt-3 text-[13px]" style={{ color: '#F3B8B0' }}>
                {actionError}
              </div>
            )}
          </div>
        </div>

        {/* Lives on the wrapper, outside the plate's clip, so nothing cuts
            the swing. Marks the invite only — a tucked hero never gets one. */}
        <div
          aria-hidden="true"
          className={leaving || promoted ? '' : 'home-invite-alert'}
          style={{
            position: 'absolute',
            top: 10,
            right: 20,
            fontSize: 30,
            lineHeight: 1,
            color: COLORS.gold,
            opacity: promoted || leaving ? 0 : 1,
            transition: 'opacity 250ms',
          }}
        >
          <FontAwesomeIcon icon={faExclamation} />
        </div>
      </div>
    </div>
  )
}
