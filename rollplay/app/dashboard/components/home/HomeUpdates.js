/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react'

import { NewsCard, NewsArticleModal, useLatestNews } from '@/app/news'
import { PARCHMENT, PARCHMENT_BORDER } from '@/app/news/newsTokens'

/**
 * Home's Updates column: the section header (with its NEW! flair) and the
 * noticeboard card beneath it.
 *
 * The header and card ship together because the flair belongs to the header
 * but its state — whether this user has read the latest post — belongs to the
 * card's data. Splitting them would mean fetching the post twice.
 */
export default function HomeUpdates({ sectionLabelColor }) {
  const { data: post, isLoading } = useLatestNews()
  const [articleOpen, setArticleOpen] = useState(false)

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-2.5 flex items-baseline px-0.5">
        <h3
          className="text-[11.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: sectionLabelColor }}
        >
          Updates
        </h3>
        {/* NEW! lives in the header, not on the card: banner art is loud, and
            an in-card chip drowns beside it. */}
        {post && !post.read && (
          <span className="news-new-chip">
            <span>NEW!</span>
          </span>
        )}
      </div>

      {post ? (
        <NewsCard post={post} onOpen={() => setArticleOpen(true)} />
      ) : (
        <QuietNoticeboard loading={isLoading} />
      )}

      <NewsArticleModal post={post} open={articleOpen} onClose={() => setArticleOpen(false)} />
    </div>
  )
}

/**
 * Nothing published yet.
 *
 * Still the parchment card rather than an empty column — the noticeboard is
 * part of the page's composition, and a hole where it sits reads as breakage.
 */
function QuietNoticeboard({ loading }) {
  return (
    <section
      className="flex flex-1 flex-col justify-center rounded-xl px-7 py-10"
      style={{ backgroundColor: PARCHMENT, border: `1px solid ${PARCHMENT_BORDER}` }}
    >
      <p className="text-[13.5px] leading-relaxed" style={{ color: '#8A8378' }}>
        {loading ? 'Looking for news…' : 'No news from the tavern yet — check back soon.'}
      </p>
    </section>
  )
}
