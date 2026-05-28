/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import Modal from '@/app/shared/components/Modal'
import AssetPicker from '@/app/workshop/components/AssetPicker'

/**
 * Avatar picker — opens a modal containing the conventional AssetPicker
 * scoped to ``assetType="image"``. The user can either pick an existing image
 * asset from their library or upload a new one inline; ``allowUpload``
 * enables the inline file picker (a feature normally hidden for non-music
 * asset types).
 *
 * Props:
 * - ``open`` / ``onClose`` — standard modal control
 * - ``onSelect(assetId)`` — fired when the user picks or uploads an image.
 *   Parent typically calls a PATCH to point the character at the asset.
 */
export default function CharacterAvatarPickerModal({ open, onClose, onSelect }) {
  const handleSelect = (assetId) => {
    onSelect(assetId)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="4xl">
      <div className="p-6 space-y-4">
        <header>
          <h2 className="text-xl font-semibold text-content-on-dark">
            Choose an avatar
          </h2>
          <p className="text-sm text-content-secondary mt-1">
            Pick an image from your library or upload a new one. The asset stays
            in your library and can be reused on other characters.
          </p>
        </header>

        <AssetPicker assetType="image" onSelect={handleSelect} allowUpload />
      </div>
    </Modal>
  )
}
