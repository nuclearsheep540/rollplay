/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef } from 'react';

/**
 * Map Management WebSocket Hook
 * Handles WebSocket events and sending functions specific to map functionality
 */
export const useMapWebSocket = (webSocket, isConnected, roomId, thisPlayer, mapContext) => {
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

  // Map event handlers
  const handleMapLoad = (data) => {
    console.log("🗺️ Map loaded (atomic):", data);
    const { map, loaded_by } = data;
    const handlers = eventHandlersRef.current;
    
    if (map && handlers && handlers.setActiveMap) {
      // Atomic map loading - set the complete map object
      // The map contains ALL its properties: grid_config, map_image_config, etc.
      handlers.setActiveMap(map);
      console.log(`🗺️ Map "${map.original_filename}" loaded atomically by ${loaded_by}`);
      console.log(`🗺️ Map includes grid_config: ${!!map.grid_config}, map_image_config: ${!!map.map_image_config}`);
    } else {
      console.warn("🗺️ Cannot load map - missing map data or setActiveMap handler");
    }
  };

  const handleMapClear = (data) => {
    console.log("🗺️ Map cleared (atomic):", data);
    const { cleared_by } = data;
    const handlers = eventHandlersRef.current;
    
    if (handlers && handlers.setActiveMap) {
      // Atomic map clearing - clear the complete map object
      // This automatically clears ALL map properties including grid_config, map_image_config
      handlers.setActiveMap(null);
      console.log(`🗺️ Map cleared atomically by ${cleared_by}`);
    } else {
      console.warn("🗺️ Cannot clear map - missing setActiveMap handler");
    }
  };

  const handleMapConfigUpdate = (data) => {
    console.log("🗺️ Map config updated (atomic):", data);
    const { filename, grid_config, map_image_config, updated_by } = data;
    const handlers = eventHandlersRef.current;
    
    if (handlers && handlers.setActiveMap) {
      // Atomic map config update - update the complete map object
      // Get current active map and update its config properties
      const currentMap = handlers.activeMap;
      if (currentMap && currentMap.filename === filename) {
        const updatedMap = {
          ...currentMap,
          // Update only the provided config properties
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
  };

  // Register event handlers with main WebSocket
  useEffect(() => {
    if (!webSocket || !isConnected) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { event_type, data } = message;

        // Check for valid event structure
        if (!event_type) {
          console.warn('Map WebSocket message missing event_type:', message);
          return;
        }

        // Only handle map-related events
        switch (event_type) {
          case 'map_load':
            handleMapLoad(data);
            break;
          case 'map_clear':
            handleMapClear(data);
            break;
          case 'map_config_update':
            handleMapConfigUpdate(data);
            break;
          // map_request is handled server-side, no client handling needed
          default:
            // Ignore non-map events
            break;
        }
      } catch (error) {
        console.error('Error processing map WebSocket message:', error);
      }
    };

    webSocket.addEventListener('message', handleMessage);

    return () => {
      if (webSocket) {
        webSocket.removeEventListener('message', handleMessage);
      }
    };
  }, [webSocket, isConnected]);

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
    // Export handlers for main WebSocket hook to use
    handleMapLoad,
    handleMapClear,
    handleMapConfigUpdate
  };
};