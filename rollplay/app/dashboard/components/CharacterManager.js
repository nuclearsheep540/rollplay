/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { useAvatarImage } from '@/app/shared/hooks/useAvatarImage'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'

// Parallelogram strip (tokens v3, decision 37) — the workshop tiles'
// slant promoted to a true tiling. Each card's SHELL is the visible band
// (the 9:16 stride); the card BOX inside it is wider by the slant run and
// clipped to a parallelogram, spilling right across the following shells
// so every seam is a diagonal.
//
// ONE dial: the slant, in degrees from vertical. The site's wedge family
// spans ~8° (avatar pane) to 35° (workshop tool tiles), so anything in
// that range stays in-family. Every other constant below derives from it
// — clip points, box width, seam-shadow angle and anchor, lead shift —
// so tuning the look is this single number.
const STRIP_ANGLE_DEGREES = 18

// Derived geometry (units of card height H): stride S = 0.5625·H (9:16),
// slant run R = tan(angle)·H, box = S + R. Both slant edges are parallel,
// so the strip tiles at any height — these are constants of the aspect.
const STRIP_STRIDE_RATIO = 9 / 16
const STRIP_SLANT_RATIO = Math.tan((STRIP_ANGLE_DEGREES * Math.PI) / 180)
const STRIP_BOX_RATIO = STRIP_STRIDE_RATIO + STRIP_SLANT_RATIO
const STRIP_BOX_WIDTH_PERCENT = ((STRIP_BOX_RATIO / STRIP_STRIDE_RATIO) * 100).toFixed(2)
// Clip x-stops: where the slant crosses the box's top and bottom edges.
const STRIP_TOP_INSET_PERCENT = ((STRIP_SLANT_RATIO / STRIP_BOX_RATIO) * 100).toFixed(2)
const STRIP_BOTTOM_EDGE_PERCENT = ((STRIP_STRIDE_RATIO / STRIP_BOX_RATIO) * 100).toFixed(2)
const STRIP_SLANT_CLIP = `polygon(${STRIP_TOP_INSET_PERCENT}% 0, 100% 0, ${STRIP_BOTTOM_EDGE_PERCENT}% 100%, 0 100%)`
// First card: square left edge (decision 37's QA fallback, taken
// 2026-08-18 — the angled lead-in void read as broken at full-bleed
// heights). Right edge keeps the strip slant so the tiling continues.
const STRIP_FIRST_CLIP = `polygon(0 0, 100% 0, ${STRIP_BOTTOM_EDGE_PERCENT}% 100%, 0 100%)`
// QA tuning (2026-08-18): even square-capped, the first card shows more
// art than the others. Pulling the strip left by a fraction of the slant
// run lets the viewport edge trim the cap's bonus zone. Each pixel of
// shift also takes a pixel off the first card's bottom stride, so keep
// this well under 1.
const STRIP_LEAD_SHIFT_FRACTION = 0.35
// Seam shadow: perpendicular to the slant (gradient angle = 90° + slant),
// so every point of the left diagonal projects to ONE stop on the
// gradient axis — a contact shadow hugging the seam. The anchor is
// geometry, not taste: the edge projects to sin(angle)·H along the axis,
// i.e. sin/(box·cos + sin) of its length (QA 2026-08-18 caught a ~280px
// solid shadow slab from borrowing the tool nav's 50% anchor — that
// number is a property of ITS squat aspect). Fixed-px fade tail so the
// shadow stays a tight edge at any card height.
const STRIP_ANGLE_RADIANS = (STRIP_ANGLE_DEGREES * Math.PI) / 180
const STRIP_SEAM_ANCHOR_PERCENT = (
  (Math.sin(STRIP_ANGLE_RADIANS)
    / (STRIP_BOX_RATIO * Math.cos(STRIP_ANGLE_RADIANS) + Math.sin(STRIP_ANGLE_RADIANS))) * 100
).toFixed(2)
const STRIP_SEAM_SHADOW = `linear-gradient(${90 + STRIP_ANGLE_DEGREES}deg, rgba(0, 0, 0, 0.55) ${STRIP_SEAM_ANCHOR_PERCENT}%, transparent calc(${STRIP_SEAM_ANCHOR_PERCENT}% + 72px))`

// Strip card — a real component (not a render helper) because the focal
// bias is a hook (decision 36). Greyscale-at-rest lives on the image layer
// only, so the name stays crisp while the art desaturates.
function CharacterStripCard({ char, shellStyle, isResizing, onSelect, isFirst = false }) {
  // Blob-cached by asset id rather than the presigned URL, so the strip
  // survives a characters refetch without re-downloading. Geometry here is a
  // parallelogram with a flat overlay, so this uses the hook directly rather
  // than the AvatarWedge the party/choice cards share.
  const { imageUrl, focalPosition } = useAvatarImage(
    char.avatar_url,
    char.avatar_asset_id,
    char.avatar_focal_area
  )
  // Readability overlay — much lighter over a real avatar so the portrait
  // stays visible; heavier over the default hero placeholder.
  const overlay = char.avatar_url ? `${COLORS.onyx}26` : `${COLORS.onyx}80`
  // The first card has no left neighbour: square cap (the seam-shadow
  // layer below simply isn't rendered for it — the gradient exists to hug
  // the left diagonal, which this card lacks).
  const clip = isFirst ? STRIP_FIRST_CLIP : STRIP_SLANT_CLIP
  const backgroundLayers = `linear-gradient(${overlay}, ${overlay}), url(${imageUrl})`

  return (
    // pointer-events-none: shells are transparent layout rectangles that
    // sit ABOVE the previous cards' spilling boxes in paint order — left
    // interactive they'd swallow most of each neighbour's hover/click
    // (clip-path clips the buttons' hit areas; nothing clips a shell).
    // The button re-enables events for the actual parallelogram.
    <div className="relative flex-shrink-0 pointer-events-none" style={shellStyle}>
      <button
        type="button"
        aria-label={`View ${char.character_name || 'Unnamed'}`}
        onClick={onSelect}
        className="group absolute inset-y-0 left-0 pointer-events-auto cursor-pointer"
        style={{
          width: `${STRIP_BOX_WIDTH_PERCENT}%`,
          clipPath: clip,
          backgroundColor: THEME.bgPanel,
        }}
      >
        {/* Avatar layer — overlay + image in one background stack.
            saturate-0 at rest is the strip's greyscale skin; hover
            restores color (decision 37). THIS is the element the hover
            zoom scales: the art grows inside the fixed parallelogram
            frame, so the title and seams never move. Focal bias
            (decision 36) rides backgroundPosition; absent ⇒ bg-center. */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none saturate-0 group-hover:saturate-100 group-focus-visible:saturate-100 group-hover:scale-[1.05] group-focus-visible:scale-[1.05]"
          style={{
            backgroundImage: backgroundLayers,
            transition: isResizing ? 'none' : 'filter 200ms ease-out, transform 200ms ease-out',
            ...(focalPosition ? { backgroundPosition: focalPosition } : {}),
          }}
        />

        {/* Seam shadow on its own layer so hover can fade it out: the pop
            lifts this card above its neighbours, so the "previous card
            rests on me" contact shadow no longer applies while popped. */}
        {!isFirst && (
          <div
            className="absolute inset-0 pointer-events-none group-hover:opacity-0 group-focus-visible:opacity-0"
            style={{
              backgroundImage: STRIP_SEAM_SHADOW,
              transition: isResizing ? 'none' : 'opacity 200ms ease-out',
            }}
          />
        )}

        {/* Name only (decision 37) — no meta line, no backplate. Bare text
            first per the plan; QA fallback is a whisper of text-shadow or
            a thin top scrim, never the band. Left offset clears the top
            edge's slant start (derived from the strip angle). */}
        {/* The title lives beside the scaling image layer, not inside it —
            it cannot move or resize during the hover zoom. */}
        <h3
          className="absolute text-2xl font-[family-name:var(--font-metamorphous)] truncate text-left"
          style={{
            top: '2rem',
            left: `calc(${STRIP_TOP_INSET_PERCENT}% + 1rem)`,
            right: '1rem',
            color: THEME.textOnDark,
          }}
        >
          {char.character_name || 'Unnamed'}
        </h3>
      </button>
    </div>
  )
}

/**
 * The characters index — the strip and nothing else. Clicking a card
 * navigates to /character/{id}, the single canonical character view (with
 * its Edit/Delete chrome); this component owns no drawer, no selection
 * state, no per-character actions.
 */
export default function CharacterManager({ user }) {
  const router = useRouter()
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Lead shift (decision 37 QA tuning): measured px the strip pulls left
  // so the first card's cap doesn't dominate. Derived from the row's
  // rendered height, so it re-measures alongside the resize handling.
  const [leadShiftPx, setLeadShiftPx] = useState(0)

  const [isResizing, setIsResizing] = useState(false)

  // Native wheel listener (React's onWheel is passive, so preventDefault
  // there is a no-op). Attaches non-passive so we can swallow the vertical
  // scroll and convert it into horizontal — otherwise the page scrolls Y
  // while the cards stay put.
  const scrollRowRef = useRef(null)
  useEffect(() => {
    const el = scrollRowRef.current
    if (!el) return
    const onWheel = (e) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loading, error])

  // Measure the lead shift from the row's rendered height (shift =
  // fraction × slant run, i.e. tan(STRIP_ANGLE_DEGREES) × card height).
  // Same mount/remount cadence as the wheel listener above; re-measures
  // on window resize.
  useEffect(() => {
    const measureLeadShift = () => {
      const rowHeight = scrollRowRef.current?.clientHeight || 0
      setLeadShiftPx(Math.round(rowHeight * STRIP_SLANT_RATIO * STRIP_LEAD_SHIFT_FRACTION))
    }
    measureLeadShift()
    window.addEventListener('resize', measureLeadShift)
    return () => window.removeEventListener('resize', measureLeadShift)
  }, [loading, error])

  // Fetch characters from API
  const fetchCharacters = async () => {
    try {
      setLoading(true)
      const response = await authFetch('/api/characters/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const charactersData = await response.json()
        setCharacters(charactersData)
      } else {
        console.error('Failed to fetch characters:', response.status)
        setError('Failed to load characters')
      }
    } catch (error) {
      console.error('Error fetching characters:', error)
      setError('Failed to load characters')
    } finally {
      setLoading(false)
    }
  }

  // Fetch characters when component mounts or user changes
  useEffect(() => {
    if (user) {
      fetchCharacters()
    }
  }, [user])

  // Resize handler - disable transitions during window resize
  useEffect(() => {
    let resizeTimer
    const handleResize = () => {
      setIsResizing(true)
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => setIsResizing(false), 100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimer)
    }
  }, [])

  // Render loading state
  const renderLoading = () => (
    <div className="flex justify-center items-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor: THEME.textAccent}}></div>
      <span className="ml-2" style={{color: THEME.textSecondary}}>Loading characters...</span>
    </div>
  )

  // Render error state
  const renderError = () => (
    // m-6: the characters tab is full-bleed (no dashboard gutter), so the
    // banner carries its own inset instead of hugging the viewport edge.
    <div className="rounded-sm border p-4 m-6" style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}>
      <p style={{color: '#fca5a5'}}>{error}</p>
    </div>
  )

  // Card SHELLS fill the scroll row's full height; width is the strip
  // stride, derived from the 9:16 portrait aspect. Min/max keep the cards
  // usable on extreme viewports. Height clamps mirror the width clamps at
  // 16/9 so the aspect genuinely holds — width clamps alone would win over
  // aspect-ratio on very tall rows, skewing the parallelogram geometry the
  // clip/gradient constants are derived from. The card BOX inside each
  // shell is STRIP_BOX_WIDTH_PERCENT of this width (angle-derived).
  // No max clamps: the full-bleed strip means cards genuinely fill the tab
  // height (the old 600/1067 maxes left a dead band under the strip).
  // Minimums stay so tiny viewports keep usable cards.
  const CARD_STYLE = {
    height: '100%',
    width: 'auto',
    aspectRatio: '9/16',
    minWidth: '140px',
    minHeight: '249px',
  }

  // Create-card — the strip's last member, same parallelogram shape,
  // knocked-out content. Clicking through lands on the wizard whose avatar
  // pane opens with the same wedge motif (decision 37 continuity).
  const renderCreateCard = () => (
    // Same shell/button pointer-events split as CharacterStripCard.
    <div className="relative flex-shrink-0 pointer-events-none" style={CARD_STYLE}>
      <button
        type="button"
        aria-label="Create New Character"
        onClick={() => router.push('/character/create')}
        className="group absolute inset-y-0 left-0 pointer-events-auto cursor-pointer"
        style={{
          width: `${STRIP_BOX_WIDTH_PERCENT}%`,
          // Square-capped when it leads the strip (zero characters) —
          // same no-left-neighbour rule as the first character card.
          clipPath: characters.length === 0 ? STRIP_FIRST_CLIP : STRIP_SLANT_CLIP,
          backgroundColor: `${THEME.bgPanel}40`, // 25% opacity knocked-out skin
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 opacity-50 group-hover:opacity-80 group-hover:scale-[1.05] group-focus-visible:scale-[1.05] transition-[opacity,transform] duration-200">
          <FontAwesomeIcon
            icon={faPlus}
            className="text-7xl mb-4"
            style={{ color: COLORS.smoke }}
          />
          <h4 className="text-2xl font-[family-name:var(--font-metamorphous)] mb-2 text-center" style={{ color: THEME.textPrimary }}>
            Create New Character
          </h4>
        </div>
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Loading/Error states */}
      {loading && renderLoading()}
      {!loading && error && renderError()}

      {/* Content area - flex-1 min-h-0 to fill remaining space */}
      <div className="flex-1 min-h-0 relative">
        {!loading && !error && (
          <div
            ref={scrollRowRef}
            className="character-index-strip flex gap-0 overflow-x-auto overflow-y-hidden h-full items-stretch"
            style={{
              // No padding at all: cards permanently fill the full-bleed
              // tab (the strip IS the page). Hover zooms the ART inside
              // each fixed parallelogram (frames never move); overflow-y
              // hidden stays as the structural guard against anything
              // painting over the nav.
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Character Cards — parallelogram strip (decision 37; angle
                set by STRIP_ANGLE_DEGREES) */}
            {characters.map((char, cardIndex) => (
              <CharacterStripCard
                key={char.id}
                char={char}
                // First shell pulls the strip left so the viewport trims
                // the cap's bonus art; overflow before the content origin
                // is unreachable by scroll, so the cut is permanent.
                shellStyle={cardIndex === 0
                  ? { ...CARD_STYLE, marginLeft: `-${leadShiftPx}px` }
                  : CARD_STYLE}
                isResizing={isResizing}
                isFirst={cardIndex === 0}
                onSelect={() => router.push(`/character/${char.id}`)}
              />
            ))}
            {/* Create New Character Card — hidden at the account cap */}
            {characters.length < (user?.max_slots ?? 4) && renderCreateCard()}
          </div>
        )}
      </div>
    </div>
  )
}
