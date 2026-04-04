/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import AudioWorkstationControls from './AudioWorkstationControls';
import { useUpdateAudioConfig } from '../hooks/useUpdateAudioConfig';
import { useWorkshopPreview } from '../hooks/useWorkshopPreview';
import { detectBpm } from '../utils/detectBpm';
import { THEME } from '@/app/styles/colorTheme';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

export default function AudioWorkstationTool({ selectedAssetId, onAssetSelect }) {
  const assetManager = useAssetManager();
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  // Resolve loop_mode from asset data (handles legacy default_looping)
  const resolveLoopMode = (asset) => {
    if (asset.loop_mode) return asset.loop_mode;
    if (asset.default_looping === false) return 'off';
    return 'full';
  };

  // Initialize draft state from asset
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

  // ── Fetch asset when selectedAssetId changes ─────────────────────────────
  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      setSaveSuccess(false);
      updateMutation.reset();
      return;
    }

    if (selectedAsset?.id === selectedAssetId) return;

    let cancelled = false;

    async function loadAsset() {
      setLoadingAsset(true);
      setSaveSuccess(false);
      updateMutation.reset();

      const assetData = await fetchAssetById(selectedAssetId);
      if (cancelled) return;

      if (!assetData) {
        setLoadingAsset(false);
        return;
      }

      setSelectedAsset(assetData);
      initDraftFromAsset(assetData);
      setLoadingAsset(false);
    }

    loadAsset();
    return () => { cancelled = true; };
  }, [selectedAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WaveSurfer initialization ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAsset?.s3_url || !waveformRef.current) return;

    let ws = null;
    let regions = null;

    const initWaveSurfer = async () => {
      // Initialize preview engine
      await preview.init();
      preview.initFromAsset(selectedAsset);

      ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#6b7280',
        progressColor: '#e11d48',
        cursorColor: '#f9fafb',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        height: 200,
        normalize: true,
        backend: 'WebAudio',
      });

      regions = ws.registerPlugin(RegionsPlugin.create());
      regionsRef.current = regions;

      // Fetch audio via assetManager to handle CORS + progress tracking
      const blob = await assetManager.download(selectedAsset.s3_url, selectedAsset.file_size, selectedAsset.id);
      ws.loadBlob(blob);

      ws.on('ready', () => {
        setDuration(ws.getDuration());

        // Restore existing loop region from asset
        if (selectedAsset.loop_start != null && selectedAsset.loop_end != null) {
          regions.addRegion({
            start: selectedAsset.loop_start,
            end: selectedAsset.loop_end,
            color: 'rgba(225, 29, 72, 0.15)',
            drag: true,
            resize: true,
          });
        }
      });

      ws.on('timeupdate', (time) => setCurrentTime(time));
      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('finish', () => setIsPlaying(false));

      // Region events — update draft state when markers are dragged
      regions.on('region-updated', (region) => {
        setLoopStart(parseFloat(region.start.toFixed(3)));
        setLoopEnd(parseFloat(region.end.toFixed(3)));
      });

      // Allow creating a region by dragging on empty waveform
      regions.enableDragSelection({
        color: 'rgba(225, 29, 72, 0.15)',
      });

      // Only allow one region — remove old ones when a new one is created
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
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.playPause();
  }, []);

  const handleStop = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // ── BPM detection ────────────────────────────────────────────────────────
  const handleDetectBpm = useCallback(async () => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    setIsDetectingBpm(true);
    try {
      const decodedData = ws.getDecodedData();
      if (!decodedData) {
        setIsDetectingBpm(false);
        return;
      }
      const detected = await detectBpm(decodedData);
      setBpm(detected);
    } catch (error) {
      console.warn('BPM detection failed:', error);
    } finally {
      setIsDetectingBpm(false);
    }
  }, []);

  // ── Clear region ─────────────────────────────────────────────────────────
  const handleClearRegion = useCallback(() => {
    const regions = regionsRef.current;
    if (regions) {
      regions.clearRegions();
    }
    setLoopStart(null);
    setLoopEnd(null);
    if (loopMode === 'region') {
      setLoopMode('full');
    }
  }, [loopMode]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      const updatedAsset = await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        audioConfig: {
          loop_start: loopStart,
          loop_end: loopEnd,
          bpm,
          loop_mode: loopMode,
        },
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      savedStateRef.current = { loopMode, loopStart, loopEnd, bpm };
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error available via updateMutation.error
    }
  };

  // ── Reset to saved ───────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    const saved = savedStateRef.current;
    setLoopMode(saved.loopMode);
    setLoopStart(saved.loopStart);
    setLoopEnd(saved.loopEnd);
    setBpm(saved.bpm);

    // Rebuild the waveform region
    const regions = regionsRef.current;
    if (regions) {
      regions.clearRegions();
      if (saved.loopStart != null && saved.loopEnd != null) {
        regions.addRegion({
          start: saved.loopStart,
          end: saved.loopEnd,
          color: 'rgba(225, 29, 72, 0.15)',
          drag: true,
          resize: true,
        });
      }
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {loadingAsset ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-content-secondary">Loading audio workstation...</div>
        </div>
      ) : selectedAsset ? (
        <div className="flex-1 min-h-0 flex gap-6">
          {/* Waveform + Transport Area */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Waveform */}
            <div className="flex-1 min-h-0 relative rounded-sm overflow-hidden border border-border bg-surface-primary">
              <div ref={waveformRef} className="w-full h-full" />
            </div>

            {/* Transport bar */}
            <div className="flex items-center gap-4 px-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePlayPause}
                  className="flex items-center justify-center w-9 h-9 rounded-sm border border-border text-content-secondary hover:bg-surface-secondary hover:text-content-on-dark transition-colors"
                >
                  <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} className="text-sm" />
                </button>
                <button
                  onClick={handleStop}
                  className="flex items-center justify-center w-9 h-9 rounded-sm border border-border text-content-secondary hover:bg-surface-secondary hover:text-content-on-dark transition-colors"
                >
                  <FontAwesomeIcon icon={faStop} className="text-sm" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-content-secondary">
                <span>{formatTimeCompact(currentTime)}</span>
                <span className="text-content-secondary/40">/</span>
                <span>{formatTimeCompact(duration)}</span>
              </div>

              {bpm && (
                <div className="ml-auto text-xs text-content-secondary">
                  <span className="font-mono">{bpm}</span> BPM
                </div>
              )}
            </div>
          </div>

          {/* Controls Sidebar */}
          <div className="w-72 flex-shrink-0">
            <AudioWorkstationControls
              loopMode={loopMode}
              onLoopModeChange={setLoopMode}
              loopStart={loopStart}
              loopEnd={loopEnd}
              bpm={bpm}
              onBpmChange={setBpm}
              onDetectBpm={handleDetectBpm}
              isDetectingBpm={isDetectingBpm}
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
      ) : (
        /* Asset grid — shows when no asset is selected */
        <AssetPicker
          assetType="music"
          onSelect={(assetId) => onAssetSelect(assetId)}
        />
      )}
    </div>
  );
}

function formatTimeCompact(seconds) {
  if (seconds == null || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
