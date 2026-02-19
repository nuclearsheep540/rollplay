/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useAssets } from '@/app/asset_library/hooks/useAssets';
import { useUploadAsset } from '@/app/asset_library/hooks/useUploadAsset';
import { useAssociateAsset } from '@/app/asset_library/hooks/useAssociateAsset';
import { DM_CHILD, DM_CHILD_LAST, PANEL_SUBTITLE, ACTIVE_BACKGROUND } from '../../styles/constants';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Inline collapsible image selection section for DM Control Center.
 * Follows MapSelectionSection pattern but filtered to IMAGE asset type.
 */
export default function ImageSelectionSection({
  isExpanded,
  onSelectImage,
  roomId,
  campaignId,
  currentImage
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef(null);

  // Campaign-scoped images query
  const {
    data: assets = [],
    isLoading: loading,
    error: assetsError,
  } = useAssets({
    assetType: 'image',
    campaignId,
    enabled: isExpanded && !!campaignId,
  });

  // Full library images query
  const {
    data: allImages = [],
    isLoading: libraryLoading,
    error: libraryQueryError,
  } = useAssets({
    assetType: 'image',
    enabled: showLibrary,
  });

  // Filter library to show only images NOT already in this campaign
  const libraryAssets = useMemo(() => {
    const campaignAssetIds = new Set(assets.map(a => a.id));
    return allImages.filter(a => !campaignAssetIds.has(a.id));
  }, [allImages, assets]);

  const uploadMutation = useUploadAsset();
  const associateMutation = useAssociateAsset();

  const error = assetsError?.message || null;
  const libraryError = libraryQueryError?.message || associateMutation.error?.message || null;

  const handleAssociateAsset = async (asset) => {
    if (!campaignId || associateMutation.isPending) return;

    try {
      await associateMutation.mutateAsync({ assetId: asset.id, campaignId });
      setShowLibrary(false);
    } catch {
      // Error available via associateMutation.error
    }
  };

  const validateFile = useCallback((file) => {
    if (!file) return 'No file selected';
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Invalid file type. Accepted: .png, .jpg, .jpeg, .webp, .gif';
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      setSelectedFile(null);
    } else {
      setUploadError(null);
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleUpload = async () => {
    if (!selectedFile || !campaignId) return;

    try {
      setUploadError(null);
      await uploadMutation.mutateAsync({
        file: selectedFile,
        assetType: 'image',
        campaignId,
      });
      setSelectedFile(null);
      setShowUpload(false);
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const handleImageSelect = (asset) => {
    const imageSettings = {
      room_id: roomId,
      asset_id: asset.id,
      filename: asset.filename,
      original_filename: asset.filename,
      file_path: asset.s3_url,
      uploaded_by: "dm"
    };
    onSelectImage(imageSettings);
  };

  if (!isExpanded) return null;

  return (
    <div className="mt-2 p-3 bg-gray-800/50 rounded border border-gray-600">
      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => { setShowUpload(!showUpload); setShowLibrary(false); }}
          className={`px-3 py-1.5 rounded text-xs transition-colors ${
            showUpload ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Upload
        </button>
        <button
          onClick={() => { setShowLibrary(!showLibrary); setShowUpload(false); }}
          className={`px-3 py-1.5 rounded text-xs transition-colors ${
            showLibrary ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Library
        </button>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded border border-gray-600">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition-all ${
              dragActive ? 'border-sky-500 bg-sky-500/10'
                : selectedFile ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-gray-500 hover:border-gray-400'
            } ${uploadMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="hidden"
              disabled={uploadMutation.isPending}
            />
            {selectedFile ? (
              <div>
                <p className="text-gray-200 text-sm truncate">{selectedFile.name}</p>
                <p className="text-gray-500 text-xs">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 text-sm">Drop or click to browse</p>
                <p className="text-gray-500 text-xs">PNG, JPG, WebP, GIF (max 50MB)</p>
              </div>
            )}
          </div>

          {uploadMutation.isPending && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 transition-all" style={{ width: `${uploadMutation.progress}%` }} />
              </div>
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-red-400 text-xs">{uploadError}</p>
          )}

          {selectedFile && !uploadMutation.isPending && (
            <button onClick={handleUpload} className="mt-2 w-full px-3 py-1.5 bg-sky-600 text-white text-sm rounded hover:bg-sky-500">
              Upload
            </button>
          )}
        </div>
      )}

      {/* Library Section */}
      {showLibrary && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded border border-gray-600">
          <p className="text-xs text-gray-400 mb-2">Images not linked to this campaign</p>

          {libraryLoading && (
            <div className="text-center py-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500 mx-auto"></div>
            </div>
          )}

          {libraryError && <p className="text-red-400 text-xs">{libraryError}</p>}

          {!libraryLoading && !libraryError && libraryAssets.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-2">No additional images in library</p>
          )}

          {!libraryLoading && !libraryError && libraryAssets.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {libraryAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 p-2 rounded border border-gray-600 hover:border-gray-500">
                  <div className="w-10 h-10 flex-shrink-0 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                    {asset.s3_url ? (
                      <img src={asset.s3_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-500 text-xs">IMG</span>
                    )}
                  </div>
                  <p className="flex-1 text-xs text-gray-300 truncate">{asset.filename}</p>
                  <button
                    onClick={() => handleAssociateAsset(asset)}
                    disabled={associateMutation.isPending}
                    className="px-2 py-1 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50"
                  >
                    {associateMutation.isPending ? '...' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500 mx-auto"></div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      {/* Empty state */}
      {!loading && !error && assets.length === 0 && (
        <p className="text-gray-500 text-xs">No images available. Upload or add from library.</p>
      )}

      {/* Asset List */}
      {!loading && !error && assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((asset) => {
            const isActive = currentImage?.asset_id === asset.id || currentImage?.filename === asset.filename;
            const hasUrl = !!asset.s3_url;
            return (
              <div
                key={asset.id}
                onClick={() => hasUrl && handleImageSelect(asset)}
                className={`flex items-center gap-2 p-2 rounded border transition-all ${
                  !hasUrl
                    ? 'border-gray-700 opacity-50 cursor-not-allowed'
                    : isActive
                    ? 'border-green-500 bg-green-900/20 cursor-pointer'
                    : 'border-gray-600 hover:border-sky-500 hover:bg-sky-900/10 cursor-pointer'
                }`}
              >
                <div className="w-10 h-10 flex-shrink-0 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                  {asset.s3_url ? (
                    <img src={asset.s3_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-500 text-xs">IMG</span>
                  )}
                </div>
                <p className="flex-1 text-xs text-gray-200 truncate">{asset.filename}</p>
                {isActive && <span className="text-green-400 text-xs">Active</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
