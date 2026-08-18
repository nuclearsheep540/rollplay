/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useState } from 'react';

import { fetchAssetById } from '@/app/shared/utils/fetchAssetById';
import { useSetFocalArea } from './useSetFocalArea';

/**
 * useFocalAreaFlow — the picker→crop→save chain behind every "token face"
 * selection (tokens v3, §3.1). One flow, two doors: the workshop's token
 * avatar button and the character avatar picker both funnel through here
 * so the interaction is coded once.
 *
 * The purpose key is deliberately hardcoded to "token" (decision 31): an
 * image has ONE crop no matter who sets it, so pc and npc tokens share a
 * single read path. Add a purpose parameter only when a second purpose
 * actually exists.
 *
 * Usage:
 *   const cropFlow = useFocalAreaFlow({ onCropSaved });
 *   cropFlow.begin(imageAssetId, context)  // fetches the asset, opens the
 *                                          // modal pre-filled; context is
 *                                          // handed back to onCropSaved
 *   {cropFlow.isOpen && <FocalAreaModal {...cropFlow.modalProps} />}
 *
 * Mount the modal conditionally on isOpen — a fresh mount per image is
 * what resets the cropper's pan/zoom state between uses.
 *
 * onCropSaved({ imageAssetId, imageUrl, area, context }) fires after the
 * PATCH lands; it may be async — a rejection keeps the modal open so the
 * user can retry or cancel, same as a failed crop save.
 */
export function useFocalAreaFlow({ onCropSaved }) {
  const [cropState, setCropState] = useState(null);
  const [saving, setSaving] = useState(false);
  const focalAreaMutation = useSetFocalArea();

  const begin = useCallback(async (imageAssetId, context = null) => {
    const imageAsset = await fetchAssetById(imageAssetId);
    if (!imageAsset) return false;
    setCropState({
      imageAssetId,
      imageUrl: imageAsset.s3_url,
      initialArea: imageAsset.focal_areas?.token || null,
      context,
    });
    return true;
  }, []);

  const cancel = useCallback(() => {
    setCropState(null);
  }, []);

  const confirm = useCallback(async (area) => {
    const activeCrop = cropState;
    if (!activeCrop) return;
    setSaving(true);
    try {
      await focalAreaMutation.mutateAsync({
        assetId: activeCrop.imageAssetId,
        purpose: 'token',
        area,
      });
      if (onCropSaved) {
        await onCropSaved({
          imageAssetId: activeCrop.imageAssetId,
          imageUrl: activeCrop.imageUrl,
          area,
          context: activeCrop.context,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[focal-area] crop save failed:', err);
      return; // keep the modal open; the user can retry or cancel
    } finally {
      setSaving(false);
    }
    setCropState(null);
  }, [cropState, focalAreaMutation, onCropSaved]);

  return {
    begin,
    isOpen: !!cropState,
    modalProps: {
      open: !!cropState,
      imageUrl: cropState?.imageUrl || null,
      initialArea: cropState?.initialArea || null,
      saving,
      onConfirm: confirm,
      onCancel: cancel,
    },
  };
}
