/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import Modal from '@/app/shared/components/Modal'
import { COLORS } from '@/app/styles/colorTheme'
import NewsImageBrowser from './NewsImageBrowser'

/**
 * Choose an image to place in an article.
 *
 * The editor's images live in our own S3 store, not on the author's machine,
 * so "insert an image" means picking one of ours — the operating system's file
 * dialog belongs behind an explicit UPLOAD, which is the only moment a local
 * file is genuinely what you want.
 *
 * Uploading here inserts the new image straight away: choosing a file IS the
 * choice, so making the author then find it in the grid would be a second
 * decision they already made.
 */
export default function NewsImagePicker({ open, onClose, postId, onSelect }) {
  const place = (image) => {
    onSelect(image)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="4xl">
      <h3
        className="mb-4 text-[18px] font-[family-name:var(--font-metamorphous)]"
        style={{ color: COLORS.smoke }}
      >
        Insert an image
      </h3>

      <div className="max-h-[62vh] overflow-y-auto overscroll-contain pr-1">
        <NewsImageBrowser
          postId={postId}
          columns={4}
          onSelect={place}
          onUploaded={place}
        />
      </div>
    </Modal>
  )
}
