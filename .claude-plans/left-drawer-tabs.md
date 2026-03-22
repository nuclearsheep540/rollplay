# Left Drawer Tab Refactor — PARTY + LOG

## Context
The left party drawer currently contains everything in a single scrollable panel: DM chair, player seats, lobby users, and the adventure log. The adventure log also captures system messages (connected/disconnected) alongside gameplay events (dice rolls, DM narration), making it noisy. This refactor splits the drawer into two tabs and separates concerns: party/connection state vs game narrative.

## Goals
1. Left drawer gets two tabs: **PARTY** and **LOG** (mirroring the right drawer's multi-tab pattern)
2. Adventure Log moves to its own LOG tab, filtered to exclude system messages
3. Lobby section becomes the home for connection activity (system messages rendered there)

## Files to Modify
- `rollplay/app/game/page.js` — state, JSX, tab config, derived memos
- `rollplay/app/globals.css` — replace `.drawer-toggle-tab` with `.left-drawer-tab-strip` / `.left-drawer-tab`
- `rollplay/app/game/components/LobbyPanel.js` — accept `systemMessages` prop, render them
- `rollplay/app/game/components/MapSafeArea.js` — no component changes, just call-site prop update

## Approach

### 1. State changes (page.js)

Replace:
```js
const [isDrawerOpen, setIsDrawerOpen] = useState(true);
const [partyDrawerSettled, setPartyDrawerSettled] = useState(true);
```
With:
```js
const [activeLeftDrawer, setActiveLeftDrawer] = useState('party'); // 'party' | 'log' | null
const [leftDrawerSettled, setLeftDrawerSettled] = useState(true);
```

Add tab config near `RIGHT_DRAWER_TABS` (~line 37):
```js
const LEFT_DRAWER_TABS = [
  { id: 'party', label: 'PARTY' },
  { id: 'log', label: 'LOG' },
];
```

Add derived memos:
```js
const filteredRollLog = useMemo(() => rollLog.filter(e => e.type !== 'system'), [rollLog]);
const systemMessages = useMemo(() => rollLog.filter(e => e.type === 'system'), [rollLog]);
```

Update all 7 references to `isDrawerOpen`/`partyDrawerSettled`:
- `transform: activeLeftDrawer ? 'translateX(0)' : 'translateX(-100%)'`
- `className: leftDrawerSettled ? 'drawer-settled' : ''`
- `onTransitionEnd: setLeftDrawerSettled(!!activeLeftDrawer)`
- MapSafeArea prop: `isDrawerOpen={!!activeLeftDrawer}`

### 2. CSS (globals.css)

**Remove** `.drawer-toggle-tab` rules (lines 565-598).

**Add** left drawer tab strip — mirrors right drawer (lines 721-778) but flipped for left side:
- `.left-drawer-tab-strip` — `position: absolute; right: -40px` (right edge of left drawer)
- `.left-drawer-tab-strip-inner` — flex column, centered, gap 8px
- `.left-drawer-tab` — 40x112px, `writing-mode: vertical-rl`, `border-radius: 0 6px 6px 0`, `border-left: none`

### 3. JSX restructuring (page.js, lines 1681-1745)

Replace single `<button className="drawer-toggle-tab">` with tab strip:
```jsx
<div className="left-drawer-tab-strip">
  <div className="left-drawer-tab-strip-inner">
    {LEFT_DRAWER_TABS.map(tab => (
      <button
        key={tab.id}
        className={`left-drawer-tab ${activeLeftDrawer === tab.id ? 'active' : ''}`}
        onClick={() => { setLeftDrawerSettled(false); setActiveLeftDrawer(prev => prev === tab.id ? null : tab.id); }}
      >
        {tab.label}
      </button>
    ))}
  </div>
</div>
```

Conditional content rendering inside `drawer-content`:
- **PARTY tab**: DM chair, player cards, LobbyPanel (with `systemMessages` prop)
- **LOG tab**: AdventureLog (with `filteredRollLog` instead of `rollLog`)

### 4. LobbyPanel update

- Accept `systemMessages` prop (default `[]`)
- Render system messages below the lobby users grid (compact, italic, muted, with timestamps)
- Cap display to last ~20 messages to prevent overflow
- Update early-return: render when either `lobbyUsers` or `systemMessages` exist

### 5. No backend changes
System messages still written to MongoDB adventure_log. Filtering is frontend-only.

## Sequencing
1. CSS — add tab strip classes, remove `.drawer-toggle-tab`
2. State — replace boolean with tab state, add memos
3. JSX — replace drawer structure, conditional content
4. LobbyPanel — accept and render system messages
5. MapSafeArea call-site — `isDrawerOpen={!!activeLeftDrawer}`

## Verification
- Left drawer opens on page load with PARTY tab active
- Clicking PARTY tab again closes drawer
- Clicking LOG while PARTY is active switches to LOG tab
- Clicking LOG again closes drawer
- Adventure Log in LOG tab shows dice rolls and DM narration but NO "connected"/"disconnected" messages
- PARTY tab shows DM, players, lobby users, and system messages
- Map safe area insets still adjust when drawer opens/closes
- Map overlay buttons (HOLD, LOCK MAP) remain flush below nav
