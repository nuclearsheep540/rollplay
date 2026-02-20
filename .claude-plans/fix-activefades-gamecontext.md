# Bug: activeFades and cancelFade missing from gameContext

## Issue

`useUnifiedAudio` exports `activeFades` and `cancelFade`, but `game/page.js` does not destructure them or add them to the `gameContext` memo object. This means when `handleRemoteAudioBatch` in `webSocketAudioEvents.js` receives the `handlers` object, `activeFades` and `cancelFade` are both `undefined`.

The batch handler has fade conflict cancellation logic (lines 144-150 of `webSocketAudioEvents.js`):
```javascript
operations.forEach(op => {
  const { trackId } = op;
  if (activeFades && activeFades[trackId] && cancelFade) {
    console.log(`🚫 Cancelling active fade for ${trackId} due to new batch operation`);
    cancelFade(trackId);
  }
});
```

This silently no-ops because `activeFades` is always undefined. If a new batch operation arrives for a track that is mid-fade, the old fade's RAF loop continues running and fighting with the new operation.

## Fix

In `game/page.js`:
1. Destructure `activeFades` and `cancelFade` from `useUnifiedAudio()`
2. Add both to the `gameContext` useMemo object
3. Add both to the useMemo dependency array

## Files
- `rollplay/app/game/page.js` — ~3 line additions

## Severity
Low — fades are relatively rare and short-lived, so the conflict window is small. But worth fixing for correctness.
