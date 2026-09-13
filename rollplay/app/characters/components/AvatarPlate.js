/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCropSimple, faPenToSquare } from '@fortawesome/free-solid-svg-icons'

import { useAvatarImage } from '@/app/shared/hooks/useAvatarImage'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * A character's portrait as a plate in the page's 8° family — the same skew-and-radius
 * construction as PlateButton, which is what gives a slanted edge genuinely rounded
 * corners. The box skews; the image inside counter-skews and overhangs the sides so the
 * corners stay covered. Size it from outside: it fills its container's width, so the
 * caller sets height and a horizontal margin of ~16px per 220px of height, which is how
 * far the skew pushes the corners past the box.
 *
 * Cover-fit and biased toward the image's token focal square, the way every other avatar
 * surface is. Falls back to the placeholder portrait until there is an image.
 */
export default function AvatarPlate({
  avatarUrl,
  avatarAssetId = null,
  focalArea = null,
  onOpenPicker,
  // Re-open the token face select on the current image. Only shown when there is an
  // image asset to crop — the placeholder has no face to frame.
  onAdjustCrop = null,
  readOnly = false,
  className = '',
}) {
  const { imageUrl, focalPosition } = useAvatarImage(avatarUrl, avatarAssetId, focalArea)

  return (
    <div
      className={`relative overflow-hidden rounded-lg group ${className}`}
      style={{ transform: SKEW_BOX }}
    >
      {/* Overhang by 32px a side: at 8° a 220px-tall box's corners reach ~31px past a
          counter-skewed layer that only spans the box. max-w-none matters — Tailwind's
          preflight caps every <img> at max-width: 100%, which silently clamped the
          overhang back to the box and left the right edge uncovered. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-y-0 -left-8 h-full max-w-none object-cover"
        style={{ transform: SKEW_LABEL, objectPosition: focalPosition, width: 'calc(100% + 64px)' }}
      />
      {!readOnly && (
        <button
          type="button"
          onClick={onOpenPicker}
          aria-label="Choose a portrait"
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30 focus-visible:bg-black/30 outline-none"
        >
          <span
            className="inline-flex items-center justify-center w-11 h-11 rounded-md bg-black/45 text-[#F7F4F3] opacity-70 group-hover:opacity-100"
            style={{ transform: SKEW_LABEL }}
          >
            <FontAwesomeIcon icon={faPenToSquare} className="h-5 w-5" />
          </span>
        </button>
      )}
      {!readOnly && onAdjustCrop && avatarAssetId && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAdjustCrop()
          }}
          title="Adjust the token face"
          aria-label="Adjust the token face"
          className="absolute bottom-3 right-10 inline-flex items-center justify-center w-9 h-9 rounded-md bg-black/55 text-[#F7F4F3] opacity-70 hover:opacity-100 hover:text-[#D9A441]"
          style={{ transform: SKEW_LABEL }}
        >
          <FontAwesomeIcon icon={faCropSimple} className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
