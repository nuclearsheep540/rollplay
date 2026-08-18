/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare } from '@fortawesome/free-regular-svg-icons'
import { faCropSimple } from '@fortawesome/free-solid-svg-icons'

import { useImageFocalPosition } from '@/app/shared/hooks/useImageFocalPosition'
import { THEME, COLORS } from '@/app/styles/colorTheme'

// Same wedge-clip visual language as the workshop tool buttons + campaign-
// drawer player cards. Forward-slash divider: full width at the top, cut
// to 80% at the bottom. Perpendicular dark gradient at 105° gives the
// inner-shadow look on the diagonal edge.
const WEDGE_CLIP = 'polygon(0 0, 100% 0, 80% 100%, 0 100%)'
const WEDGE_INNER_SHADOW =
  'linear-gradient(105deg, transparent 60%, rgba(0, 0, 0, 0.55) 78%)'

const DEFAULT_AVATAR = '/heroes.png'

/**
 * Avatar pane — presentational + opens the picker modal on click.
 *
 * Upload + asset selection both go through the conventional asset library
 * flow (``AssetPicker`` inside ``CharacterAvatarPickerModal``). This pane
 * only handles the wedge visual + click trigger; the wizard owns the modal
 * state and the PATCH that persists the chosen asset.
 *
 * Props:
 * - ``avatarUrl`` — presigned GET URL for the linked asset, or null for the default
 * - ``isBusy`` — drives the dimmed/non-interactive state during the PATCH
 * - ``error`` — string from the wizard's mutation state
 * - ``onOpenPicker()`` — wizard handler that opens the avatar picker modal
 * - ``onAdjustCrop()`` — re-opens the focal-area select on the current avatar
 *   (tokens v3, §3.2); pass null/omit to hide the affordance (no avatar yet)
 * - ``readOnly`` — drops the edit affordances (pen icon, hover dim, click target)
 *   for the finalised-character view
 */
export default function CharacterAvatarPane({
  avatarUrl,
  focalArea = null,
  isBusy = false,
  error = null,
  onOpenPicker,
  onAdjustCrop = null,
  readOnly = false,
}) {
  const displayUrl = avatarUrl || DEFAULT_AVATAR
  // Bias the cover-fit toward the avatar's token focal square (decision
  // 36). Undefined (no area / probe pending / default hero image) leaves
  // the bg-center class in charge — the pre-crop rendering.
  const focalPosition = useImageFocalPosition(avatarUrl, focalArea)

  return (
    // ``group`` sits on the aside (not the button) so the wedge image — a
    // sibling of the button — can dim via ``group-hover:``. The button covers
    // the whole aside so the hover target is functionally identical either
    // way. Transparent background lets whatever main bg the wizard chrome
    // uses show through outside the wedge.
    <aside
      className="relative h-full overflow-hidden group"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Wedge-clipped image layer — single-element trick the workshop
          tool buttons use: background stacks the inner shadow over the
          avatar, clip-path carves the forward-slash wedge. The 20% knock-out
          on hover hints that the wedge is clickable (skipped in read-only). */}
      <div
        className={`absolute inset-0 bg-cover bg-center pointer-events-none transition-opacity duration-150 ${
          readOnly ? '' : 'group-hover:opacity-80 group-focus-within:opacity-80'
        }`}
        style={{
          clipPath: WEDGE_CLIP,
          backgroundImage: `${WEDGE_INNER_SHADOW}, url('${displayUrl}')`,
          ...(focalPosition ? { backgroundPosition: focalPosition } : {}),
        }}
      />

      {!readOnly && (
        // Full-pane click target. Keyboard-accessible via the native button
        // element. Always interactable (except during the PATCH round-trip);
        // the modal handles its own gating after that.
        <button
          type="button"
          disabled={isBusy}
          onClick={onOpenPicker}
          className="absolute inset-0 z-10 flex items-center justify-center disabled:cursor-default"
          style={{ clipPath: WEDGE_CLIP }}
          aria-label="Change character avatar"
        >
          {/* Centred pen-to-square icon — the visual cue that the avatar is
              editable. Translucent by default; hover/focus brings it forward
              (with a soft dark backplate so it stays legible against busy
              images). */}
          <span
            className="rounded-full p-5 transition-all duration-150 group-hover:bg-black/40 group-focus-within:bg-black/40"
            style={{
              backgroundColor: 'transparent',
            }}
          >
            <FontAwesomeIcon
              icon={faPenToSquare}
              className="h-10 w-10 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              style={{
                color: COLORS.smoke,
                opacity: isBusy ? 0.9 : 0.6,
                filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))',
              }}
            />
          </span>

          {isBusy && (
            <span
              className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-sm border px-3 py-1 text-xs font-semibold backdrop-blur-sm"
              style={{
                backgroundColor: `${COLORS.onyx}AA`,
                borderColor: COLORS.silver,
                color: COLORS.smoke,
              }}
            >
              Saving…
            </span>
          )}
        </button>
      )}

      {!readOnly && onAdjustCrop && (
        // Adjust the token crop without re-picking the image (tokens v3,
        // §3.2). Sits above the full-pane picker button (z-20 vs z-10) so
        // its clicks never fall through to the picker.
        <button
          type="button"
          disabled={isBusy}
          onClick={onAdjustCrop}
          aria-label="Adjust token crop"
          title="Adjust how your token frames this image"
          className="absolute bottom-4 left-4 z-20 rounded-sm border px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-opacity duration-150 opacity-60 hover:opacity-100 focus-visible:opacity-100 disabled:cursor-default"
          style={{
            backgroundColor: `${COLORS.onyx}AA`,
            borderColor: COLORS.silver,
            color: COLORS.smoke,
          }}
        >
          <FontAwesomeIcon icon={faCropSimple} className="h-3.5 w-3.5 mr-1.5" />
          Token crop
        </button>
      )}

      {error && (
        <div
          className="absolute bottom-4 right-4 z-20 rounded-sm border px-3 py-1.5 text-xs max-w-[60%]"
          style={{
            borderColor: '#f87171',
            backgroundColor: `${COLORS.onyx}DD`,
            color: '#fecaca',
          }}
        >
          {error}
        </div>
      )}
    </aside>
  )
}
