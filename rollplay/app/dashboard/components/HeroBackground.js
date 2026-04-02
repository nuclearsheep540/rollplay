/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react'
import { useHeroImage } from '@/app/dashboard/hooks/useHeroImage'

/**
 * A div that renders a campaign's hero image as a CSS background.
 * Routes S3-backed hero images through AssetDownloadManager for blob caching.
 * Falls back to preset paths or a default image for legacy campaigns.
 *
 * Usage: <HeroBackground campaign={campaign} fallback="/campaign-tile-bg.png" className="..." style={{...}}>
 */
const HeroBackground = React.forwardRef(({ campaign, fallback, className, style, children, ...props }, ref) => {
  const { url, ready } = useHeroImage(campaign)
  const bgUrl = ready && url ? url : (fallback || null)

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        backgroundImage: bgUrl ? `url(${bgUrl})` : 'none',
        backgroundColor: bgUrl ? 'transparent' : style?.backgroundColor,
        backgroundSize: style?.backgroundSize || 'cover',
        backgroundPosition: style?.backgroundPosition || 'center',
      }}
      {...props}
    >
      {children}
    </div>
  )
})

HeroBackground.displayName = 'HeroBackground'
export default HeroBackground
