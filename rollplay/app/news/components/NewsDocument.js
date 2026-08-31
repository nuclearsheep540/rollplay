/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Strike from '@tiptap/extension-strike'
import Text from '@tiptap/extension-text'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list'
import { useMemo } from 'react'

/**
 * The news extension set — shared by the read-only renderer here and the
 * editor, so what you author is exactly what publishes.
 *
 * The extension list IS the feature list: ProseMirror drops any node it has no
 * schema for, so this also bounds what a paste can bring in.
 */
export const NEWS_EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Strike,
  Heading.configure({ levels: [2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Image,
]

/**
 * Rewrite image `src` values from stored S3 keys to signed URLs.
 *
 * Documents store KEYS so they never expire; the API signs them per request
 * and returns the map. Done immutably — mutating the cached document would
 * bake a URL that expires into TanStack's cache.
 */
export function resolveImageUrls(doc, imageUrls = {}) {
  if (!doc || typeof doc !== 'object') return doc

  if (Array.isArray(doc)) {
    return doc.map((node) => resolveImageUrls(node, imageUrls))
  }

  const resolved = { ...doc }

  if (resolved.type === 'image' && resolved.attrs?.src) {
    const signed = imageUrls[resolved.attrs.src]
    if (signed) {
      resolved.attrs = { ...resolved.attrs, src: signed }
    }
  }

  if (resolved.content) {
    resolved.content = resolveImageUrls(resolved.content, imageUrls)
  }

  return resolved
}

/**
 * Recover the S3 key from an image `src`.
 *
 * The editor displays signed URLs (a stored key is not a loadable image), but
 * only keys may be persisted — a signed URL would expire and break the post.
 * CloudFront URLs carry the key as their path, so the key is always
 * recoverable regardless of which lookup happened to be loaded.
 */
export function storageKeyFromSrc(src) {
  if (!src) return src

  // Already a key: no scheme, no leading slash.
  if (!src.includes('://')) return src

  try {
    return decodeURIComponent(new URL(src).pathname.replace(/^\//, ''))
  } catch {
    return src
  }
}

/**
 * Rewrite image `src` values from signed URLs back to stored S3 keys — the
 * inverse of resolveImageUrls, applied before a document is saved.
 */
export function toStorageDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc

  if (Array.isArray(doc)) {
    return doc.map((node) => toStorageDoc(node))
  }

  const stored = { ...doc }

  if (stored.type === 'image' && stored.attrs?.src) {
    stored.attrs = { ...stored.attrs, src: storageKeyFromSrc(stored.attrs.src) }
  }

  if (stored.content) {
    stored.content = toStorageDoc(stored.content)
  }

  return stored
}

/**
 * A published news document, rendered read-only.
 *
 * Keyed remounting is the caller's job: TipTap takes content at creation, so a
 * changed document needs a new editor instance rather than a content push.
 */
export default function NewsDocument({ doc, imageUrls, className = '' }) {
  const content = useMemo(() => resolveImageUrls(doc, imageUrls), [doc, imageUrls])

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    content,
    extensions: NEWS_EXTENSIONS,
    editorProps: {
      attributes: { class: `news-prose ${className}`.trim() },
    },
  })

  if (!editor) return null

  return <EditorContent editor={editor} />
}
