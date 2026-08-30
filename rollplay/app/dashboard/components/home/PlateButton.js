/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { SKEW_BOX, SKEW_LABEL } from './plateGeometry'

const SIZE_CLASSES = {
  md: 'px-[22px] py-3 text-[13px]',
  sm: 'px-3 py-2.5 text-xs',
}

// Skin and hover live in globals.css: each variant hovers differently, and a
// :hover border-color can't override an inline border shorthand.
const VARIANT_CLASSES = {
  gold: 'home-btn-gold',
  ghost: 'home-btn-ghost',
  outline: 'home-btn-outline',
  danger: 'home-btn-danger',
}

/**
 * A card CTA — rounded parallelogram in the page's 8° family. The box skews
 * and the label counter-skews so the text stays upright.
 *
 * `live` adds the rotating glint ring (styling lives in globals.css so the
 * reduced-motion guard can reach it).
 */
export default function PlateButton({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  live = false,
  disabled = false,
  title,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg font-semibold tracking-wider transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${live ? 'home-cta-live' : ''}`}
      style={{ transform: SKEW_BOX }}
    >
      <span className="inline-block" style={{ transform: SKEW_LABEL }}>
        {children}
      </span>
    </button>
  )
}
