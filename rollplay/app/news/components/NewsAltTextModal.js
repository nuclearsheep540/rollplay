/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useState } from 'react'

import Modal from '@/app/shared/components/Modal'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * Describe the selected image for people who cannot see it.
 *
 * Acts on the selection rather than on insertion, mirroring the link tool: you
 * usually cannot say what an image is FOR until you see it sitting in the
 * paragraph it illustrates, and this way one control serves both insertion
 * routes — the rail's click and the picker's modal.
 *
 * Empty is a legitimate answer, not a missing one. An image carrying no
 * meaning of its own is decorative, and `alt=""` tells a screen reader to skip
 * it — which is the correct outcome, and better than a description that makes
 * a reader stop for a flourish. The banners already behave this way by being
 * CSS backgrounds, which assistive technology ignores entirely.
 */
export default function NewsAltTextModal({ open, initialAlt = '', onClose, onSubmit }) {
  const [alt, setAlt] = useState(initialAlt)
  const inputRef = useRef(null)

  // Reseed on open: the selection is a different image from last time.
  useEffect(() => {
    if (open) setAlt(initialAlt)
  }, [open, initialAlt])

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit(alt.trim())
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" initialFocus={inputRef}>
      <form onSubmit={handleSubmit}>
        <h3
          className="text-[18px] font-[family-name:var(--font-metamorphous)]"
          style={{ color: COLORS.smoke }}
        >
          Describe this image
        </h3>

        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: COLORS.silver }}>
          Read aloud in place of the image. Say what it shows and why it is here —
          or leave it empty if it is decoration.
        </p>

        <input
          ref={inputRef}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          maxLength={250}
          placeholder="The party's route through the Sword Coast, marked in red"
          className="mt-4 w-full rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none"
          style={{
            backgroundColor: 'rgba(247, 244, 243, 0.06)',
            border: '1px solid #3A352F',
            color: COLORS.smoke,
          }}
        />

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            className="rounded-lg px-[20px] py-2.5 text-[12px] font-semibold tracking-wider"
            style={{ transform: SKEW_BOX, backgroundColor: COLORS.gold, color: '#241C08' }}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>SAVE</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
