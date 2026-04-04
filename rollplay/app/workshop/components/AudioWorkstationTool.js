/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faPause, faStop, faRepeat,
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
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

const TRACK_COUNT = 1;
const emptyTrack = (index) => ({
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
  const [tracks, setTracks] = useState(() => Array.from({ length: TRACK_COUNT }, (_, i) => emptyTrack(i)));
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

  // Per-track WaveSurfer refs (keyed by track index)
  const waveformRefs = useRef({});
  // Decoded audio buffers per track — fed to engine channels for actual playback
  const audioBuffersRef = useRef({});
  // Cursor sync rAF ids per track
  const cursorSyncRefs = useRef({});
  const wavesurferRefs = useRef({});
  const regionsRefs = useRef({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Zoom state
  const [hZoom, setHZoom] = useState(0);
  const [trackHeight, setTrackHeight] = useState(120);

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

  // Spacebar → play/pause (uses a ref to always call the latest handler)
  const handlePlayPauseRef = useRef(() => {});
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPauseRef.current();
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
    setLoadingAsset(false);
    setShowImportModal(false);
  }, [tracks, initTrackFromAsset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-import from deep-link (Library → Edit Loop Points)
  useEffect(() => {
    if (initialAssetId && tracks.every(t => t.asset === null)) {
      importAsset(initialAssetId);
    }
  }, [initialAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WaveSurfer initialization per track ──────────────────────────────────
  // Creates/destroys a WaveSurfer instance when a track gets an asset
  const initWaveSurferForTrack = useCallback(async (trackIndex, asset) => {
    const container = waveformRefs.current[trackIndex];
    if (!container || !asset?.s3_url) return;

    // Destroy existing instance for this track
    if (wavesurferRefs.current[trackIndex]) {
      wavesurferRefs.current[trackIndex].destroy();
      wavesurferRefs.current[trackIndex] = null;
      regionsRefs.current[trackIndex] = null;
    }

    await preview.init();
    preview.initChannelFromAsset(trackIndex, asset);

    const ws = WaveSurfer.create({
      container,
      waveColor: '#B5ADA6',
      progressColor: '#37322F',
      cursorColor: 'transparent',
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      height: trackHeight,
      normalize: true,
      backend: 'WebAudio',
      minPxPerSec: hZoom || undefined,
    });

    // Mute WaveSurfer — audio comes from AudioEngine, WaveSurfer is visual-only
    ws.setVolume(0);

    const regions = ws.registerPlugin(RegionsPlugin.create());
    wavesurferRefs.current[trackIndex] = ws;
    regionsRefs.current[trackIndex] = regions;

    const blob = await assetManager.download(asset.s3_url, asset.file_size, asset.id);
    ws.loadBlob(blob);

    ws.on('ready', async () => {
      setDuration(ws.getDuration());

      // Decode the blob into an AudioBuffer for the engine channel
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const engine = preview.engine.current;
        if (engine?.context) {
          const audioBuffer = await engine.context.decodeAudioData(arrayBuffer.slice(0));
          audioBuffersRef.current[trackIndex] = audioBuffer;
        }
      } catch (error) {
        console.warn(`Failed to decode buffer for track ${trackIndex}:`, error);
      }

      if (asset.loop_start != null && asset.loop_end != null) {
        regions.addRegion({
          start: asset.loop_start,
          end: asset.loop_end,
          color: 'rgba(181, 173, 166, 0.15)',
          drag: true,
          resize: true,
        });
      }

      // Auto-detect BPM if the asset doesn't have one stored
      if (asset.bpm == null) {
        setIsDetectingBpm(true);
        try {
          const decodedData = ws.getDecodedData();
          if (decodedData) {
            const detected = await detectBpm(decodedData);
            if (detected) {
              setTracks(prev => prev.map((t, i) => i === trackIndex ? { ...t, bpm: detected } : t));
              await authFetch(`/api/library/${asset.id}/audio-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bpm: detected }),
              });
            }
          }
        } catch (error) {
          console.warn('Auto BPM detection failed:', error);
        } finally {
          setIsDetectingBpm(false);
        }
      }
    });

    // WaveSurfer is visual-only; playback state + time come from the engine channel

    regions.on('region-updated', (region) => {
      setTracks(prev => prev.map((t, i) => i === trackIndex ? {
        ...t,
        loopStart: parseFloat(region.start.toFixed(3)),
        loopEnd: parseFloat(region.end.toFixed(3)),
      } : t));
    });

    regions.enableDragSelection({ color: 'rgba(181, 173, 166, 0.15)' });

    regions.on('region-created', (region) => {
      const allRegions = regions.getRegions();
      for (const r of allRegions) {
        if (r.id !== region.id) r.remove();
      }
      setTracks(prev => prev.map((t, i) => i === trackIndex ? {
        ...t,
        loopStart: parseFloat(region.start.toFixed(3)),
        loopEnd: parseFloat(region.end.toFixed(3)),
      } : t));
    });
  }, [trackHeight, hZoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger WaveSurfer init when a track gets an asset
  useEffect(() => {
    tracks.forEach((track, i) => {
      if (track.asset && !wavesurferRefs.current[i]) {
        initWaveSurferForTrack(i, track.asset);
      }
    });
  }, [tracks.map(t => t.asset?.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup all WaveSurfer instances + cursor sync loops on unmount
  useEffect(() => {
    return () => {
      Object.values(wavesurferRefs.current).forEach(ws => ws?.destroy());
      Object.values(cursorSyncRefs.current).forEach(id => id && cancelAnimationFrame(id));
      wavesurferRefs.current = {};
      regionsRefs.current = {};
      cursorSyncRefs.current = {};
      audioBuffersRef.current = {};
      preview.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync zoom to all WaveSurfer instances ────────────────────────────────
  useEffect(() => {
    Object.values(wavesurferRefs.current).forEach(ws => {
      if (ws) ws.zoom(hZoom);
    });
  }, [hZoom]);

  useEffect(() => {
    Object.values(wavesurferRefs.current).forEach(ws => {
      if (ws) ws.setOptions({ height: trackHeight });
    });
  }, [trackHeight]);

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
      setCurrentTime(channel.currentTime);
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

  // ── Transport controls (operate on active track) ─────────────────────────
  const handlePlayPause = useCallback(async () => {
    const channel = preview.getChannel(activeTrackIndex);
    const buffer = audioBuffersRef.current[activeTrackIndex];
    if (!channel || !buffer) return;

    if (channel.playbackState === 'playing') {
      channel.pause();
      stopCursorSync(activeTrackIndex);
      setIsPlaying(false);
    } else if (channel.playbackState === 'paused') {
      await channel.resume();
      setIsPlaying(true);
      startCursorSync(activeTrackIndex);
    } else {
      applyLoopConfigToChannel(activeTrackIndex);
      await channel.play(buffer);
      setIsPlaying(true);
      startCursorSync(activeTrackIndex);
    }
  }, [activeTrackIndex, preview, applyLoopConfigToChannel, startCursorSync, stopCursorSync]);

  // Keep spacebar ref in sync
  useEffect(() => {
    handlePlayPauseRef.current = handlePlayPause;
  }, [handlePlayPause]);

  const handleStop = useCallback(() => {
    const channel = preview.getChannel(activeTrackIndex);
    channel?.stop();
    stopCursorSync(activeTrackIndex);
    setIsPlaying(false);
    setCurrentTime(0);
  }, [activeTrackIndex, preview, stopCursorSync]);

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

  // ── BPM detection (active track) ─────────────────────────────────────────
  const handleDetectBpm = useCallback(async () => {
    const ws = wavesurferRefs.current[activeTrackIndex];
    if (!ws || !selectedAsset) return;
    setIsDetectingBpm(true);
    console.log(`🎵 BPM detect started — current value: ${bpm ?? 'none'}, asset: ${selectedAsset.filename}`);
    try {
      const decodedData = ws.getDecodedData();
      if (!decodedData) {
        console.warn('🎵 BPM detect: no decoded data available');
        return;
      }
      const detected = await detectBpm(decodedData);
      console.log(`🎵 BPM detect result: ${detected ?? 'null (no clear beat)'} (was: ${bpm ?? 'none'})`);
      setBpm(detected);
      if (detected) {
        await authFetch(`/api/library/${selectedAsset.id}/audio-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bpm: detected }),
        });
        console.log(`🎵 BPM ${detected} persisted to backend`);
      }
    } catch (error) {
      console.warn('🎵 BPM detection failed:', error);
    } finally {
      setIsDetectingBpm(false);
    }
  }, [activeTrackIndex, selectedAsset, bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearRegion = useCallback(() => {
    regionsRefs.current[activeTrackIndex]?.clearRegions();
    setLoopStart(null);
    setLoopEnd(null);
    if (loopMode === 'region') setLoopMode('full');
  }, [activeTrackIndex, loopMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleReset = useCallback(() => {
    const saved = activeTrack?.saved;
    if (!saved) return;
    setLoopMode(saved.loopMode);
    setLoopStart(saved.loopStart);
    setLoopEnd(saved.loopEnd);
    setBpm(saved.bpm);
    const regions = regionsRefs.current[activeTrackIndex];
    if (regions) {
      regions.clearRegions();
      if (saved.loopStart != null && saved.loopEnd != null) {
        regions.addRegion({
          start: saved.loopStart,
          end: saved.loopEnd,
          color: 'rgba(181, 173, 166, 0.15)',
          drag: true,
          resize: true,
        });
      }
    }
  }, [activeTrackIndex, activeTrack]); // eslint-disable-line react-hooks/exhaustive-deps

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
                disabled
                className="w-full flex items-center gap-3 px-4 py-2 text-xs opacity-30 cursor-not-allowed"
                style={{ color: '#0B0A09' }}
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
          >
            <FontAwesomeIcon icon={faStop} className="text-xs" />
          </button>
          <button
            onClick={handlePlayPause}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-9 h-9 rounded-sm text-content-on-dark hover:text-content-secondary transition-colors disabled:opacity-30"
          >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} className="text-sm" />
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

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          {/* Horizontal zoom (time) */}
          <FontAwesomeIcon icon={faArrowsLeftRight} className="text-xs text-content-secondary mr-0.5" />
          <button
            onClick={() => setHZoom(prev => prev <= 10 ? 0 : prev / 2)}
            disabled={!selectedAsset || hZoom === 0}
            className="flex items-center justify-center w-7 h-7 rounded-sm transition-colors disabled:opacity-30 hover:opacity-60"
            title="Zoom out (time)"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-sm" />
          </button>
          <button
            onClick={() => setHZoom(prev => prev === 0 ? 10 : Math.min(500, prev * 2))}
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
          /* ── Arrangement View — 6 track lanes (always visible) ──────────── */
          <div className="flex-1 min-h-0 overflow-auto relative">
            {tracks.map((track, i) => {
              const isActive = i === activeTrackIndex;
              const hasAsset = track.asset !== null;
              const trackName = hasAsset
                ? (track.asset.filename?.replace(/\.[^.]+$/, '') || 'Untitled')
                : `Track ${String(i + 1).padStart(2, '0')}`;

              return (
                <div
                  key={i}
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
                    className={`w-40 flex-shrink-0 border-r px-3 py-3 flex flex-col gap-1 sticky left-0 z-10 ${
                      isActive ? 'border-border-active' : 'border-border'
                    }`}
                    style={{ backgroundColor: hasAsset ? COLORS.carbon : `${COLORS.carbon}80` }}
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

                  {/* Waveform area */}
                  <div className="flex-1 min-w-0 relative">
                    {hasAsset ? (
                      <>
                        <div
                          ref={(el) => { waveformRefs.current[i] = el; }}
                          className="w-full h-full"
                        />
                        {/* Unified playhead — rendered on every loaded track, same position */}
                        {duration > 0 && (
                          <div
                            className="absolute top-0 bottom-0 pointer-events-none z-20"
                            style={{
                              left: `${(currentTime / duration) * 100}%`,
                              width: '1px',
                              backgroundColor: COLORS.smoke,
                            }}
                          />
                        )}
                      </>
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
                onSave={handleSave}
                onReset={handleReset}
                isSaving={updateMutation.isPending}
                saveSuccess={saveSuccess}
                error={updateMutation.error?.message}
                hasChanges={hasChanges}
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
function TimelineRuler({ duration }) {
  if (!duration) return null;

  const markers = [];
  const interval = duration > 300 ? 60 : duration > 60 ? 30 : 10;
  for (let t = 0; t <= duration; t += interval) {
    const pct = (t / duration) * 100;
    markers.push(
      <div
        key={t}
        className="absolute bottom-0 text-[9px] font-mono text-content-secondary/60"
        style={{ left: `${pct}%` }}
      >
        <div className="h-2 border-l border-content-secondary/20" />
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
