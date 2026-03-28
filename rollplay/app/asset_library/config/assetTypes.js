/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { faMap, faMusic, faBolt, faImage } from '@fortawesome/free-solid-svg-icons'

export const ACCEPTED_TYPES = {
  map: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    extensions: '.png, .jpg, .jpeg, .webp',
    label: 'Map',
    icon: faMap
  },
  music: {
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    extensions: '.mp3, .wav, .ogg',
    label: 'Music',
    icon: faMusic
  },
  sfx: {
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    extensions: '.mp3, .wav, .ogg',
    label: 'SFX',
    icon: faBolt
  },
  image: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    extensions: '.png, .jpg, .jpeg, .webp, .gif',
    label: 'Image',
    icon: faImage
  }
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

/**
 * Auto-detect a default asset type from a file's MIME type.
 */
export function detectAssetType(mimeType) {
  if (mimeType.startsWith('audio/')) return 'music'
  if (mimeType.startsWith('image/')) return 'image'
  return null
}

/**
 * Return the list of asset types compatible with a given MIME type.
 * Image files can be tagged as map or image; audio files as music or sfx.
 */
export function getCompatibleTypes(mimeType) {
  if (mimeType.startsWith('image/')) return ['map', 'image']
  if (mimeType.startsWith('audio/')) return ['music', 'sfx']
  return []
}

/**
 * Validate a file against the selected asset type.
 * Returns an error string, or null if valid.
 */
export function validateFileForType(file, assetType) {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
  }
  const config = ACCEPTED_TYPES[assetType]
  if (!config) return 'Invalid asset type'
  if (!config.mimeTypes.includes(file.type)) {
    return `Invalid file type for ${config.label}. Accepted: ${config.extensions}`
  }
  return null
}
