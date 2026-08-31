/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Dialog, DialogPanel, Portal, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, useEffect } from 'react'

import NewsArticle from './NewsArticle'
import { useMarkNewsRead } from '../hooks/useNews'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { COLORS } from '@/app/styles/colorTheme'

/**
 * The article, as an overlay INSIDE the app chrome.
 *
 * It portals into the layout's content region rather than the document body,
 * so it covers the page but never the header — that comes from where it lives
 * in the DOM, not from measuring anything. Width follows the app's
 * content-safe zone (the max-width the header and Home already use).
 *
 * The header stays undimmed and reachable: clicking it fires Dialog's
 * outside-click, which closes the article. So the first click dismisses and a
 * second opens whatever was clicked — conventional overlay behaviour, and
 * honest, unlike a header that looks live while `inert` swallows every click.
 *
 * Opening marks the post read — that receipt clears the NEW! flair in Home's
 * UPDATES header, so it fires on open rather than on some explicit control the
 * reader would have to find.
 */
export default function NewsArticleModal({ post, open, onClose }) {
  const { contentRef } = useAuthenticated()
  const markRead = useMarkNewsRead()

  useEffect(() => {
    if (open && post && !post.read) {
      markRead.mutate(post.id)
    }
    // Deliberately keyed on the post's identity, not the mutation object:
    // including markRead would re-fire the receipt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id, post?.read])

  return (
    <Portal.Group target={contentRef}>
      <Transition appear show={open} as={Fragment}>
        <Dialog as="div" className="absolute inset-0 z-40" onClose={onClose}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0" style={{ backgroundColor: 'rgba(11, 10, 9, 0.45)' }} />
          </TransitionChild>

          <div className="absolute inset-0 overflow-y-auto overscroll-contain">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-2"
            >
              {/* The content-safe zone: the same max-width and padding scale
                  the header and every page surface use. */}
              <DialogPanel
                className="relative mx-auto min-h-full w-full max-w-[1410px] px-4 py-12 sm:px-8 md:px-10"
                style={{ backgroundColor: COLORS.smoke }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="news-article-close"
                  aria-label="Close article"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>

                <NewsArticle post={post} />
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </Portal.Group>
  )
}
