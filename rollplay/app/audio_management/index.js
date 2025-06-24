/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Audio Management Module Index
 * Exports all audio-related functionality
 */

// Components
export * from './components';

// Hooks
export * from './hooks';

// Types
export * from './types';

// WebSocket Events
export {
  handleRemoteAudioPlay,
  handleRemoteAudioResume, 
  handleRemoteAudioBatch,
  createAudioSendFunctions
} from './hooks/webSocketAudioEvents';