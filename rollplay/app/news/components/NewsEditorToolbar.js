/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { activeBlockAttribute } from '@/app/shared/tiptap/blockAttribute'
import { BLOCK_SPACINGS } from '@/app/shared/tiptap/blockSpacing'
import { LINE_HEIGHTS } from '@/app/shared/tiptap/lineHeight'

/**
 * Formatting controls for the news editor.
 *
 * Icons are inline SVG rather than Font Awesome: these are text-formatting
 * glyphs (bold, italic, heading) where the letterform itself is the icon.
 *
 * The image button opens the picker over our own image directory rather than
 * the operating system's file dialog: article images live in S3, so "insert an
 * image" is a choice among ours. Uploading a local file is available inside
 * the picker, where it is an explicit act rather than the default.
 *
 * The bar sticks to the top of the page's scroll region as the article moves
 * under it. Sticky rather than fixed: the scroll region already starts below
 * the site header, so the bar lands in the right place without measuring the
 * chrome or competing with it for z-order.
 */
export default function NewsEditorToolbar({ editor, onPickImage, onEditLink, onEditAltText }) {
  if (!editor) return null

  const toggleClass = (isActive) => `news-tbtn ${isActive ? 'is-active' : ''}`

  return (
    <div className="news-toolbar news-toolbar--sticky">
      {/* Disabled states come from the editor's own history, so the controls
          can never offer a step that does not exist. */}
      <button
        type="button"
        className="news-tbtn"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 10H5V6" />
          <path d="M5.5 10.5a7 7 0 1 1 1.5 7.6" />
        </svg>
      </button>
      <button
        type="button"
        className="news-tbtn"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <svg viewBox="0 0 24 24">
          <path d="M15 10h4V6" />
          <path d="M18.5 10.5a7 7 0 1 0-1.5 7.6" />
        </svg>
      </button>

      <span className="news-toolbar-sep" />

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

      <button
        type="button"
        className={toggleClass(editor.isActive('superscript'))}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        title="Superscript"
      >
        <span className="news-tbtn-sup">
          x<sup>2</sup>
        </span>
      </button>

      <span className="news-toolbar-sep" />

      {/* Line spacing applies to whole blocks, so this reads the current one
          rather than toggling — a select says "this block is X" in a way a row
          of buttons cannot. Read through activeBlockAttribute because a
          heading carries the attribute too, and asking paragraph alone would
          report Default while the cursor sits in a styled heading. */}
      <select
        className="news-tbtn-select"
        value={activeBlockAttribute(editor, 'lineHeight') || ''}
        onChange={(event) => {
          const value = event.target.value
          if (value) {
            editor.chain().focus().setLineHeight(value).run()
          } else {
            editor.chain().focus().unsetLineHeight().run()
          }
        }}
        title="Line spacing"
      >
        {LINE_HEIGHTS.map((option) => (
          <option key={option.label} value={option.value || ''}>
            {option.label === 'Default' ? 'Height' : option.label}
          </option>
        ))}
      </select>

      {/* The gap AFTER a block, as opposed to the leading within one. */}
      <select
        className="news-tbtn-select"
        value={activeBlockAttribute(editor, 'blockSpacing') || ''}
        onChange={(event) => {
          const value = event.target.value
          if (value) {
            editor.chain().focus().setBlockSpacing(value).run()
          } else {
            editor.chain().focus().unsetBlockSpacing().run()
          }
        }}
        title="Space after paragraph"
      >
        {BLOCK_SPACINGS.map((option) => (
          <option key={option.label} value={option.value || ''}>
            {option.label === 'Default' ? 'Spacing' : option.label}
          </option>
        ))}
      </select>

      <span className="news-toolbar-sep" />

      {/* Nothing to link means nothing to do: with no selection and no link
          under the cursor, setLink has no text to mark and would silently do
          nothing — which the modal would then report as a rejected URL. */}
      <button
        type="button"
        className={toggleClass(editor.isActive('link'))}
        onClick={onEditLink}
        disabled={editor.state.selection.empty && !editor.isActive('link')}
        title={editor.isActive('link') ? 'Edit link' : 'Link the selected text'}
      >
        <svg viewBox="0 0 24 24">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
        </svg>
      </button>

      <button
        type="button"
        className="news-tbtn"
        onClick={onPickImage}
        title="Insert an image"
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M4.5 18.5 10 13l3.5 3.5L17 13l2.5 2.5" />
        </svg>
      </button>

      {/* Alt text belongs to one image, so this acts on the selected one and is
          dead otherwise — there is no sensible "describe nothing". */}
      <button
        type="button"
        className={toggleClass(Boolean(editor.getAttributes('image').alt))}
        onClick={onEditAltText}
        disabled={!editor.isActive('image')}
        title="Describe the selected image for screen readers"
      >
        <span className="news-tbtn-alt">ALT</span>
      </button>
    </div>
  )
}
