/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faFlag, faBolt, faFolder, faPlus } from '@fortawesome/free-solid-svg-icons'
import { TYPE_SWATCH_CLASSES } from './AssetFilterBar'

const TYPE_ITEMS = [
  { id: 'map', label: 'Maps' },
  { id: 'music', label: 'Music' },
  { id: 'sfx', label: 'SFX' },
  { id: 'image', label: 'Images' },
]

function RailItem({ active, onClick, icon, swatchClass, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors ${
        active
          ? 'bg-surface-hover text-content-on-dark'
          : 'text-content-secondary hover:bg-surface-hover hover:text-content-on-dark'
      }`}
    >
      {icon || <span className={`h-1.5 w-1.5 shrink-0 rounded-[2px] ${swatchClass || 'bg-border'}`} />}
      <span className="truncate">{label}</span>
      {(count || count === 0) && (
        <span className="ml-auto text-xs tabular-nums text-content-secondary/80">{count}</span>
      )}
    </button>
  )
}

function RailLabel({ children, icon }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-content-on-dark">
      {icon && <FontAwesomeIcon icon={icon} className="text-[9px]" />}
      {children}
    </div>
  )
}

function RailSeparator() {
  return <div className="mx-2 my-2 h-px shrink-0 bg-border-subtle" />
}

function RailNewButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="mx-0.5 mt-1 flex items-center gap-2 rounded-sm border border-dashed border-content-secondary/30 px-2.5 py-1.5 text-left text-xs text-content-secondary transition-colors hover:border-content-secondary/60 hover:text-content-on-dark"
    >
      <FontAwesomeIcon icon={faPlus} className="text-[9px]" />
      {children}
    </button>
  )
}

/**
 * Library navigation rail - type shortcuts, favorites, and the user's
 * campaigns. Sections are separated per the design contract; smart
 * collections and manual collections join in the collections PR.
 */
export default function LibraryRail({
  context,
  onNavigate,
  totalCount,
  typeCounts = {},
  favoriteCount,
  campaigns = [],
  campaignCounts = {},
  smartCollections = [],
  manualCollections = [],
  onNewSmartCollection,
  onNewCollection,
}) {
  const isActive = (kind, id = null) => context.kind === kind && context.id === id

  return (
    <aside
      aria-label="Library navigation"
      className="flex w-72 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border-subtle bg-surface-elevated p-3"
    >
      <RailLabel>Library</RailLabel>
      <RailItem
        active={isActive('all')}
        onClick={() => onNavigate('all')}
        label="All Assets"
        count={totalCount}
      />
      {TYPE_ITEMS.map((type) => (
        <RailItem
          key={type.id}
          active={isActive('type', type.id)}
          onClick={() => onNavigate('type', type.id)}
          swatchClass={TYPE_SWATCH_CLASSES[type.id]}
          label={type.label}
          count={typeCounts[type.id] || 0}
        />
      ))}

      <RailSeparator />

      <RailItem
        active={isActive('favorites')}
        onClick={() => onNavigate('favorites')}
        icon={<FontAwesomeIcon icon={faStar} className="text-[10px] text-favorite" />}
        label="Favorites"
        count={favoriteCount}
      />

      {campaigns.length > 0 && (
        <>
          <RailSeparator />
          <RailLabel icon={faFlag}>Campaigns</RailLabel>
          {campaigns.map((campaign) => (
            <RailItem
              key={campaign.id}
              active={isActive('campaign', campaign.id)}
              onClick={() => onNavigate('campaign', campaign.id)}
              icon={<span className="w-1.5 shrink-0" />}
              label={campaign.title}
              count={campaignCounts[campaign.id] || 0}
            />
          ))}
        </>
      )}

      <RailSeparator />
      <RailLabel icon={faBolt}>Smart Collections</RailLabel>
      {smartCollections.map((collection) => (
        <RailItem
          key={collection.id}
          active={isActive('smart', collection.id)}
          onClick={() => onNavigate('smart', collection.id)}
          icon={<span className="w-1.5 shrink-0" />}
          label={collection.name}
          count={collection.count}
        />
      ))}
      <RailNewButton onClick={onNewSmartCollection}>New Smart Collection</RailNewButton>

      <RailLabel icon={faFolder}>Collections</RailLabel>
      {manualCollections.map((collection) => (
        <RailItem
          key={collection.id}
          active={isActive('collection', collection.id)}
          onClick={() => onNavigate('collection', collection.id)}
          icon={<span className="w-1.5 shrink-0" />}
          label={collection.name}
          count={collection.count}
        />
      ))}
      <RailNewButton onClick={onNewCollection}>New Collection</RailNewButton>
    </aside>
  )
}
