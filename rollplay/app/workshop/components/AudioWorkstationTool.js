/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faPause, faStop, faRepeat,
  faFileImport, faFloppyDisk, faArrowRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import AudioWorkstationControls from './AudioWorkstationControls';
import { useUpdateAudioConfig } from '../hooks/useUpdateAudioConfig';
import { useWorkshopPreview } from '../hooks/useWorkshopPreview';
import { detectBpm } from '../utils/detectBpm';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

// ── View tabs ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'arrangement', label: 'ARRANGEMENT' },
  { id: 'mixer', label: 'MIXER', disabled: true },
  { id: 'loop-points', label: 'LOOP POINTS' },
];

export default function AudioWorkstationTool({ initialAssetId }) {
  const assetManager = useAssetManager();
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('arrangement');
  const [showImportModal, setShowImportModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null); // 'file' | null

  // Draft state — local edits before save
  const [loopMode, setLoopMode] = useState('full');
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [bpm, setBpm] = useState(null);
  const [isDetectingBpm, setIsDetectingBpm] = useState(false);

  // Saved state reference — for detecting changes and reset
  const savedStateRef = useRef({ loopMode: 'full', loopStart: null, loopEnd: null, bpm: null });

  // WaveSurfer refs
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

  // Spacebar → play/pause
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        wavesurferRef.current?.playPause();
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

  const initDraftFromAsset = (asset) => {
    const mode = resolveLoopMode(asset);
    setLoopMode(mode);
    setLoopStart(asset.loop_start ?? null);
    setLoopEnd(asset.loop_end ?? null);
    setBpm(asset.bpm ?? null);
    savedStateRef.current = {
      loopMode: mode,
      loopStart: asset.loop_start ?? null,
      loopEnd: asset.loop_end ?? null,
      bpm: asset.bpm ?? null,
    };
  };

  const hasChanges = (
    loopMode !== savedStateRef.current.loopMode ||
    loopStart !== savedStateRef.current.loopStart ||
    loopEnd !== savedStateRef.current.loopEnd ||
    bpm !== savedStateRef.current.bpm
  );

  // ── Import asset ─────────────────────────────────────────────────────────
  const importAsset = useCallback(async (assetId) => {
    setLoadingAsset(true);
    setSaveSuccess(false);
    updateMutation.reset();

    const assetData = await fetchAssetById(assetId);
    if (!assetData) {
      setLoadingAsset(false);
      return;
    }

    setSelectedAsset(assetData);
    initDraftFromAsset(assetData);
    setLoadingAsset(false);
    setShowImportModal(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-import from deep-link (Library → Edit Loop Points)
  useEffect(() => {
    if (initialAssetId && !selectedAsset) {
      importAsset(initialAssetId);
    }
  }, [initialAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WaveSurfer initialization ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAsset?.s3_url || !waveformRef.current) return;

    let ws = null;
    let regions = null;

    const initWaveSurfer = async () => {
      await preview.init();
      preview.initFromAsset(selectedAsset);

      ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#B5ADA6',
        progressColor: '#37322F',
        cursorColor: '#F7F4F3',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        height: 'auto',
        normalize: true,
        backend: 'WebAudio',
      });

      regions = ws.registerPlugin(RegionsPlugin.create());
      regionsRef.current = regions;

      const blob = await assetManager.download(selectedAsset.s3_url, selectedAsset.file_size, selectedAsset.id);
      ws.loadBlob(blob);

      ws.on('ready', async () => {
        setDuration(ws.getDuration());
        if (selectedAsset.loop_start != null && selectedAsset.loop_end != null) {
          regions.addRegion({
            start: selectedAsset.loop_start,
            end: selectedAsset.loop_end,
            color: 'rgba(181, 173, 166, 0.15)',
            drag: true,
            resize: true,
          });
        }

        // Auto-detect BPM if the asset doesn't have one stored
        if (selectedAsset.bpm == null) {
          setIsDetectingBpm(true);
          try {
            const decodedData = ws.getDecodedData();
            if (decodedData) {
              const detected = await detectBpm(decodedData);
              if (detected) {
                setBpm(detected);
                // Persist immediately so it's available next time
                await authFetch(`/api/library/${selectedAsset.id}/audio-config`, {
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

      ws.on('timeupdate', (time) => setCurrentTime(time));
      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('finish', () => setIsPlaying(false));

      regions.on('region-updated', (region) => {
        setLoopStart(parseFloat(region.start.toFixed(3)));
        setLoopEnd(parseFloat(region.end.toFixed(3)));
      });

      regions.enableDragSelection({
        color: 'rgba(181, 173, 166, 0.15)',
      });

      regions.on('region-created', (region) => {
        const allRegions = regions.getRegions();
        for (const r of allRegions) {
          if (r.id !== region.id) r.remove();
        }
        setLoopStart(parseFloat(region.start.toFixed(3)));
        setLoopEnd(parseFloat(region.end.toFixed(3)));
      });

      wavesurferRef.current = ws;
    };

    initWaveSurfer();

    return () => {
      if (ws) {
        ws.destroy();
        wavesurferRef.current = null;
        regionsRef.current = null;
      }
      preview.destroy();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [selectedAsset?.id, selectedAsset?.s3_url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transport controls ───────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleStop = useCallback(() => {
    wavesurferRef.current?.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // ── BPM detection ────────────────────────────────────────────────────────
  const handleDetectBpm = useCallback(async () => {
    const ws = wavesurferRef.current;
    if (!ws || !selectedAsset) return;
    setIsDetectingBpm(true);
    console.log(`🎵 BPM detect started — current value: ${bpm ?? 'none'}, asset: ${selectedAsset.filename}`);
    try {
      const decodedData = ws.getDecodedData();
      if (!decodedData) {
        console.warn('🎵 BPM detect: no decoded data available from WaveSurfer');
        return;
      }
      console.log(`🎵 BPM detect: analysing ${decodedData.duration.toFixed(1)}s of audio (${decodedData.sampleRate}Hz, ${decodedData.numberOfChannels}ch)`);
      const detected = await detectBpm(decodedData);
      console.log(`🎵 BPM detect result: ${detected ?? 'null (no clear beat found)'} (was: ${bpm ?? 'none'})`);
      // Optimistically update UI
      setBpm(detected);
      // Persist to backend
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
  }, [selectedAsset, bpm]);

  const handleClearRegion = useCallback(() => {
    regionsRef.current?.clearRegions();
    setLoopStart(null);
    setLoopEnd(null);
    if (loopMode === 'region') setLoopMode('full');
  }, [loopMode]);

  const handleSave = async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      const updatedAsset = await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        audioConfig: { loop_start: loopStart, loop_end: loopEnd, bpm, loop_mode: loopMode },
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      savedStateRef.current = { loopMode, loopStart, loopEnd, bpm };
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error available via updateMutation.error
    }
  };

  const handleReset = useCallback(() => {
    const saved = savedStateRef.current;
    setLoopMode(saved.loopMode);
    setLoopStart(saved.loopStart);
    setLoopEnd(saved.loopEnd);
    setBpm(saved.bpm);
    const regions = regionsRef.current;
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
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full rounded border border-border bg-surface-primary overflow-hidden">
      {/* ── Menu Bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border bg-surface-secondary text-xs select-none">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'file' ? null : 'file'); }}
            className={`px-4 py-2 font-medium transition-colors ${
              menuOpen === 'file'
                ? 'bg-surface-primary text-content-on-dark'
                : 'text-content-secondary hover:text-content-on-dark'
            }`}
          >
            File
          </button>
          {menuOpen === 'file' && (
            <div className="absolute top-full left-0 z-50 min-w-[180px] py-1 border border-border bg-surface-secondary rounded-sm shadow-lg">
              <button
                onClick={() => { setMenuOpen(null); setShowImportModal(true); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs text-content-secondary hover:bg-surface-primary hover:text-content-on-dark transition-colors"
              >
                <FontAwesomeIcon icon={faFileImport} className="text-[10px] w-3" />
                Import Asset
              </button>
              <button
                onClick={() => { setMenuOpen(null); handleSave(); }}
                disabled={!hasChanges || !selectedAsset}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs text-content-secondary hover:bg-surface-primary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faFloppyDisk} className="text-[10px] w-3" />
                Save
              </button>
              <button
                onClick={() => { setMenuOpen(null); handleReset(); }}
                disabled={!hasChanges}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs text-content-secondary hover:bg-surface-primary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faArrowRotateLeft} className="text-[10px] w-3" />
                Revert Changes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Transport Bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 px-4 py-2 border-b border-border bg-surface-secondary">
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
            className={`flex items-center justify-center w-9 h-9 rounded-sm transition-colors disabled:opacity-30 ${
              isPlaying
                ? 'bg-content-on-dark text-surface-primary'
                : 'text-content-on-dark hover:bg-content-on-dark/10'
            }`}
          >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} className="text-sm" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

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

      {/* ── Tab Navigation ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border bg-surface-secondary">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-content-on-dark text-content-on-dark'
                : tab.disabled
                  ? 'border-transparent text-content-secondary/30 cursor-not-allowed'
                  : 'border-transparent text-content-secondary hover:text-content-on-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loadingAsset ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-content-secondary">Loading track...</div>
          </div>
        ) : activeTab === 'arrangement' ? (
          /* ── Arrangement View ──────────────────────────────────────────── */
          selectedAsset ? (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Track lane */}
              <div className="h-[120px] flex">
                {/* Track header */}
                <div className="w-40 flex-shrink-0 border-r border-border bg-surface-secondary px-3 py-3 flex flex-col gap-2">
                  <div className="text-[11px] font-bold text-content-on-dark uppercase tracking-wide truncate">
                    {selectedAsset.filename?.replace(/\.[^.]+$/, '') || 'Untitled'}
                  </div>
                  <div className="text-[10px] text-content-secondary font-mono">01</div>
                  <div className="flex items-center gap-1 mt-1">
                    <button className="w-6 h-5 rounded text-[10px] font-bold bg-border/40 text-content-secondary hover:bg-border hover:text-content-on-dark transition-colors">
                      S
                    </button>
                    <button className="w-6 h-5 rounded text-[10px] font-bold bg-border/40 text-content-secondary hover:bg-border hover:text-content-on-dark transition-colors">
                      M
                    </button>
                  </div>
                </div>

                {/* Waveform area */}
                <div className="flex-1 min-w-0 relative">
                  {/* Timeline ruler */}
                  <div className="h-6 border-b border-border bg-surface-secondary/50 flex items-end">
                    <TimelineRuler duration={duration} />
                  </div>
                  {/* Waveform */}
                  <div className="absolute top-6 left-0 right-0 bottom-0">
                    <div ref={waveformRef} className="w-full h-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: '#0B0A09' }}>
              <div className="text-sm">No track loaded</div>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-sm border border-border hover:border-border-active hover:text-content-on-dark transition-colors"
                style={{ color: '#0B0A09' }}
              >
                <FontAwesomeIcon icon={faFileImport} className="text-[10px]" />
                Import Asset
              </button>
              <div className="text-[10px] mt-2" style={{ color: '#0B0A09', opacity: 0.5 }}>
                Or use File &gt; Import Asset from the menu bar
              </div>
            </div>
          )
        ) : activeTab === 'loop-points' ? (
          /* ── Loop Points View ──────────────────────────────────────────── */
          selectedAsset ? (
            <div className="flex-1 min-h-0 p-6 overflow-y-auto">
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
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-content-secondary">
              Import a track to configure loop points
            </div>
          )
        ) : (
          /* ── Placeholder tabs ──────────────────────────────────────────── */
          <div className="flex-1 flex items-center justify-center text-sm text-content-secondary/40">
            Coming soon
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
