'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * ColorPicker Component
 * Handles player seat color changes with Coloris integration
 */
export default function ColorPicker({ 
  currentColor, 
  onColorChange, 
  playerName, 
  seatIndex, 
  disabled = false 
}) {
  const inputRef = useRef(null);
  const [isChanging, setIsChanging] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);

  // Initialize Coloris when component mounts
  useEffect(() => {
    let debounceTimer = null;
    
    const initializeColoris = async () => {
      try {
        // Dynamic import to ensure client-side only
        const { default: Coloris } = await import('@melloware/coloris');
        
        // Configure Coloris globally with wrap: false to prevent background styling
        Coloris.init();
        Coloris({
          el: '.custom-color-input', // Use custom selector
          wrap: false, // Prevents Coloris from applying background colors
          theme: 'polaroid',
          themeMode: 'dark',
          alpha: false,
          format: 'hex',
          clearButton: false,
          closeButton: true,
          closeLabel: 'Close',
          selectLabel: 'Select',
          swatches: [
            '#3b82f6', // blue
            '#ef4444', // red  
            '#22c55e', // green
            '#f97316', // orange
            '#a855f7', // purple
            '#06b6d4', // cyan
            '#ec4899', // pink
            '#65a30d', // lime
            '#8b5cf6', // violet
            '#f59e0b', // amber
            '#10b981', // emerald
            '#f43f5e', // rose
          ]
        });

        // Debounced color change handler
        const handleColorPick = (event) => {
          const newColor = event.detail.color;
          
          // Clear existing timer
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          
          // Set new timer to delay the color change
          debounceTimer = setTimeout(() => {
            handleColorChange(newColor);
          }, 300); // Wait 300ms after user stops changing colors
        };

        // Listen for color picker close (final selection)
        const handleColorClose = (event) => {
          const newColor = event.detail.color;
          
          // Clear any pending debounced calls
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          
          // Immediately send the final color when picker closes
          handleColorChange(newColor);
        };

        document.addEventListener('coloris:pick', handleColorPick);
        document.addEventListener('coloris:close', handleColorClose);

        // Cleanup listeners on unmount
        return () => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          document.removeEventListener('coloris:pick', handleColorPick);
          document.removeEventListener('coloris:close', handleColorClose);
        };

      } catch (error) {
        console.error('Failed to initialize Coloris:', error);
      }
    };

    initializeColoris();
  }, []);

  // Handle color change with cooldown
  const handleColorChange = (newColor) => {
    if (cooldownActive || disabled) return;
    
    // Don't send if color hasn't actually changed
    if (newColor === currentColor) {
      console.log(`🎨 Color unchanged (${newColor}), skipping`);
      return;
    }

    console.log(`🎨 Sending color change: ${currentColor} → ${newColor}`);
    
    setIsChanging(true);
    setCooldownActive(true);

    // Call the parent's color change handler
    onColorChange(playerName, seatIndex, newColor);

    // Set cooldown for 5 seconds
    setTimeout(() => {
      setCooldownActive(false);
      setIsChanging(false);
    }, 5000);
  };

  return (
    <div className="color-picker-container relative">
      <input
        ref={inputRef}
        type="text"
        value={currentColor}
        readOnly
        disabled={disabled || cooldownActive}
        className={`
          color-picker-input custom-color-input w-[calc(24px*var(--ui-scale))] h-[calc(24px*var(--ui-scale))] 
          rounded border cursor-pointer transition-all duration-200
          flex items-center justify-center text-[calc(12px*var(--ui-scale))]
          ${cooldownActive 
            ? 'opacity-50 cursor-not-allowed' 
            : 'hover:bg-white/10'
          }
        `}
        style={{ 
          color: 'transparent',
          textIndent: '-9999px',
          backgroundColor: 'transparent',
          borderColor: cooldownActive ? '#6b7280' : currentColor
        }}
        title={
          cooldownActive 
            ? `Color change on cooldown...` 
            : `Click to change ${playerName}'s color`
        }
      />
      
      {/* Emoji overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[calc(12px*var(--ui-scale))]">
        🎨
      </div>
      
      {cooldownActive && (
        <div className="absolute -top-8 left-0 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          Cooldown active...
        </div>
      )}
    </div>
  );
}

/**
 * Hook for managing color picker state
 */
export function useColorPicker(sendColorChange) {
  const [colorChangeDisabled, setColorChangeDisabled] = useState(false);

  const handleColorChange = (playerName, seatIndex, newColor) => {
    if (colorChangeDisabled) return;

    // Disable color changes for 5 seconds
    setColorChangeDisabled(true);
    setTimeout(() => setColorChangeDisabled(false), 5000);

    // Send color change via WebSocket
    sendColorChange(playerName, seatIndex, newColor);
  };

  return {
    colorChangeDisabled,
    handleColorChange
  };
}