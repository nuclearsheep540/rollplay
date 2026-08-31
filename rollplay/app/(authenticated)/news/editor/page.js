/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'

import { useAuth } from '@/app/dashboard/hooks/useAuth'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'
import { GOLD_INK, INK, formatNewsDate } from '@/app/news/newsTokens'
import { useCreateNewsPost, useNewsPosts } from '@/app/news/hooks/useNews'

/**
 * The news editor index — every post ever written, drafts first.
 *
 * NEW POST is the only create door: a post is born here and edited at its own
 * route, mirroring how campaigns are created from their index rather than from
 * wherever they happen to appear.
 *
 * Admin gating here is cosmetic — the endpoints enforce it server-side, so a
 * non-admin who reaches this URL gets an empty list and failing writes.
 */
export default function NewsEditorIndexPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { data: posts, isLoading } = useNewsPosts({ enabled: Boolean(user?.is_admin) })
  const createPost = useCreateNewsPost()

  const handleCreate = () => {
    createPost.mutate(
      { title: 'Untitled post', authorName: 'The Tavern Keeper' },
      { onSuccess: (post) => router.push(`/news/editor/${post.id}`) }
    )
  }

  if (loading) return null

  if (!user?.is_admin) {
    return (
      <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-16">
          <h1 className="text-[24px] font-[family-name:var(--font-metamorphous)]" style={{ color: INK }}>
            Not available
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: '#6B6459' }}>
            The news editor is limited to administrators.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-8">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD_INK }}>
          Admin
        </span>
  
        <div className="mt-1.5 mb-6 flex items-end justify-between">
          <h1 className="text-[38px] font-[family-name:var(--font-metamorphous)]" style={{ color: INK }}>
            News editor
          </h1>
          <button
            type="button"
            onClick={handleCreate}
            disabled={createPost.isPending}
            className="rounded-lg px-[22px] py-3 text-[13px] font-semibold tracking-wider disabled:opacity-50"
            style={{ transform: SKEW_BOX, backgroundColor: COLORS.gold, color: '#241C08' }}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>
              {createPost.isPending ? 'CREATING…' : 'NEW POST'}
            </span>
          </button>
        </div>
  
        <div
          className="rounded-[10px]"
          style={{ backgroundColor: COLORS.carbon, border: '1px solid #3A352F' }}
        >
          {isLoading && (
            <p className="px-6 py-8 text-[13px]" style={{ color: COLORS.silver }}>
              Loading posts…
            </p>
          )}
  
          {!isLoading && posts?.length === 0 && (
            <p className="px-6 py-8 text-[13px]" style={{ color: COLORS.silver }}>
              No posts yet. NEW POST starts the first one.
            </p>
          )}
  
          {posts?.map((post, index) => (
            <button
              key={post.id}
              type="button"
              onClick={() => router.push(`/news/editor/${post.id}`)}
              className="news-index-row"
              style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(58, 53, 47, 0.8)' }}
            >
              <span className="news-index-pip" />
  
              <span className="min-w-0 flex-1 text-left">
                <span
                  className="block truncate text-[18px] font-[family-name:var(--font-metamorphous)]"
                  style={{ color: COLORS.smoke }}
                >
                  {post.title}
                </span>
                <span className="mt-1 block text-[12.5px]" style={{ color: COLORS.silver }}>
                  {post.published
                    ? `${formatNewsDate(post.published_at)} · ${post.like_count} likes · ${post.author_name}`
                    : `edited ${formatNewsDate(post.updated_at)} · ${post.author_name}`}
                </span>
              </span>
  
              <span
                className="rounded px-2 py-[3px] text-[9.5px] font-bold tracking-[0.1em]"
                style={
                  post.published
                    ? { transform: SKEW_BOX, backgroundColor: COLORS.gold, color: '#241C08' }
                    : { transform: SKEW_BOX, border: `1px solid ${COLORS.silver}`, color: COLORS.silver }
                }
              >
                <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                  {post.published ? 'PUBLISHED' : 'DRAFT'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
