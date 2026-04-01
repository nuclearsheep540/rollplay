/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';
import { useAssetDownload } from '@/app/shared/providers/AssetDownloadManager';

/**
 * Drop-in replacement for <img> that downloads through the AssetDownloadManager.
 * Provides progressive byte tracking and blob caching for S3 assets.
 *
 * Usage: <S3Image src={asset.s3_url} fileSize={asset.file_size} alt="" className="..." />
 */
const S3Image = React.forwardRef(({ src, fileSize, alt = '', ...props }, ref) => {
  const { blobUrl, ready } = useAssetDownload(src, fileSize);

  return (
    <img
      ref={ref}
      src={ready ? blobUrl : undefined}
      alt={alt}
      {...props}
    />
  );
});

S3Image.displayName = 'S3Image';
export default S3Image;
