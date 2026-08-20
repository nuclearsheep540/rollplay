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
import Text from '@tiptap/extension-text'
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list'
import { FontFamily, TextStyle } from '@tiptap/extension-text-style'
import { CharacterCount, Placeholder, UndoRedo } from '@tiptap/extensions'
import {
  faBold,
  faItalic,
  faListOl,
  faListUl,
  faHighlighter,
  faStrikethrough,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// Characters, not bytes — the server's real ceiling is 256KB of serialised JSON.
// 60k characters is far more than a campaign's worth of notes and lands well
// inside that, so this is a backstop the user should never meet.
const CHARACTER_LIMIT = 60000

const MONOSPACE_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/**
 * The note editor.
 *
 * The extension list IS the feature list: TipTap ships nothing you do not
 * register, and ProseMirror drops anything from a paste that has no matching node
 * or mark. So images, links, tables and code blocks cannot enter a note even by
 * paste — there is no schema for them to land in.
 *
 * MUST be mounted only once its note has loaded, and keyed by note id. Content is
 * handed over at creation via `content`; pushing it into a live editor afterwards
 * would put the insertion on the undo stack, where a single Ctrl+Z blanks the note
 * and autosave then persists the blank.
 */
export default function NoteEditor({ initialContent, onChange, editable = true }) {
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
      Strike,
      Highlight,
      Heading.configure({ levels: [2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      TextStyle,
      FontFamily,
      UndoRedo,
      Placeholder.configure({ placeholder: 'Session notes…' }),
      CharacterCount.configure({ limit: CHARACTER_LIMIT }),
    ],
    editorProps: {
      attributes: {
        class: 'notes-prose focus:outline-none min-h-[8rem]',
      },
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

  const activeFont = editor.getAttributes('textStyle')?.fontFamily
  const isMonospace = activeFont === MONOSPACE_STACK

  return (
    <div className="notes-editor">
      {editable && <div className="notes-editor__toolbar">
        <ToolbarButton
          label="H2"
          isActive={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="H3"
          isActive={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={faBold}
          title="Bold"
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={faItalic}
          title="Italic"
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={faStrikethrough}
          title="Strikethrough"
          isActive={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon={faHighlighter}
          title="Highlight"
          isActive={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={faListUl}
          title="Bullet list"
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={faListOl}
          title="Numbered list"
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          label="Mono"
          title="Monospace"
          isActive={isMonospace}
          onClick={() => {
            const chain = editor.chain().focus()
            if (isMonospace) chain.unsetFontFamily().run()
            else chain.setFontFamily(MONOSPACE_STACK).run()
          }}
        />
      </div>}

      {/* Bounded height of its own: the drawer body is already a scroll container,
          and letting the editor grow into it means the picker header scrolls away
          while you type. */}
      <div className="notes-editor__body">
        <EditorContent editor={editor} />

        {nearLimit && (
          <p className="mt-2 text-xs" style={{ color: '#B5ADA6' }}>
            {characters.toLocaleString()} / {CHARACTER_LIMIT.toLocaleString()} characters
          </p>
        )}
      </div>
    </div>
  )
}

function ToolbarDivider() {
  return <span className="notes-toolbar-divider" aria-hidden="true" />
}

function ToolbarButton({ icon, label, title, isActive, onClick }) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      className={`notes-toolbar-btn ${isActive ? 'is-active' : ''}`}
    >
      {icon ? <FontAwesomeIcon icon={icon} className="w-3" /> : label}
    </button>
  )
}
