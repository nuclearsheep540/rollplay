# Plan: Redesign Loading Gate — Full-Screen Themed Layout

## Context

The loading gate was just transformed from a cosmetic audio-unlock overlay into a genuine loading screen (previous plan). Now we're redesigning the visual layout to match a provided mockup — going from a centered 16:9 card to a full-screen, D&D-themed loading screen with hero image background, themed progress bar, fellowship panel, tips card, and decorative details.

No backend changes. No new hooks. Pure frontend UI work — replacing the gate overlay JSX in GameContent.js and updating CSS in globals.css.

---

## Visual Layout (6 zones)

### 1. Background (full viewport)
- Hero image fills viewport: `background-size: cover`, `background-position: center`
- Radial gradient overlay: darker at edges, slightly lighter at center, plus overall dark wash for text readability
- Replaces the current 16:9 card with `fixed inset-0` full-bleed background

### 2. Top Section (centered, upper area)
- Decorative horizontal rule: thin line with centered diamond `◆` ornament (flex row: `hr` + `◆` + `hr`)
- "NOW MANIFESTING" — `text-xs tracking-[0.3em] uppercase`, `COLORS.silver`
- Second decorative rule below
- **Campaign title** — large Metamorphous serif (`text-5xl md:text-7xl`), `COLORS.smoke`
- **Campaign description** — italic, `text-lg`, `COLORS.silver`, centered, `max-w-2xl`, wrapped in literal `"` quotes
- Data: `campaignMeta.title`, `campaignMeta.description`

### 3. Progress Bar (horizontally centered, lower-middle area)
- **Decorative corner brackets**: 4 small L-shaped border elements at corners of the bar container (~60% viewport width), thin, `COLORS.silver`
- **Left label**: Rotating themed flavor text — cycles every ~3s through phrases like "INKING CHRONICLES...", "SUMMONING SPIRITS...", "UNFURLING MAPS...", "TUNING THE SPHERES...", "FORGING BONDS...". `text-xs tracking-[0.2em] uppercase`, `COLORS.silver`
- **Progress bar**: dark track (`COLORS.graphite`), `COLORS.smoke` fill, `h-1.5`, `transition: width 0.15s`
- **Right label**: Percentage — `Math.round((loadedBytes / totalBytes) * 100)%`, `COLORS.smoke`
- When `gatePreload.ready`: progress section fades out (opacity transition 300ms), "CLICK TO ENTER" fades in — Metamorphous, tracking-widest, gentle pulse animation
- Data: `gatePreload.loadedBytes`, `gatePreload.totalBytes`, `gatePreload.ready`

### 4. Bottom-Left — "THE FELLOWSHIP" panel
- Semi-transparent card: `bg-black/60 backdrop-blur-sm`, subtle `COLORS.graphite` border, rounded
- Header: `faUsers` icon + "THE FELLOWSHIP" — `text-xs tracking-[0.2em] uppercase`, `COLORS.silver`
- Player list rows:
  - Amber dot (connected) or grey dot (not yet) — `w-2 h-2 rounded-full`
  - Player name — `COLORS.smoke`
  - Right: "Ready" pill badge when `gatePreload.ready`, otherwise blank for connected players, "Connecting..." italic for pending
- Data: `gameSeats` (seated players) + `lobbyUsers` (lobby), same dedup logic as current gate

### 5. Bottom-Right — "DID YOU KNOW?" tips
- `faBookOpen` icon
- "DID YOU KNOW?" header — same `text-xs tracking uppercase` style
- Tip text — italic, `COLORS.silver`, `max-w-xs`
- Static array of ~10-12 tips, randomly selected once on mount via `useMemo`
- Tips are app usage tips: grid inspect, audio effects, character release, fullscreen, cine mode, adventure log, etc.

### 6. Footer Bar (absolute bottom, full width)
- Left: `Room: {roomId}` — `text-xs`, `COLORS.graphite`
- Right: green dot + `v{version}` — version from `releases.json` `latest` field via JSON import
- Subtle, informational — not prominent

---

## Structural Layout (flex hierarchy)

```
fixed inset-0 z-[102]
├── Hero image bg div (absolute inset-0, cover)
├── Gradient overlay div (absolute inset-0, radial + linear gradient)
├── Content wrapper (absolute inset-0, flex flex-col, px-8 md:px-16)
│   ├── Top section (pt-[8vh] md:pt-[10vh], text-center)
│   │   ├── Decorative rule + "NOW MANIFESTING" + rule
│   │   ├── Campaign title (Metamorphous)
│   │   └── Campaign description (italic, quoted)
│   ├── Spacer (flex-1)
│   ├── Progress / CTA section (flex-shrink-0, w-3/5 mx-auto)
│   │   └── Relative container with corner brackets
│   │       ├── Loading: flavor text + bar + percentage
│   │       └── Ready: "CLICK TO ENTER" (fades in)
│   ├── Spacer (flex-1)
│   └── Bottom row (flex-shrink-0, flex justify-between items-end, pb-4)
│       ├── Fellowship panel (w-80, left-aligned)
│       └── Tips panel (w-72, right-aligned)
├── Footer bar (absolute bottom-0 w-full, flex justify-between, px-8, pb-2)
```

---

## State Additions (in GameContent.js)

```javascript
// Rotating flavor text for loading phase
const LOADING_PHRASES = [
  'INKING CHRONICLES', 'SUMMONING SPIRITS', 'UNFURLING MAPS',
  'TUNING THE SPHERES', 'FORGING BONDS', 'SETTING THE STAGE',
  'AWAKENING RELICS', 'CHARTING REALMS', 'WEAVING FATE'
];
const [flavorIndex, setFlavorIndex] = useState(0);
useEffect(() => {
  if (isAudioUnlocked) return;
  const id = setInterval(() => setFlavorIndex(i => (i + 1) % LOADING_PHRASES.length), 3000);
  return () => clearInterval(id);
}, [isAudioUnlocked]);

// Random app tip — selected once
const APP_TIPS = [ /* ~10-12 tips */ ];
const selectedTip = useMemo(() => APP_TIPS[Math.floor(Math.random() * APP_TIPS.length)], []);
```

---

## CSS Changes (`globals.css`)

- **Remove**: `.gate-card` and `.gate-description` container query rules (no longer needed)
- **Add**: `@keyframes gate-cta-fade-in` — opacity 0→1 over 500ms
- **Add**: `.gate-cta-enter` class applying the keyframe

---

## Imports to Add (GameContent.js)

- `faUsers`, `faBookOpen` to FontAwesome imports
- `import releases from '@/../releases.json'` for `releases.latest`

---

## Critical Files

| File | Changes |
|------|---------|
| `rollplay/app/game/GameContent.js` | Replace gate overlay JSX block (~2102-2190), add flavor text state/effect + tip constants, add FA + releases imports |
| `rollplay/app/globals.css` | Remove gate-card/gate-description rules, add CTA animation keyframes |

## Reused (no changes)
- `useGatePreload` — readiness + progress data
- `heroImageUrl` / `heroImageReady` — cached hero image
- `gameSeats` + `lobbyUsers` — connected players
- `handleEnterSession` — click handler
- `COLORS` from `colorTheme.js`
- `var(--font-metamorphous)`

## Verification

1. Load a game session — full-screen hero image background with themed layout
2. Throttle network (Slow 3G) — progress bar fills, themed text rotates every ~3s, percentage updates live
3. Downloads complete — progress fades out, "CLICK TO ENTER" fades in with pulse
4. Click CTA — audio unlocks, player auto-seats (same behavior)
5. Empty session (no assets) — gate shows ready quickly
6. No hero image — dark background, layout still intact
7. Mobile viewport — verify layout remains usable (panels may need to shrink or simplify)
