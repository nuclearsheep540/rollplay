/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import WorkshopToolNav from './WorkshopToolNav';
import MapGridTool from './MapGridTool';

// Labels for the back button
const TOOL_LABELS = {
  maps: 'Map Config',
  audio: 'Audio Workstation',
  npcs: 'NPC Barracks',
  scenes: 'Scene Builder',
};

export default function WorkshopManager({ user }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read deep-link params (from Library context menu bridge)
  const toolParam = searchParams.get('tool');
  const assetIdParam = searchParams.get('asset_id');

  // null = show tool grid, string = inside a tool
  const [activeTool, setActiveTool] = useState(toolParam || null);
  const [deepLinkAssetId, setDeepLinkAssetId] = useState(assetIdParam || null);

  // Consume deep-link params: clear them from URL after reading
  useEffect(() => {
    if (toolParam || assetIdParam) {
      const current = new URLSearchParams(searchParams.toString());
      current.delete('tool');
      current.delete('asset_id');
      const remaining = current.toString();
      const newUrl = remaining ? `/dashboard?${remaining}` : '/dashboard?tab=workshop';
      router.replace(newUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold">
            Workshop
          </h1>
          <p className="mt-2 text-content-primary">
            Prepare and configure your assets before game sessions
          </p>
        </div>
      </div>

      {/* Tool grid (landing) or active tool content */}
      {!activeTool ? (
        <WorkshopToolNav activeTool={activeTool} onToolChange={setActiveTool} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Back to tool grid + tool label */}
          <button
            onClick={() => setActiveTool(null)}
            className="flex items-center gap-2 text-sm text-content-secondary hover:text-content-on-dark transition-colors mb-6 self-start"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
            <span>{TOOL_LABELS[activeTool] || 'Back'}</span>
          </button>

          {/* Tool content */}
          <div className="flex-1 min-h-0">
            {activeTool === 'maps' && (
              <MapGridTool
                deepLinkAssetId={deepLinkAssetId}
                onDeepLinkConsumed={() => setDeepLinkAssetId(null)}
              />
            )}

            {activeTool === 'audio' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-6xl mb-4 opacity-30">{'\uD83C\uDFB5'}</div>
                <h3 className="text-lg font-medium mb-2 text-content-on-dark">
                  Audio Workstation Coming Soon
                </h3>
                <p className="max-w-sm text-content-secondary">
                  Configure loop points, BPM, and waveform regions for your music tracks.
                </p>
              </div>
            )}

            {activeTool === 'npcs' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-6xl mb-4 opacity-30">{'\uD83D\uDEE1\uFE0F'}</div>
                <h3 className="text-lg font-medium mb-2 text-content-on-dark">
                  NPC Barracks Coming Soon
                </h3>
                <p className="max-w-sm text-content-secondary">
                  Build and manage NPC stat blocks, portraits, and encounter-ready profiles.
                </p>
              </div>
            )}

            {activeTool === 'scenes' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-6xl mb-4 opacity-30">{'\uD83C\uDFAC'}</div>
                <h3 className="text-lg font-medium mb-2 text-content-on-dark">
                  Scene Builder Coming Soon
                </h3>
                <p className="max-w-sm text-content-secondary">
                  Pre-build encounter layouts with maps, NPCs, and audio presets.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
