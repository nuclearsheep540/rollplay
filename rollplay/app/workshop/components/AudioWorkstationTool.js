/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faPause, faStop, faStepBackward, faStepForward,
  faFileImport, faFloppyDisk, faArrowRotateLeft,
  faMagnifyingGlassPlus, faMagnifyingGlassMinus,
  faArrowsLeftRight, faArrowsUpDown,
  faArrowsLeftRightToLine,
  faMagnet,
} from '@fortawesome/free-solid-svg-icons';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import AudioWorkstationControls from './AudioWorkstationControls';
import WaveformViewer from './WaveformViewer';
import AudioPresetsTool from './AudioPresetsTool';
import MixEditorTab from './MixEditorTab';
import FileMenuBar from './FileMenuBar';
import { useUpdateAudioConfig } from '../hooks/useUpdateAudioConfig';
import { useWorkshopPreview } from '../hooks/useWorkshopPreview';
import { detectBpm } from '../utils/detectBpm';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';
import { COLORS } from '@/app/styles/colorTheme';

const TABS = [
  { id: 'loop', label: 'Loop Editor' },
  { id: 'presets', label: 'Presets' },
  { id: 'mix', label: 'Mix Editor' },
];

// Top-level shell: tab bar swaps between the per-asset loop editor,
// the preset editor (AudioPresetsTool), and the standalone mix editor
// (MixEditorTab). Presets hotlink into Mix via `onMix(presetId)`.
export default function AudioWorkstationTool({ initialAssetId }) {
  const [activeTab, setActiveTab] = useState('loop');
  const [mixPresetId, setMixPresetId] = useState(null);

  const openMix = (presetId) => {
    setMixPresetId(presetId);
    setActiveTab('mix');
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-0 border-b border-border select-none flex-shrink-0"
        style={{ backgroundColor: COLORS.carbon }}
      >
        {TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 text-xs font-medium uppercase tracking-wider border-r border-border transition-colors ${
                isActive
                  ? 'bg-surface-secondary text-content-on-dark'
                  : 'text-content-secondary hover:text-content-on-dark'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === 'loop' && <LoopEditor initialAssetId={initialAssetId} />}
        {activeTab === 'presets' && <AudioPresetsTool onMix={openMix} />}
        {activeTab === 'mix' && (
          <MixEditorTab
            selectedPresetId={mixPresetId}
            onSelectPreset={setMixPresetId}
          />
        )}
      </div>
    </div>
  );
}

const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 400;
const DEFAULT_PX_PER_SEC = 50;
const H_ZOOM_STEP = 1.5;

const MIN_WAVE_HEIGHT = 80;
const MAX_WAVE_HEIGHT = 320;
const DEFAULT_WAVE_HEIGHT = 160;
const V_ZOOM_STEP = 40;

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

function resolveLoopMode(asset) {
  if (asset?.loop_mode) return asset.loop_mode;
  if (asset?.default_looping === false) return 'off';
  // Legacy fallback: if the asset has a region saved but no explicit mode,
  // the intent is to loop within that region — default to `continuous`
  // (intro + loop), not `full` (whole-track loop that ignores the region).
  if (asset?.loop_start != null && asset?.loop_end != null) return 'continuous';
  return 'full';
}

function LoopEditor({ initialAssetId }) {
  const assetManager = useAssetManager();
  const preview = useWorkshopPreview();
  const updateMutation = useUpdateAudioConfig();

  // ── Asset + config state ────────────────────────────────────────────────
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loopMode, setLoopMode] = useState('full');
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [bpm, setBpm] = useState(null);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [savedConfig, setSavedConfig] = useState({
    loopMode: 'full', loopStart: null, loopEnd: null, bpm: null, timeSignature: '4/4',
  });
  // Per-session preference — snap loop region drag to beat grid.
  const [snapToBeats, setSnapToBeats] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  // Drawer visibility is derived from the loop mode by default — if the
  // track is in a region-based mode, the drawer is where you'd edit those
  // points, so it opens. The user can still explicitly override for the
  // current session via the LOOP button / close affordance; that override
  // resets to `null` (follow the mode) on asset import.
  const [loopDrawerOverride, setLoopDrawerOverride] = useState(null);
  const loopDrawerDerivedOpen = loopMode !== 'off';
  const loopDrawerOpen = loopDrawerOverride !== null ? loopDrawerOverride : loopDrawerDerivedOpen;
  const [isDetectingBpm, setIsDetectingBpm] = useState(false);

  // ── Playback state ──────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [waveHeight, setWaveHeight] = useState(DEFAULT_WAVE_HEIGHT);

  // ── Refs ────────────────────────────────────────────────────────────────
  const audioBufferRef = useRef(null);
  const waveformRef = useRef(null);
  const timecodeRef = useRef(null);

  const hasChanges = (
    loopMode !== savedConfig.loopMode ||
    loopStart !== savedConfig.loopStart ||
    loopEnd !== savedConfig.loopEnd ||
    bpm !== savedConfig.bpm ||
    timeSignature !== savedConfig.timeSignature
  );

  // ── Import asset flow ───────────────────────────────────────────────────
  const importAsset = useCallback(async (assetId) => {
    setLoadingAsset(true);
    setSaveSuccess(false);
    updateMutation.reset();

    const assetData = await fetchAssetById(assetId);
    if (!assetData) {
      setLoadingAsset(false);
      return;
    }

    const mode = resolveLoopMode(assetData);
    const sig = assetData.time_signature || '4/4';
    setSelectedAsset(assetData);
    setLoopMode(mode);
    setLoopStart(assetData.loop_start ?? null);
    setLoopEnd(assetData.loop_end ?? null);
    setBpm(assetData.bpm ?? null);
    setTimeSignature(sig);
    setSavedConfig({
      loopMode: mode,
      loopStart: assetData.loop_start ?? null,
      loopEnd: assetData.loop_end ?? null,
      bpm: assetData.bpm ?? null,
      timeSignature: sig,
    });

    // Clear any drawer override from the previous session — drawer
    // visibility now follows the newly-imported asset's loop mode.
    setLoopDrawerOverride(null);

    // Decode into the engine's AudioContext so effects apply during preview
    await preview.init();
    preview.initChannelFromAsset(assetData);

    try {
      const blob = await assetManager.download(assetData.s3_url, assetData.file_size, assetData.id);
      const engine = preview.engine.current;
      if (engine?.context) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await engine.context.decodeAudioData(arrayBuffer);
        audioBufferRef.current = audioBuffer;
        setDuration(audioBuffer.duration);

        if (assetData.bpm == null) {
          setIsDetectingBpm(true);
          try {
            const detected = await detectBpm(audioBuffer);
            if (detected) {
              setBpm(detected);
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
      console.warn('Failed to decode audio buffer:', error);
    }

    setLoadingAsset(false);
    setShowImportModal(false);
  }, [preview, assetManager, updateMutation]);

  // Auto-import from deep link (Library → Edit Loop Points)
  useEffect(() => {
    if (initialAssetId && !selectedAsset) {
      importAsset(initialAssetId);
    }
  }, [initialAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioBufferRef.current = null;
      preview.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Engine channel helpers ──────────────────────────────────────────────
  const applyLoopConfigToChannel = useCallback(() => {
    const channel = preview.channel.current;
    if (!channel) return;
    // Region bounds are independent of mode — push them to the engine
    // whenever we have them. Both `continuous` and `region` modes need
    // the native source.loopStart/loopEnd wired up.
    if (loopStart != null && loopEnd != null) {
      channel.setLoopRegion(loopStart, loopEnd);
    }
    channel.setLoopMode(loopMode);
  }, [loopMode, loopStart, loopEnd, preview]);

  // Live-apply loop config while playing or paused
  useEffect(() => {
    applyLoopConfigToChannel();
  }, [applyLoopConfigToChannel]);

  // Channel is the single source of truth for position. Every visible
  // cursor/timecode update flows through timeupdate events.
  useEffect(() => {
    const channel = preview.channel.current;
    if (!channel) return;

    const onTimeUpdate = ({ currentTime }) => {
      if (waveformRef.current) waveformRef.current.setTime(currentTime);
      if (timecodeRef.current) timecodeRef.current.textContent = formatTimecode(currentTime);
    };
    const onEnded = () => setIsPlaying(false);

    channel.on('timeupdate', onTimeUpdate);
    channel.on('ended', onEnded);
    return () => {
      channel.off('timeupdate', onTimeUpdate);
      channel.off('ended', onEnded);
    };
  }, [selectedAsset, preview]);

  // Drive WaveSurfer zoom from our pxPerSec state
  useEffect(() => {
    if (waveformRef.current) waveformRef.current.zoom(pxPerSec);
  }, [pxPerSec, selectedAsset]);

  // ── Transport ───────────────────────────────────────────────────────────
  // Channel.currentTime is the single source of position truth. Every
  // handler reads from there; visuals reconcile via timeupdate events.

  const handlePlayPause = useCallback(async () => {
    const channel = preview.channel.current;
    const buffer = audioBufferRef.current;
    if (!channel || !buffer) return;

    if (channel.playbackState === 'playing') {
      channel.pause();
      setIsPlaying(false);
    } else if (channel.playbackState === 'paused') {
      await channel.resume();
      setIsPlaying(true);
    } else {
      // Stopped: resume from wherever the cursor sits (after Stop, seek, step)
      applyLoopConfigToChannel();
      await channel.play(buffer, { offset: channel.currentTime });
      setIsPlaying(true);
    }
  }, [preview, applyLoopConfigToChannel]);

  // Stop resets position. Inside region mode, snap to the region start so
  // the next play picks up where the loop begins.
  const handleStop = useCallback(() => {
    const channel = preview.channel.current;
    if (!channel) return;
    channel.stop();
    setIsPlaying(false);
    const target = (loopMode === 'region' && loopStart != null) ? loopStart : 0;
    if (target > 0) channel.seek(target);
  }, [preview, loopMode, loopStart]);

  const seekTo = useCallback(async (time) => {
    const channel = preview.channel.current;
    const buffer = audioBufferRef.current;
    if (!channel || !buffer) return;

    if (channel.playbackState === 'playing') {
      applyLoopConfigToChannel();
      await channel.play(buffer, { offset: Math.max(0, Math.min(time, buffer.duration)) });
    } else {
      channel.seek(time);
    }
  }, [preview, applyLoopConfigToChannel]);

  const handleStepBackward = useCallback(() => {
    const channel = preview.channel.current;
    if (!channel) return;
    const t = channel.currentTime;
    const stops = [0];
    if (loopStart != null) stops.push(loopStart);
    if (loopEnd != null) stops.push(loopEnd);
    stops.sort((a, b) => a - b);
    const target = stops.filter(s => s < t - 0.01).pop() ?? 0;
    seekTo(target);
  }, [preview, loopStart, loopEnd, seekTo]);

  const handleStepForward = useCallback(() => {
    const channel = preview.channel.current;
    if (!channel) return;
    const t = channel.currentTime;
    const stops = [];
    if (loopStart != null) stops.push(loopStart);
    if (loopEnd != null) stops.push(loopEnd);
    if (duration > 0) stops.push(duration);
    stops.sort((a, b) => a - b);
    const target = stops.find(s => s > t + 0.01) ?? duration;
    seekTo(target);
  }, [preview, loopStart, loopEnd, duration, seekTo]);

  // Keyboard hotkeys (Space = play/pause, Enter = rewind)
  const handlePlayPauseRef = useRef(handlePlayPause);
  const handleStopRef = useRef(handleStop);
  useEffect(() => { handlePlayPauseRef.current = handlePlayPause; }, [handlePlayPause]);
  useEffect(() => { handleStopRef.current = handleStop; }, [handleStop]);

  useEffect(() => {
    const onKey = (e) => {
      // Ignore when user is typing in an input
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPauseRef.current();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        handleStopRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── BPM detection (manual button) ───────────────────────────────────────
  const handleDetectBpm = useCallback(async () => {
    const buffer = audioBufferRef.current;
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
        setSavedConfig(prev => ({ ...prev, bpm: detected }));
      }
    } catch (error) {
      console.warn('BPM detection failed:', error);
    } finally {
      setIsDetectingBpm(false);
    }
  }, [selectedAsset]);

  // ── Save / revert ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        audioConfig: {
          loop_start: loopStart,
          loop_end: loopEnd,
          bpm,
          loop_mode: loopMode,
          time_signature: timeSignature,
        },
      });
      setSavedConfig({ loopMode, loopStart, loopEnd, bpm, timeSignature });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error surfaced via updateMutation.error
    }
  }, [selectedAsset, loopMode, loopStart, loopEnd, bpm, timeSignature, updateMutation]);

  const handleReset = useCallback(() => {
    setLoopMode(savedConfig.loopMode);
    setLoopStart(savedConfig.loopStart);
    setLoopEnd(savedConfig.loopEnd);
    setBpm(savedConfig.bpm);
    setTimeSignature(savedConfig.timeSignature);
  }, [savedConfig]);

  const handleClearRegion = useCallback(() => {
    setLoopStart(null);
    setLoopEnd(null);
    if (loopMode === 'region') setLoopMode('full');
  }, [loopMode]);

  // Auto-save on loop config changes (debounced to coalesce drags)
  const autoSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!selectedAsset) return;
    if (!hasChanges) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => handleSave(), 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [loopMode, loopStart, loopEnd, timeSignature, selectedAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zoom ────────────────────────────────────────────────────────────────
  const zoomInH = () => setPxPerSec(p => Math.min(MAX_PX_PER_SEC, p * H_ZOOM_STEP));
  const zoomOutH = () => setPxPerSec(p => Math.max(MIN_PX_PER_SEC, p / H_ZOOM_STEP));
  const zoomInV = () => setWaveHeight(h => Math.min(MAX_WAVE_HEIGHT, h + V_ZOOM_STEP));
  const zoomOutV = () => setWaveHeight(h => Math.max(MIN_WAVE_HEIGHT, h - V_ZOOM_STEP));

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full border border-border bg-surface-secondary overflow-hidden">
      {/* ── Menu Bar ────────────────────────────────────────────────────── */}
      <FileMenuBar
        items={[
          { label: 'Open Asset', icon: faFileImport, onClick: () => setShowImportModal(true) },
          { label: 'Save', icon: faFloppyDisk, onClick: handleSave, disabled: !hasChanges || !selectedAsset },
          { label: 'Revert Changes', icon: faArrowRotateLeft, onClick: handleReset, disabled: !hasChanges },
        ]}
      />

      {/* ── Transport Bar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 px-4 py-2 border-b border-border bg-surface-secondary">
        {/* BPM */}
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

        {/* Time signature */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] uppercase tracking-wider text-content-secondary">Sig</span>
          <select
            value={timeSignature}
            onChange={(e) => setTimeSignature(e.target.value)}
            disabled={!selectedAsset}
            className="text-sm font-mono font-bold bg-transparent border-none outline-none disabled:opacity-30 cursor-pointer"
            style={{ color: COLORS.smoke }}
          >
            {['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8'].map(sig => (
              <option key={sig} value={sig} style={{ color: COLORS.onyx, backgroundColor: COLORS.smoke }}>
                {sig}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Snap toggle — local, per-session */}
        <button
          onClick={() => setSnapToBeats(prev => !prev)}
          disabled={!selectedAsset || !bpm}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium transition-colors disabled:opacity-30 ${
            snapToBeats ? 'text-content-on-dark' : 'text-content-secondary hover:text-content-on-dark'
          }`}
          title="Snap loop region to the beat grid"
        >
          <FontAwesomeIcon icon={faMagnet} className="text-[10px]" />
          <span className="uppercase tracking-wider">Snap to grid:</span>
          <span className="uppercase tracking-wider font-bold">
            {snapToBeats ? 'ON' : 'OFF'}
          </span>
        </button>

        <div className="w-px h-6 bg-border" />

        {/* Transport controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleStop}
            disabled={!selectedAsset}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-content-secondary hover:text-content-on-dark transition-colors disabled:opacity-30"
            title="Stop (Enter)"
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

        <div className="w-px h-6 bg-border" />

        {/* Position */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] uppercase tracking-wider text-content-secondary">Position</span>
          <span className="text-sm font-mono font-bold text-content-on-dark">
            <span ref={timecodeRef}>{formatTimecode(0)}</span>
          </span>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Loop drawer toggle — sets an explicit override on top of the
            loop-mode-derived default, so the button behaves as expected
            regardless of which mode the track is currently in. */}
        <button
          onClick={() => setLoopDrawerOverride(!loopDrawerOpen)}
          disabled={!selectedAsset}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium transition-colors disabled:opacity-30 ${
            loopDrawerOpen ? 'text-content-on-dark' : 'text-content-secondary hover:text-content-on-dark'
          }`}
          title="Loop points"
        >
          <FontAwesomeIcon icon={faArrowsLeftRightToLine} className="text-lg" />
          LOOP
        </button>

        <div className="w-px h-6 bg-border" />

        {/* Zoom — horizontal (time) */}
        <div className="flex items-center gap-1">
          <FontAwesomeIcon icon={faArrowsLeftRight} className="text-xs text-content-secondary mr-0.5" />
          <button
            onClick={zoomOutH}
            disabled={!selectedAsset || pxPerSec <= MIN_PX_PER_SEC + 0.01}
            className="flex items-center justify-center w-7 h-7 rounded-sm transition-colors disabled:opacity-30 hover:opacity-60"
            title="Zoom out (time)"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-sm" />
          </button>
          <button
            onClick={zoomInH}
            disabled={!selectedAsset || pxPerSec >= MAX_PX_PER_SEC - 0.01}
            className="flex items-center justify-center w-7 h-7 rounded-sm hover:text-content-secondary transition-colors disabled:opacity-30"
            title="Zoom in (time)"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="text-sm" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          {/* Zoom — vertical (amplitude) */}
          <FontAwesomeIcon icon={faArrowsUpDown} className="text-xs text-content-secondary mr-0.5" />
          <button
            onClick={zoomOutV}
            disabled={!selectedAsset || waveHeight <= MIN_WAVE_HEIGHT}
            className="flex items-center justify-center w-7 h-7 rounded-sm transition-colors disabled:opacity-30 hover:opacity-60"
            title="Zoom out (amplitude)"
            style={{ color: COLORS.smoke }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-sm" />
          </button>
          <button
            onClick={zoomInV}
            disabled={!selectedAsset || waveHeight >= MAX_WAVE_HEIGHT}
            className="flex items-center justify-center w-7 h-7 rounded-sm hover:text-content-secondary transition-colors disabled:opacity-30"
            title="Zoom in (amplitude)"
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

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loadingAsset ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-content-secondary">Loading track...</div>
          </div>
        ) : !selectedAsset ? (
          <div
            className="flex-1 flex items-center justify-center cursor-pointer"
            onClick={() => setShowImportModal(true)}
          >
            <span className="text-sm text-content-secondary">Click to import a music asset</span>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto p-4" style={{ backgroundColor: COLORS.onyx }}>
            <WaveformViewer
              ref={waveformRef}
              audioBuffer={audioBufferRef.current}
              regionStart={loopStart}
              regionEnd={loopEnd}
              regionEditEnabled={loopDrawerOpen}
              onRegionChange={(start, end) => {
                setLoopStart(start);
                setLoopEnd(end);
                if (loopMode !== 'region') setLoopMode('region');
              }}
              onSeek={seekTo}
              height={waveHeight}
              bpm={bpm}
              timeSignature={timeSignature}
              snapToBeats={snapToBeats}
            />
          </div>
        )}

        {/* ── Loop Points Drawer ──────────────────────────────────────── */}
        {loopDrawerOpen && selectedAsset && (
          <div className="flex-shrink-0 border-t border-border-active bg-surface-secondary max-h-[50%] overflow-y-auto">
            {/* Header — constrained to match the body column */}
            <div className="mx-auto w-full" style={{ maxWidth: 'min(80vw, 1200px)' }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <div className="text-[11px] font-bold uppercase tracking-wider text-content-on-dark">
                  Loop Points — {selectedAsset.filename}
                </div>
                <button
                  onClick={() => setLoopDrawerOverride(false)}
                  className="text-[10px] text-content-secondary hover:text-content-on-dark transition-colors uppercase tracking-wider"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 mx-auto w-full" style={{ maxWidth: 'min(80vw, 1200px)' }}>
              <AudioWorkstationControls
                loopMode={loopMode}
                onLoopModeChange={setLoopMode}
                loopStart={loopStart}
                loopEnd={loopEnd}
                bpm={bpm}
                timeSignature={timeSignature}
                onClearRegion={handleClearRegion}
                isSaving={updateMutation.isPending}
                saveSuccess={saveSuccess}
                error={updateMutation.error?.message}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Import Modal ───────────────────────────────────────────────── */}
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

function formatTimecode(seconds) {
  if (seconds == null || isNaN(seconds)) return '00:00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}
