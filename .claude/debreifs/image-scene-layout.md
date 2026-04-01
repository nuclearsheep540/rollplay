# Debrief: Image Scene Layout

**Plan file:** `.claude-plans/image-scene-layout.md`
**Branches:** `image_scene_layout` (PR #124)
**Period:** March–April 2026
**Status:** Display modes shipped, visual overlays shipped, workshop shipped. Cine animations (Ken Burns, transitions, text overlays) not started — deferred to future work.

---

## Goals Set

1. Add display modes (float, wrap, cine) to image assets — full stack from contracts through frontend
2. Build cine mode as a cinematic storytelling tool with transitions, Ken Burns, text overlays, visual overlays, and UI hiding
3. Structure `cine_config` from untyped Dict to typed Pydantic models
4. Implement visual overlays (film grain, color filter) as the first cine feature
5. Create workshop Image Config tool for authoring display + cine config
6. Compose shared contracts in api-game to eliminate field drift bugs

---

## What Was Delivered

### Display Modes — Shipped
Four display modes (float, wrap, letterbox, cine) with full stack: shared contracts, PostgreSQL joined table + 3 migrations, domain aggregate, API endpoint, session ETL, api-game service + WebSocket, frontend rendering + DM controls.

Key files created:
- `rollplay-shared-contracts/shared_contracts/cine.py` — CineConfig + overlay contracts
- `api-site/modules/library/domain/cine_config.py` — domain value object
- `api-site/modules/library/domain/overlays/` — overlay domain types
- `rollplay/app/workshop/image-config/page.js` — workshop tool page
- `rollplay/app/workshop/components/ImageConfigTool.js` — config editor
- `rollplay/app/workshop/components/ImageDisplayControls.js` — display + overlay UI

### Visual Overlays — Shipped
Film grain and color filter overlays with discriminated union, typed stacking, workshop editing, and game-time rendering. Shared contract tests cover round-trip serialization and discriminator survival.

### Workshop Image Config — Shipped
Workshop tool for display mode, aspect ratio, position nudging, and cine overlay editing.

### Composed Contracts in api-game — Shipped
`ImageSettings` composes `ImageConfig`, `MapSettings` composes `MapConfig`. One shape in MongoDB, WebSocket, and frontend. Eliminated the field drift bugs.

### UI Hiding for Cine — Shipped
`cineHideUI` flag hides drawers, dice panel, and initiative for PLAYER role during cine mode. DM/moderator/spectator unaffected.

### Position Nudging — Shipped
`image_position_x/y` columns on `image_assets`, wired through ETL and MongoDB, with live slider controls in the game IMAGE drawer for letterbox mode.

### Not Delivered (deferred)
- **CineDisplay component** — no Ken Burns, entrance transitions, or text overlays. GSAP + animate.css installed but the animation rendering layer was not built.
- **Workshop cine preview** — no live playback of full cine sequences
- **`prefers-reduced-motion`** — not implemented

---

## Challenges

### Letterbox/cine mode confusion
Originally planned 3 modes (float, wrap, cine) where cine handled both letterboxing and cinematic effects. During implementation it became clear these had fundamentally different runtime semantics — letterbox is a DM tool adjustable mid-session, cine is workshop-authored and read-only. This caused confusing code paths where the same mode needed to sometimes allow ratio changes and sometimes not. Resolved by splitting into 4 modes (float, wrap, letterbox, cine) with clear ownership boundaries.

### Field drift in api-game
After wiring up cine_config through the stack, hit repeated bugs where fields were silently dropped during manual field-by-field construction in api-game (e.g. `cine_config.style` lost). The root cause was that `ImageSettings` and `MapSettings` duplicated contract fields as flat attributes and every construction site had to map them individually. This triggered the mid-flight decision to compose shared contracts instead (Sub-Plan C). The refactor touched 14 files but eliminated the entire class of drift bugs.

### MongoDB unpacking to old shape
After the compose-contracts refactor, existing MongoDB documents still had the flat shape. Had to handle both flat and nested formats during the transition. Commit `60646c4` resolved the last of these issues.

### Polymorphic response schema
The workshop tool needed to read image-specific fields from the asset API response, but the existing polymorphic response schema didn't surface them cleanly. Fixed in commit `7f38a3a` before workshop tool development could proceed.

---

## Decisions & Diversions

### D1: Three modes → Four modes (planned float/wrap/cine → shipped float/wrap/letterbox/cine)

**Plan said:** Three display modes — float, wrap, cine (where cine includes letterboxing).

**Shipped:** Four display modes — letterbox separated from cine as its own mode.

**Rationale:** Letterbox is a runtime DM framing tool (adjustable ratio + position mid-session). Cine is workshop-authored (overlays, UI hiding, future animations). Mixing both in one mode meant the code had to conditionally allow/disallow editing based on whether "cine features" were configured, which was confusing for both the code and the DM.

**Impact on future work:** Cine mode now has a clean boundary — everything in cine is read-only at runtime. When Ken Burns and transitions are added, they slot into cine without affecting letterbox behavior.

Documented in plan: `.claude-plans/image-scene-layout.md` → Layer 5a

### D2: Untyped Dict → Typed CineConfig (planned Dict → shipped Pydantic + domain dataclass)

**Plan said:** `cine_config: Optional[Dict[str, Any]]` everywhere.

**Shipped:** Typed `CineConfig` Pydantic model in shared contracts, domain `CineConfig` dataclass with validation in api-site, discriminated `VisualOverlay` union.

**Rationale:** Implementing visual overlays required per-overlay-type validation (blend modes, opacity ranges, hex colors). An untyped dict would have pushed all validation to the frontend. The typed model gives us validation at the contract boundary, domain layer, and repository load — catching schema drift early.

**Impact on future work:** When Ken Burns and text overlays are implemented, they get the same typed treatment — add a field to the contract's `CineConfig`, add a domain value object, wire validation.

Documented in plan: `.claude-plans/image-scene-layout.md` → Sub-Plan B

### D3: Flat api-game models → Composed contracts (planned flat → shipped composed)

**Plan said:** Add `display_mode` and `aspect_ratio` as flat fields on `ImageSettings`.

**Shipped:** `ImageSettings` composes `ImageConfig`, `MapSettings` composes `MapConfig`. All flat field duplication removed.

**Rationale:** Repeated drift bugs during cine implementation (4+ instances of fields silently dropped during manual mapping). The compose pattern eliminates the entire class of bugs by passing the contract through whole.

**Impact on future work:** Any new field added to `ImageConfig` or `MapConfig` in the shared contracts automatically flows through api-game without touching `ImageSettings`/`MapSettings`. No more manual field mapping.

Documented in plan: `.claude-plans/image-scene-layout.md` → Sub-Plan C

### D4: Immediate mode changes → Optimistic preview + apply (planned instant → shipped preview/apply)

**Plan said:** Mode change fires WebSocket immediately, no "apply" button needed.

**Shipped:** Optimistic preview with snapshot-based cancel. DM sees changes live locally, clicks "Apply" to broadcast, or cancels to revert.

**Rationale:** During testing, instant broadcasts on every click felt disruptive to players — rapid mode switching caused flickering. The preview/apply pattern gives the DM time to experiment without affecting other clients.

**Impact on future work:** Same pattern should be used for any future DM controls that affect the shared display.

### D5: Scope — CineDisplay animation layer not built

**Plan said:** Build CineDisplay component with GSAP Ken Burns, Animate.css entrance transitions, text overlays, master timeline orchestration.

**Shipped:** Dependencies installed (gsap, @gsap/react, animate.css), placeholders in CineConfig schema, but no CineDisplay component or animation rendering.

**Rationale:** The foundational work (display modes, contracts, compose refactor, visual overlays, workshop) consumed the full scope of the branch. The animation layer is a clean addition on top — all the plumbing is in place.

**Impact on future work:** CineDisplay is a new component rendered inside ImageDisplay when `display_mode === "cine"`. It reads from `cine_config.transition`, `cine_config.ken_burns`, `cine_config.text_overlays`. The component layer model is designed in the plan (Sub-Plan A) and the z-index slots are reserved.

---

## Open Items

1. **PR feedback fixes merged** — sentinel bug, MongoDB truthiness, contract tests, clarifying comments all actioned in the final commits before merge
2. **GSAP license** — GSAP's "No Charge" license is not OSS-compatible but permits free use for non-commercial projects. Tabletop Tavern is free (donations only for server costs). No conflict in practice, but worth noting if distribution model ever changes.
3. **Audio cue state bug** — unrelated bug noted during this branch, tracked in `.claude-plans/bug-audio-cue.md`
4. **Hot update for late-joining characters** — added opportunistically in commit `c314cc6`, not part of the original plan
