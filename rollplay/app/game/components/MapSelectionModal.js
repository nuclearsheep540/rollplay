/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DM_CHILD, DM_CHILD_LAST, PANEL_SUBTITLE, ACTIVE_BACKGROUND } from '../../styles/constants';

const ACCEPTED_MAP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Inline collapsible map selection section for DM Control Center
 * Replaces the modal with an inline expandable section
 */
export default function MapSelectionSection({
  isExpanded,
  onSelectMap,
  roomId,
  campaignId,
  currentMap
}) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Add from Library state
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState(null);
  const [associating, setAssociating] = useState(null);

  // Fetch available assets when section expands
  const fetchAssets = useCallback(async () => {
    if (!campaignId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/library/?campaign_id=${campaignId}&asset_type=map`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch assets');
      }

      const data = await response.json();
      const mapAssets = (data.assets || []).filter(asset => asset.asset_type === 'map');
      setAssets(mapAssets);
    } catch (err) {
      console.error('Error fetching assets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (isExpanded && campaignId) {
      fetchAssets();
    }
  }, [isExpanded, campaignId, fetchAssets]);

  // Fetch user's full library
  const fetchLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);

    try {
      const response = await fetch(`/api/library/?asset_type=map`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch library');
      }

      const data = await response.json();
      const campaignAssetIds = new Set(assets.map(a => a.id));
      const libraryMaps = (data.assets || [])
        .filter(asset => asset.asset_type === 'map' && !campaignAssetIds.has(asset.id));
      setLibraryAssets(libraryMaps);
    } catch (err) {
      console.error('Error fetching library:', err);
      setLibraryError(err.message);
    } finally {
      setLibraryLoading(false);
    }
  }, [assets]);

  useEffect(() => {
    if (showLibrary) {
      fetchLibrary();
    }
  }, [showLibrary, fetchLibrary]);

  // Associate a library asset with the campaign
  const handleAssociateAsset = async (asset) => {
    if (!campaignId || associating) return;

    try {
      setAssociating(asset.id);

      const response = await fetch(`/api/library/${asset.id}/associate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ campaign_id: campaignId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to add to campaign');
      }

      await fetchAssets();
      setShowLibrary(false);
    } catch (err) {
      console.error('Error associating asset:', err);
      setLibraryError(err.message);
    } finally {
      setAssociating(null);
    }
  };

  // File validation
  const validateFile = useCallback((file) => {
    if (!file) return 'No file selected';
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    if (!ACCEPTED_MAP_TYPES.includes(file.type)) {
      return 'Invalid file type. Accepted: .png, .jpg, .jpeg, .webp';
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
      setUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      const uploadUrlParams = new URLSearchParams({
        filename: selectedFile.name,
        content_type: selectedFile.type,
        asset_type: 'map'
      });

      const uploadUrlResponse = await fetch(
        `/api/library/upload-url?${uploadUrlParams}`,
        { credentials: 'include' }
      );

      if (!uploadUrlResponse.ok) {
        const errorData = await uploadUrlResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get upload URL');
      }

      const { upload_url, key } = await uploadUrlResponse.json();
      setUploadProgress(20);

      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': selectedFile.type }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }
      setUploadProgress(70);

      const confirmResponse = await fetch(`/api/library/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          key,
          asset_type: 'map',
          file_size: selectedFile.size,
          campaign_id: campaignId
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to confirm upload');
      }

      setUploadProgress(100);
      setSelectedFile(null);
      setShowUpload(false);
      await fetchAssets();
    } catch (err) {
      console.error('Error uploading map:', err);
      setUploadError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleMapSelect = (asset) => {
    const mapSettings = {
      room_id: roomId,
      asset_id: asset.id,
      filename: asset.filename,
      original_filename: asset.filename,
      file_path: asset.s3_url,
      uploaded_by: "dm"
    };
    onSelectMap(mapSettings);
  };

  if (!isExpanded) return null;

  return (
    <div className="ml-4 mb-4">
      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => { setShowUpload(!showUpload); setShowLibrary(false); }}
          className={`px-3 py-1.5 rounded text-xs transition-colors ${
            showUpload ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📤 {showUpload ? 'Hide' : 'Upload'}
        </button>
        <button
          onClick={() => { setShowLibrary(!showLibrary); setShowUpload(false); }}
          className={`px-3 py-1.5 rounded text-xs transition-colors ${
            showLibrary ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📚 {showLibrary ? 'Hide' : 'Library'}
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
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition-all ${
              dragActive ? 'border-sky-500 bg-sky-500/10'
                : selectedFile ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-gray-500 hover:border-gray-400'
            } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              accept={ACCEPTED_MAP_TYPES.join(',')}
              className="hidden"
              disabled={uploading}
            />
            {selectedFile ? (
              <div>
                <p className="text-gray-200 text-sm truncate">{selectedFile.name}</p>
                <p className="text-gray-500 text-xs">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 text-sm">Drop or click to browse</p>
                <p className="text-gray-500 text-xs">PNG, JPG, WebP (max 50MB)</p>
              </div>
            )}
          </div>

          {uploading && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-red-400 text-xs">{uploadError}</p>
          )}

          {selectedFile && !uploading && (
            <button onClick={handleUpload} className="mt-2 w-full px-3 py-1.5 bg-sky-600 text-white text-sm rounded hover:bg-sky-500">
              Upload
            </button>
          )}
        </div>
      )}

      {/* Library Section */}
      {showLibrary && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded border border-gray-600">
          <p className="text-xs text-gray-400 mb-2">Maps not linked to this campaign</p>

          {libraryLoading && (
            <div className="text-center py-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500 mx-auto"></div>
            </div>
          )}

          {libraryError && <p className="text-red-400 text-xs">{libraryError}</p>}

          {!libraryLoading && !libraryError && libraryAssets.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-2">No additional maps in library</p>
          )}

          {!libraryLoading && !libraryError && libraryAssets.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {libraryAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 p-2 rounded border border-gray-600 hover:border-gray-500">
                  <div className="w-10 h-10 flex-shrink-0 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                    {asset.s3_url ? (
                      <img src={asset.s3_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-500 text-xs">🗺️</span>
                    )}
                  </div>
                  <p className="flex-1 text-xs text-gray-300 truncate">{asset.filename}</p>
                  <button
                    onClick={() => handleAssociateAsset(asset)}
                    disabled={associating === asset.id}
                    className="px-2 py-1 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50"
                  >
                    {associating === asset.id ? '...' : 'Add'}
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
        <p className="text-gray-500 text-xs">No maps available. Upload or add from library.</p>
      )}

      {/* Asset List */}
      {!loading && !error && assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((asset) => {
            const isActive = currentMap?.asset_id === asset.id || currentMap?.filename === asset.filename;
            const hasUrl = !!asset.s3_url;
            return (
              <div
                key={asset.id}
                onClick={() => hasUrl && handleMapSelect(asset)}
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
                    <span className="text-gray-500 text-xs">🗺️</span>
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
