/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useAssets } from '@/app/asset_library/hooks/useAssets';
import { useUploadAsset } from '@/app/asset_library/hooks/useUploadAsset';
import { useAssociateAsset } from '@/app/asset_library/hooks/useAssociateAsset';
import { ChannelType } from '../types';

const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Inline audio selection section for a single channel.
 * Follows the MapSelectionSection pattern with Upload + Library sub-sections.
 */
export default function AudioSelectionModal({
  isOpen,
  onClose,
  onSelectAsset,
  channelId,
  channelType,
  campaignId,
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef(null);

  // Map channel type to asset type
  const assetType = channelType === ChannelType.BGM ? 'music' : 'sfx';

  // Campaign-scoped audio query
  const {
    data: campaignAssets = [],
    isLoading: campaignLoading,
    error: campaignError,
  } = useAssets({
    assetType,
    campaignId,
    enabled: isOpen && !!campaignId,
  });

  // Full library query — only when library panel is open
  const {
    data: allAssets = [],
    isLoading: libraryLoading,
    error: libraryQueryError,
  } = useAssets({
    assetType,
    enabled: showLibrary,
  });

  // Filter library to exclude assets already in campaign
  const libraryAssets = useMemo(() => {
    const campaignAssetIds = new Set(campaignAssets.map(a => a.id));
    return allAssets.filter(a => !campaignAssetIds.has(a.id));
  }, [allAssets, campaignAssets]);

  const uploadMutation = useUploadAsset();
  const associateMutation = useAssociateAsset();

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
    if (!ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      return 'Invalid file type. Accepted: .mp3, .wav, .ogg';
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
      const result = await uploadMutation.mutateAsync({
        file: selectedFile,
        assetType,
        campaignId,
      });
      setSelectedFile(null);
      setShowUpload(false);
      // Auto-select the uploaded asset for this channel
      if (result) {
        onSelectAsset(channelId, result);
        onClose();
      }
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const handleAssetSelect = (asset) => {
    onSelectAsset(channelId, asset);
    onClose();
  };

  if (!isOpen) return null;

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
        <button
          onClick={onClose}
          className="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
        >
          Cancel
        </button>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <div className="mb-3 p-3 bg-gray-700/50 rounded border border-gray-600">
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
              accept={ACCEPTED_AUDIO_TYPES.join(',')}
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
                <p className="text-gray-500 text-xs">MP3, WAV, OGG (max 50MB)</p>
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
        <div className="mb-3 p-3 bg-gray-700/50 rounded border border-gray-600">
          <p className="text-xs text-gray-400 mb-2">
            {assetType === 'music' ? 'Music' : 'Sound effects'} not linked to this campaign
          </p>

          {libraryLoading && (
            <div className="text-center py-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500 mx-auto"></div>
            </div>
          )}

          {libraryError && <p className="text-red-400 text-xs">{libraryError}</p>}

          {!libraryLoading && !libraryError && libraryAssets.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-2">No additional {assetType} assets in library</p>
          )}

          {!libraryLoading && !libraryError && libraryAssets.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {libraryAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 p-2 rounded border border-gray-600 hover:border-gray-500">
                  <span className="text-gray-400 text-sm flex-shrink-0">
                    {assetType === 'music' ? '🎵' : '🔊'}
                  </span>
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

      {/* Campaign Assets — select for this channel */}
      {campaignLoading && (
        <div className="text-center py-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500 mx-auto"></div>
        </div>
      )}

      {campaignError && <p className="text-red-400 text-xs mb-2">{campaignError.message}</p>}

      {!campaignLoading && !campaignError?.message && campaignAssets.length === 0 && (
        <p className="text-gray-500 text-xs">No {assetType} assets in campaign. Upload or add from library.</p>
      )}

      {!campaignLoading && !campaignError?.message && campaignAssets.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400 mb-1">Campaign {assetType === 'music' ? 'music' : 'sound effects'}</p>
          {campaignAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => handleAssetSelect(asset)}
              className="flex items-center gap-2 p-2 rounded border border-gray-600 hover:border-sky-500 hover:bg-sky-900/10 cursor-pointer"
            >
              <span className="text-gray-400 text-sm flex-shrink-0">
                {assetType === 'music' ? '🎵' : '🔊'}
              </span>
              <p className="flex-1 text-xs text-gray-200 truncate">{asset.filename}</p>
              <span className="text-xs text-gray-500">Select</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
