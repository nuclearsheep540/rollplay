// Custom Color Palette - Dashboard Redesign
// Copyright (C) 2025 Matthew Davey
// SPDX-License-Identifier: GPL-3.0-or-later

// =============================================================================
// CUSTOM COLOR PALETTE (The ONLY colors to use on dashboard)
// =============================================================================

export const COLORS = {
  carbon: '#1F1F1F',      // Dark backgrounds, deep contrast
  smoke: '#F7F4F3',    // Light text, borders, accents
  onyx: '#0B0A09',    // Mid-dark backgrounds, panels
  graphite: '#37322F',   // Secondary text, subtle borders
  silver: '#B5ADA6'  // Lightest accent, highlights
}

// =============================================================================
// SEMANTIC THEME MAPPINGS
// =============================================================================

export const THEME = {
  // Backgrounds (light main background with dark panels for maximum contrast)
  bgPrimary: COLORS.smoke,      // Main background (light)
  bgSecondary: COLORS.carbon,      // Secondary panels (deepest dark)
  bgPanel: COLORS.carbon,          // Panel backgrounds (deepest dark)

  // Text (context-aware for light and dark backgrounds)
  textBold: COLORS.onyx,
  textPrimary: COLORS.carbon,      // Dark text on light background
  textSecondary: COLORS.silver,    // Light secondary text - works on dark backgrounds
  textAccent: COLORS.silver,  // Light accent - works on both dark panels AND as emphasis
  textOnDark: COLORS.smoke,  // Light text specifically for dark backgrounds (header, tabs, buttons)

  // Borders
  borderDefault: COLORS.graphite,
  borderActive: COLORS.smoke,
  borderSubtle: `${COLORS.graphite}40`, // 25% opacity

  // Interactive states
  hoverBg: COLORS.silver,
  activeBg: COLORS.silver,
  focusBorder: COLORS.onyx,

  // Overlays (for modals, hero cards with images)
  overlayDark: `${COLORS.carbon}E6`, // 90% opacity (very dark overlay)
  overlayLight: `${COLORS.onyx}CC` // 80% opacity (medium dark overlay)
}

// =============================================================================
// COMMON STYLE OBJECTS (for inline styles)
// =============================================================================

export const STYLES = {
  card: {
    backgroundColor: THEME.bgPanel,
    borderColor: THEME.borderSubtle,
    color: THEME.textPrimary
  },

  button: {
    backgroundColor: THEME.bgSecondary,
    color: THEME.textPrimary,
    borderColor: THEME.borderDefault
  },

  buttonHover: {
    backgroundColor: THEME.bgSecondary,
    borderColor: THEME.borderActive,
    color: THEME.textAccent
  },

  tabActive: {
    borderBottomColor: THEME.borderActive,
    color: THEME.textAccent
  },

  tabInactive: {
    borderBottomColor: 'transparent',
    color: THEME.textSecondary
  }
}
