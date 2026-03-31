# Cine Mode — Cinematic Image Display

## Context

The image scene now supports three display modes: float, wrap, and letterbox. "Cine" is a fourth mode — a fully immersive cinematic storytelling experience.

Cine mode transforms the image display from a simple tool into an interactive storytelling experience with:
- **Entrance transitions** — how the image appears (fade, slide, zoom, etc.)
- **Ken Burns motion** — slow pan + zoom across a still image
- **Text overlays** — animated text appearing over the image
- **Visual overlays** — effects layered on top of the image
- **UI hiding** — hides game UI for PLAYER roles (wiring already in GameContent.js)

---

## Key Architectural Decisions

### Cine config is workshop-authored, game-read-only

- **Workshop** creates and edits `cine_config` on the image asset in PostgreSQL
- **Session start ETL** sends `cine_config` to api-game/MongoDB (read-only copy)
- **In-game** the DM selects "Cine" as display mode → `CineDisplay` reads the config
- **Session end ETL** does NOT write `cine_config` back — it's never mutated at runtime
- Session end ETL only syncs `display_mode` and `aspect_ratio` as today

### Cine button disabled without config

In the game IMAGE drawer, the "Cine" mode button is visible but **disabled** when the asset has no `cine_config`. Clear UX signal that this asset needs workshop configuration first.

### Workshop: "Image Config" tool

One workshop tool called "Image Config" that contains:
- Display mode + aspect ratio controls (what we built today)
- Cine configuration as a subset of tools within it (transitions, ken burns, text overlays)

---

## Animation Library Decision

**GSAP (`gsap` + `@gsap/react`)** for Ken Burns + text animations:
- Timeline-based orchestration — sequence entrance → ken burns → text
- Ken Burns is a coordinated `scale` + `x`/`y` tween
- `useGSAP()` hook handles React lifecycle/cleanup
- Performant — GPU-accelerated transforms

**Animate.css** for entrance transitions:
- Pre-built CSS classes (fadeIn, slideInUp, zoomIn, etc.)
- 4KB, zero JS overhead — just toggle a class
- Config stores effect names, frontend maps to Animate.css classes

---

## Config Architecture

### Config Shape

Config describes **what** to do, not **how**. The rendering layer (`CineDisplay`) decides which library handles each feature. This mapping is deterministic and lives in code, not config.

- Entrance transitions → Animate.css (class-based)
- Ken Burns motion → GSAP (timeline tweens)
- Text animations → GSAP (stagger, timeline)

```javascript
// cine_config — stored as JSONB on the image asset, read-only at runtime
{
  // Entrance transition — CineDisplay maps effect name → Animate.css class
  transition: {
    effect: "fadeIn",              // "fadeIn" | "slideInUp" | "zoomIn" | "none" | etc.
    duration: 1.5,                 // seconds
    delay: 0,                      // seconds before transition starts
  },
  
  // Ken Burns motion — CineDisplay always uses GSAP for this
  ken_burns: {
    enabled: true,
    duration: 12,                  // seconds for full motion
    start: { x: 0, y: 0, scale: 1.0 },
    end: { x: -5, y: -3, scale: 1.3 },
    easing: "power1.inOut",        // easing curve name
  },
  
  // Text overlays (array — multiple text elements)
  // CineDisplay always uses GSAP for text animation
  text_overlays: [
    {
      text: "The kingdom falls silent...",
      position: "bottom-center",   // preset positions (frontend defines available options)
      style: "subtitle",           // preset styles (frontend defines available options)
      animation: "fadeUp",         // "fadeUp" | "typewriter" | "none" | etc.
      delay: 2.0,                  // seconds after image enters
      duration: null,              // null = persist, number = auto-hide after
    }
  ],
  
  // Aspect ratio (reuse existing letterbox logic)
  aspect_ratio: "2.39:1",
  
  // UI hiding for players
  hide_player_ui: true,
}
```

Valid options for dropdowns (positions, styles, animations, effects) are defined as **frontend constants** in the components that render them. The backend stores and returns the JSONB blob without validating individual option values.

### Config Storage

- PostgreSQL: `image_assets` table gets new JSONB column `cine_config` (nullable)
- MongoDB: stored on the active image document (read-only copy via ETL)
- Shared contract: `ImageConfig` gets `cine_config: Optional[Dict] = None`
- Workshop writes `cine_config` via `PATCH /assets/{id}/image-config`
- Session start ETL includes `cine_config` in the payload to api-game
- Session end ETL **skips** `cine_config` — never overwritten from game state

### Why JSONB (not flat columns)

Cine config is complex and nested (arrays of text overlays, nested objects for ken burns). A single JSONB column is cleaner than 20+ flat columns. This matches how session config stores `audio_config` and `map_config` as JSONB.

---

## Frontend Architecture

### Component Layer Model

The cinematic image object is a nested structure where each layer has a single responsibility and uses a different mechanism (no transform conflicts):

```
Transition wrapper (entrance/exit — animates EVERYTHING as one unit)
  ├── Text overlays (z-15 — above letterbox, never clipped by bars)
  └── Letterbox container (aspect-ratio, black bars)
      └── Ken Burns wrapper (GSAP scale + translate within the frame)
          ├── Visual overlays (z-10 — pan/zoom with the image)
          └── <img object-fit:cover object-position:X% Y%> ← nudge/reframe
```

**Why this order:**
- **Transition** wraps everything — the letterbox IS part of the image object, so entrance/exit animations move bars + image + overlays together
- **Text overlays** sit above the letterbox so they're never clipped by bars, but inside the transition wrapper so they animate in/out with the object
- **Letterbox** constrains the visual frame with aspect-ratio + black background
- **Ken Burns** transforms only the image content within the letterbox frame
- **Visual overlays** are inside Ken Burns so they pan/zoom with the image
- **Image nudge** uses `object-position` (not transforms) to reframe the crop anchor — zero conflict with Ken Burns transforms or transitions

**Mechanism separation:**
- Transition = Animate.css class or GSAP on the outermost wrapper div
- Ken Burns = GSAP `transform: scale() translate()` on its own wrapper div
- Nudge = `object-position: X% Y%` on the `<img>` element (no transforms)

### New Component: `CineDisplay`

Rendered inside ImageDisplay when `display_mode === "cine"`. Orchestrates the full cinematic sequence using the layer model above.

### Animation Orchestration

GSAP master timeline coordinates everything:

```
0.0s  ─── Image enters (Animate.css class)
0.0s  ─── Ken Burns begins (GSAP scale + translate tween)
2.0s  ─── Text overlay 1 animates in (GSAP stagger)
5.0s  ─── Text overlay 2 animates in
12.0s ─── Ken Burns completes
```

### In-Game DM Controls (IMAGE drawer)

The display mode selector adds "Cine" as a fourth button:
- **Enabled** when asset has `cine_config` → selects cine mode, reads config
- **Disabled** when asset has no `cine_config` → tooltip: "Configure in Workshop"
- No cine editing controls in the game drawer — cine is read-only at runtime

### Workshop Controls (future — Image Config tool)

Single "Image Config" workshop tool containing:
- Display mode + aspect ratio (existing functionality)
- Cine configuration subset:
  - Transition picker (effect name + duration + delay)
  - Ken Burns editor (start/end position + scale + duration + easing)
  - Text overlay editor (add/remove text, position, style, animation, timing)
  - Preview playback

---

## Backend Changes

### Shared Contract
`rollplay-shared-contracts/shared_contracts/image.py`:
- Add `cine_config: Optional[Dict[str, Any]] = None` to `ImageConfig`

### PostgreSQL
`api-site/modules/library/model/image_asset_model.py`:
- Add `cine_config = Column(JSONB, nullable=True)` to `image_assets` table

`api-site/modules/library/domain/image_asset_aggregate.py`:
- Add `cine_config: Optional[dict] = None` field
- Add `"cine"` to `VALID_DISPLAY_MODES`
- Update `build_image_config_for_game()` to include `cine_config`
- `update_image_config_from_game()` does NOT touch `cine_config`

### MongoDB (api-game)
`api-game/imageservice.py`:
- Add `cine_config: Optional[Dict] = None` to `ImageSettings`
- Include in config preservation logic (read from existing doc on image re-load)
- `update_image_config()` does NOT update `cine_config` (it's read-only at runtime)

### Session ETL
- **Start (cold→hot)**: `_restore_image_config()` includes `cine_config` from asset
- **End (hot→cold)**: `_extract_and_sync_game_state()` syncs `display_mode`/`aspect_ratio` but **skips** `cine_config`

### GameContent.js
- Activate `cineHideUI` flag: `activeImage?.display_mode === 'cine' && activeImage?.cine_config?.hide_player_ui && isPlayer`
- Wiring already exists from previous work

---

## Implementation Order

1. **Install dependencies** — `npm install gsap @gsap/react animate.css`
2. **Config schema** — add `cine_config` JSONB column + migration
3. **Backend plumbing** — contract, aggregate, repository, ETL (read-only semantics)
4. **ImageControlsPanel** — add Cine button (disabled without config)
5. **CineDisplay component** — entrance transition + Ken Burns + text overlays
6. **cineHideUI activation** — flip the flag for player role hiding
7. **Workshop Image Config tool** — cine configuration editor

---

## Verification

1. Asset with no `cine_config` → Cine button disabled in game drawer
2. Asset with `cine_config` → Cine button enabled, selecting it triggers cinematic display
3. Image enters with configured transition effect
4. Ken Burns motion plays smoothly (GPU-accelerated transforms)
5. Text overlays animate in at configured delays
6. Letterbox bars display correctly with chosen aspect ratio
7. PLAYER role: all drawers/dice/initiative hidden, top nav visible
8. DM role: sees cinematic display but retains all UI controls
9. Session pause/resume: `cine_config` preserved (not overwritten by ETL)
10. Config persists across image switches (MongoDB preservation)
11. `prefers-reduced-motion` respected — skip animations gracefully
