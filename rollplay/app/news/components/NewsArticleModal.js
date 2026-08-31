/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, useEffect } from 'react'

import NewsArticle from './NewsArticle'
import { useMarkNewsRead } from '../hooks/useNews'
import { COLORS } from '@/app/styles/colorTheme'

/**
 * The article, full-screen below the site header.
 *
 * An ordinary fixed overlay like every other modal in the app, with one
 * difference: it starts below the chrome instead of covering it, by
 * subtracting the header's measured height (--site-header-height, published by
 * the authenticated layout). The header therefore stays visible and clickable,
 * and clicking it dismisses the article via Dialog's outside-click.
 *
 * Opening marks the post read — that receipt clears the NEW! flair in Home's
 * UPDATES header, so it fires on open rather than on a control the reader
 * would have to find.
 */
export default function NewsArticleModal({ post, open, onClose }) {
  const markRead = useMarkNewsRead()

  useEffect(() => {
    if (open && post && !post.read) {
      markRead.mutate(post.id)
    }
    // Deliberately keyed on the post's identity, not the mutation object:
    // including markRead would re-fire the receipt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id, post?.read])

  // The fallback matters on the first paint, before the layout's effect has
  // measured: without it the overlay would briefly start at the very top.
  const belowHeader = {
    top: 'var(--site-header-height, 69px)',
    bottom: 0,
    left: 0,
    right: 0,
  }

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-40" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed"
            style={{ ...belowHeader, backgroundColor: 'rgba(11, 10, 9, 0.5)' }}
          />
        </TransitionChild>

        {/* The sheet itself never moves — padding here sets its inset from
            the chrome, and the article scrolls inside it. */}
        <div className="fixed flex justify-center p-8" style={belowHeader}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-2"
            enterTo="opacity-100 translate-y-0"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-2"
          >
            <DialogPanel
              className="relative flex max-h-full w-full max-w-[1180px] flex-col overflow-hidden rounded-xl"
              style={{
                backgroundColor: COLORS.smoke,
                boxShadow: '0 24px 60px rgba(11, 10, 9, 0.4)',
              }}
            >
              {/* Outside the scrolling region, so it stays put however far
                  down the article the reader is. */}
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

              {/* Extra right padding keeps the text clear of the scrollbar and
                  of the close button above it. */}
              <div className="overflow-y-auto overscroll-contain px-6 py-10 pr-14 sm:px-10 sm:pr-16 md:px-14 md:pr-20">
                <NewsArticle post={post} />
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
