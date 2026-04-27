/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation';
import WorkshopToolNav from './WorkshopToolNav';

// Route map for each tool
const TOOL_ROUTES = {
  maps: '/workshop/map-config?from=map-config',
  fog: '/workshop/fog-mask?from=fog-mask',
  images: '/workshop/image-config?from=image-config',
  audio: '/workshop/audio-workstation?from=audio-workstation',
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
      {/* Tool grid */}
      <WorkshopToolNav activeTool={null} onToolChange={handleToolSelect} />
    </div>
  );
}
