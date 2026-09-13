/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useState } from 'react'

import S3Image from '@/app/shared/components/S3Image'
import { useAssets } from '@/app/asset_library/hooks/useAssets'
import { useUploadAsset } from '@/app/asset_library/hooks/useUploadAsset'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { platePolygon, TEXT_SHADOW_ON_ART } from '@/app/styles/plateGeometry'

const CARD_BACKGROUNDS = [
  { value: '/campaign-tile-bg.png', label: 'Mountains' },
  { value: '/floating-city.png', label: 'Floating City' },
  { value: '/barren-land.png', label: 'Barren' },
  { value: '/underworld.png', label: 'Underworld' },
  { value: null, label: 'None' },
]

// The plate's backdrop is two things. The base — black to navy — is always there. The
// highlights — the brown-gold at top right and the navy bloom — are what the plate shows
// when there is no image, and are exactly what a chosen image replaces: it sits where they
// sat, over the same base, so picking a background reads as a swap rather than a cover.
const HERO_BASE = 'linear-gradient(115deg,#0A0D16 20%,#131B2E 55%,#0C1020 100%)'
const HERO_HIGHLIGHTS =
  'radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107,74,46,0) 34%), ' +
  'radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36,52,79,0) 55%)'
// The overlay on a chosen image is the base's own geometry — same 115° run, same three
// stops — with the colour turned into alpha. Dark and solid through the top-left fifth
// where the text sits, easing off along the diagonal so the image emerges on the right
// exactly where the highlights used to be. If art ever makes the description hard to
// read, raise the middle stop's alpha; do not change the angle, or the plate stops looking
// like the same object with and without an image.
const HERO_SCRIM =
  'linear-gradient(115deg, rgba(10,13,22,0.94) 20%, rgba(19,27,46,0.55) 55%, rgba(12,16,32,0.18) 100%)'

/**
 * The campaign's front page: what it is, and the few settings that shape every game at it.
 *
 * Everything here is persisted. The mock also drew an opening read-aloud, a cast list, key
 * locations and a secrets panel; those were cut rather than shipped unplumbed, because the
 * page autosaves and a box that quietly forgets what you typed is worse in a page that
 * saves itself than in one that never did. They come back with a column to live in
 * (08-followups).
 */
export default function OverviewSection({ tabKey, fields, onFieldChange }) {
  const [activeSection, setActiveSection] = useState('story')
  const sectionRefs = useRef({})
  const fileInputRef = useRef(null)
  const { user, showToast } = useAuthenticated()

  // The user's image library: the "from library" row, and the source of the preview when
  // the chosen background is one of them (the campaign response carries the asset's id;
  // this list carries its URL).
  const { data: libraryImages = [] } = useAssets({ assetType: 'image', enabled: !!user?.id })
  const selectedLibraryAsset = fields.heroImageAssetId
    ? libraryImages.find((asset) => asset.id === fields.heroImageAssetId) || null
    : null

  const uploadAsset = useUploadAsset()
  const onUploadChosen = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const asset = await uploadAsset.mutateAsync({ file, assetType: 'image' })
      onFieldChange({ heroImage: null, heroImageAssetId: asset.id })
    } catch (failure) {
      showToast(failure.message || 'Could not upload that image', 'error')
    }
  }

  const sections =
    tabKey === 'setup'
      ? [{ key: 'table', label: 'The table' }, { key: 'ruleset', label: 'Ruleset' }]
      : [
          { key: 'story', label: 'The campaign' },
          { key: 'table', label: 'The table' },
          { key: 'ruleset', label: 'Ruleset' },
        ]

  useEffect(() => {
    const onScroll = () => {
      const entries = sections
        .map((section) => [section.key, sectionRefs.current[section.key]?.getBoundingClientRect().top ?? Infinity])
        .filter(([, top]) => top !== Infinity)
      const nearest = entries.reduce((best, entry) => (Math.abs(entry[1] - 120) < Math.abs(best[1] - 120) ? entry : best), entries[0])
      if (nearest) setActiveSection(nearest[0])
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [sections])

  const register = (key) => (element) => {
    sectionRefs.current[key] = element
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-[26px] items-start">
      <div className="flex flex-col gap-6">
        {tabKey !== 'setup' && (
          <>
            <div
              ref={register('story')}
              className="relative overflow-hidden rounded-md"
              style={{ background: HERO_BASE, clipPath: platePolygon() }}
            >
              {/* Art layer: the chosen image, or the gradient highlights when there is none. */}
              {selectedLibraryAsset ? (
                <S3Image
                  src={selectedLibraryAsset.s3_url}
                  fileSize={selectedLibraryAsset.file_size}
                  assetId={selectedLibraryAsset.id}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : fields.heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fields.heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: HERO_HIGHLIGHTS }} />
              )}
              {(selectedLibraryAsset || fields.heroImage) && (
                <div className="absolute inset-0" style={{ background: HERO_SCRIM }} />
              )}

              <div className="relative px-10 py-8">
                <input
                  className="w-full bg-transparent border-0 border-b border-dashed border-[rgba(247,244,243,0.35)] pb-2 font-[family-name:var(--font-metamorphous)] text-[44px] text-[#F7F4F3] outline-none placeholder:text-[rgba(247,244,243,0.4)]"
                  style={{ textShadow: TEXT_SHADOW_ON_ART }}
                  maxLength={100}
                  placeholder="Name your campaign"
                  value={fields.title}
                  onChange={(event) => onFieldChange({ title: event.target.value })}
                />
                <textarea
                  className="mt-5 w-full bg-transparent border border-dashed border-[rgba(247,244,243,0.28)] rounded p-3 text-[13.5px] leading-relaxed text-[#CFC9C2] outline-none resize-none placeholder:text-[rgba(207,201,194,0.45)]"
                  rows={5}
                  maxLength={1000}
                  placeholder="What is this campaign about?"
                  value={fields.description}
                  onChange={(event) => onFieldChange({ description: event.target.value })}
                />

                {/* The card background is part of what the campaign looks like, so it lives
                    with the name and the description rather than with the game settings. */}
                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D9A441] mb-2.5">
                    Card background
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {CARD_BACKGROUNDS.map((preset) => {
                      const selected = !fields.heroImageAssetId && fields.heroImage === preset.value
                      return (
                        <BackgroundTile
                          key={preset.label}
                          selected={selected}
                          title={preset.label}
                          onClick={() => onFieldChange({ heroImage: preset.value, heroImageAssetId: null })}
                        >
                          {preset.value ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preset.value} alt={preset.label} className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[11px] text-[#CFC9C2]">None</span>
                          )}
                        </BackgroundTile>
                      )
                    })}

                    {/* Upload: one file, the library's own presigned flow, then selected. */}
                    <BackgroundTile
                      title={uploadAsset.isPending ? `Uploading… ${uploadAsset.progress}%` : 'Upload an image to your library'}
                      onClick={() => !uploadAsset.isPending && fileInputRef.current?.click()}
                      dashed
                    >
                      <span className="flex h-full items-center justify-center text-[11px] text-[#CFC9C2]">
                        {uploadAsset.isPending ? `${uploadAsset.progress}%` : '+ Upload'}
                      </span>
                    </BackgroundTile>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onUploadChosen}
                    />
                  </div>

                  {libraryImages.length > 0 && (
                    <>
                      <div className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(217,164,65,0.75)]">
                        From your library
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {libraryImages.map((asset) => (
                          <BackgroundTile
                            key={asset.id}
                            selected={fields.heroImageAssetId === asset.id}
                            title={asset.filename}
                            onClick={() => onFieldChange({ heroImage: null, heroImageAssetId: asset.id })}
                          >
                            <S3Image
                              src={asset.s3_url}
                              fileSize={asset.file_size}
                              assetId={asset.id}
                              alt={asset.filename}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          </BackgroundTile>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <PlainCard reference={register('table')} eyebrow="The table">
          <div className="flex flex-wrap gap-8 items-start">
            <div>
              <label className="block text-[13px] font-medium mb-2 text-[#37322F]">Maximum players</label>
              <select
                className="w-[120px] box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-sm"
                value={fields.maxPlayers}
                onChange={(event) => onFieldChange({ maxPlayers: Number(event.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
              <div className="mt-1.5 text-[12.5px] text-content-muted">Applies the next time the game starts.</div>
            </div>
          </div>
        </PlainCard>

        <PlainCard reference={register('ruleset')} eyebrow="Ruleset">
          <p className="text-[13px] text-[#37322F]">
            Characters in this campaign are built from the components you configure under Character.
          </p>
          <div className="mt-3.5 flex items-center justify-between rounded border border-[#E5DECF] px-4 py-3">
            <span className="text-[13px] text-content-muted">Framework preset — None. Start from scratch.</span>
            <button
              type="button"
              disabled
              title="Coming later"
              className="px-3 py-1.5 rounded border border-[#B5ADA6] text-[12px] text-content-muted opacity-60 cursor-not-allowed"
            >
              Choose
            </button>
          </div>
        </PlainCard>
      </div>

      <nav className="sticky top-6 border-l border-[#E5DECF] pl-[18px]">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-2.5">On this page</div>
        <ul className="flex flex-col gap-2">
          {sections.map((section) => (
            <li key={section.key}>
              <button
                type="button"
                onClick={() => sectionRefs.current[section.key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`text-left text-[13px] ${
                  activeSection === section.key ? 'font-semibold text-content-primary' : 'text-content-muted'
                }`}
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function BackgroundTile({ selected = false, dashed = false, title, onClick, children }) {
  const border = selected
    ? 'border-[#D9A441]'
    : dashed
      ? 'border-dashed border-[rgba(247,244,243,0.35)]'
      : 'border-[rgba(247,244,243,0.28)]'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-[104px] aspect-[16/9] rounded-sm overflow-hidden border-2 relative ${border}`}
    >
      {children}
    </button>
  )
}

function PlainCard({ reference, eyebrow, children }) {
  return (
    <div ref={reference} className="rounded-md border border-[#E5DECF] bg-white px-6 py-5">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-3.5">{eyebrow}</div>
      {children}
    </div>
  )
}
