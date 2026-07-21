/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Site-wide identity color system.
 *
 * A user's color paints their account icon and their disc in other users'
 * social panes. The stored value (users.color, chosen on the account page)
 * is the single authority; the deterministic hash below is only the
 * fallback for users who haven't chosen yet — same demotion pattern as the
 * seat palette under character colors.
 *
 * DISTINCT from character colors (characters.color): that's the in-game
 * persona color for seats and map tokens, per campaign character.
 *
 * Curated for legibility on dark surfaces (Matt, 2026-07-21). Mirrors
 * USER_COLORS in api-site modules/user/domain/user_aggregate.py — the
 * server validates picks against the same list.
 */

export const USER_COLORS = [
  '#cda265', // tan
  '#99cd65', // lime
  '#70c285', // green
  '#5fd3d3', // teal
  '#5979d9', // blue
  '#9959d9', // purple
  '#d959b9', // magenta
  '#d95959', // red
]

/** Deterministic palette pick for users with no stored color. */
export const userColorFallback = (userId) => {
  let hash = 0
  for (const char of String(userId || '')) hash = (hash + char.charCodeAt(0)) % USER_COLORS.length
  return USER_COLORS[hash]
}

/** The user's identity color: stored choice first, hash fallback otherwise. */
export const resolveUserColor = (storedColor, userId) =>
  storedColor || userColorFallback(userId)
