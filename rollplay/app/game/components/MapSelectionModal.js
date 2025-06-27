/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState } from 'react';
import { DM_CHILD, DM_CHILD_LAST, PANEL_SUBTITLE } from '../../styles/constants';

const AVAILABLE_MAPS = [
  {
    filename: "map-bg-no-grid.jpg",
    displayName: "Battle Map (No Grid)",
    description: "Clean battle map without pre-drawn grid"
  },
  {
    filename: "map-with-grid.webp",
    displayName: "Battle Map (With Grid)", 
    description: "Battle map with pre-drawn grid lines"
  }
];

export default function MapSelectionModal({ 
  isOpen, 
  onClose, 
  onSelectMap, 
  roomId,
  currentMap 
}) {
  const [selectedMapFilename, setSelectedMapFilename] = useState(null);

  if (!isOpen) return null;

  const handleMapSelect = (mapData) => {
    const mapSettings = {
      room_id: roomId,
      filename: mapData.filename,
      original_filename: mapData.displayName,
      file_path: `/${mapData.filename}`,
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

        <div className="space-y-4">
          {AVAILABLE_MAPS.map((map) => (
            <div
              key={map.filename}
              className={`border rounded-lg p-4 transition-all cursor-pointer ${
                selectedMapFilename === map.filename 
                  ? 'border-blue-500 bg-blue-900/20' 
                  : 'border-gray-600 hover:border-gray-500'
              } ${
                currentMap?.filename === map.filename 
                  ? 'ring-2 ring-green-500 ring-opacity-50' 
                  : ''
              }`}
              onClick={() => setSelectedMapFilename(map.filename)}
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <img
                    src={`/${map.filename}`}
                    alt={map.displayName}
                    className="w-24 h-24 object-cover rounded border"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {map.displayName}
                    {currentMap?.filename === map.filename && (
                      <span className="ml-2 text-sm text-green-400">(Currently Active)</span>
                    )}
                  </h3>
                  <p className="text-gray-400 text-sm mb-2">{map.description}</p>
                  <div className="text-xs text-gray-500">
                    No grid - DM can set grid dimensions after loading
                  </div>
                </div>
              </div>
              
              {selectedMapFilename === map.filename && (
                <div className="mt-4 pt-4 border-t border-gray-600">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMapSelect(map);
                    }}
                    className={DM_CHILD_LAST}
                  >
                    🗺️ Load {map.displayName}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

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