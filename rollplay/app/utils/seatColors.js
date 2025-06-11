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