/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Heading from '@tiptap/extension-heading'
import Highlight from '@tiptap/extension-highlight'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Strike from '@tiptap/extension-strike'
import Superscript from '@tiptap/extension-superscript'
import Text from '@tiptap/extension-text'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list'
import { FontFamily, TextStyle } from '@tiptap/extension-text-style'
import { CharacterCount, Placeholder, UndoRedo } from '@tiptap/extensions'
import {
  faAlignCenter,
  faAlignLeft,
  faAlignRight,
  faBold,
  faCheck,
  faChevronDown,
  faHighlighter,
  faItalic,
  faListOl,
  faListUl,
  faRotateLeft,
  faRotateRight,
  faStrikethrough,
  faSuperscript,
  faArrowsUpDown,
  faParagraph,
  faUnderline,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import Dropdown from '@/app/shared/components/Dropdown'
import { activeBlockAttribute } from '@/app/shared/tiptap/blockAttribute'
import { BLOCK_SPACINGS, BlockSpacing } from '@/app/shared/tiptap/blockSpacing'
import { LINE_HEIGHTS, LineHeight } from '@/app/shared/tiptap/lineHeight'

// Characters, not bytes — the server's real ceiling is 256KB of serialised JSON.
// 60k characters is far more than a campaign's worth of notes and lands well
// inside that, so this is a backstop the user should never meet.
const CHARACTER_LIMIT = 60000

const MONOSPACE_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: faAlignLeft },
  { value: 'center', label: 'Align centre', icon: faAlignCenter },
  { value: 'right', label: 'Align right', icon: faAlignRight },
]

/**
 * The note editor: formatting bar plus writing canvas.
 *
 * The extension list IS the feature list. TipTap ships nothing you do not
 * register, and ProseMirror drops anything from a paste that has no matching
 * node or mark — so images, links, tables and code blocks cannot enter a note
 * even by paste. There is no schema for them to land in.
 *
 * MUST be mounted only once its note has loaded, and keyed by note id. Content
 * is handed over at creation via `content`; pushing it into a live editor
 * afterwards would put the insertion on the undo stack, where a single Ctrl+Z
 * blanks the note and autosave then persists the blank.
 */
export default function NoteEditor({ initialContent, onChange, editable = true, measured = false }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    content: initialContent,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      Underline,
      Strike,
      Superscript,
      LineHeight,
      BlockSpacing,
      Highlight,
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      UndoRedo,
      Placeholder.configure({ placeholder: 'Session notes…' }),
      CharacterCount.configure({ limit: CHARACTER_LIMIT }),
    ],
    editorProps: {
      attributes: { class: 'notes-prose focus:outline-none' },
    },
    onUpdate: ({ editor: instance }) => {
      onChange?.(instance.getJSON(), instance.getText())
    },
  })

  // `editable` is read when the editor is created, so a lock that engages after
  // mount (a DM starting a session while this page is open) needs applying
  // explicitly. Remounting instead would drop unsaved text.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  if (!editor) return null

  const characters = editor.storage.characterCount?.characters?.() ?? 0
  const nearLimit = characters > CHARACTER_LIMIT * 0.9

  const isMonospace = editor.getAttributes('textStyle')?.fontFamily === MONOSPACE_STACK

  // One control that reports the current block rather than two toggles that
  // never showed which one you were already in.
  const headingLabel = editor.isActive('heading', { level: 1 })
    ? 'H1'
    : editor.isActive('heading', { level: 2 })
      ? 'H2'
      : editor.isActive('heading', { level: 3 })
        ? 'H3'
        : 'Body'

  const headingItems = [
    {
      label: 'Heading 1',
      icon: editor.isActive('heading', { level: 1 }) ? faCheck : undefined,
      onClick: () => editor.chain().focus().setNode('heading', { level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      icon: editor.isActive('heading', { level: 2 }) ? faCheck : undefined,
      onClick: () => editor.chain().focus().setNode('heading', { level: 2 }).run(),
    },
    {
      label: 'Heading 3',
      icon: editor.isActive('heading', { level: 3 }) ? faCheck : undefined,
      onClick: () => editor.chain().focus().setNode('heading', { level: 3 }).run(),
    },
    {
      label: 'Body',
      icon: editor.isActive('paragraph') ? faCheck : undefined,
      onClick: () => editor.chain().focus().setParagraph().run(),
    },
  ]

  const activeAlignment =
    ALIGNMENTS.find((option) => editor.isActive({ textAlign: option.value })) || ALIGNMENTS[0]

  const alignmentItems = ALIGNMENTS.map((option) => ({
    label: option.label,
    icon: activeAlignment.value === option.value ? faCheck : undefined,
    onClick: () => editor.chain().focus().setTextAlign(option.value).run(),
  }))

  // Line spacing is a block attribute, so the active one is read from the
  // block the cursor sits in rather than from a toggle's state — headings
  // carry it too, and asking paragraph alone reports Default inside one.
  const activeLineHeight = activeBlockAttribute(editor, 'lineHeight')

  const lineHeightItems = LINE_HEIGHTS.map((option) => ({
    label: option.label,
    icon: activeLineHeight === option.value ? faCheck : undefined,
    onClick: () =>
      option.value
        ? editor.chain().focus().setLineHeight(option.value).run()
        : editor.chain().focus().unsetLineHeight().run(),
  }))

  // The gap after a block, as opposed to the leading within one.
  const activeBlockSpacing = activeBlockAttribute(editor, 'blockSpacing')

  const blockSpacingItems = BLOCK_SPACINGS.map((option) => ({
    label: option.label,
    icon: activeBlockSpacing === option.value ? faCheck : undefined,
    onClick: () =>
      option.value
        ? editor.chain().focus().setBlockSpacing(option.value).run()
        : editor.chain().focus().unsetBlockSpacing().run(),
  }))

  return (
    <>
      {editable && (
        <div className="notes-toolbar">
          <ToolButton
            icon={faRotateLeft}
            title="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolButton
            icon={faRotateRight}
            title="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />

          <ToolDivider />

          <Dropdown
            align="left"
            items={headingItems}
            trigger={
              <button type="button" className="notes-tool" title="Heading level">
                <span className="notes-tool__label">{headingLabel}</span>
                <FontAwesomeIcon icon={faChevronDown} className="notes-tool__caret" />
              </button>
            }
          />
          <ToolButton
            icon={faListUl}
            title="Bullet list"
            isActive={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolButton
            icon={faListOl}
            title="Numbered list"
            isActive={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />

          <ToolDivider />

          <ToolButton
            icon={faBold}
            title="Bold"
            isActive={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolButton
            icon={faItalic}
            title="Italic"
            isActive={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolButton
            icon={faUnderline}
            title="Underline"
            isActive={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolButton
            icon={faStrikethrough}
            title="Strikethrough"
            isActive={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <ToolButton
            icon={faHighlighter}
            title="Highlight"
            isActive={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          />
          <ToolButton
            icon={faSuperscript}
            title="Superscript"
            isActive={editor.isActive('superscript')}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
          />

          <ToolDivider />

          <Dropdown
            align="left"
            items={lineHeightItems}
            trigger={
              <button type="button" className="notes-tool" title="Line height">
                <FontAwesomeIcon icon={faArrowsUpDown} />
                <FontAwesomeIcon icon={faChevronDown} className="notes-tool__caret" />
              </button>
            }
          />

          <Dropdown
            align="left"
            items={blockSpacingItems}
            trigger={
              <button type="button" className="notes-tool" title="Space after paragraph">
                <FontAwesomeIcon icon={faParagraph} />
                <FontAwesomeIcon icon={faChevronDown} className="notes-tool__caret" />
              </button>
            }
          />

          <ToolDivider />

          <Dropdown
            align="left"
            items={alignmentItems}
            trigger={
              <button type="button" className="notes-tool" title="Alignment">
                <FontAwesomeIcon icon={activeAlignment.icon} />
                <FontAwesomeIcon icon={faChevronDown} className="notes-tool__caret" />
              </button>
            }
          />

          <ToolDivider />

          <button
            type="button"
            title="Monospace"
            className={`notes-tool notes-tool--mono ${isMonospace ? 'is-active' : ''}`}
            onClick={() => {
              const chain = editor.chain().focus()
              if (isMonospace) chain.unsetFontFamily().run()
              else chain.setFontFamily(MONOSPACE_STACK).run()
            }}
          >
            Aa
          </button>
        </div>
      )}

      <div className="notes-canvas">
        <div className={measured ? 'notes-measure' : undefined}>
          <EditorContent editor={editor} />

          {nearLimit && (
            <p className="notes-canvas__count">
              {characters.toLocaleString()} / {CHARACTER_LIMIT.toLocaleString()} characters
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function ToolDivider() {
  return <span className="notes-toolbar__divider" aria-hidden="true" />
}

function ToolButton({ icon, title, isActive, disabled, onClick }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      disabled={disabled}
      onClick={onClick}
      className={`notes-tool ${isActive ? 'is-active' : ''}`}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  )
}
