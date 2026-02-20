/*
 * Audio Management Types
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PlaybackState = {
  STOPPED: 'stopped',
  PLAYING: 'playing',
  PAUSED: 'paused',
  TRANSITIONING: 'transitioning'
};

export const ChannelType = {
  BGM: 'bgm',
  SFX: 'sfx'
};