# Workshop Undo / Redo — Action History System

## Context

The workshop's `MapConfigTool` will support undo/redo across all its tools (grid, fog, future image config), with a max history of 10. Naïve approaches — "store full asset snapshots" or "PATCH everything on every undo" — collapse different operations into a single shape and produce ambiguous semantics ("what does undo mean here?"). They also bake assumptions that rot when a new tool is added.

This plan treats each user action as a **typed, self-describing entry** with its own apply/revert semantics. The history container is dumb; the action types are smart. New tools register a handler and become undoable without touching shared code.

Replaces the workshop's standalone "Discard" button. (In-game DM panel keeps Discard — different context, different lifecycle.)

---

## Core abstractions

### Action

A pure-data record. The history bag holds these and nothing else.

```js
{
  kind:      string,         // discriminator: 'save_grid' | 'save_fog' | …
  label:     string,         // e.g. "Save grid (24×18)" — for tooltips/menus
  timestamp: number,         // Date.now() at creation
  before:    <kind-specific>,// payload to apply on undo
  after:     <kind-specific>,// payload to apply on redo
}
```

`before` and `after` shapes are owned by the kind. The history container never inspects them.

### Handler

A registry entry resolved at apply-time. Lives in the React component (since it closes over hooks/mutations) and is passed fresh into the history hook each render.

```js
{
  apply:    async (payload) => void,  // commits the payload to server + local state
  describe?: (after) => string,       // optional: build label from after payload
}
```

`apply` is deliberately the same call path for undo and redo — the only difference is which payload (`before` vs `after`) gets handed in. This keeps the contract minimal and prevents "undo and redo do subtly different things" bugs.

### ActionHistory (the hook)

```js
useActionHistory({ handlers, capacity = 10 })
  → {
    push(action),         // append; clears redo; trims to capacity
    undo(),               // resolves handler for top of history → apply(action.before)
    redo(),               // resolves handler for top of redo → apply(action.after)
    canUndo, canRedo,
    peekUndoLabel,        // last history entry's label, or null
    peekRedoLabel,        // last redo entry's label, or null
    clear(),              // wipes both stacks (e.g. when the asset changes)
    historySize,
  }
```

Notes:
- `push` is the **only** way to add an entry. Callers build the action; the hook never invents one.
- `undo` and `redo` resolve the handler from `handlers[action.kind]` at call time. If a kind has no handler (caller bug), they throw — fail loud, not silent.
- `clear` is for asset-switch / page-reload scenarios. Stacks are session-local; no persistence.

---

## Concrete action kinds for MapConfigTool

Two to start. Each is a self-contained contract — the rest of the system never needs to know what's inside `before`/`after`.

### `save_grid`

A grid config commit. Independent of fog state.

```
before: GridFlatConfig | null    // null = grid was unconfigured
after:  GridFlatConfig
```

`GridFlatConfig` matches `useGridConfig().toFlatConfig()` and the body of `PATCH /api/library/{id}/grid`. No new shape, no translation layer.

**Handler:**
1. PATCH `/api/library/{id}/grid` with the payload
2. Sync local: `grid.initFromConfig(payload)` so the WorkshopGridControls UI reflects reality
3. Update `selectedAsset` state with the response

Undoing a `save_grid` only touches the grid. Fog is untouched. No idempotent fog PATCH.

### `save_fog`

A fog mask commit. Independent of grid state.

```
before: FogConfig | null         // null = fog was cleared
after:  FogConfig | null         // null on a "clear and save" operation
```

`FogConfig` matches the shared contract `{ mask, mask_width, mask_height, version }` — same shape the engine produces from `serialize()`.

**Handler:**
1. PATCH `/api/library/{id}/fog` with the payload (or `{ mask: null, ... }` to clear)
2. Sync local: `fog.loadDataUrl(payload?.mask ?? null)` (engine handles the null-clear path)
3. Update `selectedAsset` state with the response

Undoing a `save_fog` only touches fog. Grid is untouched.

---

## What is *not* in the undo bag

Explicit non-actions, to avoid ambiguity creep:

- **In-progress edits** (grid nudges before save, fog strokes before save). These are local-only, never committed. If the user undoes a save, they lose any unsaved edits as a side effect — that's the implicit "discard" replacing the old button.
- **Tool changes** (`activeTool` switching between move/grid/paint/erase). Pure UI state, not committed to anything.
- **Asset selection.** Picking a different map clears history (`clear()` called on asset change).
- **Brush size / mode toggles.** Local UI state.
- **Anything in the in-game runtime** — that lives in a different aggregate (MongoDB session) with its own lifecycle. Out of scope for this hook.

If a future feature needs to undo something on this list, it gets promoted to a typed action with a handler. Not added as a special-case branch in the history hook.

---

## File layout

**New:**
- `rollplay/app/shared/hooks/useActionHistory.js` — generic hook. No tool-specific logic.
- `rollplay/app/workshop/components/MapConfigUndoRedo.js` — tiny presentational component, two icon buttons + tooltips.

**Modified:**
- `rollplay/app/workshop/components/MapConfigTool.js`
  - Remove `onResetToServer` prop on `<FogPaintControls>` (drops the workshop Discard button).
  - Build the `handlers` object inline (memoised), call `useActionHistory({ handlers })`.
  - On grid save success → `history.push({ kind: 'save_grid', before, after, label: ... })`.
  - On fog save success → same with `kind: 'save_fog'`.
  - On asset change → `history.clear()`.
  - Keyboard shortcut listener for Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, scoped to the tool, ignored when an `<input>` is focused.
  - Mount `<MapConfigUndoRedo>` in the top context bar.

**Untouched (deliberately):**
- `rollplay/app/game/components/MapControlsPanel.js` — in-game DM panel keeps `onResetToServer` and the Discard button.
- `rollplay/app/fog_management/components/FogPaintControls.js` — already prop-gated; nothing to change.

---

## API surface (concrete)

In `MapConfigTool`:

```js
const handlers = useMemo(() => ({
  save_grid: {
    apply: async (payload) => {
      if (payload) {
        const updated = await gridUpdateMutation.mutateAsync({ assetId, gridConfig: payload });
        grid.initFromConfig(payload);
        setSelectedAsset(prev => ({ ...prev, ...updated }));
      } else {
        // payload === null means revert to "no grid configured" — call
        // the same endpoint with null fields. Out of scope until grid
        // can be cleared via the UI; throw for now to surface it loudly
        // if it ever happens.
        throw new Error('save_grid: clearing grid is not yet supported');
      }
    },
  },
  save_fog: {
    apply: async (payload) => {
      const updated = await fogUpdateMutation.mutateAsync({ assetId, fogConfig: payload });
      await fog.loadDataUrl(payload?.mask ?? null);
      setSelectedAsset(prev => ({ ...prev, ...updated }));
    },
  },
}), [assetId, grid, fog, gridUpdateMutation, fogUpdateMutation]);

const history = useActionHistory({ handlers, capacity: 10 });
```

Action creation at save time:

```js
const handleGridSave = async () => {
  const before = extractGridFlat(selectedAsset);     // small helper
  const after  = grid.toFlatConfig();
  const updated = await gridUpdateMutation.mutateAsync({ assetId, gridConfig: after });
  setSelectedAsset(prev => ({ ...prev, ...updated }));
  history.push({
    kind: 'save_grid',
    label: `Save grid (${after.grid_width}×${after.grid_height})`,
    timestamp: Date.now(),
    before,
    after,
  });
};
```

`extractGridFlat(asset)` is a tiny helper next to the handler — it pulls the same flat fields out of the response, deliberately mirroring `toFlatConfig()`'s shape so before/after are symmetric.

---

## UI surface

`MapConfigUndoRedo` — two FontAwesome buttons in the top context bar (just before Dashboard):

- ↶ Undo (`faRotateLeft`)
  - Disabled when `!canUndo`
  - Tooltip: `Undo: ${peekUndoLabel}` (e.g. "Undo: Save grid (24×18)")
  - Shortcut hint in tooltip: `(⌘Z)` / `(Ctrl+Z)`
- ↷ Redo (`faRotateRight`)
  - Same pattern with `peekRedoLabel`
  - `(⇧⌘Z)` / `(Ctrl+Shift+Z)`

Keyboard shortcuts wired in `MapConfigTool` via `useEffect`-mounted `keydown` listener:
- `(meta || ctrl) && z && !shift` → `history.undo()`
- `(meta || ctrl) && z && shift`   → `history.redo()`
- Skip when `document.activeElement` is an input/textarea/contenteditable.

---

## Adding a new action kind later (worked example)

When image-config support lands in MapConfigTool:

1. Define the action shape: `before: ImageConfig, after: ImageConfig`.
2. Add a handler entry: `save_image: { apply: async (payload) => { /* PATCH /image-config + sync */ } }`.
3. On image save success, `history.push({ kind: 'save_image', label, before, after, timestamp })`.

Zero changes to `useActionHistory`. Zero changes to `MapConfigUndoRedo`. The polymorphism is in the handler registry; the rest of the system doesn't notice.

---

## Verification

1. Load a map → undo/redo both disabled.
2. Save grid → undo enabled, label shows the grid commit. Save fog → undo points at the fog commit. Saving alternately produces a mixed stack.
3. Undo after a fog save → grid untouched (no spurious PATCH to `/grid`), fog reverts to its prior state on screen and on server.
4. Undo a grid save → fog untouched, grid reverts.
5. Make 11 saves → history caps at 10; oldest entry drops silently.
6. Redo after undo → re-applies; making a new save after an undo clears the redo stack (standard).
7. Switch to a different map asset → history clears; undo/redo disabled.
8. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z work; ignored while typing in the grid color/value inputs.
9. Workshop's Discard button is gone. In-game DM panel's Discard button is still present and still works.
