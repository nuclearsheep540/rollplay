/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faPause, faStop, faRepeat, faStepBackward, faStepForward,
  faFileImport, faFloppyDisk, faArrowRotateLeft,
  faMagnifyingGlassPlus, faMagnifyingGlassMinus,
  faArrowsLeftRight, faArrowsUpDown,
  faArrowsLeftRightToLine,
} from '@fortawesome/free-solid-svg-icons';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import AudioWorkstationControls from './AudioWorkstationControls';
import { useUpdateAudioConfig } from '../hooks/useUpdateAudioConfig';
import { useWorkshopPreview } from '../hooks/useWorkshopPreview';
import { detectBpm } from '../utils/detectBpm';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';
import { COLORS } from '@/app/styles/colorTheme';
import WaveformCanvas from './WaveformCanvas';

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

const MAX_TRACKS = 6;
let trackIdCounter = 0;
const emptyTrack = (index) => ({
  id: `track_${trackIdCounter++}`,
  index,
  asset: null,
  loopMode: 'full',
  loopStart: null,
  loopEnd: null,
  bpm: null,
  saved: { loopMode: 'full', loopStart: null, loopEnd: null, bpm: null },
});

export default function AudioWorkstationTool({ initialAssetId }) {
  const assetManager = useAssetManager();
  const [tracks, setTracks] = useState(() => [emptyTrack(0)]);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [loopDrawerOpen, setLoopDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null); // 'file' | 'edit' | null
  const [isDetectingBpm, setIsDetectingBpm] = useState(false);

  // Convenience accessors for the active track
  const activeTrack = tracks[activeTrackIndex];
  const selectedAsset = activeTrack?.asset;
  const loopMode = activeTrack?.loopMode ?? 'full';
  const loopStart = activeTrack?.loopStart ?? null;
  const loopEnd = activeTrack?.loopEnd ?? null;
  const bpm = activeTrack?.bpm ?? null;

  const setActiveTrackField = useCallback((field, value) => {
    setTracks(prev => prev.map((t, i) => i === activeTrackIndex ? { ...t, [field]: value } : t));
  }, [activeTrackIndex]);

  const setLoopMode = (v) => setActiveTrackField('loopMode', v);
  const setLoopStart = (v) => setActiveTrackField('loopStart', v);
  const setLoopEnd = (v) => setActiveTrackField('loopEnd', v);
  const setBpm = (v) => setActiveTrackField('bpm', v);

  const hasChanges = (
    loopMode !== activeTrack?.saved.loopMode ||
    loopStart !== activeTrack?.saved.loopStart ||
    loopEnd !== activeTrack?.saved.loopEnd ||
    bpm !== activeTrack?.saved.bpm
  );

  const addTrack = useCallback(() => {
    if (tracks.length >= MAX_TRACKS) return;
    setTracks(prev => [...prev, emptyTrack(prev.length)]);
  }, [tracks.length]);

  const handleCreateMultiTrack = useCallback(() => {
    // Add a second track if we only have one
    if (tracks.length < 2) addTrack();
  }, [tracks.length, addTrack]);

  // Decoded audio buffers per track — fed to engine channels for actual playback
  const audioBuffersRef = useRef({});
  // Cursor sync rAF ids per track
  const cursorSyncRefs = useRef({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Zoom state
  const [hZoom, setHZoom] = useState(0);
  const [trackHeight, setTrackHeight] = useState(120);

  // Arrangement viewport measurement (for fit-to-width when hZoom=0)
  const arrangementScrollRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  // Follow mode — auto-scroll arrangement to keep playhead in view
  const [followMode, setFollowMode] = useState(true);
  const followModeRef = useRef(true);
  const pxPerSecRef = useRef(0);
  const followingProgrammaticallyRef = useRef(false);

  // Shared coordinate system — all horizontal positioning derives from pxPerSec
  const HEADER_WIDTH = 160; // w-40 in px
  const pxPerSec = hZoom > 0
    ? hZoom
    : (duration > 0 && viewportWidth > HEADER_WIDTH ? (viewportWidth - HEADER_WIDTH) / duration : 0);
  const contentWidth = duration > 0 ? duration * pxPerSec : 0;

  // Keep follow refs in sync for use inside closures (rAF tick, scroll listener)
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);

  // Disable follow mode when user manually scrolls the arrangement
  useEffect(() => {
    const el = arrangementScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (followingProgrammaticallyRef.current) return;
      if (followModeRef.current) setFollowMode(false);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Measure arrangement viewport width for fit-to-width calculation
  useEffect(() => {
    const el = arrangementScrollRef.current;
    if (!el) return;
    setViewportWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preview hook — single-channel engine for audition through effects
  const preview = useWorkshopPreview();
  const updateMutation = useUpdateAudioConfig();

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = () => setMenuOpen(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [menuOpen]);

  // Keyboard hotkeys (refs to always call the latest handlers)
  const handlePlayPauseRef = useRef(() => {});
  const handleRewindRef = useRef(() => {});
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPauseRef.current();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        handleRewindRef.current();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        setFollowMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Resolve loop_mode from asset data (handles legacy default_looping)
  const resolveLoopMode = (asset) => {
    if (asset.loop_mode) return asset.loop_mode;
    if (asset.default_looping === false) return 'off';
    return 'full';
  };

  const initTrackFromAsset = useCallback((trackIndex, asset) => {
    const mode = resolveLoopMode(asset);
    setTracks(prev => prev.map((t, i) => i === trackIndex ? {
      ...t,
      asset,
      loopMode: mode,
      loopStart: asset.loop_start ?? null,
      loopEnd: asset.loop_end ?? null,
      bpm: asset.bpm ?? null,
      saved: {
        loopMode: mode,
        loopStart: asset.loop_start ?? null,
        loopEnd: asset.loop_end ?? null,
        bpm: asset.bpm ?? null,
      },
    } : t));
  }, []);

  // ── Import asset into next available track ────────────────────────────────
  const importAsset = useCallback(async (assetId) => {
    setLoadingAsset(true);
    setSaveSuccess(false);
    updateMutation.reset();

    const assetData = await fetchAssetById(assetId);
    if (!assetData) {
      setLoadingAsset(false);
      return;
    }

    // Find next empty track slot
    const targetIndex = tracks.findIndex(t => t.asset === null);
    if (targetIndex === -1) {
      console.warn('All track slots are full');
      setLoadingAsset(false);
      setShowImportModal(false);
      return;
    }

    initTrackFromAsset(targetIndex, assetData);
    setActiveTrackIndex(targetIndex);

    // Download + decode AudioBuffer for the engine (independent of WaveSurfer)
    await preview.init();
    preview.initChannelFromAsset(targetIndex, assetData);
    try {
      const blob = await assetManager.download(assetData.s3_url, assetData.file_size, assetData.id);
      const engine = preview.engine.current;
      if (engine?.context) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await engine.context.decodeAudioData(arrayBuffer);
        audioBuffersRef.current[targetIndex] = audioBuffer;
        setDuration(audioBuffer.duration);

        // Auto-detect BPM if the asset doesn't have one stored
        if (assetData.bpm == null) {
          setIsDetectingBpm(true);
          try {
            const detected = await detectBpm(audioBuffer);
            if (detected) {
              setTracks(prev => prev.map((t, i) => i === targetIndex ? { ...t, bpm: detected } : t));
              await authFetch(`/api/library/${assetData.id}/audio-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bpm: detected }),
              });
            }
          } catch (err) {
            console.warn('Auto BPM detection failed:', err);
          } finally {
            setIsDetectingBpm(false);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to decode audio buffer for track ${targetIndex}:`, error);
    }

    setLoadingAsset(false);
    setShowImportModal(false);
  }, [tracks, initTrackFromAsset, preview, assetManager]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-import from deep-link (Library → Edit Loop Points)
  useEffect(() => {
    if (initialAssetId && tracks.every(t => t.asset === null)) {
      importAsset(initialAssetId);
    }
  }, [initialAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup cursor sync loops + engine on unmount
  useEffect(() => {
    return () => {
      Object.values(cursorSyncRefs.current).forEach(id => id && cancelAnimationFrame(id));
      cursorSyncRefs.current = {};
      audioBuffersRef.current = {};
      preview.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Engine channel helpers ────────────────────────────────────────────────
  const applyLoopConfigToChannel = useCallback((trackIndex) => {
    const channel = preview.getChannel(trackIndex);
    if (!channel) return;
    const track = tracks[trackIndex];
    if (!track) return;
    if (track.loopMode === 'region' && track.loopStart != null && track.loopEnd != null) {
      channel.setLoopMode('region');
      channel.setLoopRegion(track.loopStart, track.loopEnd);
    } else if (track.loopMode === 'off') {
      channel.setLoopMode('off');
    } else {
      channel.setLoopMode('full');
    }
  }, [tracks, preview]);

  // Start rAF loop syncing engine playback time to React state (drives unified playhead)
  const startCursorSync = useCallback((trackIndex) => {
    const channel = preview.getChannel(trackIndex);
    if (!channel) return;

    const tick = () => {
      if (channel.playbackState !== 'playing') {
        cursorSyncRefs.current[trackIndex] = null;
        return;
      }
      const time = channel.currentTime;
      setCurrentTime(time);

      // Follow mode auto-scroll — keep playhead in view
      const scrollEl = arrangementScrollRef.current;
      const pps = pxPerSecRef.current;
      if (followModeRef.current && scrollEl && pps > 0) {
        const playheadX = HEADER_WIDTH + time * pps;
        const visibleLeft = scrollEl.scrollLeft + HEADER_WIDTH;
        const visibleRight = scrollEl.scrollLeft + scrollEl.clientWidth;
        if (playheadX > visibleRight || playheadX < visibleLeft) {
          // Page scroll: playhead to left edge of visible area
          followingProgrammaticallyRef.current = true;
          scrollEl.scrollLeft = Math.max(0, playheadX - HEADER_WIDTH);
          // Clear flag on next frame (scroll event fires asynchronously)
          requestAnimationFrame(() => { followingProgrammaticallyRef.current = false; });
        }
      }

      cursorSyncRefs.current[trackIndex] = requestAnimationFrame(tick);
    };
    cursorSyncRefs.current[trackIndex] = requestAnimationFrame(tick);
  }, [preview]);

  const stopCursorSync = useCallback((trackIndex) => {
    if (cursorSyncRefs.current[trackIndex]) {
      cancelAnimationFrame(cursorSyncRefs.current[trackIndex]);
      cursorSyncRefs.current[trackIndex] = null;
    }
  }, []);

  // ── Transport controls (operate on ALL loaded tracks via engine) ───────────
  const handlePlayPause = useCallback(async () => {
    const engine = preview.engine.current;
    if (!engine) return;

    // Determine global state from any playing channel
    const anyPlaying = Array.from(engine.channels.values()).some(ch => ch.playbackState === 'playing');

    if (anyPlaying) {
      engine.pauseAll();
      tracks.forEach((_, i) => stopCursorSync(i));
      setIsPlaying(false);
    } else {
      // Play or resume all loaded tracks
      for (let i = 0; i < tracks.length; i++) {
        const buffer = audioBuffersRef.current[i];
        const ch = preview.getChannel(i);
        if (!ch || !buffer) continue;

        if (ch.playbackState === 'paused') {
          await ch.resume();
        } else {
          applyLoopConfigToChannel(i);
          await ch.play(buffer);
        }
        startCursorSync(i);
      }
      setIsPlaying(true);
    }
  }, [tracks, preview, applyLoopConfigToChannel, startCursorSync, stopCursorSync]);

  // Keep keyboard hotkey refs in sync
  useEffect(() => {
    handlePlayPauseRef.current = handlePlayPause;
  }, [handlePlayPause]);

  const handleStop = useCallback(() => {
    const engine = preview.engine.current;
    if (engine) engine.stopAll();
    tracks.forEach((_, i) => stopCursorSync(i));
    setIsPlaying(false);
    setCurrentTime(0);
  }, [tracks, preview, stopCursorSync]);

  // Seek to a specific time, preserving playback state
  const seekTo = useCallback(async (time) => {
    const channel = preview.getChannel(activeTrackIndex);
    const buffer = audioBuffersRef.current[activeTrackIndex];
    if (!channel || !buffer) return;

    const clamped = Math.max(0, Math.min(time, buffer.duration));
    const wasPlaying = channel.playbackState === 'playing';

    if (wasPlaying) {
      channel.stop();
      stopCursorSync(activeTrackIndex);
      applyLoopConfigToChannel(activeTrackIndex);
      await channel.play(buffer, { offset: clamped });
      startCursorSync(activeTrackIndex);
    } else {
      // Paused/stopped — just update the cursor visually
      channel.stop();
    }
    setCurrentTime(clamped);
  }, [activeTrackIndex, preview, applyLoopConfigToChannel, startCursorSync, stopCursorSync]);

  // Step backward — jump to previous marker (loop_end, loop_start, or 0)
  const handleStepBackward = useCallback(() => {
    const t = currentTime;
    const stops = [0];
    if (loopStart != null) stops.push(loopStart);
    if (loopEnd != null) stops.push(loopEnd);
    stops.sort((a, b) => a - b);
    // Find largest stop that is < currentTime (use small epsilon to escape exact match)
    const target = stops.filter(s => s < t - 0.01).pop() ?? 0;
    seekTo(target);
  }, [currentTime, loopStart, loopEnd, seekTo]);

  // Step forward — jump to next marker (loop_start, loop_end, or duration)
  const handleStepForward = useCallback(() => {
    const t = currentTime;
    const stops = [];
    if (loopStart != null) stops.push(loopStart);
    if (loopEnd != null) stops.push(loopEnd);
    if (duration > 0) stops.push(duration);
    stops.sort((a, b) => a - b);
    const target = stops.find(s => s > t + 0.01) ?? duration;
    seekTo(target);
  }, [currentTime, loopStart, loopEnd, duration, seekTo]);

  // Rewind playhead to start — stops all playback, resets visual position
  const handleRewind = useCallback(() => {
    const engine = preview.engine.current;
    if (engine) engine.stopAll();
    tracks.forEach((_, i) => stopCursorSync(i));
    setIsPlaying(false);
    setCurrentTime(0);
  }, [tracks, preview, stopCursorSync]);

  useEffect(() => {
    handleRewindRef.current = handleRewind;
  }, [handleRewind]);

  // Apply loop config whenever the user changes it (live update while playing)
  useEffect(() => {
    applyLoopConfigToChannel(activeTrackIndex);
  }, [loopMode, loopStart, loopEnd, activeTrackIndex, applyLoopConfigToChannel]);

  // Handle channel 'ended' events (non-looping playback finished)
  useEffect(() => {
    const channel = preview.getChannel(activeTrackIndex);
    if (!channel) return;
    const onEnded = () => {
      stopCursorSync(activeTrackIndex);
      setIsPlaying(false);
      setCurrentTime(0);
    };
    channel.on('ended', onEnded);
    return () => channel.off('ended', onEnded);
  }, [activeTrackIndex, preview, stopCursorSync]);

  // ── BPM detection (active track) — reads from audioBuffersRef, not WaveSurfer
  const handleDetectBpm = useCallback(async () => {
    const buffer = audioBuffersRef.current[activeTrackIndex];
    if (!buffer || !selectedAsset) return;
    setIsDetectingBpm(true);
    try {
      const detected = await detectBpm(buffer);
      setBpm(detected);
      if (detected) {
        await authFetch(`/api/library/${selectedAsset.id}/audio-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bpm: detected }),
        });
      }
    } catch (error) {
      console.warn('BPM detection failed:', error);
    } finally {
      setIsDetectingBpm(false);
    }
  }, [activeTrackIndex, selectedAsset]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearRegion = useCallback(() => {
    setLoopStart(null);
    setLoopEnd(null);
    if (loopMode === 'region') setLoopMode('full');
  }, [loopMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      const updatedAsset = await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        audioConfig: { loop_start: loopStart, loop_end: loopEnd, bpm, loop_mode: loopMode },
      });
      // Update both asset and saved state on the active track
      setTracks(prev => prev.map((t, i) => i === activeTrackIndex ? {
        ...t,
        asset: { ...t.asset, ...updatedAsset },
        saved: { loopMode, loopStart, loopEnd, bpm },
      } : t));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error available via updateMutation.error
    }
  };

  // Auto-save on loop config changes — debounced to coalesce drag events
  const autoSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!selectedAsset) return;
    if (!hasChanges) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [loopMode, loopStart, loopEnd, selectedAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = useCallback(() => {
    const saved = activeTrack?.saved;
    if (!saved) return;
    setLoopMode(saved.loopMode);
    setLoopStart(saved.loopStart);
    setLoopEnd(saved.loopEnd);
    setBpm(saved.bpm);
  }, [activeTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full border border-border bg-surface-secondary overflow-hidden">
      {/* ── Menu Bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border text-xs select-none" style={{ backgroundColor: '#B5ADA6', color: '#0B0A09' }}>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'file' ? null : 'file'); }}
            className={`px-4 py-2 font-medium transition-colors ${
              menuOpen === 'file'
                ? 'opacity-70'
                : 'hover:opacity-70'
            }`}
            style={{ color: '#0B0A09' }}
          >
            File
          </button>
          {menuOpen === 'file' && (
            <div className="absolute top-full left-0 z-50 min-w-[180px] py-1 border border-border shadow-lg" style={{ backgroundColor: '#B5ADA6', color: '#0B0A09' }}>
              <button
                onClick={() => { setMenuOpen(null); setShowImportModal(true); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-surface-secondary transition-colors"
                style={{ color: '#0B0A09' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#F7F4F3'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#0B0A09'}
              >
                <FontAwesomeIcon icon={faFileImport} className="text-[10px] w-3" />
                Import Asset
              </button>
              <button
                onClick={() => { setMenuOpen(null); handleSave(); }}
                disabled={!hasChanges || !selectedAsset}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-surface-secondary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: '#0B0A09' }}
              >
                <FontAwesomeIcon icon={faFloppyDisk} className="text-[10px] w-3" />
                Save
              </button>
              <button
                onClick={() => { setMenuOpen(null); handleReset(); }}
                disabled={!hasChanges}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-surface-secondary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: '#0B0A09' }}
              >
                <FontAwesomeIcon icon={faArrowRotateLeft} className="text-[10px] w-3" />
                Revert Changes
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'edit' ? null : 'edit'); }}
            className={`px-4 py-2 font-medium transition-colors ${
              menuOpen === 'edit'
                ? 'opacity-70'
                : 'hover:opacity-70'
            }`}
            style={{ color: '#0B0A09' }}
          >
            Edit
          </button>
          {menuOpen === 'edit' && (
            <div className="absolute top-full left-0 z-50 min-w-[200px] py-1 border border-border shadow-lg" style={{ backgroundColor: '#B5ADA6', color: '#0B0A09' }}>
              <button
                onClick={() => { setMenuOpen(null); handleCreateMultiTrack(); }}
                disabled={tracks.length >= MAX_TRACKS}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-surface-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: '#0B0A09' }}
                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = '#F7F4F3')}
                onMouseLeave={(e) => e.currentTarget.style.color = '#0B0A09'}
              >
                Create Multi-Track Mix
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Transport Bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 px-4 py-2 border-b border-border bg-surface-secondary">
        {/* BPM — interactive: click value to edit, detect button */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-content-secondary">BPM</span>
            <input
              type="number"
              min="1"
              max="300"
              value={bpm ?? ''}
              onChange={(e) => setBpm(e.target.value === '' ? null : Math.round(parseFloat(e.target.value)))}
              placeholder="--"
              disabled={!selectedAsset}
              className="w-16 text-center text-sm font-mono font-bold bg-transparent border-none outline-none text-content-on-dark placeholder:text-content-secondary/40 disabled:opacity-30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <button
            onClick={handleDetectBpm}
            disabled={!selectedAsset || isDetectingBpm}
            className="px-2 py-1 text-[9px] uppercase tracking-wider font-medium rounded-sm text-content-secondary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Detect BPM"
          >
            {isDetectingBpm ? '...' : 'Detect'}
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Transport controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleStop}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-content-secondary hover:text-content-on-dark transition-colors disabled:opacity-30"
            title="Stop"
          >
            <FontAwesomeIcon icon={faStop} className="text-xs" />
          </button>
          <button
            onClick={handleStepBackward}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-content-secondary hover:text-content-on-dark transition-colors disabled:opacity-30"
            title="Step backward (to previous marker)"
          >
            <FontAwesomeIcon icon={faStepBackward} className="text-xs" />
          </button>
          <button
            onClick={handlePlayPause}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-9 h-9 rounded-sm text-content-on-dark hover:text-content-secondary transition-colors disabled:opacity-30"
            title="Play / Pause (Space)"
          >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} className="text-sm" />
          </button>
          <button
            onClick={handleStepForward}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-content-secondary hover:text-content-on-dark transition-colors disabled:opacity-30"
            title="Step forward (to next marker)"
          >
            <FontAwesomeIcon icon={faStepForward} className="text-xs" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Position display */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] uppercase tracking-wider text-content-secondary">Position</span>
          <span className="text-sm font-mono font-bold text-content-on-dark">
            {formatTimecode(currentTime)}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Loop mode indicator */}
        <button
          onClick={() => {
            const current = loopMode;
            const hasRegion = loopStart != null && loopEnd != null;
            let next;
            if (current === 'off') next = 'full';
            else if (current === 'full' && hasRegion) next = 'region';
            else next = 'off';
            setLoopMode(next);
          }}
          disabled={!selectedAsset}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium transition-colors disabled:opacity-30 ${
            loopMode === 'off'
              ? 'text-content-secondary'
              : loopMode === 'region'
                ? 'text-amber-400'
                : 'text-content-on-dark'
          }`}
          title={`Loop: ${loopMode}`}
        >
          <FontAwesomeIcon icon={faRepeat} className="text-[10px]" />
          {loopMode === 'region' ? 'RGN' : loopMode === 'full' ? 'FULL' : 'OFF'}
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Follow mode toggle */}
        <button
          onClick={() => setFollowMode(prev => !prev)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium transition-colors ${
            followMode ? 'text-content-on-dark' : 'text-content-secondary'
          }`}
          title="Follow playhead (F)"
        >
          FOLLOW
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          {/* Horizontal zoom (time) */}
          <FontAwesomeIcon icon={faArrowsLeftRight} className="text-xs text-content-secondary mr-0.5" />
          <button
            onClick={() => {
              // Zoom out: if current hZoom is <= pxPerSec (fit level), snap back to fit
              const fitLevel = duration > 0 && viewportWidth > HEADER_WIDTH
                ? (viewportWidth - HEADER_WIDTH) / duration : 10;
              setHZoom(prev => {
                const next = prev / 2;
                return next <= fitLevel ? 0 : next;
              });
            }}
            disabled={!selectedAsset || hZoom === 0}
            className="flex items-center justify-center w-7 h-7 rounded-sm transition-colors disabled:opacity-30 hover:opacity-60"
            title="Zoom out (time)"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-sm" />
          </button>
          <button
            onClick={() => {
              // Zoom in: if at fit level (hZoom=0), seed from current pxPerSec, then double
              const base = hZoom === 0 ? pxPerSec * 2 : hZoom * 2;
              setHZoom(Math.min(500, base));
            }}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-7 h-7 rounded-sm hover:text-content-secondary transition-colors disabled:opacity-30"
            title="Zoom in (time)"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="text-sm" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          {/* Vertical zoom (track height) */}
          <FontAwesomeIcon icon={faArrowsUpDown} className="text-xs text-content-secondary mr-0.5" />
          <button
            onClick={() => setTrackHeight(prev => Math.max(60, prev - 40))}
            disabled={trackHeight <= 60}
            className="flex items-center justify-center w-7 h-7 rounded-sm hover:text-content-secondary transition-colors disabled:opacity-30"
            title="Decrease track height"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-sm" />
          </button>
          <button
            onClick={() => setTrackHeight(prev => Math.min(400, prev + 40))}
            disabled={trackHeight >= 400}
            className="flex items-center justify-center w-7 h-7 rounded-sm hover:text-content-secondary transition-colors disabled:opacity-30"
            title="Increase track height"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="text-sm" />
          </button>
        </div>

        {/* Track name — right-aligned */}
        {selectedAsset && (
          <div className="ml-auto text-xs text-content-secondary truncate max-w-[200px]">
            {selectedAsset.filename}
          </div>
        )}

        {/* Save indicator */}
        {saveSuccess && (
          <span className="text-[10px] text-feedback-success font-medium">Saved</span>
        )}
        {hasChanges && !saveSuccess && selectedAsset && (
          <span className="text-[10px] text-content-secondary">Modified</span>
        )}
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loadingAsset ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-content-secondary">Loading track...</div>
          </div>
        ) : (
          /* ── Arrangement View — shared pxPerSec coordinate system ─────────── */
          <div
            ref={arrangementScrollRef}
            className="flex-1 min-h-0 overflow-auto relative"
          >
            {/* Content row has explicit width = header + duration × pxPerSec */}
            <div style={{ width: contentWidth > 0 ? `${HEADER_WIDTH + contentWidth}px` : '100%' }}>
              {/* Timeline ruler row */}
              <div
                className="flex border-b border-border sticky top-0 z-30"
                style={{ height: '24px', backgroundColor: COLORS.smoke }}
              >
                <div
                  className="flex-shrink-0 border-r border-border sticky left-0 z-10"
                  style={{ width: `${HEADER_WIDTH}px`, backgroundColor: COLORS.smoke }}
                />
                <div className="flex-1 relative" style={{ minWidth: `${contentWidth}px` }}>
                  <TimelineRuler duration={duration} pxPerSec={pxPerSec} />
                </div>
              </div>

              {/* Track lanes */}
              {tracks.map((track, i) => {
                const isActive = i === activeTrackIndex;
                const hasAsset = track.asset !== null;
                const trackName = hasAsset
                  ? (track.asset.filename?.replace(/\.[^.]+$/, '') || 'Untitled')
                  : `Track ${String(i + 1).padStart(2, '0')}`;

                return (
                  <div
                    key={track.id}
                    className="flex border-b border-border cursor-pointer"
                    style={{
                      backgroundColor: hasAsset ? COLORS.onyx : `${COLORS.onyx}80`,
                      height: `${trackHeight}px`,
                    }}
                    onClick={() => {
                      setActiveTrackIndex(i);
                      if (!hasAsset) setShowImportModal(true);
                    }}
                  >
                    {/* Track header */}
                    <div
                      className={`flex-shrink-0 border-r px-3 py-3 flex flex-col gap-1 sticky left-0 z-10 ${
                        isActive ? 'border-border-active' : 'border-border'
                      }`}
                      style={{
                        width: `${HEADER_WIDTH}px`,
                        backgroundColor: hasAsset ? COLORS.carbon : `${COLORS.carbon}80`,
                      }}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-wide truncate text-content-on-dark">
                        {trackName}
                      </div>
                      <div className="text-[10px] font-mono text-content-secondary">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      {hasAsset && (
                        <div className="flex items-center gap-1 mt-1">
                          <button className="w-6 h-5 rounded text-[10px] font-bold bg-border/40 text-content-secondary hover:bg-border hover:text-content-on-dark transition-colors">
                            S
                          </button>
                          <button className="w-6 h-5 rounded text-[10px] font-bold bg-border/40 text-content-secondary hover:bg-border hover:text-content-on-dark transition-colors">
                            M
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveTrackIndex(i); setLoopDrawerOpen(prev => !prev); }}
                            className="w-6 h-5 rounded flex items-center justify-center bg-border/40 text-content-secondary hover:bg-border hover:text-content-on-dark transition-colors"
                            title="Toggle loop points drawer"
                          >
                            <FontAwesomeIcon icon={faArrowsLeftRightToLine} className="text-xs" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Waveform area — explicit width from pxPerSec */}
                    <div
                      className="relative flex-shrink-0"
                      style={{ width: contentWidth > 0 ? `${contentWidth}px` : '100%', height: '100%' }}
                    >
                      {hasAsset ? (
                        <WaveformCanvas audioBuffer={audioBuffersRef.current[i]} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-sm text-content-secondary">
                            Click to import a track
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* + Add Track placeholder */}
              {tracks.length > 1 && tracks.length < MAX_TRACKS && (
                <div
                  className="flex border-b border-border cursor-pointer"
                  style={{
                    backgroundColor: `${COLORS.onyx}40`,
                    height: '48px',
                  }}
                  onClick={addTrack}
                >
                  <div
                    className="flex-shrink-0 border-r border-border sticky left-0 z-10"
                    style={{ width: `${HEADER_WIDTH}px`, backgroundColor: `${COLORS.carbon}40` }}
                  />
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-sm text-content-secondary">+ Add Track</span>
                  </div>
                </div>
              )}
            </div>

            {/* Unified playhead — positioned in px, spans from ruler through all tracks */}
            {duration > 0 && pxPerSec > 0 && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-40"
                style={{
                  left: `${HEADER_WIDTH + currentTime * pxPerSec}px`,
                  width: '1px',
                  backgroundColor: COLORS.smoke,
                }}
              />
            )}
          </div>
        )}

        {/* ── Loop Points Drawer (bottom) ─────────────────────────────────── */}
        {loopDrawerOpen && selectedAsset && (
          <div className="flex-shrink-0 border-t border-border-active bg-surface-secondary max-h-[50%] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="text-[11px] font-bold uppercase tracking-wider text-content-on-dark">
                Loop Points — {selectedAsset.filename}
              </div>
              <button
                onClick={() => setLoopDrawerOpen(false)}
                className="text-[10px] text-content-secondary hover:text-content-on-dark transition-colors uppercase tracking-wider"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <AudioWorkstationControls
                loopMode={loopMode}
                onLoopModeChange={setLoopMode}
                loopStart={loopStart}
                loopEnd={loopEnd}
                onClearRegion={handleClearRegion}
                isSaving={updateMutation.isPending}
                saveSuccess={saveSuccess}
                error={updateMutation.error?.message}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Import Modal ──────────────────────────────────────────────────── */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(11, 10, 9, 0.8)' }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[70vh] rounded border border-border bg-surface-secondary p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-content-on-dark uppercase tracking-wider">
                Import Music Asset
              </h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-content-secondary hover:text-content-on-dark text-xs"
              >
                ESC
              </button>
            </div>
            <AssetPicker
              assetType="music"
              onSelect={(assetId) => importAsset(assetId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline ruler ───────────────────────────────────────────────────────────
function TimelineRuler({ duration, pxPerSec }) {
  if (!duration || !pxPerSec) return null;

  // Choose interval based on pxPerSec so markers don't crowd/sparse out
  let interval;
  if (pxPerSec > 100) interval = 1;
  else if (pxPerSec > 50) interval = 5;
  else if (pxPerSec > 20) interval = 10;
  else if (pxPerSec > 10) interval = 30;
  else if (pxPerSec > 5) interval = 60;
  else interval = 300;

  const markers = [];
  for (let t = 0; t <= duration; t += interval) {
    markers.push(
      <div
        key={t}
        className="absolute bottom-0 text-[9px] font-mono"
        style={{ left: `${t * pxPerSec}px`, color: COLORS.onyx }}
      >
        <div className="h-2 border-l" style={{ borderColor: COLORS.onyx }} />
        <span className="ml-0.5">{formatTimeRuler(t)}</span>
      </div>
    );
  }

  return <div className="relative w-full h-full">{markers}</div>;
}

function formatTimecode(seconds) {
  if (seconds == null || isNaN(seconds)) return '00:00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function formatTimeRuler(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
