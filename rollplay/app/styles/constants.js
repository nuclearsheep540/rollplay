// UI Component Style Constants
// Copyright (C) 2025 Matthew Davey
// SPDX-License-Identifier: GPL-3.0-or-later

// =============================================================================
// THEME CONFIGURATION (Change colors, spacing, fonts here)
// =============================================================================

// Base Colors - Use explicit class names for Tailwind detection
const PRIMARY_BG = "bg-slate-800";
const PRIMARY_BORDER = "border-slate-800";
const PRIMARY_BG_HOVER = "hover:brightness-125"; // Automatically brighten whatever color is set
const PRIMARY_BORDER_HOVER = "hover:brightness-125"; // Automatically brighten border
const PRIMARY_BG_ACTIVE = "hover:brightness-125";
const PRIMARY_TEXT = "text-slate-200";
const SECONDARY_TEXT = "text-slate-600";
const ACTIVE_BG = "brightness-200";

// Typography & Spacing Scale
const TITLE_FONT = "text-m font-bold uppercase border-red-200/0";
const HEADER_FONT = "text-m font-semibold uppercase";
const CHILD_FONT = "text-sm";
const TITLE_PADDING = "p-4";
const HEADER_PADDING = "p-2";
const CHILD_PADDING = "p-2.5";
const STANDARD_BORDER_RADIUS = "rounded";

// =============================================================================
// 4 CORE STYLES (with built-in spacing)
// =============================================================================

// 1. Main collapsible titles (DM Command Center, Moderator Controls, etc.)
export const PANEL_TITLE = `pl-2 pr-2 flex items-center justify-between cursor-pointer transition-all duration-100 ${TITLE_PADDING} border ${PRIMARY_BORDER} ${PRIMARY_BG_HOVER} ${PRIMARY_BORDER_HOVER} ${PRIMARY_TEXT} ${TITLE_FONT} gap-2`;

// 2. Section headers within panels (Map Controls, Combat Management, etc.)
export const PANEL_HEADER = `mt-1 mb-2 flex items-center justify-between cursor-pointer transition-all duration-100 ${HEADER_PADDING} ${STANDARD_BORDER_RADIUS} border ${PRIMARY_BORDER} ${PRIMARY_BG_HOVER} ${PRIMARY_BORDER_HOVER} ${PRIMARY_TEXT} ${HEADER_FONT}`;

// 3. Sub-section headers (Attack Rolls, Ability Checks, etc.) NOT BEING USED
export const PANEL_SUB_HEADER = `m-1 font-semibold uppercase tracking-wide ${PRIMARY_TEXT} ${CHILD_FONT}`;

// 4. Interactive child elements (buttons, inputs, etc.)
export const PANEL_CHILD = `mb-1 w-full text-left transition-all duration-100 ${CHILD_PADDING} ${STANDARD_BORDER_RADIUS} border ${PRIMARY_BORDER} ${PRIMARY_TEXT} ${PRIMARY_BG_ACTIVE} ${CHILD_FONT}`;

// Variant for last elements (no bottom margin)
export const PANEL_CHILD_LAST = `${PANEL_CHILD} mb-4`;

// Arrow/chevron styling
export const PANEL_ARROW = `${SECONDARY_TEXT} transition-transform duration-100 ${CHILD_FONT}`;

// Special elements
export const PANEL_SUBTITLE = `text-sky-500/70 text-xs normal-case`;
export const PANEL_LABEL = `${PRIMARY_TEXT} font-medium ${CHILD_FONT}`;

// =============================================================================
// MODAL & VARIANT STYLES
// =============================================================================

// Modal container
export const MODAL_CONTAINER = "bg-slate-800 border border-amber-500/30 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6";
export const MODAL_TITLE = "text-amber-300 font-bold text-lg";
export const MODAL_CLOSE_BUTTON = "text-gray-400 hover:text-white transition-colors text-xl";

// Color-coded button variants for dice prompts
export const EMERALD_BUTTON = "text-left p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg transition-all duration-100 hover:bg-emerald-500/20 text-sm";
export const BLUE_BUTTON = "text-left p-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-lg transition-all duration-100 hover:bg-blue-500/20 text-sm";
export const RED_BUTTON = "text-left p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg transition-all duration-100 hover:bg-red-500/20 text-sm";
export const PURPLE_BUTTON = "w-full bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-lg py-3 transition-all duration-100 hover:bg-purple-500/30 text-sm";

// Section headers for modal
export const EMERALD_HEADER = "text-emerald-400 font-semibold mb-3 text-base";
export const BLUE_HEADER = "text-blue-400 font-semibold mb-3 text-base";
export const RED_HEADER = "text-red-400 font-semibold mb-3 text-base";
export const PURPLE_HEADER = "text-purple-400 font-semibold mb-3 text-base";

// Form elements
export const MODAL_INPUT = "w-full bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm";
export const MODAL_LABEL = "block text-gray-300 mb-2 text-sm";
export const MODAL_CANCEL_BUTTON = "px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded-md transition-all duration-100 hover:bg-gray-500 text-sm";

// Combat toggle
export const COMBAT_TOGGLE_ACTIVE = "bg-emerald-500 border-emerald-400";
export const COMBAT_TOGGLE_INACTIVE = "bg-gray-600 border-gray-500";

// Active/expanded state
export const ACTIVE_BACKGROUND = ACTIVE_BG;

// =============================================================================
// ALIASES (both components use identical styles)
// =============================================================================

// DM aliases
export const DM_TITLE = `${PANEL_TITLE} bg-none mt-6`;
export const DM_HEADER = `${PANEL_HEADER} bg-rose-500/20 border-rose-400/50`;
export const DM_SUB_HEADER = `${PANEL_SUB_HEADER} text-rose-400 border-rose-400/50`;
export const DM_CHILD = `${PANEL_CHILD} bg-rose-900/50 text-rose-100 border-rose-400/50`;
export const DM_CHILD_LAST = `${DM_CHILD} ${PANEL_CHILD_LAST}`;
export const DM_ARROW = `${PANEL_ARROW} text-rose-600`;

// Moderator aliases
export const MODERATOR_TITLE = `${PANEL_TITLE} bg-none`;
export const MODERATOR_HEADER = `${PANEL_HEADER} bg-blue-500/20 border-blue-400/50`;
export const MODERATOR_SUB_HEADER = `${PANEL_SUB_HEADER} text-blue-400 border-blue-400/50`;
export const MODERATOR_CHILD = `${PANEL_CHILD} bg-blue-950 text-blue-100 border-blue-400/50`;
export const MODERATOR_CHILD_LAST = `${MODERATOR_CHILD} ${PANEL_CHILD_LAST}`;
export const MODERATOR_ARROW = `${PANEL_ARROW} text-blue-500`;
export const MODERATOR_SUBTITLE = PANEL_SUBTITLE;
export const MODERATOR_LABEL = PANEL_LABEL;