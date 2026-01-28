/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useEffect } from 'react';
import { DM_CHILD, DM_CHILD_LAST, PANEL_SUBTITLE } from '../../styles/constants';

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

  // Fetch available assets when modal opens
  useEffect(() => {
    if (isOpen && roomId) {
      setLoading(true);
      setError(null);

      fetch(`/api/game/${roomId}/assets`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch assets');
          }
          return response.json();
        })
        .then(data => {
          // Filter to only map assets
          const mapAssets = (data.assets || []).filter(asset => asset.asset_type === 'map');
          setAssets(mapAssets);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching assets:', err);
          setError(err.message);
          setLoading(false);
        });
    }
  }, [isOpen, roomId]);

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
              Upload maps in the Dashboard to use them in game sessions.
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
                    <img
                      src={asset.s3_url || asset.s3_key}
                      alt={asset.filename}
                      className="w-24 h-24 object-cover rounded border"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
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
