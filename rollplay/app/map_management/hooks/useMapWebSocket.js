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
    console.log("🗺️ Map loaded:", data);
    const { map, loaded_by } = data;
    const handlers = eventHandlersRef.current;
    
    if (map && handlers) {
      // Set the active map
      if (handlers.setActiveMap) {
        handlers.setActiveMap(map);
      }
      
      // Apply grid configuration if present
      if (map.grid_config && handlers.setGridConfig) {
        console.log('🗺️ Setting grid config from map:', map.grid_config);
        handlers.setGridConfig(map.grid_config);
      } else {
        console.log('🗺️ No grid config to set:', { 
          hasGridConfig: !!map.grid_config, 
          hasSetGridConfig: !!handlers.setGridConfig 
        });
      }
      
      // Apply map image configuration if present
      if (map.map_image_config && handlers.setMapImageConfig) {
        handlers.setMapImageConfig(map.map_image_config);
      }
      
      console.log(`🗺️ Map "${map.original_filename}" loaded by ${loaded_by}`);
    }
  };

  const handleMapClear = (data) => {
    console.log("🗺️ Map cleared:", data);
    const { cleared_by } = data;
    const handlers = eventHandlersRef.current;
    
    if (handlers) {
      // Clear all map-related state
      if (handlers.setActiveMap) handlers.setActiveMap(null);
      if (handlers.setGridConfig) handlers.setGridConfig(null);
      if (handlers.setMapImageConfig) handlers.setMapImageConfig(null);
      
      console.log(`🗺️ Map cleared by ${cleared_by}`);
    }
  };

  const handleMapConfigUpdate = (data) => {
    console.log("🗺️ Map config updated:", data);
    const { map_id, grid_config, map_image_config, updated_by } = data;
    const handlers = eventHandlersRef.current;
    
    if (handlers) {
      // Update grid configuration if provided
      if (grid_config && handlers.setGridConfig) {
        handlers.setGridConfig(grid_config);
      }
      
      // Update map image configuration if provided
      if (map_image_config && handlers.setMapImageConfig) {
        handlers.setMapImageConfig(map_image_config);
      }
      
      console.log(`🗺️ Map config updated by ${updated_by}`);
    }
  };

  // Note: Event handling is done through the main WebSocket hook
  // Map events are processed by the main game WebSocket system
  // This hook only provides send functions and event handlers for the main hook to use

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

  const sendMapConfigUpdate = (mapId, gridConfig = null, mapImageConfig = null) => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send map config update - WebSocket not connected');
      return;
    }

    console.log('🗺️ Sending map config update:', { mapId, gridConfig, mapImageConfig });
    webSocket.send(JSON.stringify({
      event_type: 'map_config_update',
      data: {
        map_id: mapId,
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