/**
 * Simple seat color system - deterministic mapping of seat index to Tailwind color
 */

// 8-seat color system - seat index maps directly to color
const SEAT_COLORS = [
  'blue',   // Seat 0
  'red',    // Seat 1  
  'green',  // Seat 2
  'orange', // Seat 3
  'purple', // Seat 4
  'cyan',   // Seat 5
  'pink',   // Seat 6
  'lime',   // Seat 7
];

// Concrete hex values for the palette (Tailwind 500-level shades) — CSS custom
// properties and the color picker need real color values, not Tailwind names
const SEAT_COLOR_HEX = {
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#22c55e',
  orange: '#f97316',
  purple: '#a855f7',
  cyan: '#06b6d4',
  pink: '#ec4899',
  lime: '#65a30d',
};

/**
 * Get seat color name by seat index
 * @param {number} seatIndex - Zero-based seat index (0-7)
 * @returns {string} Tailwind color name (e.g., 'blue', 'red')
 */
export const getSeatColor = (seatIndex) => {
  if (seatIndex < 0 || seatIndex >= SEAT_COLORS.length) {
    return SEAT_COLORS[0]; // Default to blue
  }
  return SEAT_COLORS[seatIndex];
};

/**
 * Get seat fallback color as a hex value by seat index
 * @param {number} seatIndex - Zero-based seat index (0-7)
 * @returns {string} Hex color (e.g., '#3b82f6')
 */
export const getSeatColorHex = (seatIndex) => {
  return SEAT_COLOR_HEX[getSeatColor(seatIndex)];
};