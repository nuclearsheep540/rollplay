/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * Formatting controls for the news editor.
 *
 * Icons are inline SVG rather than Font Awesome: these are text-formatting
 * glyphs (bold, italic, heading) where the letterform itself is the icon.
 *
 * Images are not here: the rail beside the editor owns them, because placing
 * one means choosing which — a toolbar button could only open the rail.
 */
export default function NewsEditorToolbar({ editor }) {
  if (!editor) return null

  const toggleClass = (isActive) => `news-tbtn ${isActive ? 'is-active' : ''}`

  return (
    <div className="news-toolbar">
      <button
        type="button"
        className={toggleClass(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <span className="news-tbtn-b">B</span>
      </button>
      <button
        type="button"
        className={toggleClass(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <span className="news-tbtn-i">I</span>
      </button>
      <button
        type="button"
        className={toggleClass(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading"
      >
        <span className="news-tbtn-h">H2</span>
      </button>
      <button
        type="button"
        className={toggleClass(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Sub-heading"
      >
        <span className="news-tbtn-h">H3</span>
      </button>

      <span className="news-toolbar-sep" />

      <button
        type="button"
        className={toggleClass(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button
        type="button"
        className={toggleClass(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 6h11M9 12h11M9 18h11M4 5v3M3 8h2M3 11h2l-2 3h2" />
        </svg>
      </button>

    </div>
  )
}
