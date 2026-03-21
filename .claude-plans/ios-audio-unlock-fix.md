# iOS Audio Unlock — Definitive Fix for Safari + Chrome

## Context

Audio unlock works on iOS Safari but not iOS Chrome. The unlock flow uses HTML5 Audio (`new Audio('/audio/silence.mp3')` + `await play()`) to activate the iOS audio session before creating a fresh AudioContext. The `silence.mp3` network fetch consumes the user gesture window — Chrome iOS is stricter about gesture timing than Safari and expires the gesture before the AudioContext creation.

**History of what was tried:**
- Programmatic silent buffer (no HTML5 Audio) → didn't work on iOS, too short / doesn't activate audio session
- sword.mp3 → worked but beeped
- Base64 WAV data URI → worked on Chrome, not Safari (WAV format issue)
- silence.mp3 file → works on Safari, not Chrome (network fetch timing issue)

**The fix:** Combine what worked — **base64 data URI** (preserves Chrome gesture timing) + **MP3 format** (Safari-compatible). The current silence.mp3 is only 746 bytes / ~1KB base64.

## The Fix

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js` — `unlockAudio()` function (line ~1060)

### Change: Replace silence.mp3 file reference with inline base64 MP3 data URI

**Before (lines 1064-1068):**
```javascript
const silentAudio = new Audio('/audio/silence.mp3');
silentAudio.volume = 0;
await silentAudio.play().catch(() => {});
```

**After:**
```javascript
const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAA...rest of base64...');
silentAudio.volume = 0;
await silentAudio.play().catch(() => {});
```

That's it. One line change. Everything else stays the same — close/recreate pattern, graph rebuild, defensive resume, pending ops drain.

### Why this works on both browsers

| Factor | Old base64 WAV | Current silence.mp3 | **This fix (base64 MP3)** |
|--------|---------------|---------------------|--------------------------|
| Network request | None (inline) | Yes (fetch) | **None (inline)** |
| Format | WAV | MP3 | **MP3** |
| Chrome gesture timing | Preserved | Consumed by fetch | **Preserved** |
| Safari compatibility | Failed (WAV) | Works (MP3) | **Works (MP3)** |

### Cleanup
- `/public/audio/silence.mp3` can be deleted after confirming the fix (only used by this line)

## Verification

1. Build and deploy to a device-accessible URL
2. **iOS Safari**: Enter game session → audio should play
3. **iOS Chrome**: Enter game session → audio should play
4. **Desktop browsers**: Confirm no regression
5. Late-joiner test: DM starts audio → player joins → pending ops drain and play
6. Console should show `AudioContext state: running` after unlock on both iOS browsers
