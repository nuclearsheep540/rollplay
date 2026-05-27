/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef, useState } from 'react'

import { THEME, COLORS } from '@/app/styles/colorTheme'

// Same visual language as the workshop tool buttons + campaign-drawer
// player cards (both use parallelogram clip-paths with a perpendicular
// dark gradient). Here the wedge sits on the pane's RIGHT edge with a
// forward-slash direction: full width at the top, cut to 80% at the
// bottom. The perpendicular shadow gradient at 105° gives the
// inner-shadow look on the diagonal.
const WEDGE_CLIP = 'polygon(0 0, 100% 0, 80% 100%, 0 100%)'
const WEDGE_INNER_SHADOW =
  'linear-gradient(105deg, transparent 60%, rgba(0, 0, 0, 0.55) 78%)'

const DEFAULT_AVATAR = '/heroes.png'
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB cap matches typical image upload limits

/**
 * Avatar pane — presentational + file picker only.
 *
 * Upload orchestration (creating the draft if needed, calling the upload
 * hook) lives in CharacterWizard so the pane can stay "always interactive"
 * even when the draft doesn't exist yet. Pane signals up via ``onFileChosen``;
 * the wizard handles the rest and passes ``isUploading`` / ``error`` back
 * down for visual feedback.
 *
 * Props:
 * - ``avatarUrl`` — presigned GET URL, or null/undefined to render the default.
 * - ``isUploading`` — drives the "Uploading…" chip and locks the picker.
 * - ``error`` — string from the wizard's upload state (validation or server).
 * - ``onFileChosen(file)`` — wizard's handler. Always-callable, even with no draft.
 */
export default function CharacterAvatarPane({
  avatarUrl,
  isUploading = false,
  error = null,
  onFileChosen,
}) {
  const inputRef = useRef(null)
  const [localError, setLocalError] = useState(null)

  // Local preview URL so the chosen image flashes in immediately, before the
  // S3 round-trip completes. Cleared when the wizard passes a real avatarUrl back.
  const [previewUrl, setPreviewUrl] = useState(null)
  useEffect(() => {
    if (avatarUrl && previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }, [avatarUrl, previewUrl])

  // Validation errors take precedence over server errors so a stale server
  // error doesn't cover a fresh "must be an image" complaint.
  const displayError = localError || error
  const displayUrl = previewUrl || avatarUrl || DEFAULT_AVATAR

  const triggerPicker = () => {
    if (isUploading) return
    setLocalError(null)
    inputRef.current?.click()
  }

  const handleFileChosen = (event) => {
    const file = event.target.files?.[0]
    // Reset the input so picking the same file twice still fires `onChange`.
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setLocalError('Avatar must be an image file.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setLocalError('Avatar must be 8 MB or smaller.')
      return
    }

    // Optimistic preview — clear when a real avatarUrl arrives (effect above).
    const objectUrl = URL.createObjectURL(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(objectUrl)

    onFileChosen?.(file)
  }

  return (
    <aside
      className="relative h-full overflow-hidden"
      style={{ backgroundColor: COLORS.carbon }}
    >
      {/* Wedge-clipped image layer fills the pane; same single-element
          trick the workshop tool buttons use — background stacks the
          inner shadow over the avatar, clip-path carves the wedge. */}
      <div
        className="absolute inset-0 bg-cover bg-center pointer-events-none"
        style={{
          clipPath: WEDGE_CLIP,
          backgroundImage: `${WEDGE_INNER_SHADOW}, url('${displayUrl}')`,
        }}
      />

      {/* Click-to-upload overlay sits above the image but inside the wedge.
          Using a button (not a div) so keyboard focus + Enter / Space work
          out of the box. Always enabled (except during an in-flight upload)
          so the avatar is editable from the very first interaction. */}
      <button
        type="button"
        disabled={isUploading}
        onClick={triggerPicker}
        className="absolute inset-0 z-10 flex flex-col items-end justify-end p-6 text-right transition-opacity hover:opacity-100 focus:opacity-100 disabled:cursor-default"
        style={{
          clipPath: WEDGE_CLIP,
          opacity: isUploading ? 1 : 0.0,
          color: THEME.textOnDark,
        }}
        aria-label="Change character avatar"
      >
        {/* Tiny hint chip — only renders on hover/focus via opacity flip. */}
        <span
          className="inline-block rounded-sm border px-3 py-1 text-xs font-semibold backdrop-blur-sm"
          style={{
            backgroundColor: `${COLORS.onyx}AA`,
            borderColor: COLORS.silver,
            color: COLORS.smoke,
          }}
        >
          {isUploading ? 'Uploading…' : 'Change avatar'}
        </span>
      </button>

      {/* Always-visible affordance: faint upload icon in the bottom-left
          corner so users discover the click action even without hovering. */}
      {!isUploading && (
        <div
          className="absolute bottom-4 left-4 z-0 flex items-center gap-2 text-xs uppercase tracking-wide pointer-events-none"
          style={{ color: COLORS.silver, opacity: 0.55 }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5 7.5 12M12 7.5v9"
            />
          </svg>
          Click to upload
        </div>
      )}

      {displayError && (
        <div
          className="absolute bottom-4 right-4 z-20 rounded-sm border px-3 py-1.5 text-xs max-w-[60%]"
          style={{
            borderColor: '#f87171',
            backgroundColor: `${COLORS.onyx}DD`,
            color: '#fecaca',
          }}
        >
          {displayError}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChosen}
      />

      <style jsx>{`
        aside button { transition: opacity 150ms ease-out; }
        aside:hover button:not(:disabled),
        aside button:not(:disabled):focus-visible {
          opacity: 1 !important;
        }
      `}</style>
    </aside>
  )
}
