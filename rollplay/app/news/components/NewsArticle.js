/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import LikeButton from './LikeButton'
import NewsDocument from './NewsDocument'
import { GOLD_INK, INK, formatNewsDate } from '../newsTokens'

/**
 * The full article.
 *
 * Reads on the app's natural light ground — no parchment sheet, no dimmed
 * stage. Parchment stays the Home card's identity; borrowing it here would
 * make the article look like a bigger card rather than its own surface.
 *
 * The article OWNS its header: title, separator rule, then author and meta
 * beneath. The card bakes its meta above the title instead, and that
 * difference is deliberate — a card is a summary, an article is a document.
 *
 * `interactive` exists for the editor's preview tab: it renders this same
 * component against the REAL post, so a live like button there would write
 * genuine engagement — on a draft nobody has read yet.
 */
export default function NewsArticle({ post, interactive = true }) {
  if (!post) return null

  const topBanner = post.banner_urls?.article_top
  const bottomBanner = post.banner_urls?.article_bottom

  return (
    <article className="mx-auto w-full max-w-[760px]">
      <h1
        className="pb-3.5 text-[34px] leading-tight font-[family-name:var(--font-metamorphous)]"
        style={{ color: INK, borderBottom: '1px solid rgba(55, 50, 47, 0.25)' }}
      >
        {post.title}
      </h1>

      <div className="mt-2.5 mb-6 flex items-center gap-3 text-[13px]" style={{ color: '#6B6459' }}>
        <span className="font-semibold" style={{ color: '#37322F' }}>
          by {post.author_name}
        </span>
        <span className="text-[11px] font-semibold tracking-widest" style={{ color: GOLD_INK }}>
          {formatNewsDate(post.published_at || post.updated_at)}
        </span>
        <LikeButton
          postId={post.id}
          likeCount={post.like_count}
          liked={post.liked}
          interactive={interactive}
        />
      </div>

      {topBanner && (
        <div
          style={{
            aspectRatio: '21 / 9',
            background: `url(${topBanner}) center bottom / contain no-repeat`,
          }}
        />
      )}

      {/* Keyed by id: TipTap takes content at creation, so switching post must
          build a new editor rather than push content into the live one. */}
      <NewsDocument key={post.id} doc={post.doc} imageUrls={post.image_urls} />

      {bottomBanner && (
        <div
          className="mt-8"
          style={{
            aspectRatio: '21 / 9',
            background: `url(${bottomBanner}) center bottom / contain no-repeat`,
          }}
        />
      )}
    </article>
  )
}
