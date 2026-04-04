# Debrief: Dissolve cine_config & Compose Shared Contracts

**Plan file:** `.claude/plans/motion-cine.md`
**Branch:** `motion_handheld` — PR #128
**Period:** 2026-04-03 → 2026-04-04
**Status:** Dissolution plan — all 12 steps complete. Compose contracts plan — Phase 1 (Image) and Phase 2 (Map) complete.

---

## 1. Goals Set

The branch started as **hand-held camera motion** work — adding a new motion effect to images. During implementation, two deeper architectural problems surfaced:

- **`cine_config` conflated two unrelated concerns**: "cine" as a display mode (hide player UI) was fused with visual effects (overlays, motion) inside a single `cine_config` wrapper. Effects could only be used in cine mode.
- **api-game models duplicated shared contract fields**: `ImageSettings` and `MapSettings` manually copied every field from the shared contracts, causing repeated field-drift bugs (most recently `cine_config.style` being silently dropped).

This led to two plans:
1. **Dissolve cine_config** — promote `visual_overlays` and `motion` to top-level image config fields, make `display_mode` (standard/cine) orthogonal to `image_fit` (float/wrap/letterbox)
2. **Compose shared contracts** — replace field duplication in api-game with direct composition of `ImageConfig` and `MapConfig`

Additionally, several bugs were discovered and fixed along the way.

---

## 2. What Was Delivered

### Dissolution (12 steps — all delivered)

| Area | Key Changes |
|------|-------------|
| **Migration** | Auto-generated + data backfill SQL: coerces old `display_mode` values, extracts overlays/motion from `cine_config` JSONB, drops column |
| **Backend domain** | `CineConfig` class removed. `image_fit`, `display_mode`, `visual_overlays`, `motion` are independent fields on `ImageAsset` aggregate |
| **Database model** | `cine_config` column dropped; `image_fit`, `display_mode`, `visual_overlays` (JSONB), `motion` (JSONB) added |
| **Repository** | Serializes/deserializes overlays and motion separately |
| **Shared contracts** | `ImageConfig` has orthogonal `image_fit`/`display_mode` fields with legacy coercion validators. `CineConfig` removed from contracts; overlay and motion types preserved |
| **API schemas** | `UpdateImageConfigRequest` uses typed `List[VisualOverlay]` and `MotionConfig` (not raw list/dict) |
| **api-game** | Uses `image_fit` for fit, `display_mode` for cine, no `cine_config` merge |
| **Frontend ImageDisplay** | Reads `image_fit` for layout, overlays/motion directly — no cine gating |
| **Workshop controls** | Image Fit selector, Display Mode toggle, effects section always available |
| **Game runtime** | Separate fit/display selectors, cine only hides player UI |
| **Contract tests** | Updated for new fields, CineConfig tests removed, legacy coercion tested |

### Compose Contracts (Phase 1 + Phase 2 — all delivered)

| Area | Key Changes |
|------|-------------|
| **ImageSettings** | Composes `ImageConfig` as nested field instead of 9 flat duplicated fields |
| **MapSettings** | Composes `MapConfig` as nested field instead of 6 flat duplicated fields |
| **ETL construction** | Both session-start and in-game-load paths build the contract first, wrap in settings |
| **Frontend reads** | All components read via `activeImage.image_config.field` / `activeMap.map_config.field` |

### New Features (scope additions)

- **Hand-held camera motion** — random waypoint-based CSS keyframe animation with configurable track points, distance, speed, drift bias, and randomness
- **3 new overlay assets** — bokeh light glow, lens flare leak, sun glow GIFs
- **Image staging in game drawer** — clicking an image now previews locally for the DM; explicit "Activate" CTA broadcasts to players
- **Cine indicator on image library** — images with `display_mode: 'cine'` show amber warning in DM's image picker
- **Dashboard back button** — workshop detail pages now show a "Dashboard" button alongside the smart back button

### Bug Fixes

- **Stale image config in MongoDB** (`a90fd65`) — Sentry error traced to ETL failing to clear room images on closed rooms. Stale config in MongoDB took precedence over incoming config. Added proper delete-image-config step to ETL.
- **Workshop map editor broken** (`3c36883`) — Cine render PR migrated `MapDisplay` to `useAssetDownload` which reads `map_config.file_path`, but `MapGridTool` still passed a flat `{ file_path }` object. Fixed by building the expected nested shape.
- **Camera motion math** (`42982f7`) — Crawl max distance was calculated from arbitrary values, not actual waypoint distance. Fixed to derive from real geometry. Also added randomness parameter.

---

## 3. Challenges

### The cine conflation — mid-branch architectural pivot

The branch started as "add hand-held motion to cine mode." During implementation, it became clear that gating effects behind `cine_config` was the root cause of multiple UX constraints — you couldn't apply film grain to a standard float image, and enabling any effect forced you into letterbox + hidden UI. This wasn't a bug in the plan — it was a fundamental misunderstanding of what "cine" should mean in the product.

**Resolution:** Paused feature work, created the dissolution plan, and refactored from the database up through every layer. This consumed the majority of the branch's effort but eliminated a class of future bugs.

### Auto-generated migration missing data backfill

The `alembic revision --autogenerate` correctly detected column changes but (by design) can't generate data migration SQL. The initial migration would have dropped `cine_config` with all existing overlay/motion data. Caught during PR review (Copilot flagged it).

**Resolution:** Added explicit SQL to backfill `image_fit` from old `display_mode`, coerce `display_mode` to standard/cine, extract overlays/motion from `cine_config` JSONB before dropping.

### MapDisplay regression from prior branch

The Cine render PR (#126) migrated `MapDisplay` to use `useAssetDownload` which requires `file_size` and `asset_id` via the nested `map_config` shape. The workshop's `MapGridTool` was never updated to match — it still passed a flat object. This wasn't caught because the workshop wasn't in scope for #126.

**Resolution:** Updated `MapGridTool` to pass the full nested `map_config` shape.

---

## 4. Decisions & Diversions

### D1: Cine is a display mode, not a config wrapper (planned: extend cine_config → shipped: dissolve it)

**Plan said:** The original cine_config approach would have added motion as another nested field inside the wrapper.

**Shipped:** Eliminated `cine_config` entirely. "Cine" became a simple `display_mode` flag that only controls whether player UI is hidden. Effects (overlays, motion) are independent top-level fields.

**Rationale:** The conflation was causing compounding UX and architectural problems. Every new effect type would have deepened the coupling. Dissolving it now was cheaper than carrying the debt.

**Impact on future work:** Any new effect type (ken burns, transitions, text overlays) can be added as a top-level field without touching display mode logic.

### D2: Image staging before activation (not in original plans)

**Plan said:** Nothing — this was a scope addition.

**Shipped:** Clicking an image in the DM's game drawer now previews it locally (amber "Preview" state) instead of immediately broadcasting. An explicit "Activate Image" CTA commits the broadcast.

**Rationale:** A DM misclicking an image (especially one with cine mode) would immediately disrupt all players' screens with no undo. The two-step flow gives the DM a safety net.

**Impact on future work:** Maps should follow the same pattern for UX consistency (deferred to a follow-up).

### D3: Compose contracts folded into this branch (planned as separate work)

**Plan said:** The compose-contracts plan was written as a standalone refactor to fix field drift in api-game.

**Shipped:** Delivered on this branch because the dissolution required touching the same files. Doing both together avoided a two-pass refactor of `imageservice.py` and `websocket_events.py`.

**Rationale:** Pragmatic — the files were already open and the changes were complementary.

---

## 5. Current Architecture

### Image Config Data Flow (after)

```
Workshop save → api-site (PostgreSQL: image_fit, display_mode, visual_overlays, motion as separate columns)
    ↓ ETL (session start)
api-game (MongoDB: ImageSettings { room_id, loaded_by, image_config: ImageConfig { ...all fields } })
    ↓ WebSocket broadcast
Frontend (activeImage.image_config.image_fit / .display_mode / .visual_overlays / .motion)
```

### Field Orthogonality

| Concern | Field | Values | Independent? |
|---------|-------|--------|-------------|
| Image fit | `image_fit` | float / wrap / letterbox | Yes |
| Display mode | `display_mode` | standard / cine | Yes |
| Visual effects | `visual_overlays` | array of overlays | Yes |
| Motion effects | `motion` | { hand_held, ken_burns } | Yes |
| Aspect ratio | `aspect_ratio` | 2.39:1, 16:9, etc. | Depends on letterbox |
| Image position | `image_position_x/y` | 0–100 | Depends on letterbox/wrap |

---

## 6. Downstream Readiness

| Dependency | Status | Ready? |
|------------|--------|--------|
| Ken Burns motion effect | `motion.ken_burns` field path exists, UI placeholder in workshop | Partial — backend/contract ready, frontend not built |
| Text overlays | Plan references as future effect type | No — needs new overlay discriminator |
| Transitions | Plan references as future effect type | No — needs new concept entirely |
| Map staging (two-step activation) | Image staging shipped, map deferred | No — should follow same pattern |

---

## 7. Open Items

- [ ] Migration has not been applied to production database yet — needs verification on staging first
- [ ] Map staging (two-step activate) deferred — should be done for UX consistency
- [ ] `confetti copy.gif` in `rollplay/public/` appears to be an accidental file — should be removed before merge
- [ ] Contract tests should be run: `cd rollplay-shared-contracts && pytest tests/test_contracts.py -v`
