/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';

import Modal from './Modal';

/**
 * FocalAreaModal — pick a square focal region of an image (tokens v2,
 * decision 28). Instagram-avatar interaction via react-easy-crop: a fixed
 * round frame previews the final circle while the user pans/zooms the
 * image underneath. onCropComplete hands back natural-pixel coordinates,
 * which is exactly the FocalArea storage shape {x, y, size}.
 *
 * Purpose-agnostic by design: the caller owns persistence and the purpose
 * key ("token" today, "character" in a later PR). The modal only converts
 * an image + optional initial area into a confirmed square — or, for a
 * caller that passes a non-square aspect and a 'rect' frame, a region.
 */
export default function FocalAreaModal({
  open,
  imageUrl,
  initialArea = null,   // {x, y, size} or {x, y, width, height}, native px; null = fresh pick
  title = 'Choose the focal area',
  confirmLabel = 'Use this area',
  hint = 'Drag to position, scroll or use the slider to zoom. The circle is exactly how the token will look.',
  aspect = 1,           // width / height of the frame; 1 confirms a square, anything else a region
  cropShape = 'round',  // 'round' | 'rect'
  saving = false,
  onConfirm,            // square: ({x, y, size}); otherwise ({x, y, width, height}) — native px
  onCancel,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);

  const handleCropComplete = useCallback((_croppedAreaPercent, croppedAreaPixels) => {
    setAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirm = () => {
    if (!areaPixels || !onConfirm) return;
    // The stored shape follows the frame: a square keeps the FocalArea contract's one
    // side length; any other ratio is a FocalRegion with both.
    if (aspect === 1) {
      onConfirm({ x: areaPixels.x, y: areaPixels.y, size: areaPixels.width });
    } else {
      onConfirm({ x: areaPixels.x, y: areaPixels.y, width: areaPixels.width, height: areaPixels.height });
    }
  };

  const initialPixels = initialArea
    ? {
        x: initialArea.x,
        y: initialArea.y,
        width: initialArea.width ?? initialArea.size,
        height: initialArea.height ?? initialArea.size,
      }
    : undefined;

  return (
    <Modal open={open} onClose={onCancel} size="lg">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-content-on-dark">{title}</p>
        <p className="text-xs text-content-secondary">{hint}</p>

        <div className="relative w-full h-80 bg-black/60 rounded overflow-hidden">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            initialCroppedAreaPixels={initialPixels}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <input
          type="range"
          min={1}
          max={5}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-full cursor-pointer"
          aria-label="Zoom"
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 rounded text-xs text-gray-300 border border-white/25 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !areaPixels}
            className="px-3 py-1.5 rounded text-xs bg-emerald-900/60 text-emerald-100 border border-emerald-400/50 hover:bg-emerald-900/90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
