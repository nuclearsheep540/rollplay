/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DM_CHILD, DM_CHILD_LAST, PANEL_SUBTITLE } from '../../styles/constants';

const ACCEPTED_MAP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function MapSelectionModal({
  isOpen,
  onClose,
  onSelectMap,
  roomId,
  currentMap
}) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

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
  const [associating, setAssociating] = useState(null); // asset id being associated

  // Fetch available assets when modal opens
  const fetchAssets = useCallback(async () => {
    if (!roomId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/game/${roomId}/assets?asset_type=map`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch assets');
      }

      const data = await response.json();
      // Filter to only map assets (in case backend doesn't filter)
      const mapAssets = (data.assets || []).filter(asset => asset.asset_type === 'map');
      setAssets(mapAssets);
    } catch (err) {
      console.error('Error fetching assets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (isOpen && roomId) {
      fetchAssets();
    }
  }, [isOpen, roomId, fetchAssets]);

  // Fetch user's full library (for "Add from Library" feature)
  const fetchLibrary = useCallback(async () => {
    if (!roomId) return;

    setLibraryLoading(true);
    setLibraryError(null);

    try {
      const response = await fetch(`/api/game/${roomId}/user-library?asset_type=map`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch library');
      }

      const data = await response.json();
      // Filter to only map assets not already in campaign
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
  }, [roomId, assets]);

  // When library panel opens, fetch library assets
  useEffect(() => {
    if (showLibrary) {
      fetchLibrary();
    }
  }, [showLibrary, fetchLibrary]);

  // Associate a library asset with the campaign
  const handleAssociateAsset = async (asset) => {
    if (!roomId || associating) return;

    try {
      setAssociating(asset.id);

      const response = await fetch(`/api/game/${roomId}/assets/${asset.id}/associate`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to add to campaign');
      }

      // Refresh campaign assets and library
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

  // Handle file selection
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

  // Drag and drop handlers
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

  // Upload handler
  const handleUpload = async () => {
    if (!selectedFile || !roomId) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      // Step 1: Get presigned upload URL from api-game (proxies to api-site)
      const uploadUrlParams = new URLSearchParams({
        filename: selectedFile.name,
        content_type: selectedFile.type,
        asset_type: 'map'
      });

      const uploadUrlResponse = await fetch(
        `/api/game/${roomId}/upload-url?${uploadUrlParams}`,
        { credentials: 'include' }
      );

      if (!uploadUrlResponse.ok) {
        const errorData = await uploadUrlResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get upload URL');
      }

      const { upload_url, key } = await uploadUrlResponse.json();
      setUploadProgress(20);

      // Step 2: Upload file directly to S3
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }
      setUploadProgress(70);

      // Step 3: Confirm upload with api-game (proxies to api-site)
      const confirmResponse = await fetch(`/api/game/${roomId}/upload-confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          key,
          asset_type: 'map',
          file_size: selectedFile.size
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to confirm upload');
      }

      setUploadProgress(100);

      // Reset upload state and refresh assets
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

  if (!isOpen) return null;

  const handleMapSelect = (asset) => {
    const mapSettings = {
      room_id: roomId,
      asset_id: asset.id,
      filename: asset.filename,
      original_filename: asset.filename,
      file_path: asset.s3_url || asset.s3_key,
      // DON'T send any grid config - maps start with no grid until DM sets one
      uploaded_by: "dm"
    };

    onSelectMap(mapSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Select Map</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowUpload(!showUpload); setShowLibrary(false); }}
            className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
              showUpload
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            <span>📤</span>
            {showUpload ? 'Hide Upload' : 'Upload New Map'}
          </button>
          <button
            onClick={() => { setShowLibrary(!showLibrary); setShowUpload(false); }}
            className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
              showLibrary
                ? 'bg-sky-500 text-white'
                : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            <span>📚</span>
            {showLibrary ? 'Hide Library' : 'Add from Library'}
          </button>
        </div>

        {/* Upload Section */}
        {showUpload && (
          <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Upload Map Image</h3>

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-sky-500 bg-sky-500/10'
                  : selectedFile
                    ? 'border-emerald-500/50 bg-emerald-500/5'
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
                  <span className="text-2xl block mb-2">🗺️</span>
                  <p className="text-gray-200 font-medium truncate">{selectedFile.name}</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  {!uploading && (
                    <p className="text-gray-500 text-xs mt-2">Click to change file</p>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-3xl block mb-2">📁</span>
                  <p className="text-gray-300 mb-1">Drop map image here or click to browse</p>
                  <p className="text-gray-500 text-sm">PNG, JPG, JPEG, WebP (max 50MB)</p>
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Uploading...</span>
                  <span className="text-gray-300">{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload Error */}
            {uploadError && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{uploadError}</p>
              </div>
            )}

            {/* Upload Button */}
            {selectedFile && !uploading && (
              <button
                onClick={handleUpload}
                className="mt-3 w-full px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-500 transition-colors"
              >
                Upload Map
              </button>
            )}
          </div>
        )}

        {/* Add from Library Section */}
        {showLibrary && (
          <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
            <h3 className="text-sm font-medium text-gray-300 mb-3">
              Add from Your Library
              <span className="text-gray-500 font-normal ml-2">
                (maps not yet linked to this campaign)
              </span>
            </h3>

            {libraryLoading && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500 mx-auto mb-2"></div>
                <p className="text-gray-400 text-sm">Loading library...</p>
              </div>
            )}

            {libraryError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{libraryError}</p>
              </div>
            )}

            {!libraryLoading && !libraryError && libraryAssets.length === 0 && (
              <div className="text-center py-4">
                <p className="text-gray-400 text-sm">
                  No additional maps in your library.
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  Upload maps via the Dashboard Library tab.
                </p>
              </div>
            )}

            {!libraryLoading && !libraryError && libraryAssets.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {libraryAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      {asset.s3_url ? (
                        <img
                          src={asset.s3_url}
                          alt={asset.filename}
                          className="w-12 h-12 object-cover rounded border border-gray-600"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="w-12 h-12 bg-gray-700 rounded border border-gray-600 items-center justify-center text-gray-500 text-sm"
                        style={{ display: asset.s3_url ? 'none' : 'flex' }}
                      >
                        🗺️
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-sm font-medium truncate">
                        {asset.filename}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {asset.content_type || 'Map image'}
                      </p>
                    </div>

                    {/* Add Button */}
                    <button
                      onClick={() => handleAssociateAsset(asset)}
                      disabled={associating === asset.id}
                      className={`px-3 py-1.5 rounded text-sm transition-colors flex-shrink-0 ${
                        associating === asset.id
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-sky-600 text-white hover:bg-sky-500'
                      }`}
                    >
                      {associating === asset.id ? 'Adding...' : 'Add to Campaign'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading maps...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-2">Failed to load maps</p>
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && assets.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-2">No maps available</p>
            <p className="text-gray-500 text-sm">
              Upload a map above or add maps to your Library in the Dashboard.
            </p>
          </div>
        )}

        {/* Asset List */}
        {!loading && !error && assets.length > 0 && (
          <div className="space-y-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className={`border rounded-lg p-4 transition-all cursor-pointer ${
                  selectedAssetId === asset.id
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-600 hover:border-gray-500'
                } ${
                  currentMap?.asset_id === asset.id || currentMap?.filename === asset.filename
                    ? 'ring-2 ring-green-500 ring-opacity-50'
                    : ''
                }`}
                onClick={() => setSelectedAssetId(asset.id)}
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    {asset.s3_url ? (
                      <img
                        src={asset.s3_url}
                        alt={asset.filename}
                        className="w-24 h-24 object-cover rounded border border-gray-600"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className="w-24 h-24 bg-gray-700 rounded border border-gray-600 items-center justify-center text-gray-500"
                      style={{ display: asset.s3_url ? 'none' : 'flex' }}
                    >
                      🗺️
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {asset.filename}
                      {(currentMap?.asset_id === asset.id || currentMap?.filename === asset.filename) && (
                        <span className="ml-2 text-sm text-green-400">(Currently Active)</span>
                      )}
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      {asset.content_type || 'Map image'}
                    </p>
                    <div className="text-xs text-gray-500">
                      No grid - DM can set grid dimensions after loading
                    </div>
                  </div>
                </div>

                {selectedAssetId === asset.id && (
                  <div className="mt-4 pt-4 border-t border-gray-600">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMapSelect(asset);
                      }}
                      className={DM_CHILD_LAST}
                    >
                      🗺️ Load {asset.filename}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
