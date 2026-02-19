/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useCallback } from 'react';

/**
 * Image Management WebSocket Hook
 *
 * Handles image-related WebSocket events (image_load, image_clear)
 * and provides send functions for image operations.
 * Images are DM-presented, non-interactive (no grid, no pan/zoom).
 *
 * Uses the central handler registry from useWebSocket — all messages are parsed
 * once by useWebSocket, which dispatches to handlers registered here.
 */
export const useImageWebSocket = (webSocket, isConnected, roomId, thisPlayer, imageContext, registerHandler) => {
  const eventHandlersRef = useRef(null);

  // Update event handlers ref when imageContext changes
  useEffect(() => {
    if (imageContext) {
      eventHandlersRef.current = {
        ...imageContext,
        thisPlayer
      };
    }
  }, [imageContext, thisPlayer]);

  // Image event handlers — useCallback with [] deps is safe because
  // these only read from eventHandlersRef.current at call time
  const handleImageLoad = useCallback((data) => {
    console.log("🖼️ Image loaded (atomic):", data);
    const { image, active_display, loaded_by } = data;
    const handlers = eventHandlersRef.current;

    if (image && handlers) {
      if (handlers.setActiveImage) {
        handlers.setActiveImage(image);
        console.log(`🖼️ Image "${image.original_filename}" loaded by ${loaded_by}`);
      }
      if (handlers.setActiveDisplay && active_display !== undefined) {
        handlers.setActiveDisplay(active_display);
        console.log(`🖼️ Active display set to "${active_display}"`);
      }
    } else {
      console.warn("🖼️ Cannot load image - missing image data or handlers");
    }
  }, []);

  const handleImageClear = useCallback((data) => {
    console.log("🖼️ Image cleared (atomic):", data);
    const { active_display, cleared_by } = data;
    const handlers = eventHandlersRef.current;

    if (handlers) {
      if (handlers.setActiveImage) {
        handlers.setActiveImage(null);
        console.log(`🖼️ Image cleared by ${cleared_by}`);
      }
      if (handlers.setActiveDisplay && active_display !== undefined) {
        handlers.setActiveDisplay(active_display);
        console.log(`🖼️ Active display set to "${active_display}"`);
      }
    } else {
      console.warn("🖼️ Cannot clear image - missing handlers");
    }
  }, []);

  // Register handlers with the central WebSocket router
  // Replaces the old addEventListener pattern — messages are parsed once by useWebSocket
  useEffect(() => {
    if (!registerHandler) return;

    const cleanups = [
      registerHandler('image_load', handleImageLoad),
      registerHandler('image_clear', handleImageClear),
    ];

    return () => cleanups.forEach(fn => fn());
  }, [registerHandler, handleImageLoad, handleImageClear]);

  // Image send functions
  const sendImageLoad = (imageData) => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send image load - WebSocket not connected');
      return;
    }

    const message = {
      event_type: 'image_load',
      data: {
        image_data: imageData
      }
    };

    console.log('🖼️ Sending image load:', imageData);
    webSocket.send(JSON.stringify(message));
  };

  const sendImageClear = () => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send image clear - WebSocket not connected');
      return;
    }

    console.log('🖼️ Sending image clear');
    webSocket.send(JSON.stringify({
      event_type: 'image_clear',
      data: {}
    }));
  };

  const sendImageRequest = () => {
    if (!webSocket || !isConnected) {
      console.warn('❌ Cannot send image request - WebSocket not connected');
      return;
    }

    console.log('🖼️ Sending image request');
    webSocket.send(JSON.stringify({
      event_type: 'image_request',
      data: {}
    }));
  };

  return {
    sendImageLoad,
    sendImageClear,
    sendImageRequest,
  };
};
