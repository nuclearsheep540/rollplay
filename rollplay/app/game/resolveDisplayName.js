/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Single identity resolver for the game runtime.
 *
 * Resolution order: character name → screen name → a neutral, non-identifying default.
 * NEVER falls back to a raw user_id (UUID) or email — those are PII and must never render.
 *
 * @param {string} userId
 * @param {Object<string,string>} [characterNameMap]  userId → character name
 * @param {Object<string,string>} [displayNameMap]    userId → screen name
 */
export const UNKNOWN_NAME = 'Unknown Adventurer';

export function resolveDisplayName(userId, characterNameMap = {}, displayNameMap = {}) {
  if (!userId || userId === 'empty') return UNKNOWN_NAME;
  return (characterNameMap && characterNameMap[userId])
    || (displayNameMap && displayNameMap[userId])
    || UNKNOWN_NAME;
}
