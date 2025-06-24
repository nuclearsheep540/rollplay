/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * WebSocket Audio Event Handlers
 * Contains all the business logic for handling incoming WebSocket audio messages
 * These functions take data and state setters directly to process audio events
 */

// =====================================
// REMOTE AUDIO EVENT HANDLERS
// =====================================

export const handleRemoteAudioPlay = async (data, { playRemoteTrack, loadRemoteAudioBuffer, audioBuffersRef }) => {
  console.log("🎵 Remote audio play command received:", data);
  const { tracks, triggered_by } = data;
  
  if (playRemoteTrack) {
    if (tracks && Array.isArray(tracks)) {
      // Multiple tracks for synchronized playback
      console.log(`🔗 Processing ${tracks.length} synchronized tracks:`, tracks);
      
      try {
        // Phase 1: Load all audio buffers in parallel (but wait for ALL to complete)
        const loadPromises = tracks.map(async (track) => {
          const { channelId, filename } = track;
          
          // Use the existing loadRemoteAudioBuffer function from useUnifiedAudio
          const buffer = await loadRemoteAudioBuffer(`/audio/${filename}`, channelId);
          
          // Store the buffer with the same key format that playRemoteTrack expects
          if (buffer && audioBuffersRef) {
            const expectedKey = `${channelId}_${filename}`;
            audioBuffersRef.current[expectedKey] = buffer;
          }
          return { track, buffer };
        });
        
        const loadResults = await Promise.all(loadPromises);
        
        // Phase 2: Start all tracks simultaneously (now that all buffers are ready)
        const playPromises = loadResults.map(async ({ track, buffer }) => {
          if (!buffer) {
            console.warn(`❌ Buffer failed to load for ${track.channelId}`);
            return false;
          }
          
          const { channelId, filename, looping = true, volume = 1.0 } = track;
          
          // Call playRemoteTrack with a flag to skip buffer loading since we already have it
          const success = await playRemoteTrack(channelId, filename, looping, volume, null, track, true);
          return success;
        });
        
        const results = await Promise.all(playPromises);
        console.log(`🎯 Synchronized playback completed: ${results.filter(r => r).length}/${tracks.length} tracks started successfully`);
      } catch (error) {
        console.error(`❌ Synchronized playback failed:`, error);
      }
    } else {
      // Legacy single track format
      const { track_type, audio_file, loop = true, volume = 1.0 } = data;
      console.log(`▶️ Playing single remote track: ${track_type}: ${audio_file}`);
      // For legacy format, create a simple track state object
      const trackState = { channelId: track_type, filename: audio_file, looping: loop, volume };
      const success = await playRemoteTrack(track_type, audio_file, loop, volume, null, trackState);
      console.log(`▶️ Single track play result: ${success}`);
    }
  } else {
    console.warn("❌ playRemoteTrack function not available");
  }
};

export const handleRemoteAudioResume = async (data, { resumeRemoteTrack, remoteTrackStates }) => {
  console.log("▶️ Remote audio resume command received:", data);
  const { tracks, track_type, triggered_by } = data;
  
  if (resumeRemoteTrack) {
    if (tracks && Array.isArray(tracks)) {
      // Multiple tracks for synchronized resume
      console.log(`🔗 Processing ${tracks.length} synchronized resume tracks:`, tracks);
      
      // Start all tracks simultaneously using Promise.all for true sync
      const resumePromises = tracks.map(async (track, index) => {
        const { channelId } = track;
        console.log(`▶️ [RESUME ${index + 1}/${tracks.length}] About to resume ${channelId} from paused position`);
        
        const success = await resumeRemoteTrack(channelId);
        console.log(`▶️ [RESUME ${index + 1}/${tracks.length}] Resume result for ${channelId}: ${success}`);
        return success;
      });
      
      try {
        const results = await Promise.all(resumePromises);
        console.log(`🎯 Synchronized resume completed: ${results.filter(r => r).length}/${tracks.length} tracks resumed successfully`);
      } catch (error) {
        console.error(`❌ Synchronized resume failed:`, error);
      }
    } else {
      // Legacy single track resume format
      console.log(`▶️ Resuming single remote track: ${track_type} from paused position`);
      
      const success = await resumeRemoteTrack(track_type);
      console.log(`▶️ Single track resume result: ${success}`);
    }
  } else {
    console.warn("❌ resumeRemoteTrack function not available");
  }
};


export const handleRemoteAudioBatch = async (data, { 
  playRemoteTrack, 
  stopRemoteTrack, 
  pauseRemoteTrack, 
  resumeRemoteTrack, 
  setRemoteTrackVolume, 
  toggleRemoteTrackLooping,
  loadRemoteAudioBuffer,
  audioBuffersRef,
  audioContextRef
}) => {
  console.log("🎛️ Remote audio batch command received:", data);
  const { operations, triggered_by } = data;
  
  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    console.warn("❌ Invalid batch operations received");
    return;
  }
  
  console.log(`🎛️ Processing ${operations.length} batch operations from ${triggered_by}`);
  
  // Process all operations in parallel using Promise.all()
  const processOperation = async (op, index, syncStartTime = null) => {
    const { trackId, operation } = op;
    
    try {
      switch (operation) {
        case 'play':
          if (playRemoteTrack && loadRemoteAudioBuffer && audioBuffersRef) {
            const { filename, looping = true, volume = 1.0 } = op;
            
            // For synchronized operations, buffer is pre-loaded; for single operations, load it now
            if (!syncStartTime) {
              // Single track operation - load buffer now
              const buffer = await loadRemoteAudioBuffer(`/audio/${filename}`, trackId);
              if (buffer && audioBuffersRef) {
                const expectedKey = `${trackId}_${filename}`;
                audioBuffersRef.current[expectedKey] = buffer;
              }
            }
            // else: Buffer already pre-loaded for synchronized operations
            
            // Pass synchronized start time for batch operations (null for single operations)
            await playRemoteTrack(trackId, filename, looping, volume, null, op, true, syncStartTime);
            console.log(`✅ Batch operation ${index + 1}: played ${trackId} (${filename}) ${syncStartTime ? `at sync time ${syncStartTime}` : 'immediately'}`);
          } else {
            console.warn(`❌ Batch operation ${index + 1}: playRemoteTrack function not available`);
          }
          break;
          
        case 'stop':
          if (stopRemoteTrack) {
            stopRemoteTrack(trackId);
            console.log(`✅ Batch operation ${index + 1}: stopped ${trackId}`);
          } else {
            console.warn(`❌ Batch operation ${index + 1}: stopRemoteTrack function not available`);
          }
          break;
          
        case 'pause':
          if (pauseRemoteTrack) {
            pauseRemoteTrack(trackId);
            console.log(`✅ Batch operation ${index + 1}: paused ${trackId}`);
          } else {
            console.warn(`❌ Batch operation ${index + 1}: pauseRemoteTrack function not available`);
          }
          break;
          
        case 'resume':
          if (resumeRemoteTrack) {
            resumeRemoteTrack(trackId);
            console.log(`✅ Batch operation ${index + 1}: resumed ${trackId}`);
          } else {
            console.warn(`❌ Batch operation ${index + 1}: resumeRemoteTrack function not available`);
          }
          break;
          
        case 'volume':
          if (setRemoteTrackVolume) {
            const { volume } = op;
            setRemoteTrackVolume(trackId, volume);
            console.log(`✅ Batch operation ${index + 1}: set ${trackId} volume to ${volume}`);
          } else {
            console.warn(`❌ Batch operation ${index + 1}: setRemoteTrackVolume function not available`);
          }
          break;
          
        case 'loop':
          if (toggleRemoteTrackLooping) {
            const { looping } = op;
            toggleRemoteTrackLooping(trackId, looping);
            console.log(`✅ Batch operation ${index + 1}: set ${trackId} looping to ${looping}`);
          } else {
            console.warn(`❌ Batch operation ${index + 1}: toggleRemoteTrackLooping function not available`);
          }
          break;
          
        default:
          console.warn(`❌ Batch operation ${index + 1}: unknown operation '${operation}'`);
      }
    } catch (error) {
      console.error(`❌ Batch operation ${index + 1} failed:`, error);
      throw error; // Re-throw to handle in Promise.all
    }
  };

  // Calculate synchronized start time for play operations
  const playOperations = operations.filter(op => op.operation === 'play');
  const hasMultiplePlayOps = playOperations.length > 1;
  
  console.log(`🎛️ Batch analysis: ${operations.length} total operations, ${playOperations.length} play operations`);
  console.log(`🎛️ Audio context available:`, !!audioContextRef?.current);
  console.log(`🎛️ Audio context state:`, audioContextRef?.current?.state);
  console.log(`🎛️ Audio context currentTime:`, audioContextRef?.current?.currentTime);

  // Execute all operations in parallel
  try {
    if (hasMultiplePlayOps && audioContextRef?.current) {
      // For synchronized playback: Load all buffers first, then calculate sync time
      console.log(`🎵 🔄 Pre-loading ${playOperations.length} audio buffers for synchronized playback...`);
      
      // Load all play operation buffers in parallel
      const bufferLoadPromises = operations.map(async (op, index) => {
        if (op.operation === 'play' && loadRemoteAudioBuffer && audioBuffersRef) {
          const { filename, trackId } = op;
          
          // Load buffer if needed
          const buffer = await loadRemoteAudioBuffer(`/audio/${filename}`, trackId);
          if (buffer && audioBuffersRef) {
            const expectedKey = `${trackId}_${filename}`;
            audioBuffersRef.current[expectedKey] = buffer;
          }
        }
        return op;
      });
      
      // Wait for all buffers to load
      await Promise.all(bufferLoadPromises);
      console.log(`🎵 ✅ All buffers loaded, calculating sync time...`);
      
      // NOW calculate sync time after all buffers are ready
      const syncStartTime = audioContextRef.current.currentTime + 0.2; // Increased buffer for safety
      console.log(`🎵 ✅ Scheduling ${playOperations.length} tracks to start simultaneously at audio time ${syncStartTime}`);
      
      // Execute all operations with the calculated sync time
      await Promise.all(operations.map((op, index) => processOperation(op, index, syncStartTime)));
      
    } else {
      // Non-synchronized operations (single track or non-play operations)
      if (!hasMultiplePlayOps) {
        console.log(`🎵 Single/non-play operation - no synchronization needed`);
      } else {
        console.warn(`⚠️ Multiple play operations but no audio context available!`);
      }
      await Promise.all(operations.map((op, index) => processOperation(op, index, null)));
    }
    
    console.log(`🎛️ ✅ Completed processing ${operations.length} batch operations from ${triggered_by} (synchronized)`);
  } catch (error) {
    console.error(`❌ Some batch operations failed:`, error);
    console.log(`🎛️ ⚠️ Partially completed processing ${operations.length} batch operations from ${triggered_by}`);
  }
};

// =====================================
// REMOTE AUDIO SENDING FUNCTIONS
// =====================================

export const createAudioSendFunctions = (webSocket, isConnected, playerName) => {
  const sendRemoteAudioPlay = (trackType, audioFile, loop = true, volume = null) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio play: ${trackType} - ${audioFile}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_play",
      "data": {
        "track_type": trackType,
        "audio_file": audioFile,
        "loop": loop,
        "volume": volume,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioResume = (trackType) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio resume: ${trackType}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_resume",
      "data": {
        "track_type": trackType,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioBatch = (operations) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio batch (${operations.length} operations):`, operations);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_batch",
      "data": {
        "operations": operations,
        "triggered_by": playerName
      }
    }));
  };

  return {
    sendRemoteAudioPlay,
    sendRemoteAudioResume,
    sendRemoteAudioBatch
  };
};