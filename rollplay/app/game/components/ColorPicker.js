'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * ColorPicker Component
 * Handles character color changes with Coloris integration
 * `usedColors` is inform-only: entries ({color, ownerName}) mark colors other
 * players' characters currently display so a small "in use" hint can render —
 * every color always remains fully selectable.
 */
export default function ColorPicker({
  currentColor,
  onColorChange,
  userId,
  playerName,
  usedColors = [],
  disabled = false
}) {
  const inputRef = useRef(null);
  const [isChanging, setIsChanging] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  // Live picker value while Coloris is open — drives the "in use" hint
  const [liveColor, setLiveColor] = useState(null);

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

          // Track the live selection so the "in use" hint can react instantly
          setLiveColor(newColor);

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

          // Picker closed — retire the live "in use" hint
          setLiveColor(null);
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

    // Call the parent's color change handler with userId as identity —
    // color is character-owned, so no seat index travels with it
    onColorChange(userId, newColor);

    // Set cooldown for 5 seconds
    setTimeout(() => {
      setCooldownActive(false);
      setIsChanging(false);
    }, 5000);
  };

  // Inform-only annotation: does the live picker value match a color another
  // player's character already displays? Selection is never blocked on this.
  const normalizedLiveColor = liveColor ? liveColor.toLowerCase() : null;
  const liveColorInUse = normalizedLiveColor
    ? usedColors.find(usage => usage.color && usage.color.toLowerCase() === normalizedLiveColor)
    : null;

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
          rounded border cursor-pointer transition-colors duration-200
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

      {/* Inform-only "in use" hint — same tooltip shell as the cooldown notice */}
      {!cooldownActive && liveColorInUse && (
        <div className="absolute -top-8 left-0 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: liveColorInUse.color }}
          />
          In use by {liveColorInUse.ownerName}
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

  const handleColorChange = (userId, newColor) => {
    if (colorChangeDisabled) return;

    // Disable color changes for 5 seconds
    setColorChangeDisabled(true);
    setTimeout(() => setColorChangeDisabled(false), 5000);

    // Send color change via WebSocket — character-owned, no seat index
    sendColorChange(userId, newColor);
  };

  return {
    colorChangeDisabled,
    handleColorChange
  };
}