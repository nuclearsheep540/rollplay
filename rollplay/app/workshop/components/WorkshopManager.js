/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation';
import WorkshopToolNav from './WorkshopToolNav';

// Route map for each tool
const TOOL_ROUTES = {
  maps: '/workshop/map-config?from=map-config',
  // audio: '/workshop/audio-workstation',
  // npcs: '/workshop/npc-barracks',
  // scenes: '/workshop/scene-builder',
};

export default function WorkshopManager({ user }) {
  const router = useRouter();

  const handleToolSelect = (toolId) => {
    const route = TOOL_ROUTES[toolId];
    if (route) router.push(route);
  };

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

      {/* Tool grid */}
      <WorkshopToolNav activeTool={null} onToolChange={handleToolSelect} />
    </div>
  );
}
