/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUserPlus } from '@fortawesome/free-solid-svg-icons'

/**
 * Reusable Invite Button component
 * Used across CampaignManager and GamesManager for consistent styling
 */
export default function InviteButton({ onClick, disabled = false, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg border border-blue-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title="Invite Players"
    >
      <FontAwesomeIcon icon={faUserPlus} />
      Invite
    </button>
  )
}
