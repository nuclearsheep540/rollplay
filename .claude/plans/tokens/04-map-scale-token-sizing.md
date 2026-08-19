# Map Tokens v4 — PC Token Scale

> **Status:** PLANNED (designed with Matt 2026-08-18, **rewritten 2026-08-19** after the first design was built and reverted). Builds on [01](01-token-system.md) (decisions 1–15), [02](02-dm-tokens-workshop-images.md) (16–29), [03](03-pc-token-avatars.md) (30–39).
> **Scope:** one per-map, GM-set scale applied to player-side token discs. Nothing else.
> **Governing philosophy:** [product-principles.md](../core/product-principles.md), with the scope calibration in decision 40.

---

## 0. What happened to the first version (read this before re-litigating)

The original brief was a PC token scale. The first design turned it into a **map scale** — the DM setting the map's px-per-square via the existing `grid_cell_size`, applied to every token. It was fully built (column, migration, ETL threading, grid on/off toggle, control, tests) and then **reverted on 2026-08-19**.

Why it was reverted, in Matt's words: *"we've plumbed a feature that's supposed to be just PC token scaling into a new idea that the grid always exists now, and is just rendered as hidden — this means there's a conflict between the render and what a user or human developer can see."*

The chain that produced it: making the value map-wide meant it lived on the map's geometry; setting that value forces a grid config into existence; suppressing the resulting lines needs `enabled: false`; persisting that needs a column. Each step followed from the last, and the destination was a permanent tax on two subsystems — grid and tokens — paid for a feature that should touch neither.

**The reasoning that was wrong.** The case against a PC-only multiplier was that a Medium goblin and a Medium fighter must render the same size, because "one square means one thing". That argument requires there to *be* a square. On a gridless map there is no lattice and no shared unit for the two to be coherent against — so the objection was weakest exactly where the feature applies. It also overrode a product decision Matt had already made (decision 45: PCs collectively one size, NPCs individually configured), on simulation-fidelity grounds nobody asked for.

Keep this section. The next person to think "wouldn't it be tidier to derive this from cell size?" needs to find the answer already written down.

## 1. Product decisions

Continues v3 numbering (30–39 in [03](03-pc-token-avatars.md)).

40. **"Facilitate, don't enforce" governs gameplay rules, not UI/graphical decisions** (Matt, 2026-08-18). A token rendered outside its cell reads as broken; that is a UI quality judgement, not a canon-correctness gate, and the product principle does not protect it. Unchanged from the first version, and it is why the scale is bounded rather than free.

41. **The problem is that PC tokens have no size control at all.** NPC tokens have per-token `footprint`; PC tokens are hardcoded `footprint: 1` (`MapTokenChipList.js:50`) with no UI. On maps whose art implies a finer scale than the ~100px fallback, players report their tokens look too big and have no lever. This gives them one.

42. **A per-map multiplier on player-side discs.** ~~Rejected in the first version~~ — **reinstated 2026-08-19**, see §0. It is what was asked for, it touches nothing but token rendering, and the coherence objection does not hold on the maps it serves.

43. **Player-side means `kind === "pc"` OR an assigned `owner_user_id`** (Matt, 2026-08-18: *"if the DM assigns a token to a player, that token is PC and shares the scaling rules"*). Same predicate as `isCompanion` (`MapTokenLayer.js:423`) and the server's `companion_move_allowed` (`websocket_events.py:1749-1753`). Second occurrence ⇒ extract a small shared predicate rather than derive it a third time.

44. **Per-map, GM-set, live-editable** (Matt, 2026-08-18: *"a 'player token size' field would be exposed to the GM for each map — this value can be changed in game runtime freely"*). Different map art implies different scale, so the value belongs to the map, not the session or campaign.

45. **PC size is collective, NPC size is per-token.** Unchanged. PC tokens keep `footprint: 1`; NPC tokens keep their selector. The scale is one number for all player-side discs on a map — it does not become a per-token field.

46. **`footprint` is untouched.** Snapping, occupancy, grid re-snap and cell labels all read `footprint` and the grid; none of them learn about the scale. A scaled PC disc still *owns* one cell — only its rendered diameter changes. This is the line that keeps the feature out of the grid subsystem.

47. **Bounded 0.5–1.5, continuous.** Matt's brief was three steps at ±50%. A bounded float costs the same, keeps the slider, and avoids a contract migration if the useful range turns out to be 0.7 rather than 0.5. Bounds enforce decision 40 — a disc cannot wander far enough from its cell to read as broken.

48. **Nothing else may read it.** A hard rule, not a preference: the failure mode in §0 began when one value acquired a second consumer. If a future feature wants this number, that is a design review, not a convenience import.

## 2. Facts the design rests on (verified 2026-08-18/19)

- `tokenDiameterPx(footprint, gridConfig, w, h)` (`map_tokens/config.js:83-85`) is the single sizing function. Three call sites, **all in `MapTokenLayer`** (`:155`, `:158`, `:447`), and all three already hold the token — so taking the token instead of the footprint costs nothing.
- Both disc rendering and stack-membership go through it, so the scale follows into the stack badge for free.
- PC tokens are hardcoded `footprint: 1` (`MapTokenChipList.js:50`).
- `MapConfig` documents the recipe for a new optional field (`shared_contracts/map.py:116-120`): update the MapAsset ↔ contract mapping and `_merge_preserved_map_fields`. `extra="forbid"` makes spelling drift raise rather than silently drop.
- The in-game map save is `PUT /api/game/{roomId}/map` with the **complete map object** (`MapControlsPanel.js` `applyGrid`), not the WebSocket `map_config_update`. A new `map_config` field rides it with no payload surgery.
- api-game stores `map_config` opaquely and rebroadcasts it; it needs **no code change** for a new field.

## 3. Design

### 3.1 Contract + storage

- `MapConfig.pc_token_scale: Optional[float] = Field(default=None, ge=0.5, le=1.5)`. `None` means "never set" and reads as `1.0`, so every existing map is byte-identical.
- `map_assets.pc_token_scale` — `Float, nullable=True`. Autogenerated migration, never hand-written.
- `MapAsset`: field, `from_base`, a keep-current-on-None assignment, and both ETL builders — mirroring exactly how `grid_cell_size` is already threaded.
- Repository's three `MapAsset` mapping sites.
- `_merge_preserved_map_fields` gains the field so a `map_load` that omits it preserves the in-room value.
- Contracts package version bump; extend `tests/test_contracts.py` (CI gate). Both service images take the bumped package together.

**Honest cost note:** the storage footprint is about the same as the reverted `grid_enabled`. The saving is entirely conceptual — one additive field with exactly one consumer, no new mode, no invisible state, no existing reader that has to learn about it.

### 3.2 Rendering

- `tokenDiameterPx(token, gridConfig, naturalWidth, naturalHeight, pcTokenScale)` — takes the token, applies the multiplier when the shared player-side predicate says so (decision 43), otherwise returns exactly today's value.
- `MapTokenLayer` passes `activeMap.map_config.pc_token_scale` through to its three call sites.
- No change to `snapTokenCenter`, `cellPxForMap`, `grid_math`, or any grid reader.

### 3.3 Control

- A slider in `MapControlsPanel` (already DM-gated), labelled **"Player token size"** — accurate here, unlike in the reverted design, because it now only moves player tokens.
- Persists through the existing complete-map PUT.
- Applies on release rather than per-pixel, one write per adjustment. Assess during QA: if eyeballing it against the map needs live feedback, the disc diameter is derived, so a local preview value is a contained follow-up.

## 4. PR sequence

| PR | Contents | Ships on |
|---|---|---|
| **14 — PC token scale** | §3.1 contract + column + migration + ETL threading; §3.2 predicate + `tokenDiameterPx`; §3.3 slider. api-site + frontend + one autogenerated migration + contracts bump. No api-game change. | feature branch |
| **15 — Re-snap reachability** | Unrelated pre-existing bug, kept from the first version: `update_map` (`app.py:130-177`) never calls `_grid_resnap_fragment`, and the WS handler that does is only reached by `sendMapConfigUpdate`, which has **zero call sites**. So the exact-cell re-snap (decision 20, shipped 0.60.0) has never fired in the app. api-game + tests. | feature branch |

## 5. What we will NOT build

- **No grid involvement of any kind** — no `grid_cell_size` reuse, no `grid_enabled`, no grid on/off toggle, no "configured but hidden" state (§0).
- **No per-token PC scale** — one value per map (decision 45).
- **No NPC scaling** — NPCs have `footprint`. Its floor of 1 cell is a known limitation, deliberately not addressed here.
- **No change to snapping, occupancy, cell labels, or re-snap** (decision 46).
- **No PC footprint UI** — wildshape / Enlarge-Reduce / Large-species PCs stay unrepresentable (open item 1).
- **No second consumer of the value** (decision 48).

## 6. Verification (desktop, two-browser where relevant)

- Slider moves PC discs and assigned companions; plain NPC discs do not move.
- A footprint-2 NPC keeps its size while PCs scale — the two axes are independent.
- Snapping is unchanged at every scale: a 0.5× PC disc still occupies and snaps to one whole cell.
- Stack badge follows the rendered size (shared `tokenDiameterPx`).
- Value persists across a session end/start (ETL) and across a map switch; per-map, so switching maps changes it.
- Existing maps (NULL) render byte-identical to today.
- Second browser sees the change; api-game unchanged.
- Bounds hold at 0.5 and 1.5.

## 7. Open items

1. **PC footprint is hardcoded to 1** (`MapTokenChipList.js:50`). Wildshape into a Large beast, Enlarge/Reduce, and Large-species characters are unrepresentable. Out of scope; decision 45 is a product constraint here rather than a game-system fact, and this is where that shows.
2. **Live-drag preview on the slider** — see §3.3. Decide on QA evidence.
3. **`grid_cell_size` remains grid-named** for what is really the map's scale. Cosmetic only, and renaming costs a contract bump plus a column rename. Left alone deliberately; noted so the naming friction of 2026-08-18/19 isn't rediscovered from scratch.
