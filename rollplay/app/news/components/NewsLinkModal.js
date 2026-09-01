/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useState } from 'react'

import Modal from '@/app/shared/components/Modal'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * Add, change or remove a link on the current selection.
 *
 * A field rather than window.prompt: an author editing an existing link needs
 * to SEE the current address to correct a typo in it, which a prompt cannot
 * show. Opening with the existing href prefilled is the whole point.
 *
 * The schema decides what a valid link is (see isPublishableLink); this only
 * reports the refusal, so the two can never disagree about what is allowed.
 */
export default function NewsLinkModal({ open, initialUrl = '', onClose, onSubmit, onRemove }) {
  const [url, setUrl] = useState(initialUrl)
  const [rejected, setRejected] = useState(false)
  const inputRef = useRef(null)

  // Reseed whenever the modal opens: the selection may be a different link, or
  // none at all, since it was last used.
  useEffect(() => {
    if (open) {
      setUrl(initialUrl)
      setRejected(false)
    }
  }, [open, initialUrl])

  const handleSubmit = (event) => {
    event.preventDefault()

    const trimmed = url.trim()
    if (!trimmed) {
      onRemove()
      onClose()
      return
    }

    // A bare domain is what people type; assume https rather than refusing it.
    const candidate = /^[a-z]+:/i.test(trimmed) ? trimmed : `https://${trimmed}`

    if (!onSubmit(candidate)) {
      setRejected(true)
      return
    }

    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" initialFocus={inputRef}>
      <form onSubmit={handleSubmit}>
        <h3
          className="text-[18px] font-[family-name:var(--font-metamorphous)]"
          style={{ color: COLORS.smoke }}
        >
          {initialUrl ? 'Edit link' : 'Add link'}
        </h3>

        <input
          ref={inputRef}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            setRejected(false)
          }}
          placeholder="example.com/page"
          className="mt-4 w-full rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none"
          style={{
            backgroundColor: 'rgba(247, 244, 243, 0.06)',
            border: `1px solid ${rejected ? '#B03030' : '#3A352F'}`,
            color: COLORS.smoke,
          }}
        />

        {rejected && (
          <p className="mt-2 text-[12px]" style={{ color: '#D08A8A' }}>
            Links must be a web address or an email link.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          {initialUrl ? (
            <button
              type="button"
              onClick={() => {
                onRemove()
                onClose()
              }}
              className="text-[12px] font-semibold tracking-wider"
              style={{ color: COLORS.silver }}
            >
              REMOVE LINK
            </button>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="rounded-lg px-[20px] py-2.5 text-[12px] font-semibold tracking-wider"
            style={{ transform: SKEW_BOX, backgroundColor: COLORS.gold, color: '#241C08' }}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>
              {initialUrl ? 'UPDATE' : 'ADD LINK'}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
