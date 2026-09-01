/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRightLong } from '@fortawesome/free-solid-svg-icons'

import LikeButton from './LikeButton'
import { PARCHMENT, PARCHMENT_BORDER, GOLD_INK, formatNewsDate } from '../newsTokens'

/**
 * The noticeboard — Home's single LIGHT card, and the page's only parchment
 * surface. The contrast inversion against a page of dark plates IS the pop.
 *
 * Banners break the frame deliberately: negative margins carry the art over
 * the card's own border, which only reads correctly with transparent cutout
 * PNGs at 21:9. `contain` (never cover) letterboxes wrong-ratio art rather
 * than cropping someone's illustration.
 *
 * Rendered by BOTH Home and the editor's preview tab, so what is authored and
 * what ships can never drift apart.
 */
export default function NewsCard({ post, onOpen, interactive = true }) {
  if (!post) return null

  const excerpt = extractExcerpt(post.doc)
  const topBanner = post.banner_urls?.home_top
  const bottomBanner = post.banner_urls?.home_bottom

  return (
    <section
      className="flex flex-1 flex-col rounded-xl px-7 pb-6"
      style={{
        backgroundColor: PARCHMENT,
        border: `1px solid ${PARCHMENT_BORDER}`,
        paddingTop: topBanner ? 0 : '1.5rem',
      }}
    >
      {topBanner && (
        <div
          className="relative"
          style={{
            margin: '-26px -28px 20px',
            aspectRatio: '21 / 9',
            background: `url(${topBanner}) center bottom / contain no-repeat`,
          }}
        />
      )}

      <div className="flex items-center gap-3.5">
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

      <h4
        className="mt-1.5 mb-2 text-[22px] leading-snug font-[family-name:var(--font-metamorphous)]"
        style={{ color: '#181512' }}
      >
        {post.title}
      </h4>

      <p className="text-[13.5px] leading-relaxed" style={{ color: '#4C463E' }}>
        {excerpt}
      </p>

      {/* Seated directly under the excerpt — it ends the reading, not the card.
          mb-auto puts the column's slack BELOW the button rather than above it,
          which is what used to strand it mid-card when no banner followed. The
          banner still lands on the bottom edge, and keeps its own 20px top
          margin so the gap survives a card with no slack to give. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!interactive}
        className="mb-auto flex items-center gap-2 self-start pt-4 text-[12.5px] font-semibold tracking-wider transition-colors"
        style={{ color: GOLD_INK }}
      >
        READ MORE
        <FontAwesomeIcon icon={faArrowRightLong} className="text-[11px]" />
      </button>

      {bottomBanner && (
        <div
          className="relative"
          style={{
            margin: '20px -28px -50px',
            aspectRatio: '21 / 9',
            background: `url(${bottomBanner}) center bottom / contain no-repeat`,
          }}
        />
      )}
    </section>
  )
}

/**
 * First paragraph of the document, as the card's teaser.
 *
 * The card shows a fixed opening rather than a word-count truncation of the
 * whole post: an author controls their first paragraph, and a mid-sentence cut
 * reads as broken.
 */
function extractExcerpt(doc) {
  if (!doc?.content) return ''

  for (const node of doc.content) {
    if (node.type !== 'paragraph' || !node.content) continue

    const text = node.content
      .filter((child) => child.type === 'text')
      .map((child) => child.text)
      .join('')

    if (text.trim()) return text
  }

  return ''
}
