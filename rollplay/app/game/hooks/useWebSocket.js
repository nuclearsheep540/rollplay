/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef } from 'react';
import {
  handleSeatChange,
  handlePlayerConnected,
  handleLobbyUpdate,
  handlePlayerKicked,
  handleCombatState,
  handlePlayerDisconnected,
  handleDiceRoll,
  handleSystemMessagesCleared,
  handleAllMessagesCleared,
  handleDicePrompt,
  handleInitiativePromptAll,
  handleDicePromptClear,
  handleColorChange,
  handleAdventureLogRemoved,
  handleRoleChange,
  handleSeatCountChange,
  handlePlayerDisplaced,
  handleSystemMessage,
  createSendFunctions
} from './webSocketEvent';
import {
  handleRemoteAudioPlay,
  handleRemoteAudioResume,
  handleRemoteAudioBatch
} from '../../audio_management';

export const useWebSocket = (roomId, thisPlayer, gameContext) => {
  const [webSocket, setWebSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventHandlersRef = useRef(null);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!roomId || !thisPlayer) return;

    console.log(`🔌 Initializing WebSocket connection for room ${roomId}, player ${thisPlayer}`);
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}?player_name=${thisPlayer}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { event_type, data } = message;
        
        // Check for valid event structure
        if (!event_type) {
          console.warn('WebSocket message missing event_type:', message);
          return;
        }
        
        console.log(`📨 WebSocket message received: ${event_type}`, data);

        // Get current event handlers
        const handlers = eventHandlersRef.current;
        if (!handlers) {
          console.warn('Event handlers not initialized yet');
          return;
        }

        // Route messages to appropriate handlers
        switch (event_type) {
          case 'seat_change':
            handleSeatChange(data, handlers);
            break;
          case 'seat_count_change':
            handleSeatCountChange(data, handlers);
            break;
          case 'player_connected':
            handlePlayerConnected(data, handlers);
            break;
          case 'lobby_update':
            handleLobbyUpdate(data, handlers);
            break;
          case 'player_kicked':
            handlePlayerKicked(data, handlers);
            break;
          case 'combat_state':
            handleCombatState(data, handlers);
            break;
          case 'player_disconnected':
            handlePlayerDisconnected(data, handlers);
            break;
          case 'dice_roll':
            handleDiceRoll(data, handlers);
            break;
          case 'clear_system_messages':
            handleSystemMessagesCleared(data, handlers);
            break;
          case 'clear_all_messages':
            handleAllMessagesCleared(data, handlers);
            break;
          case 'dice_prompt':
            handleDicePrompt(data, handlers);
            break;
          case 'initiative_prompt_all':
            handleInitiativePromptAll(data, handlers);
            break;
          case 'dice_prompt_clear':
            handleDicePromptClear(data, handlers);
            break;
          case 'color_change':
            handleColorChange(data, handlers);
            break;
          case 'adventure_log_removed':
            handleAdventureLogRemoved(data, handlers);
            break;
          case 'role_change':
            handleRoleChange(data, handlers);
            break;
          case 'player_displaced':
            handlePlayerDisplaced(data, handlers);
            break;
          case 'system_message':
            handleSystemMessage(data, handlers);
            break;
          case 'remote_audio_play':
            handleRemoteAudioPlay(data, handlers);
            break;
          case 'remote_audio_resume':
            handleRemoteAudioResume(data, handlers);
            break;
          case 'remote_audio_batch':
            handleRemoteAudioBatch(data, handlers);
            break;
          case 'error':
            console.error('WebSocket error received:', data);
            break;
          default:
            // Map events are handled by useMapWebSocket hook
            if (event_type && !event_type.startsWith('map_')) {
              console.warn(`Unknown WebSocket event type: ${event_type}`);
            }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    setWebSocket(ws);

    // Cleanup on unmount
    return () => {
      ws.close();
    };
  }, [roomId, thisPlayer]);

  // Update event handlers ref when gameContext changes
  useEffect(() => {
    if (gameContext) {
      eventHandlersRef.current = {
        ...gameContext,
        thisPlayer
      };
    }
  }, [gameContext, thisPlayer]);

  // Create send functions
  const sendFunctions = webSocket && isConnected 
    ? createSendFunctions(webSocket, isConnected, roomId, thisPlayer)
    : {};

  return {
    webSocket,
    isConnected,
    ...sendFunctions
  };
};