/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'
import NewsAltTextModal from '@/app/news/components/NewsAltTextModal'
import NewsArticle from '@/app/news/components/NewsArticle'
import NewsBannerSlot from '@/app/news/components/NewsBannerSlot'
import NewsCard from '@/app/news/components/NewsCard'
import NewsEditorToolbar from '@/app/news/components/NewsEditorToolbar'
import NewsImagePicker from '@/app/news/components/NewsImagePicker'
import NewsLinkModal from '@/app/news/components/NewsLinkModal'
import NewsImageRail from '@/app/news/components/NewsImageRail'
import {
  NEWS_EDITOR_EXTENSIONS,
  replaceImageKey,
  resolveImageUrls,
  toStorageDoc,
} from '@/app/news/components/NewsDocument'
import { GOLD_INK, INK, PARCHMENT, PARCHMENT_BORDER } from '@/app/news/newsTokens'
import {
  useDeleteNewsPost,
  useNewsImageUrlLookup,
  useNewsPost,
  usePublishNewsPost,
  useUpdateNewsPost,
} from '@/app/news/hooks/useNews'

// How long a confirmation stays up. Long enough to be seen, short enough that
// it never lingers as a claim about a save you have since moved on from.
const SAVE_CONFIRMATION_MS = 4000

const TABS = [
  { id: 'edit', label: 'EDIT' },
  { id: 'card', label: 'HOME CARD' },
  { id: 'article', label: 'ARTICLE' },
]

/**
 * The news editor.
 *
 * One page, three tab states. The two preview tabs render the REAL components
 * Home uses, fed the working draft — so a preview can never drift from what
 * ships. That is why this page imports NewsCard and NewsArticle rather than
 * approximating them.
 *
 * Banner slots are per-surface: each slot's toggle picks whether it is editing
 * the home-card pair or the article pair, and a post can carry both.
 */
export default function NewsEditorPage() {
  const { postId } = useParams()
  const router = useRouter()
  // The layout owns the one auth instance for this route group — a second
  // useAuth() here would start its own fetch and token-refresh lifecycle.
  const { user, loading: authLoading } = useAuthenticated()

  const { data: post, isLoading } = useNewsPost(postId, { enabled: Boolean(user?.is_admin) })
  const updatePost = useUpdateNewsPost()
  const publishPost = usePublishNewsPost()
  const deletePost = useDeleteNewsPost()

  // Both scopes at once: an article can reference its own images and shared
  // ones in the same document, so resolving a key to a URL has to look in both.
  const imageUrlByKey = useNewsImageUrlLookup(postId, { enabled: Boolean(user?.is_admin) })

  const [activeTab, setActiveTab] = useState('edit')
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [altModalOpen, setAltModalOpen] = useState(false)
  // 'idle' | 'saved' | 'failed' — what to say about the LAST completed write.
  // In-flight state comes from the mutations themselves.
  const [saveState, setSaveState] = useState('idle')
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [doc, setDoc] = useState(null)
  const [banners, setBanners] = useState({})
  const [topSurface, setTopSurface] = useState('home')
  const [bottomSurface, setBottomSurface] = useState('home')

  // Seed local state once the post arrives. Keyed on id so switching posts
  // reseeds, while typing does not get clobbered by a background refetch.
  useEffect(() => {
    if (!post) return

    setTitle(post.title)
    setAuthorName(post.author_name)
    setDoc(post.doc)
    setBanners({
      banner_home_top: post.banner_home_top,
      banner_home_bottom: post.banner_home_bottom,
      banner_article_top: post.banner_article_top,
      banner_article_bottom: post.banner_article_bottom,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id])

  // The editor works in SIGNED URLs — a stored key is not a loadable image —
  // and every read of its content converts back to keys before saving.
  const editor = useEditor({
    immediatelyRender: false,
    content: post ? resolveImageUrls(post.doc, post.image_urls) : null,
    extensions: NEWS_EDITOR_EXTENSIONS,
    editorProps: {
      attributes: { class: 'news-prose focus:outline-none' },
    },
    onUpdate: ({ editor: instance }) => setDoc(toStorageDoc(instance.getJSON())),
  }, [post?.id])

  /**
   * The draft as the preview components consume it — same shape the API
   * returns, so NewsCard and NewsArticle need no editor-specific branch.
   *
   * Signed URLs are rebuilt from the image directory rather than reused from
   * the saved post, so art dropped a moment ago previews immediately instead
   * of waiting for a save-and-refetch.
   */
  const draftPost = useMemo(() => {
    if (!post) return null

    const signed = (key) => (key ? imageUrlByKey[key] : null)

    // In-content images: the working doc holds keys, so the preview needs a
    // URL for each one, including images inserted since the last save.
    const imageUrls = { ...post.image_urls }
    for (const [key, url] of Object.entries(imageUrlByKey)) {
      imageUrls[key] = url
    }

    return {
      ...post,
      title,
      author_name: authorName,
      doc: doc || post.doc,
      ...banners,
      banner_urls: {
        home_top: signed(banners.banner_home_top),
        home_bottom: signed(banners.banner_home_bottom),
        article_top: signed(banners.banner_article_top),
        article_bottom: signed(banners.banner_article_bottom),
      },
      image_urls: imageUrls,
    }
  }, [post, title, authorName, doc, banners, imageUrlByKey])

  /**
   * Report the outcome of a write.
   *
   * A silent failure is the thing worth preventing: without this, a save that
   * 500s looks exactly like one that worked, and the author walks away
   * believing their edit is safe. Success clears itself after a moment;
   * failure stays until the next attempt, because it is still true.
   */
  const reportOutcome = {
    onSuccess: () => {
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), SAVE_CONFIRMATION_MS)
    },
    onError: () => setSaveState('failed'),
  }

  /** Everything the editor is currently holding, as the API takes it. */
  const draftPayload = () => ({
    title,
    author_name: authorName,
    doc: doc || post.doc,
    ...banners,
  })

  const handleSave = () => {
    setSaveState('idle')
    updatePost.mutate({ postId, payload: draftPayload() }, reportOutcome)
  }

  /**
   * Publish (or unpublish) what is on screen.
   *
   * The save is not optional. Publishing used to send only the flag, so an
   * author who edited and then hit PUBLISH shipped the PREVIOUS version to
   * every reader while the UI reported success and went on showing the edits
   * that never left the browser. Chained rather than parallel: publishing
   * content that failed to save would be the same bug again.
   */
  const handlePublish = () => {
    setSaveState('idle')
    updatePost.mutate(
      { postId, payload: draftPayload() },
      {
        onSuccess: () =>
          publishPost.mutate({ postId, published: !post.published }, reportOutcome),
        onError: () => setSaveState('failed'),
      }
    )
  }

  /**
   * Follow an image that moved between scopes.
   *
   * The server rewrote every reference it had stored, but the working document
   * lives here in local state and the seeding effect deliberately ignores
   * same-id refetches so a background update cannot clobber unsaved edits.
   * Without this, the editor would keep the dead key — the preview would break
   * and the next save would write it back over the server's correction.
   */
  const handleImageMoved = ({ oldKey, newKey, newUrl }) => {
    const followedDoc = replaceImageKey(doc || post.doc, oldKey, newKey)

    setDoc(followedDoc)
    setBanners((current) => {
      const followed = {}
      for (const [slot, key] of Object.entries(current)) {
        followed[slot] = key === oldKey ? newKey : key
      }
      return followed
    })

    // The editor's own content has to be corrected too, not just this state:
    // its DOM still holds a signed URL for the object the move deleted, and
    // the next keystroke would read that back through toStorageDoc and put
    // the dead key straight into the document again.
    //
    // The URL comes from the move response rather than the image lookup,
    // which has not refetched yet — signing it server-side is what makes the
    // picture survive the move without a visible reload.
    editor?.commands.setContent(
      resolveImageUrls(followedDoc, { ...imageUrlByKey, [newKey]: newUrl })
    )
  }

  const handleDelete = () => {
    deletePost.mutate(postId, { onSuccess: () => router.push('/news/editor') })
  }

  const insertImage = (key) => {
    // Insert the signed URL so the image is visible while writing; onUpdate
    // converts it back to its key, so only the key is ever persisted.
    const src = imageUrlByKey[key] || key
    editor?.chain().focus().setImage({ src }).run()
  }

  /**
   * Place an image chosen in the picker.
   *
   * The picker hands over both the key and a signed URL: the URL renders now,
   * and onUpdate converts it back to the key before anything is saved.
   */
  const placeImage = ({ key, url }) => {
    editor?.chain().focus().setImage({ src: url || key }).run()
  }

  /**
   * Describe the selected image.
   *
   * An empty string is stored rather than dropped: `alt=""` is the explicit
   * marker for decoration, and it means something different to a screen reader
   * than an absent attribute.
   */
  const applyAltText = (alt) => {
    editor?.chain().focus().updateAttributes('image', { alt }).run()
  }

  /**
   * Apply a link to the selection.
   *
   * Returns whether it took: the schema rejects anything that is not a web or
   * mail address, and the modal reports that rather than deciding for itself
   * what counts as valid.
   */
  /**
   * Start a link command against the right range.
   *
   * With a real selection, act on EXACTLY that — unlinking a trailing space
   * must unlink the space, not the sentence it follows. Only when the
   * selection is collapsed (a bare cursor sitting inside a link) is there
   * nothing to act on, and widening to the whole link becomes the sole
   * sensible reading.
   *
   * TipTap's own commands already behave correctly on a selection;
   * extendMarkRange is an opt-in override, so it is applied only where it is
   * actually needed rather than on every call.
   */
  const linkCommandChain = () => {
    const chain = editor.chain().focus()
    return editor.state.selection.empty ? chain.extendMarkRange('link') : chain
  }

  const applyLink = (url) => {
    if (!editor) return false

    linkCommandChain().setLink({ href: url }).run()
    return editor.isActive('link')
  }

  const removeLink = () => {
    if (!editor) return

    linkCommandChain().unsetLink().run()
  }

  const bannerSlotKey = (position, surface) => `banner_${surface}_${position}`

  const setBanner = (position, surface, key) =>
    setBanners((current) => ({ ...current, [bannerSlotKey(position, surface)]: key }))

  if (authLoading || isLoading) return null

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

  if (!post) {
    return (
      <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-16">
          <p className="text-[14px]" style={{ color: '#6B6459' }}>
            That post no longer exists.
          </p>
        </div>
      </main>
    )
  }

  const topKey = banners[bannerSlotKey('top', topSurface)]
  const bottomKey = banners[bannerSlotKey('bottom', bottomSurface)]
  const savedUrls = post.banner_urls || {}

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-8">
        {/* Tool row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push('/news/editor')}
              className="text-[12px] font-semibold tracking-wider"
              style={{ color: GOLD_INK }}
            >
              ‹ ALL POSTS
            </button>
            <span
              className="rounded px-2 py-[3px] text-[9.5px] font-bold tracking-[0.1em]"
              style={
                post.published
                  ? { transform: SKEW_BOX, backgroundColor: COLORS.gold, color: '#241C08' }
                  : { transform: SKEW_BOX, border: '1px solid #8A8378', color: '#6B6459' }
              }
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                {post.published ? 'PUBLISHED' : 'DRAFT'}
              </span>
            </span>
          </div>
  
          <div className="flex items-center gap-3">
            <SaveStatus
              pending={updatePost.isPending || publishPost.isPending}
              state={saveState}
            />
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-4 py-3 text-[12px] font-semibold tracking-wider"
              style={{ transform: SKEW_BOX, border: '1px solid rgba(31,31,31,0.28)', color: '#6B6459' }}
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>DELETE</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updatePost.isPending}
              className="rounded-lg px-[22px] py-3 text-[13px] font-semibold tracking-wider disabled:opacity-50"
              style={{ transform: SKEW_BOX, background: 'rgba(31,31,31,0.05)', border: '1px solid rgba(31,31,31,0.28)', color: '#37322F' }}
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                {updatePost.isPending ? 'SAVING…' : post.published ? 'SAVE ARTICLE' : 'SAVE DRAFT'}
              </span>
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishPost.isPending || updatePost.isPending}
              className="rounded-lg px-[22px] py-3 text-[13px] font-semibold tracking-wider disabled:opacity-50"
              style={{ transform: SKEW_BOX, backgroundColor: COLORS.gold, color: '#241C08' }}
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                {post.published ? 'UNPUBLISH' : 'PUBLISH'}
              </span>
            </button>
          </div>
        </div>
  
        {/* Title block — the fields you edit; the article renders its own header */}
        <div className="mt-6 mb-5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            className="w-full bg-transparent pt-1 pb-3 text-[34px] font-[family-name:var(--font-metamorphous)] focus:outline-none"
            style={{ color: INK, borderBottom: '1px solid rgba(55,50,47,0.25)' }}
            placeholder="Post title"
          />
          <div className="mt-2.5 text-[13px]" style={{ color: '#6B6459' }}>
            by{' '}
            <input
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              maxLength={80}
              className="bg-transparent font-semibold focus:outline-none"
              style={{ color: '#37322F', borderBottom: `1px dashed ${GOLD_INK}` }}
              placeholder="Author"
            />
          </div>
        </div>
  
        {/* Tabs */}
        <div className="mb-6 flex gap-2.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`news-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
  
        {activeTab === 'edit' && (
          <div className="flex items-start gap-6">
            <section
              className="flex-1 rounded-xl px-6 py-5"
              style={{ backgroundColor: PARCHMENT, border: `1px solid ${PARCHMENT_BORDER}` }}
            >
              <NewsBannerSlot
                label="TOP BANNER"
                surface={topSurface}
                onSurfaceChange={setTopSurface}
                imageUrl={topKey ? imageUrlByKey[topKey] || savedUrls[`${topSurface}_top`] : null}
                onSet={(key) => setBanner('top', topSurface, key)}
                onClear={() => setBanner('top', topSurface, null)}
              />
  
              <NewsEditorToolbar
              editor={editor}
              onPickImage={() => setImagePickerOpen(true)}
              onEditLink={() => setLinkModalOpen(true)}
              onEditAltText={() => setAltModalOpen(true)}
            />
  
              <div className="px-2 pt-5 pb-6">
                <EditorContent editor={editor} />
              </div>
  
              <NewsBannerSlot
                label="BOTTOM BANNER"
                surface={bottomSurface}
                onSurfaceChange={setBottomSurface}
                imageUrl={bottomKey ? imageUrlByKey[bottomKey] || savedUrls[`${bottomSurface}_bottom`] : null}
                onSet={(key) => setBanner('bottom', bottomSurface, key)}
                onClear={() => setBanner('bottom', bottomSurface, null)}
              />
            </section>
  
            <NewsImageRail postId={postId} onInsert={insertImage} onMoved={handleImageMoved} />

            <NewsImagePicker
              open={imagePickerOpen}
              onClose={() => setImagePickerOpen(false)}
              postId={postId}
              onSelect={placeImage}
              onMoved={handleImageMoved}
            />

            <NewsAltTextModal
              open={altModalOpen}
              initialAlt={editor?.getAttributes('image').alt || ''}
              onClose={() => setAltModalOpen(false)}
              onSubmit={applyAltText}
            />

            <NewsLinkModal
              open={linkModalOpen}
              initialUrl={editor?.getAttributes('link').href || ''}
              onClose={() => setLinkModalOpen(false)}
              onSubmit={applyLink}
              onRemove={removeLink}
            />
          </div>
        )}
  
        {activeTab === 'card' && (
          <div className="pb-16">
            <p className="mx-auto mb-4 max-w-[540px] text-right text-[11.5px]" style={{ color: '#8A8378' }}>
              as the card renders on Home
            </p>
            <div className="mx-auto max-w-[540px]">
              <div className="mb-2.5 flex items-baseline px-0.5">
                <h3
                  className="text-[11.5px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: GOLD_INK }}
                >
                  Updates
                </h3>
              </div>
              <NewsCard post={draftPost} interactive={false} />
            </div>
          </div>
        )}
  
        {activeTab === 'article' && (
          <div className="pb-16">
            <p className="mx-auto mb-4 max-w-[760px] text-right text-[11.5px]" style={{ color: '#8A8378' }}>
              as the full article renders
            </p>
            <NewsArticle post={draftPost} interactive={false} />
          </div>
        )}
      </div>
    </main>
  )
}

/**
 * What happened to the last write.
 *
 * Wording follows the notes editor's vocabulary so save states read the same
 * across the app, adapted for a manual save: there is no "unsaved changes"
 * here because the author decides when to write.
 */
function SaveStatus({ pending, state }) {
  if (pending) {
    return <StatusText color="#6B6459">Saving…</StatusText>
  }

  if (state === 'saved') {
    return <StatusText color="#4C7A4C">Saved</StatusText>
  }

  if (state === 'failed') {
    return <StatusText color="#B03030">Could not save — try again</StatusText>
  }

  return null
}

function StatusText({ color, children }) {
  return (
    <span className="text-[12px] font-semibold" style={{ color }}>
      {children}
    </span>
  )
}
