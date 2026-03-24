/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
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
  handleSessionEnded,
  handleInitialState,
  handlePlayerCharacterChanged,
  createSendFunctions
} from './webSocketEvent';
import {
  handleRemoteAudioPlay,
  handleRemoteAudioResume,
  handleRemoteAudioBatch
} from '../../audio_management';

export const useWebSocket = (roomId, thisUserId, gameContext) => {
  const [webSocket, setWebSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventHandlersRef = useRef(null);

  // Handler registry for domain hooks (map, image, audio, etc.)
  // Domain hooks register handlers here instead of adding their own message listeners.
  // This ensures every WebSocket message is parsed exactly once.
  const messageRouterRef = useRef(new Map());

  const registerHandler = useCallback((eventType, handlerFn) => {
    messageRouterRef.current.set(eventType, handlerFn);
    return () => messageRouterRef.current.delete(eventType);
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!roomId || !thisUserId) return;

    console.log(`🔌 Initializing WebSocket connection for room ${roomId}, user ${thisUserId}`);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}?user_id=${thisUserId}`;

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

        // Dispatch to registered domain handlers (map, image, audio, etc.)
        const registeredHandler = messageRouterRef.current.get(event_type);
        if (registeredHandler) {
          registeredHandler(data);
          return;
        }

        // Core game events
        switch (event_type) {
          case 'initial_state':
            handleInitialState(data, handlers);
            break;
          case 'seat_change':
            handleSeatChange(data, handlers);
            break;
          case 'seat_count_change':
            handleSeatCountChange(data, handlers);
            break;
          case 'player_character_changed':
            handlePlayerCharacterChanged(data, handlers);
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
          case 'system_messages_cleared':
            handleSystemMessagesCleared(data, handlers);
            break;
          case 'all_messages_cleared':
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
          case 'session_ended':
            handleSessionEnded(data, handlers);
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
            console.warn(`Unknown WebSocket event type: ${event_type}`);
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
  }, [roomId, thisUserId]);

  // Update event handlers ref when gameContext changes
  useEffect(() => {
    if (gameContext) {
      eventHandlersRef.current = {
        ...gameContext,
        thisUserId
      };
    }
  }, [gameContext, thisUserId]);

  // Create send functions (no-op stubs when disconnected so callers never get undefined)
  const noop = () => {};
  const sendFunctions = webSocket && isConnected
    ? createSendFunctions(webSocket, isConnected, roomId, thisUserId)
    : {
        sendSeatChange: noop, sendSeatCountChange: noop, sendCombatStateChange: noop,
        sendPlayerKick: noop, sendDiceRoll: noop, sendClearSystemMessages: noop,
        sendClearAllMessages: noop, sendDicePrompt: noop, sendDicePromptClear: noop,
        sendInitiativePromptAll: noop, sendColorChange: noop, sendRoleChange: noop,
        sendRemoteAudioPlay: noop, sendRemoteAudioResume: noop, sendRemoteAudioBatch: noop,
      };

  return {
    webSocket,
    isConnected,
    registerHandler,
    ...sendFunctions
  };
};
