/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useCallback } from 'react';

/**
 * Map Management WebSocket Hook
 *
 * Handles map-related WebSocket events (map_load, map_clear, map_config_update)
 * and provides send functions for map operations.
 *
 * Uses the central handler registry from useWebSocket — all messages are parsed
 * once by useWebSocket, which dispatches to handlers registered here.
 */
export const useMapWebSocket = (webSocket, isConnected, roomId, thisPlayer, mapContext, registerHandler) => {
  const eventHandlersRef = useRef(null);

  // Update event handlers ref when mapContext changes
  useEffect(() => {
    if (mapContext) {
      eventHandlersRef.current = {
        ...mapContext,
        thisPlayer
      };
    }
  }, [mapContext, thisPlayer]);

  // Map event handlers — useCallback with [] deps is safe because
  // these only read from eventHandlersRef.current at call time
  const handleMapLoad = useCallback((data) => {
    console.log("🗺️ Map loaded (atomic):", data);
    const { map, loaded_by } = data;
    const handlers = eventHandlersRef.current;

    if (map && handlers && handlers.setActiveMap) {
      handlers.setActiveMap(map);
      console.log(`🗺️ Map "${map.original_filename}" loaded atomically by ${loaded_by}`);
      console.log(`🗺️ Map includes grid_config: ${!!map.grid_config}, map_image_config: ${!!map.map_image_config}`);
    } else {
      console.warn("🗺️ Cannot load map - missing map data or setActiveMap handler");
    }
  }, []);

  const handleMapClear = useCallback((data) => {
    console.log("🗺️ Map cleared (atomic):", data);
    const { cleared_by } = data;
    const handlers = eventHandlersRef.current;

    if (handlers && handlers.setActiveMap) {
      handlers.setActiveMap(null);
      console.log(`🗺️ Map cleared atomically by ${cleared_by}`);
    } else {
      console.warn("🗺️ Cannot clear map - missing setActiveMap handler");
    }
  }, []);

  const handleMapConfigUpdate = useCallback((data) => {
    console.log("🗺️ Map config updated (atomic):", data);
    const { filename, grid_config, map_image_config, updated_by } = data;
    const handlers = eventHandlersRef.current;

    if (handlers && handlers.setActiveMap) {
      const currentMap = handlers.activeMap;
      if (currentMap && currentMap.filename === filename) {
        const updatedMap = {
          ...currentMap,
          ...(grid_config !== undefined && { grid_config }),
          ...(map_image_config !== undefined && { map_image_config })
        };

        handlers.setActiveMap(updatedMap);
        console.log(`🗺️ Map ${filename} config updated atomically by ${updated_by}`);
        console.log(`🗺️ Updated grid_config: ${!!updatedMap.grid_config}, map_image_config: ${!!updatedMap.map_image_config}`);
      } else {
        console.warn(`🗺️ Config update for ${filename} but current map is different or missing`);
      }
    } else {
      console.warn("🗺️ Cannot update map config - missing setActiveMap handler or activeMap");
    }
  }, []);

  // Register handlers with the central WebSocket router
  // Replaces the old addEventListener pattern — messages are parsed once by useWebSocket
  useEffect(() => {
    if (!registerHandler) return;

    const cleanups = [
      registerHandler('map_load', handleMapLoad),
      registerHandler('map_clear', handleMapClear),
      registerHandler('map_config_update', handleMapConfigUpdate),
    ];

    return () => cleanups.forEach(fn => fn());
  }, [registerHandler, handleMapLoad, handleMapClear, handleMapConfigUpdate]);

  // Map send functions
  const sendMapLoad = (mapData) => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send map load - WebSocket not connected');
      return;
    }

    const message = {
      event_type: 'map_load',
      data: {
        map_data: mapData
      }
    };

    console.log('🗺️ Sending map load:', mapData);
    console.log('🗺️ Full message being sent:', message);
    webSocket.send(JSON.stringify(message));
  };

  const sendMapClear = () => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send map clear - WebSocket not connected');
      return;
    }

    console.log('🗺️ Sending map clear');
    webSocket.send(JSON.stringify({
      event_type: 'map_clear',
      data: {}
    }));
  };

  const sendMapConfigUpdate = (filename, gridConfig = null, mapImageConfig = null) => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send map config update - WebSocket not connected');
      return;
    }

    console.log('🗺️ Sending map config update:', { filename, gridConfig, mapImageConfig });
    webSocket.send(JSON.stringify({
      event_type: 'map_config_update',
      data: {
        filename: filename,
        grid_config: gridConfig,
        map_image_config: mapImageConfig
      }
    }));
  };

  const sendMapRequest = () => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send map request - WebSocket not connected');
      return;
    }

    const message = {
      event_type: 'map_request',
      data: {}
    };

    console.log('🗺️ Sending map request');
    console.log('🗺️ Full request message being sent:', message);
    webSocket.send(JSON.stringify(message));
  };

  return {
    sendMapLoad,
    sendMapClear,
    sendMapConfigUpdate,
    sendMapRequest,
  };
};
