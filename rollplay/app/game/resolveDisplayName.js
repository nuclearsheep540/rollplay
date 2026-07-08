/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Single identity resolver for the game runtime.
 *
 * Resolution order: character name → screen name → a neutral, non-identifying default.
 * NEVER falls back to a raw user_id (UUID) or email — those are PII and must never render.
 */
export const UNKNOWN_NAME = 'Unknown Adventurer';

/**
 * Core resolution from the two candidate names. Use this when you already hold the values
 * (e.g. a structured player/character payload) rather than the lookup maps.
 *
 * @param {string} [characterName]
 * @param {string} [screenName]
 */
export function resolveName(characterName, screenName) {
  return characterName || screenName || UNKNOWN_NAME;
}

/**
 * Map-based convenience: resolve a userId via the character/display name maps.
 *
 * @param {string} userId
 * @param {Object<string,string>} [characterNameMap]  userId → character name
 * @param {Object<string,string>} [displayNameMap]    userId → screen name
 */
export function resolveDisplayName(userId, characterNameMap = {}, displayNameMap = {}) {
  if (!userId || userId === 'empty') return UNKNOWN_NAME;
  return resolveName(characterNameMap?.[userId], displayNameMap?.[userId]);
}
