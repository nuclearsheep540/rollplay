# Stage 8 — Ironing the creases: ship-readiness fixes for `feature/home-page`

> Part of the [Home landing page epic](00-epic.md). **Decided 2026-09-09** (Matt + Fable, from
> the code check recorded in [deliverables.md](deliverables.md) §K). Ships as
> ONE pull request on a branch cut from `feature/home-page` (`feature/home-page-creases`):
> every item is small, they touch the same handful of files, and the branch is going to QA as
> a whole.
>
> **Written for an implementing agent that must make no decisions.** Copy, behaviour per
> state, field names and file anchors are all locked below. Anchors were verified against
> `7a443f2` on 2026-09-09; line numbers drift, so re-grep the symbol before editing. Where
> this document is silent, stop and ask rather than guess.
>
> **BUILT 2026-09-09 on the `feature/home-page` working tree** (branch and commit are
> Matt's). api-site 1241 green, api-game 111 green, compile check and lint clean. Deviations
> from the text below, all found while building:
> - **Item 5.3 needed no code**: `confirmDeleteCampaign`'s `catch` already closed the modal
>   on the tree at `7a443f2` — the "refusal hidden behind the modal" claim in §5 was wrong
>   and is corrected there.
> - **The end acts as the caller, not the game's host** (§5.1), or a member who may not
>   delete could end a live game by asking for a delete. A third endpoint test pins it.
> - **Six more user-facing "session" strings** were outside the original sweep (the
>   workshop token controls and a library placeholder); added to §4's table and fixed.
> - **The API test harness was promoted** to `api-site/conftest.py` (`client`, `auth_as`,
>   `_initialize_registry`) and the identical copies in `characters/tests/api` and
>   `game/tests/api` deleted, because the delete tests would have been the third copy.
> - **Three test helpers used `asyncio.get_event_loop()`** (`conftest.create_friendship`,
>   the friendship and presence suites) and failed whenever an earlier test had run
>   `asyncio.run` — a pre-existing order dependency that alphabetical collection hid until
>   the new campaign API tests ran first. Switched to `asyncio.run` so each owns its loop.

---

## Why

The row-by-row check of the branch against the deliverables contract found that the code
does what the plans said everywhere except a short list of creases: an idle line that never
says when the table last played, a schedule control that vanishes instead of disabling, a
wrap-up that cannot name the next game although the API takes the name, a delete flow whose
refusal the GM cannot see, thirteen user-facing strings still saying "session", Pulse coins
that draw their own disc instead of the app's, a history section that hides when empty, and
buttons that do not say the game is starting or ending. None is a redesign. All of them are
the difference between "built" and "ready to ship".

## Decisions

| # | Decision | Matt's call (2026-09-09) |
|---|---|---|
| D1 | **The idle line falls back to when the table last played.** `gameStatusLine` gains two branches after the schedule ones: `campaign.last_played_at` set → "Last played · {relative}"; never played → "Not played yet". "No game running" goes. One rule, hero and card alike. | "correct we want that, we should get that in" |
| D2 | **SCHEDULE is always rendered for the host and disabled while any game is open**, never hidden, so nothing in the row moves. Disabled title "End the game to change the schedule". | "lets _not_ hide it so the UI moves, lets just disable it" |
| D3 | **The wrap-up gets a "Name (optional)" field for the next game**, mirroring the Next Game modal, sent as `next_game_name` on End. The backend already applies it. | "the form doesnt allow you to name … *BUT IT SHOULD* so lets fix that" |
| D4 | **Every user-facing "session" / "Pause" string is rewritten** per the copy table. Thirteen mean *game* (one of them, the countdown tooltip, also swaps the retired verb "pauses" for "ends"); one, the note editor placeholder, means *campaign notes* — not session, not game. Code identifiers are not renamed. | "lets rename those" |
| D5 | **Delete campaign ends any running game first, then deletes** — the endpoint composes `EndGame(SYSTEM)` and `DeleteCampaign`, the way the create endpoint composes `CreateCampaign` and `CreateSession`. No button gate, no second prompt: the one existing confirm carries the whole truth in game vocabulary; on a refused delete the modal closes so the error banner is readable. | "instead of gating … trigger a stop first, then delete"; "dont make another modal for GM … dont add more than what we need" — see §5 |
| D6 | **Pulse coins render through `UserDisc`**, the app's one identity-disc component, so colour resolution (chosen colour, else the palette hash) matches the social panel and any future avatar lands in both places at once. `UserDisc` gains `style` and `title` pass-through; no new component. | "re-use the same friendship icons so we capture avatars if true, and get the color correct too" |
| D7 | **GAMES PLAYED always renders** its heading; with no games it shows "No games played yet". | "Games Played as a heading should always render as UI" |
| D8 | **Buttons surface the game state**: STARTING… and ENDING… labels on the hero (both roles) and on the card's Start/End, all disabled, so nobody keeps clicking. | "lets have the game state surface through to the button properly" |
| D9 | **Name counter on the account page** to match the setup modal; **delete `ScreenNameModal.js`** (dead). | house rule: superseded code goes |
| D10 | **Doc-only acceptances** (no code): the news listing route stays admin-only; Home has no footer; migration H5 resolves the host from the `dm` member row; the ticker cap stays 5 and the score drives breath and glow only; friend pills stay inert. Recorded in deliverables.md as the intent. | assumed from silence — veto any of these and it becomes an item |

## Ground truth (verified 2026-09-09 at `7a443f2`)

| What | Where |
|---|---|
| The one status rule; ends `return 'No game running'` | `rollplay/app/dashboard/utils/gameStatusLine.js:29-57` (docstring table `:8-19`) |
| Hero primary action (`renderPrimaryAction`), `isTransitioning` | `rollplay/app/dashboard/components/home/HomeHeroCard.js:51-82` |
| `PlateButton` — `disabled`, `title`, `live`, `variant` props | `rollplay/app/dashboard/components/home/PlateButton.js` |
| Card controls row (live / idle-host / starting branches) | `rollplay/app/dashboard/components/CampaignManager.js:1669-1710` |
| Stripe overlay while starting | `CampaignManager.js:1627-1655` |
| `hasRunningGame(campaignId)` | `CampaignManager.js:159-161` |
| `confirmEndGame({ name, summary, nextScheduledAt })` | `CampaignManager.js:398-413` |
| `confirmDeleteCampaign` (modal stays open on error) | `CampaignManager.js:534-548` |
| The tab's error banner | `CampaignManager.js:1110-1113` |
| GAMES PLAYED (guarded by `playedGames.length > 0`) | `CampaignManager.js:1721-1792` |
| Delete Campaign button | `CampaignManager.js:1994-2001` |
| Release-character tooltip ("session") | `CampaignManager.js:138` |
| `EndGameModal` props passed from the drawer | `CampaignManager.js:2264-2274` |
| Shared wrap-up: state `:66-69`, `end()` `:79-86`, THE NEXT GAME `:157-190`, the "session" line `:165` | `rollplay/app/shared/components/EndGameModal.js` |
| Next Game modal's name input (the pattern to mirror) | `rollplay/app/dashboard/components/ScheduleGameModal.js:64-72` |
| `useEndGame` mutation (dashboard) | `rollplay/app/dashboard/hooks/mutations/useSessionMutations.js:56-72` |
| `useEndGame` hook (runtime) | `rollplay/app/game/hooks/useEndGame.js:64-75` |
| `EndGame._record_the_wrap_up` — the `session_scheduled` broadcast passes the raw `next_game_name` | `api-site/modules/game/application/commands.py` (grep `_record_the_wrap_up`) |
| `DeleteCampaignModal` | `rollplay/app/dashboard/components/DeleteCampaignModal.js:16-30` |
| `DeleteCampaign` command (refusal message; cascade) | `api-site/modules/campaign/application/commands.py:79-125` |
| Delete endpoint (`command = DeleteCampaign(...)`) and the create endpoint's two-command composition (the pattern) | `api-site/modules/campaign/api/endpoints.py:335-360` and `:181-210` (`session_command = CreateSession(...)` at `:204`) |
| `EndGame` constructor and `execute(game_id, host_id, reason=...)` | `api-site/modules/game/application/commands.py` (`class EndGame`); wiring precedent `expired_game_cleanup.py:53-61` |
| Pulse coins (`.pulse-coin` spans with `friend_color \|\| COLORS.graphite`) | `rollplay/app/dashboard/components/home/PulseLine.js:117-153` |
| `.pulse-coin` / `.pulse-coin-more` | `rollplay/app/globals.css:2549-2565` |
| `UserDisc` — "THE way to render a user's identity disc" | `rollplay/app/shared/components/UserDisc.js` (one caller: `SocialPanel.js:598`) |
| `UserChrome` friend row ("In session · …") | `rollplay/app/shared/components/SocialPanel.js:371-384` |
| Account-page name input (cap, no counter) | `rollplay/app/dashboard/components/ProfileManager.js:332-349` |
| Setup modal name input (cap + counter — the pattern) | `rollplay/app/dashboard/components/AccountNameModal.js:247-253` |
| Dead: `rollplay/app/dashboard/components/ScreenNameModal.js` (no importers; the `showScreenNameModal` flag in `useAuth.js` is unrelated and stays) | |
| Eviction modal (`SessionEndedModal`) + fallback copy | `rollplay/app/game/GameContent.js:2850-2866`; `rollplay/app/game/hooks/webSocketEvent.js:768-772` |
| The message that modal actually shows, sent by api-game on room close | `api-game/websocket_handlers/connection_manager.py:235` |

---

## The work

### 1. Last-played line (D1) — `gameStatusLine.js`

Replace the final `return 'No game running'` with:

```js
if (campaign?.last_played_at) {
  return `Last played · ${formatRelativeTime(campaign.last_played_at)}`
}
return 'Not played yet'
```

`formatRelativeTime` is already imported; it yields "3 hours ago", "Yesterday", "15 Jan" —
all read correctly after the dot. Update the docstring table: the last two rows become
`idle, played before → "Last played · 3 days ago"` and `idle, never played → "Not played yet"`.
Nothing else changes: the live and schedule branches still return first, so a live game never
shows a last-played line, and `last_played_at` (stamped at ACTIVE) is only read when idle.
Update the drawer comment at `CampaignManager.js:1656-1661` that quotes "No game running".

### 2. Card controls: always the same row (D2, D8) — `CampaignManager.js:1669-1710`

Rebuild the controls container so the **host** always sees `[primary] [end?] [schedule]` and
a **player** sees `[Enter]` only while live and nothing otherwise (unchanged). Per state:

| `currentGame?.status` | primary | End (host, icon `faStop`) | Schedule (host, icon `faCalendarDays`) |
|---|---|---|---|
| none (idle) | **Start** — enabled (`faPlay`) | not rendered | enabled; title "Set when the next game is", aria-label "Schedule the next game" |
| `starting` (or this browser's `startGameMutation.isPending` for this session) | **Starting…** — disabled (`faPlay`), stripe overlay as today | not rendered | disabled; title + aria-label "End the game to change the schedule" |
| `active` | **Enter** — enabled (`faRightToBracket`), everyone | enabled; title/aria "End Game" | disabled; "End the game to change the schedule" |
| `ending` | **Enter** — disabled | disabled; title/aria "Ending…" | disabled; "End the game to change the schedule" |

Rules:
- Schedule's `disabled` = `scheduleGameMutation.isPending || Boolean(currentGame)`. Its
  title and aria-label switch on `Boolean(currentGame)` only (a pending save keeps the
  enabled wording).
- The End button's `disabled` = `endGameMutation.isPending || currentGame.status === 'ending'`.
- Keep every existing class and inline style; only the branching and labels change. The
  primary button keeps `min-w-[7rem]` so Start ↔ Enter does not shift the row.
- Delete the `(!currentGame || currentGame.status === 'starting') && host` ternary — the
  table above replaces it.

### 3. The wrap-up names the next game (D3)

**`shared/components/EndGameModal.js`**
- Add `const [nextName, setNextName] = useState('')` beside `date`/`time`.
- In THE NEXT GAME section, directly under its intro paragraph and above the date/time row,
  render an input identical in shape to `ScheduleGameModal.js:64-72`: `type="text"`,
  `maxLength={100}`, `placeholder="Name (optional) — e.g. The Siege of Kraghammer"`,
  `aria-label="Name of the next game"`, `disabled={isEnding}`, the dialog's `fieldStyle`, and
  `className="w-full mb-3 px-3 py-2 rounded-sm border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"`.
- `end()` sends `nextGameName: nextName.trim() || null` alongside the three existing keys.
- The End button's disabled rule is unchanged (`isEnding || hasHalfDate`): a name never blocks.
- Rewrite the docstring paragraph that says the dialog cannot name the next game, and the
  intro line per the copy table ("Why not plan the next game while everyone is here?").

**`CampaignManager.js` `confirmEndGame`** — destructure `nextGameName` and pass it to
`endGameMutation.mutateAsync`.

**`useSessionMutations.js` `useEndGame`** and **`game/hooks/useEndGame.js`** — accept
`nextGameName = null` and send `next_game_name: nextGameName` in the body. Update both
docstrings (they currently describe a date-only wrap-up).

**`api-site/modules/game/application/commands.py` `_record_the_wrap_up`** — the
`session_scheduled` broadcast must carry `next_game_name=session.next_game_name` (the value
the aggregate stored: stripped, blank → `None`), exactly as `ScheduleSession` does, instead
of the raw argument. Everything else in that method already handles the name.

### 4. Copy: "session" and "Pause" out of the user's sight (D4)

Every row is a literal replacement. Nothing else in these files changes except item 3's
line in `EndGameModal.js` and item 5's in `DeleteCampaignModal.js`.

| File:line | Today | Becomes | It meant |
|---|---|---|---|
| `dashboard/components/CharacterSelectionModal.js:150` | You can't change your character while a session is active. Pause or finish the session first. | You can't change your character while a game is running. End the game first. | game (the backend says exactly this) |
| `dashboard/components/CampaignManager.js:138` | Cannot remove your character while a session is active | Cannot release your character while a game is running | game (backend copy) |
| `shared/components/SocialPanel.js:380` | In session · {campaign} | Playing · {campaign} | a friend is in a live game |
| `shared/components/EndGameModal.js:165` | Why not plan your next game session while everyone is here? | Why not plan the next game while everyone is here? | game |
| `game/GameContent.js:2859` | Session Ended | Game Ended | game |
| `game/GameContent.js:2861` and `game/hooks/webSocketEvent.js:771` | This game session has ended: {reason} | This game has ended: {reason} | game |
| `api-game/websocket_handlers/connection_manager.py:235` | This game session has ended. You will be redirected shortly. | This game has ended. | game — this is the string the modal shows; the modal's own next line already says everyone is redirected |
| `game/GameContent.js:2141` | You're watching this session. Select a character in your campaign to participate. | You're watching this game. Select a character in your campaign to participate. | game |
| `game/GameContent.js:93` | You can release your character between sessions to use them elsewhere. | You can release your character between games to use them elsewhere. | game |
| `game/GameContent.js:96` | Use the adventure log to track key moments in your session. | Use the adventure log to track key moments in your game. | game |
| `game/components/SessionCountdown.js:57` | Session auto-pauses when the timer ends | The game ends when the timer runs out | **the system end**: the signed-URL lease lapses and the sweeper ends the game (silent, schedule kept, the next Start seeds from it). "Pauses" was the retired backend verb. |
| `notes/components/NotesWorkspace.js:227` | …stay with this campaign between sessions. | …stay with this campaign between games. | game |
| `notes/components/NotesWorkspace.js:279` | A session is live for this campaign. Notes are read-only here… | A game is running for this campaign. Notes are read-only here… | game |
| `notes/components/NotesPanel.js:147` | …stay with this campaign between sessions. | …stay with this campaign between games. | game |
| `notes/components/NoteEditor.js:104` | Session notes… | Campaign notes… | **not a game**: notes belong to the campaign and the user, and outlive every game — "session" was wrong under the old model too |
| `(authenticated)/character/components/CharacterWizard.js:318` | Token crop saved - applies from your next game session | Token crop saved — applies from your next game | game |
| `dashboard/components/DeleteCampaignModal.js:23` | see item 5 | | |
| `workshop/components/WorkshopTokenControls.js:54-55` *(found while building)* | They seed every new session and persist between games; in-session changes never write back here. | They seed each game at Start and persist between games; in-game changes never write back here. | game |
| `workshop/components/WorkshopTokenControls.js:128` | Locked in place at session start — click to unlock | Locked in place at game start — click to unlock | game |
| `workshop/components/WorkshopTokenControls.js:153-155` | Un-conflicting changes land when the session resumes; anything play already touched keeps its in-game state until the session finishes. | Un-conflicting changes land when the next game starts; anything play already touched keeps its in-game state. | game — and "resumes"/"finishes" are both retired verbs; nothing finishes any more, in-play state simply persists |
| `workshop/components/WorkshopTokenControls.js:192-193` | While a session is active, edit tokens in-game from the DM panel instead. | While a game is running, edit tokens in-game from the DM panel instead. | game |
| `asset_library/components/SmartCollectionBuilder.js:116` | placeholder "e.g. Sea Session" | e.g. Sea Voyage | an example collection name, not the noun — changed anyway so the word appears nowhere |

Also rename the component `SessionEndedModal` → `GameEndedModal` in `GameContent.js` (the
file is open and the old name now reads as a different thing); leave every other identifier
(`SessionCountdown`, `sessionEndedData`, `handleSessionEnded`, `lockedBySession`, the
`session_*` event keys, `/api/sessions`) alone — the vocabulary rule is about what users
read, and backend names were settled in CLAUDE.md.

Verify afterwards with the same sweep the check used:
`grep -rn -i "session\|\bpause\|\bresume\|\breset\b\|stopping" rollplay/app --include='*.js'`
and classify every hit; the only user-facing survivors allowed are none.

### 5. Delete campaign (D5)

**The problem, in full.** A GM with a live game presses Delete Campaign. The button is
enabled. The danger-styled confirm opens and says "All associated game sessions will also be
deleted" — the retired word, describing the retired multi-session model. They press Delete.
The backend refuses with "End the game before deleting this campaign" (`DeleteCampaign`,
`commands.py:98-99`). `confirmDeleteCampaign` writes that into `error`, closes the modal and
the tab's banner at `CampaignManager.js:1110` shows it. (An earlier draft of this section
said the modal stayed open over the banner; the `catch` already closes it — corrected
2026-09-09.) So the GM is refused, correctly worded, after walking through a confirm whose
copy was wrong and for a reason the product no longer wants to be one.

**The decision (Matt, 2026-09-09): do not gate — end the game, then delete.** Deleting a
campaign is the GM's call, and a running game is not a reason to refuse it; it is a step on
the way. One confirm, no second prompt, nothing added beyond what is needed. Three changes:

1. **The endpoint ends first.** `campaign/api/endpoints.py` `delete_campaign` (`:335-360`),
   following the create endpoint's two-command composition (`:181-210`):
   - inject what `EndGame` needs beside what is already there: `session_repo`, `user_repo`,
     `asset_repo` (see `expired_game_cleanup.py:53-61` for the exact constructor wiring;
     `character_repository` is already injected here and is passed through);
   - `open_game = game_repo.get_open_game_for_campaign(campaign_id)`; if present,
     `await EndGame(...).execute(open_game.id, host_id=open_game.host_id, reason=EndReason.SYSTEM)`.
     SYSTEM, not HOST: the game ending is incidental, so players get no "game has ended"
     toast and the schedule is left alone. The `campaign_deleted` broadcast that follows is
     itself silent (`show_toast=False`, `save_notification=False` — a cache invalidation, so
     the campaign simply disappears from a dashboard); the room close (`EndGame` phase 3)
     is the only thing a player sees, and it sends everyone in the game to the dashboard as
     it does today;
   - then `DeleteCampaign(...).execute(...)` exactly as now. Its own open-game refusal
     **stays** as the backstop: it can only fire if the end above did not actually close the
     game, and that is a bug worth a 400 rather than a silent cascade.
   - Any `ValueError` from either command is the response's 400, as today. `EndGame` refuses
     unless the game is ACTIVE, so a delete during STARTING or ENDING is refused with
     "Cannot end a game in {status} status", and an unreachable api-game refuses with the
     ETL's message and rolls the game back to ACTIVE — the campaign is untouched in both.
   - Docstring: say that a running game is ended (SYSTEM) before the delete, and why the
     command's guard remains.
   The end ETL's write onto the game row is cascaded away moments later — accepted. What the
   ETL also does outlives the campaign and is why we end properly rather than drop the room:
   audio and map settings sync back to the library assets, and character colours sync back
   to the characters.
2. **The confirm carries the whole truth.** `DeleteCampaignModal.js:23` description becomes:
   "This cannot be undone. Any running game ends and everyone is sent back to their
   dashboard. Every game played here, its history and the party go with the campaign.
   Players keep their characters, and your assets are kept."
   No second modal, no conditional copy: the line is true whether or not a game is running.
   (What actually cascades: the session and its roster, every `games` row — FK
   `ondelete='CASCADE'` — and `campaign_members`; character locks are released by the
   command; media assets are untouched. Notes lose their campaign link, `ON DELETE SET NULL`
   — the epic's known orphaned-notes concern, out of scope here, and the copy stays silent
   on it rather than promising either way.)
3. **Refusals stay readable — no change needed.** `confirmDeleteCampaign`'s `catch`
   already closes the modal, so the banner at `:1110` is visible for the cases that remain
   (a game in flight, api-game down, a non-host caller). The Delete button itself is
   unchanged: enabled whenever the drawer is open, `isPending` covers the longer request
   (the end ETL's api-game round trips, a few seconds) with the existing "Deleting…"
   spinner.

### 6. Pulse coins through `UserDisc` (D6)

**`shared/components/UserDisc.js`** — add two pass-through props, explicit not spread:
`title` and `style`, merged as `style={{ backgroundColor: resolveUserColor(color, userId), ...style }}`
and `title={title}`. Nothing else changes; the one existing caller is unaffected.

**`dashboard/components/home/PulseLine.js:139-152`** — replace each coin `<span>` with:

```jsx
<UserDisc
  key={friend.friend_id}
  userId={friend.friend_id}
  color={friend.friend_color}
  name={friend.friend_screen_name}
  className="pulse-coin"
  style={{ marginLeft: index === 0 ? 0 : -8, zIndex: MAX_COINS - index }}
  title={friend.friend_screen_name || 'A friend'}
/>
```

Import `UserDisc`; drop the `COLORS.graphite` fallback (and the `COLORS` import if nothing
else in the file uses it — the breathing dot does, so it stays). The "+N" overflow coin is
not a user and keeps its `<span className="pulse-coin pulse-coin-more">`.

**`globals.css:2549-2560`** — `.pulse-coin` keeps `width`, `height`, `flex`, `border`,
`border-radius` and `display: grid; place-items: center` (harmless under the disc's flex);
**delete its `color:` and any `font-size`/`font-weight` lines** so the disc's own text
treatment (`text-surface-secondary`, `font-bold`) wins and the initial matches every other
disc. Set the coin's text size on the className instead: `className="pulse-coin text-[11px]"`.

**Avatars.** No user has an avatar today: `FriendshipResponse` carries none and
`UserChrome`'s docstring says the colour block is "shaped to hold an uploaded avatar when
users get one". Routing the coins through `UserDisc` is what makes that arrive in both
places at once; nothing avatar-shaped is built here.

### 7. GAMES PLAYED always renders (D7) — `CampaignManager.js:1721`

Remove the `playedGames.length > 0 &&` guard. Keep the heading (and its "latest N of M"
note, which is already conditional). Below it, when `playedGames.length === 0`, render
`<p className="text-xs" style={{color: THEME.textSecondary}}>No games played yet</p>` in
place of the scrolling list; otherwise the list exactly as today.

### 8. Buttons surface the state (D8) — `HomeHeroCard.js:61-82`

Rewrite `renderPrimaryAction` in this order, both roles unless stated:

```
active                                  → ENTER GAME (GM) / JOIN GAME (player), variant gold, live
starting, or startGame.isPending (GM)   → <PlateButton disabled>STARTING…</PlateButton>
ending                                  → <PlateButton disabled>ENDING…</PlateButton>
player, otherwise                       → <PlateButton disabled>WAITING FOR GM</PlateButton>
GM, otherwise                           → START GAME, variant gold, onClick startGame.mutate(session.id), disabled={!session}
```

A player now sees STARTING… / ENDING… instead of WAITING FOR GM during the transitions —
deliberate: the state is real and it tells them a Join is seconds away. Delete
`isTransitioning`. The card's labels are item 2's table.

### 9. Name counter, dead modal (D9)

- `ProfileManager.js:332-349`: under the input add the counter exactly as
  `AccountNameModal.js:253` renders it (`{screenName.length}/30 characters`, same classes and
  colour), keeping the existing helper text.
- Delete `rollplay/app/dashboard/components/ScreenNameModal.js` — the **orphaned** older
  single-field prompt ("Welcome to Tabletop Tavern! … choose a screen name"), imported by
  nothing. **The live new-user prompt is `AccountNameModal.js`** (account name + screen name
  in one form), rendered by `(authenticated)/dashboard/page.js:179`; it, and the
  `showScreenNameModal` flag in `useAuth.js` that is one of its two show conditions, are
  untouched. Confirm before deleting: `grep -rn "from.*ScreenNameModal" rollplay/app` → nothing.

---

## What we will NOT do

- No renaming of code identifiers, tables, routes or wire event names that carry "session".
- No new components: `UserDisc` grows two props; no `PulseCoin`, no `GameStatePill`.
- No End button on the hero, no hero schedule opener, no RSVP, no paging past the five-game cap.
- No Pulse v2: no width-aware ticker, no cadence, no coin-count scaling, no clickable friend
  pills (D10 — say so and it becomes a two-line item), no avatar upload.
- No api-game change beyond the one message string.
- No change to `DeleteCampaign`'s own rule or message — the endpoint composes around it.
- No gate on the Delete button and no second confirm for a running game.
- No JS test suite. No emoji log prefixes. No lazy imports. No single-letter or initialism names.

## Tests

- **api-site** (`modules/game/tests/test_game_lifecycle.py`, the HOST-end wrap-up test):
  End with `next_game_name="  The Siege  "` → `session.next_game_name == "The Siege"` **and**
  the broadcast `session_scheduled` payload's `next_game_name == "The Siege"`. Run it alone
  against the unfixed code first: it must fail on the untrimmed payload, then pass. Run the
  suite: `docker exec api-site-dev python -m pytest -q`.
- **api-site** (`modules/campaign/tests/`, new test beside `test_campaign_with_session.py`,
  using the api-game mocking harness `test_game_lifecycle.py` already has): with a campaign
  whose session has an ACTIVE game, `DELETE /api/campaigns/{id}` as the host → 200; the
  game's end ETL was called (the mocked api-game `end` was hit with that game's id and the
  room delete was scheduled — captured and driven through the stub); the campaign is gone
  and no open game remains; no `session_ended` broadcast (SYSTEM), one silent
  `campaign_deleted`. Second test: with the game
  STARTING, the delete is refused with 400 and the campaign and game are untouched. Run each
  alone against the unfixed code first — the first must fail with today's "End the game
  before deleting this campaign".
- **Frontend**: the throwaway-page compile check from the HMR memory (a page outside the
  protected routes importing `HomeHeroCard`, `CampaignManager`, `EndGameModal`, `PulseLine`,
  `UserDisc`; restart `rollplay-dev`; read "✓ Compiled"; delete it; restart), then
  `docker exec rollplay-dev npx next lint`. Never `npm run build` while `rollplay-dev` is up.
- **Copy sweep** (item 4's grep) — zero user-facing hits.
- **Dead-code sweep** on every touched file: `isTransitioning`, unused icon imports after
  the controls rewrite, `COLORS` in `PulseLine.js`, `ScreenNameModal.js`.

## Acceptance — QA script (dev stack, GM + player browsers)

1. **Idle line**: a campaign played before → hero and card read "Last played · {relative}";
   a never-played campaign → "Not played yet"; a scheduled one → "Next game · …"; live →
   "Started …". No "No game running" anywhere.
2. **Card controls**: idle → Start + Schedule enabled. Press Start → "Starting…" disabled,
   Schedule disabled with the "End the game to change the schedule" tooltip, stripes. Live →
   Enter + End + Schedule (disabled, same tooltip). Press End → Enter, End ("Ending…") and
   Schedule all disabled, status "Ending…". Back to idle. Only the End button appears and
   disappears; nothing else shifts.
3. **Hero**: GM sees START GAME → STARTING… → ENTER GAME → ENDING… → START GAME; the player
   sees WAITING FOR GM → STARTING… → JOIN GAME → ENDING… → WAITING FOR GM. Every "…" button
   is disabled.
4. **Wrap-up**: end with a next-game name and date → the player's toast reads "{host} set the
   next {campaign} game, {name}, for {when}"; the card and hero read "Next game · {name} ·
   {when}". Name only → "{host} named the next {campaign} game {name}" and "Next game ·
   {name}". A name typed with spaces around it arrives trimmed. Start → the wrap-up opens with
   that name prefilled; `session.next_game_name` is null.
5. **Delete**: with a game live and a player in it, press Delete Campaign → the one confirm
   reads the new copy; confirm → the player's tab gets the eviction modal and lands on a
   dashboard without the campaign, the GM's drawer loses the campaign, and nobody gets a
   toast or a notification — `campaign_deleted` is a silent cache invalidation, so a player
   already on their dashboard just sees the campaign vanish. Same delete with no game
   running → identical dialog, immediate. Press Delete while the game is STARTING → the
   modal closes and the banner reads the refusal; the campaign is still there.
6. **Copy**: open every surface in item 4's table and read it — character-swap modal during a
   live game, a friend's "Playing · {campaign}", the eviction modal ("Game Ended" / "This game
   has ended."), the spectator banner, the countdown tooltip, both notes empty states, the
   notes lock banner, the note editor placeholder, the token-crop toast.
7. **Coins**: a friend with a chosen colour shows the same colour as their social-panel
   capsule; a friend without one shows the same palette colour in both; the initial's colour
   matches the search-result discs; "+N" overflow unchanged; the stack still opens the panel.
8. **GAMES PLAYED**: a never-played campaign shows the heading and "No games played yet".
9. **Account page**: the name counter counts; `ScreenNameModal.js` is gone.
10. Suites green; lint clean.

## Afterwards

- [deliverables.md](deliverables.md): rewrite B4, B6, G6 (idle line), G3 (schedule
  disabled), F13 (delete), F14 (controls table), F20 (name field), F21 (empty state), E3
  (coins), A12; drop §K1 items 1–8 and the coin/ticker part of 10; the D10 acceptances
  stay recorded as intent.
- [02](02-live-panels-and-news.md): remove the "previews show last saved art" note once
  runtime QA confirms unsaved slot art previews.
- [00-epic.md](00-epic.md): list this as stage 8 in the stage split.
