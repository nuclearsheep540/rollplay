# Fullscreen Toggle Button — Game Top Nav

## Context

The game UI would benefit from a fullscreen mode that hides browser chrome (toolbars, address bar) to maximize screen real estate during gameplay. The browser Fullscreen API supports this via `requestFullscreen({ navigationUI: 'hide' })`, which tells the browser to hide its own UI elements. Both Chrome and Safari (16.4+) support this standard option. Older Safari needs webkit-prefixed fallbacks (`webkitRequestFullscreen`), which don't accept the `navigationUI` option but hide toolbars by default anyway.

## Plan

### 1. Create `useFullscreen` hook

**New file:** `app/game/hooks/useFullscreen.js`

A small hook that encapsulates cross-browser fullscreen logic:

- **`isFullscreen`** — boolean state, kept in sync via `fullscreenchange` and `webkitfullscreenchange` event listeners on `document`. These events fire regardless of how fullscreen was entered/exited (our button, browser menu, Escape key), so the state always reflects reality.
  - Note: Chrome's F11 key triggers a separate "browser fullscreen" that does NOT fire Fullscreen API events — this is outside our control and not part of the DOM API. Our toggle only manages the DOM Fullscreen API.
- **`toggleFullscreen()`** — if not fullscreen, calls `document.documentElement.requestFullscreen({ navigationUI: 'hide' })` (with webkit fallback). If fullscreen, calls `document.exitFullscreen()` (with webkit fallback).
- Webkit fallbacks for older Safari: `webkitRequestFullscreen()`, `webkitExitFullscreen()`, `webkitFullscreenElement`
- `useEffect` cleanup removes event listeners on unmount

### 2. Add fullscreen button to top nav bar

**Modify:** `app/game/GameContent.js`

- Import `useFullscreen` hook
- Import `faExpand` and `faCompress` from `@fortawesome/free-solid-svg-icons` (FontAwesome)
- Place the toggle button in `.nav-actions`, after the UI scale toggle — it's a display preference control like scale
- **Icon swap:** `faExpand` (maximize) when not fullscreen, `faCompress` (minimize) when in fullscreen
- Uses a new `.fullscreen-btn` CSS class following the existing `.control-btn` pattern

```
[Campaign Title]   [Volume] [S M L] [⛶]   [Dashboard →]
```

### 3. Add fullscreen button styling

**Modify:** `app/globals.css`

Add `.fullscreen-btn` class following the `.control-btn` pattern already in globals.css (transparent bg, 1px border, hover turns green `#4ade80`, uses `var(--ui-scale)` for sizing consistency).

## Files Modified

| File | Action |
|------|--------|
| `app/game/hooks/useFullscreen.js` | Create — cross-browser fullscreen hook with event sync |
| `app/game/GameContent.js` | Modify — import hook + FA icons, add toggle button in nav-actions |
| `app/globals.css` | Modify — add `.fullscreen-btn` style |

## Verification

1. Open game session in Chrome — click button — browser enters fullscreen with toolbars hidden, icon changes to `faCompress`. Click again — exits fullscreen, icon reverts to `faExpand`.
2. Open game session in Safari — same behavior (webkit fallback path).
3. Press Escape while fullscreen — browser exits fullscreen, button icon updates correctly via `fullscreenchange` event.
4. UI scale S/M/L, volume, and Dashboard button all still work.
5. `npm run build` passes.
