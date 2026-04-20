/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPen, faTrash, faFloppyDisk, faArrowRotateLeft,
  faXmark, faSliders,
} from '@fortawesome/free-solid-svg-icons';
import AssetPicker from './AssetPicker';
import {
  useListPresets, useCreatePreset, useUpdatePreset, useDeletePreset,
} from '../hooks/usePresets';
import { useAssets } from '@/app/asset_library/hooks/useAssets';
import { BGM_CHANNELS } from '@/app/audio_management/types';
import { COLORS } from '@/app/styles/colorTheme';

function emptySavedShape() {
  return { name: '', slots: [] };
}

export default function AudioPresetsTool({ onMix }) {
  const { data: presets = [], isLoading: presetsLoading } = useListPresets();
  const { data: musicAssets = [] } = useAssets({ assetType: 'music' });
  const createPreset = useCreatePreset();
  const updatePreset = useUpdatePreset();
  const deletePreset = useDeletePreset();

  const [selectedId, setSelectedId] = useState(null);
  const [pickerSlot, setPickerSlot] = useState(null); // channel_id with picker open
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // ── Editor state (bound to the selected preset) ─────────────────────────
  const [editorName, setEditorName] = useState('');
  const [editorSlots, setEditorSlots] = useState([]); // [{channel_id, music_asset_id}]
  const [savedSnapshot, setSavedSnapshot] = useState(emptySavedShape());

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedId) ?? null,
    [presets, selectedId]
  );

  // When selection changes, hydrate editor state from the preset
  useEffect(() => {
    if (!selectedPreset) {
      setEditorName('');
      setEditorSlots([]);
      setSavedSnapshot(emptySavedShape());
      return;
    }
    setEditorName(selectedPreset.name);
    setEditorSlots(selectedPreset.slots.map(s => ({ ...s })));
    setSavedSnapshot({
      name: selectedPreset.name,
      slots: selectedPreset.slots.map(s => ({ ...s })),
    });
    setErrorMsg(null);
  }, [selectedPreset]);

  // Auto-select first preset once loaded, if nothing selected
  useEffect(() => {
    if (selectedId) return;
    if (presets.length > 0) setSelectedId(presets[0].id);
  }, [presets, selectedId]);

  const assetById = useMemo(() => {
    const map = new Map();
    for (const a of musicAssets) map.set(a.id, a);
    return map;
  }, [musicAssets]);

  const slotsByChannel = useMemo(() => {
    const map = new Map();
    for (const slot of editorSlots) map.set(slot.channel_id, slot);
    return map;
  }, [editorSlots]);

  const hasChanges = useMemo(() => {
    if (!selectedPreset) return false;
    if (editorName !== savedSnapshot.name) return true;
    if (editorSlots.length !== savedSnapshot.slots.length) return true;
    for (const slot of editorSlots) {
      const match = savedSnapshot.slots.find(s => s.channel_id === slot.channel_id);
      if (!match || match.music_asset_id !== slot.music_asset_id) return true;
    }
    return false;
  }, [selectedPreset, editorName, editorSlots, savedSnapshot]);

  // ── Slot mutations (editor-local until Save) ────────────────────────────
  const setSlot = useCallback((channelId, assetId) => {
    setEditorSlots(prev => {
      const filtered = prev.filter(s => s.channel_id !== channelId);
      if (assetId) {
        filtered.push({ channel_id: channelId, music_asset_id: assetId });
      }
      return filtered;
    });
  }, []);

  // ── Save / revert ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedPreset) return;
    setErrorMsg(null);
    try {
      const body = {};
      if (editorName !== savedSnapshot.name) body.name = editorName;

      const slotsChanged =
        editorSlots.length !== savedSnapshot.slots.length ||
        editorSlots.some(s => {
          const prev = savedSnapshot.slots.find(x => x.channel_id === s.channel_id);
          return !prev || prev.music_asset_id !== s.music_asset_id;
        });
      if (slotsChanged) body.slots = editorSlots;

      if (!body.name && !body.slots) return;

      await updatePreset.mutateAsync({ presetId: selectedPreset.id, ...body });
      setSavedSnapshot({ name: editorName, slots: editorSlots.map(s => ({ ...s })) });
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to save preset');
    }
  }, [selectedPreset, editorName, editorSlots, savedSnapshot, updatePreset]);

  const handleRevert = useCallback(() => {
    setEditorName(savedSnapshot.name);
    setEditorSlots(savedSnapshot.slots.map(s => ({ ...s })));
    setErrorMsg(null);
  }, [savedSnapshot]);

  // ── Create / rename / delete presets ────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const name = newPresetName.trim();
    if (!name) return;
    setErrorMsg(null);
    try {
      const preset = await createPreset.mutateAsync({ name, slots: [] });
      setNewPresetName('');
      setShowCreateModal(false);
      setSelectedId(preset.id);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to create preset');
    }
  }, [newPresetName, createPreset]);

  const handleRename = useCallback(async () => {
    if (!selectedPreset) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    try {
      await updatePreset.mutateAsync({ presetId: selectedPreset.id, name: trimmed });
      setEditorName(trimmed);
      setSavedSnapshot(prev => ({ ...prev, name: trimmed }));
      setShowRenameModal(false);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to rename preset');
    }
  }, [selectedPreset, renameValue, updatePreset]);

  const handleDelete = useCallback(async () => {
    if (!selectedPreset) return;
    if (!window.confirm(`Delete preset "${selectedPreset.name}"?`)) return;
    setErrorMsg(null);
    try {
      await deletePreset.mutateAsync(selectedPreset.id);
      setSelectedId(null);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to delete preset');
    }
  }, [selectedPreset, deletePreset]);

  return (
    <div className="flex h-full border border-border bg-surface-secondary overflow-hidden">
      {/* ── Left pane: preset list ─────────────────────────────────────── */}
      <div
        className="flex-shrink-0 w-64 border-r border-border flex flex-col"
        style={{ backgroundColor: COLORS.carbon }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-xs font-bold uppercase tracking-wider text-content-on-dark">
            Presets
          </h2>
          <button
            onClick={() => { setNewPresetName(''); setShowCreateModal(true); }}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-content-secondary hover:text-content-on-dark transition-colors"
            title="New preset"
          >
            <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {presetsLoading ? (
            <div className="p-4 text-xs text-content-secondary">Loading...</div>
          ) : presets.length === 0 ? (
            <div className="p-4 text-xs text-content-secondary">
              No presets yet. Click New to create one.
            </div>
          ) : (
            presets.map(preset => {
              const isSelected = preset.id === selectedId;
              return (
                <button
                  key={preset.id}
                  onClick={() => setSelectedId(preset.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/40 transition-colors ${
                    isSelected ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/50'
                  }`}
                >
                  <div className={`text-sm font-medium ${
                    isSelected ? 'text-content-on-dark' : 'text-content-primary'
                  }`}>
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-content-secondary mt-0.5">
                    {preset.slots.length} {preset.slots.length === 1 ? 'track' : 'tracks'}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right pane: editor ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedPreset ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-content-secondary">
              Select a preset, or create a new one.
            </div>
          </div>
        ) : (
          <>
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-secondary">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-content-on-dark truncate max-w-[320px]">
                  {editorName || selectedPreset.name}
                </span>
                <button
                  onClick={() => { setRenameValue(selectedPreset.name); setShowRenameModal(true); }}
                  className="text-[10px] text-content-secondary hover:text-content-on-dark transition-colors"
                  title="Rename"
                >
                  <FontAwesomeIcon icon={faPen} className="text-[10px]" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <span className="text-[10px] text-content-secondary mr-2">Modified</span>
                )}
                {onMix && (
                  <button
                    onClick={() => onMix(selectedPreset.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors"
                    title="Open in Mix Editor"
                  >
                    <FontAwesomeIcon icon={faSliders} className="text-[10px]" />
                    Mix
                  </button>
                )}
                <button
                  onClick={handleRevert}
                  disabled={!hasChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faArrowRotateLeft} className="text-[10px]" />
                  Revert
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || updatePreset.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-interactive-active border border-border-active text-content-on-dark hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faFloppyDisk} className="text-[10px]" />
                  {updatePreset.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-feedback-error hover:border-feedback-error transition-colors"
                  title="Delete preset"
                >
                  <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                  Delete
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="px-4 py-2 text-xs text-feedback-error border-b border-border bg-surface-secondary">
                {errorMsg}
              </div>
            )}

            {/* Channel slot grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto flex flex-col gap-3">
                {BGM_CHANNELS.map(channel => {
                  const slot = slotsByChannel.get(channel.id);
                  const asset = slot ? assetById.get(slot.music_asset_id) : null;
                  return (
                    <div
                      key={channel.id}
                      className="flex items-center gap-4 px-4 py-3 rounded border border-border"
                      style={{ backgroundColor: COLORS.onyx }}
                    >
                      <div className="flex-shrink-0 w-16 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-content-secondary">
                          Channel
                        </div>
                        <div className="text-xl font-bold text-content-on-dark">
                          {channel.label}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {slot ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate">
                              <div className="text-sm text-content-on-dark truncate">
                                {asset?.filename ?? '(missing asset)'}
                              </div>
                              <div className="text-[10px] text-content-secondary font-mono truncate">
                                {slot.music_asset_id}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setPickerSlot(channel.id)}
                                className="text-[10px] uppercase tracking-wider text-content-secondary hover:text-content-on-dark transition-colors"
                              >
                                Change
                              </button>
                              <button
                                onClick={() => setSlot(channel.id, null)}
                                className="text-[10px] uppercase tracking-wider text-content-secondary hover:text-feedback-error transition-colors"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPickerSlot(channel.id)}
                            className="w-full text-left text-sm text-content-secondary hover:text-content-on-dark transition-colors"
                          >
                            + Add a track to channel {channel.label}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Create modal ──────────────────────────────────────────────── */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)} title="New Preset">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="e.g. Tavern Evening"
            autoFocus
            maxLength={64}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            className="w-full px-3 py-2 text-sm bg-surface-primary border border-border rounded-sm focus:outline-none focus:border-border-active"
            style={{ color: COLORS.onyx }}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:text-content-on-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newPresetName.trim() || createPreset.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-sm bg-interactive-active border border-border-active text-content-on-dark hover:opacity-80 transition-opacity disabled:opacity-30"
            >
              {createPreset.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Rename modal ──────────────────────────────────────────────── */}
      {showRenameModal && (
        <Modal onClose={() => setShowRenameModal(false)} title="Rename Preset">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            maxLength={64}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            className="w-full px-3 py-2 text-sm bg-surface-primary border border-border rounded-sm focus:outline-none focus:border-border-active"
            style={{ color: COLORS.onyx }}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowRenameModal(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:text-content-on-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={!renameValue.trim() || updatePreset.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-sm bg-interactive-active border border-border-active text-content-on-dark hover:opacity-80 transition-opacity disabled:opacity-30"
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {/* ── Asset picker modal ────────────────────────────────────────── */}
      {pickerSlot && (
        <Modal
          onClose={() => setPickerSlot(null)}
          title={`Pick a track for channel ${BGM_CHANNELS.find(c => c.id === pickerSlot)?.label ?? ''}`}
          wide
        >
          <AssetPicker
            assetType="music"
            onSelect={(assetId) => {
              setSlot(pickerSlot, assetId);
              setPickerSlot(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Modal primitive ──────────────────────────────────────────────────────────
function Modal({ onClose, title, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(11, 10, 9, 0.8)' }}
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? 'max-w-3xl max-h-[70vh]' : 'max-w-md'} rounded border border-border bg-surface-secondary p-6 overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-content-on-dark uppercase tracking-wider">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-content-secondary hover:text-content-on-dark"
          >
            <FontAwesomeIcon icon={faXmark} className="text-sm" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
