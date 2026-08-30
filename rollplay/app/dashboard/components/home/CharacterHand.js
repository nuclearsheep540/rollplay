/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'

import { useAvatarImage } from '@/app/shared/hooks/useAvatarImage'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL, SLANT_RATIO } from './plateGeometry'

// A hand of physical cards, not a strip: each card is a free-standing
// parallelogram built by skew, so its corners round for free.
const HAND_HEIGHT_PX = 480
const CARD_OVERLAP_PX = 28
// The lean pushes the top edge right by tan(8°) x height; that overhang is
// budgeted into the card width rather than allowed to cross the row's edge.
const CARD_OVERHANG_PX = Math.round(SLANT_RATIO * HAND_HEIGHT_PX)
// Width is fixed by the four-shell fill rule (three characters + create):
// 4W - 3 overlaps + overhang = row width. Fewer characters leave the
// trailing space empty rather than growing the cards.
const CARD_WIDTH = `calc(25% + ${((3 * CARD_OVERLAP_PX - CARD_OVERHANG_PX) / 4).toFixed(2)}px)`

function CharacterCard({ character, onSelect }) {
  const { imageUrl, focalPosition } = useAvatarImage(
    character.avatar_url,
    character.avatar_asset_id,
    character.avatar_focal_area
  )

  return (
    <button
      type="button"
      aria-label={`View ${character.character_name || 'Unnamed'}`}
      onClick={onSelect}
      className="group relative block h-full w-full cursor-pointer overflow-hidden rounded-md border-0 p-0 text-left transition-transform duration-200 ease-out hover:-translate-y-2"
      style={{
        backgroundColor: COLORS.graphite,
        transform: SKEW_BOX,
        transformOrigin: '0 100%',
        boxShadow: '14px 10px 22px rgba(5, 4, 3, 0.28)',
      }}
    >
      {/* Counter-skew layer: everything inside stays upright. It reaches past
          the right edge so art fills the card's leaning top corner. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          right: -CARD_OVERHANG_PX,
          transform: SKEW_LABEL,
          transformOrigin: '0 100%',
        }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center saturate-0 transition-all duration-200 ease-out group-hover:scale-105 group-hover:saturate-100"
          style={{
            backgroundImage: `linear-gradient(rgba(11, 10, 9, 0.15), rgba(11, 10, 9, 0.15)), url(${imageUrl})`,
            ...(focalPosition ? { backgroundPosition: focalPosition } : {}),
          }}
        />
        <h3
          className="absolute truncate text-2xl font-[family-name:var(--font-metamorphous)]"
          style={{
            top: 28,
            left: CARD_OVERHANG_PX + 22,
            right: 28,
            color: COLORS.smoke,
          }}
        >
          {character.character_name || 'Unnamed'}
        </h3>
      </div>
    </button>
  )
}

function CreateCharacterCard({ onSelect }) {
  return (
    <button
      type="button"
      aria-label="Create a new character"
      onClick={onSelect}
      className="group relative block h-full w-full cursor-pointer overflow-hidden rounded-md border-0 p-0 transition-transform duration-200 ease-out hover:-translate-y-2"
      style={{
        // A card that isn't real yet casts no shadow.
        backgroundColor: 'rgba(55, 50, 47, 0.25)',
        transform: SKEW_BOX,
        transformOrigin: '0 100%',
      }}
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{
          right: -CARD_OVERHANG_PX,
          transform: SKEW_LABEL,
          transformOrigin: '0 100%',
        }}
      >
        {/* Knocked-out skin in the same dark treatment as the build card's
            create variant — both are ghosts on the light page ground. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 transition-transform duration-200 group-hover:scale-105">
          <FontAwesomeIcon
            icon={faPlus}
            className="text-5xl"
            style={{ color: COLORS.graphite, opacity: 0.5 }}
          />
          <h4
            className="px-5 text-center text-2xl font-[family-name:var(--font-metamorphous)]"
            style={{ color: COLORS.graphite }}
          >
            Create New<br />Character
          </h4>
        </div>
      </div>
    </button>
  )
}

/** The user's characters, dealt as a hand. Zero characters leaves the ghost alone. */
export default function CharacterHand({ characters = [] }) {
  const router = useRouter()
  const shellCount = characters.length + 1

  return (
    <div className="flex items-stretch" style={{ height: HAND_HEIGHT_PX }}>
      {characters.map((character, index) => (
        <div
          key={character.id}
          className="home-char-shell relative flex-none"
          style={{
            width: CARD_WIDTH,
            marginLeft: index === 0 ? 0 : -CARD_OVERLAP_PX,
            '--hand-depth': shellCount - index,
          }}
        >
          <CharacterCard
            character={character}
            onSelect={() => router.push(`/character/${character.id}`)}
          />
        </div>
      ))}
      <div
        className="home-char-shell relative flex-none"
        style={{
          width: CARD_WIDTH,
          marginLeft: characters.length === 0 ? 0 : -CARD_OVERLAP_PX,
          '--hand-depth': 1,
        }}
      >
        <CreateCharacterCard onSelect={() => router.push('/character/create')} />
      </div>
    </div>
  )
}
