# Character Tab Horizontal Redesign

## Overview

Transform the Characters tab from a vertical wrapping grid to a **horizontal scrolling row of portrait cards** with an expandable stats drawer, mirroring the Campaign tab's interaction pattern.

| Campaigns Tab | Characters Tab (New) |
|---------------|----------------------|
| Vertical scroll | Horizontal scroll |
| Landscape 16:4 tiles | Portrait 3:4 tiles |
| Session drawer below | Stats drawer below |
| Full-width rows | Fixed-width columns |

---

## Design Requirements

### Layout
- **Horizontal scrolling single row** (native scroll, no carousel arrows)
- **Portrait cards with 3:4 aspect ratio** (full card, not just portrait section)
- **Fixed card width**: `clamp(180px, 20vw, 240px)`
- **"Create New Character" card** at end of row (knocked-out `+` pattern)

### Card States

**Collapsed (unselected):**
- Stylized avatar placeholder (initial letter in circle)
- Character name
- Level
- "In Game" badge if active
- Collectible card aesthetic

**Expanded (selected):**
- Stats drawer expands **below the entire row** (full viewport width)
- Shows: Basic info, combat stats (AC, HP), ability scores (6 stats)
- Action buttons moved to drawer (Edit, Clone, Delete)
- Close button in drawer header

### Interaction
- Click card → expand drawer, show full stats
- Click again or close button → collapse drawer
- Only one character selected at a time

---

## Files to Modify

**Primary:**
- `rollplay/app/dashboard/components/CharacterManager.js` - Complete redesign (~304 lines currently)

**Reference (patterns to copy):**
- `rollplay/app/dashboard/components/CampaignManager.js` - Selection state, resize handling, drawer expansion

---

## Implementation Plan

### Phase 1: State & Structure Setup

**Add new state variables:**
```javascript
const [selectedCharacter, setSelectedCharacter] = useState(null)
const [isResizing, setIsResizing] = useState(false)
```

**Add resize handler useEffect** (copy from CampaignManager lines 556-581):
- Sets `isResizing` true immediately on resize
- Clears after 100ms of no resize activity
- Disables transitions during resize

**Add toggle function:**
```javascript
const toggleCharacterDetails = (character) => {
  setSelectedCharacter(prev =>
    prev?.id === character.id ? null : character
  )
}
```

**Remove** the header "Create Character" button (moves to end of row)

### Phase 2: Convert Grid to Horizontal Scroll

**Replace grid container** (line 253):
```javascript
// OLD
<div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 320px))' }}>

// NEW
<div
  className="flex gap-4 overflow-x-auto pb-4"
  style={{
    flexWrap: 'nowrap',
    paddingLeft: selectedCharacter ? '0' : 'clamp(0.5rem, 2.5vw, 3.5rem)',
    paddingRight: selectedCharacter ? '0' : 'clamp(0.5rem, 2.5vw, 3.5rem)',
    transition: isResizing ? 'none' : 'padding 200ms ease-in-out',
    scrollbarWidth: 'thin',
    WebkitOverflowScrolling: 'touch'
  }}
>
```

### Phase 3: Redesign Character Cards

**New card structure** (replace lines 138-231):
```javascript
<div
  key={char.id}
  className="flex-shrink-0 rounded-sm border-2 overflow-hidden cursor-pointer"
  style={{
    width: 'clamp(180px, 20vw, 240px)',
    aspectRatio: '3/4',
    backgroundColor: THEME.bgPanel,
    borderColor: selectedCharacter?.id === char.id ? THEME.borderActive : THEME.borderDefault,
    transition: isResizing ? 'none' : 'border-color 200ms ease-in-out'
  }}
  onClick={() => toggleCharacterDetails(char)}
>
  {/* Avatar area - flex-1 */}
  <div className="flex-1 flex items-center justify-center relative h-3/4"
       style={{backgroundColor: THEME.bgSecondary}}>
    {/* Initial circle */}
    <div className="w-16 h-16 rounded-full flex items-center justify-center border-2"
         style={{backgroundColor: `${THEME.textAccent}30`, borderColor: `${THEME.textAccent}80`}}>
      <span className="text-3xl font-bold" style={{color: THEME.textAccent}}>
        {char.character_name?.[0]?.toUpperCase() || '?'}
      </span>
    </div>

    {/* In Game badge */}
    {char.active_game && (
      <div className="absolute top-2 right-2">
        <span className="px-2 py-1 text-xs font-semibold rounded-sm border flex items-center gap-1"
              style={{backgroundColor: '#16a34a', borderColor: '#22c55e', color: 'white'}}>
          <FontAwesomeIcon icon={faLock} className="text-xs" />
          In Game
        </span>
      </div>
    )}
  </div>

  {/* Name + Level bar - h-1/4 */}
  <div className="h-1/4 p-3 border-t flex flex-col justify-center"
       style={{borderTopColor: THEME.borderSubtle}}>
    <h3 className="text-sm font-bold truncate" style={{color: THEME.textOnDark}}>
      {char.character_name || 'Unnamed'}
    </h3>
    <p className="text-xs" style={{color: THEME.textSecondary}}>
      Level {char.level || 1}
    </p>
  </div>
</div>
```

### Phase 4: Implement Stats Drawer

**Add drawer after the scroll container** (new section after line 255):
```javascript
{/* Stats Drawer - expands below entire row */}
{selectedCharacter && (
  <div
    style={{
      position: 'relative',
      left: 'calc(50% - 50vw)',
      width: '100vw',
      backgroundColor: THEME.bgPanel,
      borderColor: THEME.borderSubtle,
      borderWidth: '2px',
      borderStyle: 'solid',
      borderRadius: '0.125rem',
      borderTopLeftRadius: '0',
      borderTopRightRadius: '0',
      marginTop: '-8px'
    }}
  >
    <div className="py-6 px-4 sm:px-8 md:px-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]"
            style={{color: THEME.textOnDark}}>
          {selectedCharacter.character_name}
        </h3>
        <button onClick={() => setSelectedCharacter(null)}
                style={{color: THEME.textSecondary}}>
          Close
        </button>
      </div>

      {/* Stats Grid - 3 columns on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Basic Info */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>Basic Info</h4>
          <div className="p-3 rounded-sm border" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}>
            <p style={{color: THEME.textOnDark}}>
              Level {selectedCharacter.level} {selectedCharacter.character_race}
            </p>
            <p style={{color: THEME.textSecondary}}>
              {selectedCharacter.character_classes?.map(c => c.character_class).join(' / ') || 'No Class'}
            </p>
            {selectedCharacter.background && (
              <p className="text-sm mt-2" style={{color: THEME.textSecondary}}>
                Background: {selectedCharacter.background}
              </p>
            )}
          </div>
        </div>

        {/* Column 2: Combat Stats */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>Combat Stats</h4>
          <div className="flex gap-4">
            <div className="flex-1 p-3 rounded-sm border text-center" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}>
              <p className="text-2xl font-bold" style={{color: THEME.textOnDark}}>{selectedCharacter.ac || 0}</p>
              <p className="text-xs" style={{color: THEME.textSecondary}}>AC</p>
            </div>
            <div className="flex-1 p-3 rounded-sm border text-center" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}>
              <p className="text-2xl font-bold" style={{color: THEME.textOnDark}}>
                {selectedCharacter.hp_current || 0}/{selectedCharacter.hp_max || 0}
              </p>
              <p className="text-xs" style={{color: THEME.textSecondary}}>HP</p>
            </div>
          </div>
        </div>

        {/* Column 3: Ability Scores */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>Ability Scores</h4>
          <div className="grid grid-cols-3 gap-2">
            {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ability => (
              <div key={ability} className="p-2 rounded-sm border text-center" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}>
                <p className="text-lg font-bold" style={{color: THEME.textOnDark}}>
                  {selectedCharacter.ability_scores?.[ability] || 10}
                </p>
                <p className="text-xs uppercase" style={{color: THEME.textSecondary}}>
                  {ability.slice(0, 3)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 pt-6 border-t flex gap-3 justify-end" style={{borderTopColor: THEME.borderSubtle}}>
        <Button variant="primary" onClick={() => router.push(`/character/edit/${selectedCharacter.id}`)}>
          <FontAwesomeIcon icon={faPenToSquare} className="mr-2" />
          Edit
        </Button>
        <Button variant="default" onClick={() => handleClone(selectedCharacter)}>
          <FontAwesomeIcon icon={faCopy} className="mr-2" />
          Clone
        </Button>
        <Button
          variant="danger"
          onClick={() => handleDeleteClick(selectedCharacter)}
          disabled={selectedCharacter.active_game}
        >
          <FontAwesomeIcon icon={faTrash} className="mr-2" />
          Delete
        </Button>
      </div>

      {/* Created Date */}
      <p className="mt-4 text-xs" style={{color: THEME.textSecondary}}>
        Created: {selectedCharacter.created_at ? new Date(selectedCharacter.created_at).toLocaleDateString() : 'Unknown'}
      </p>
    </div>
  </div>
)}
```

### Phase 5: Add Create Character Card

**Add at end of scroll container** (after character map):
```javascript
{/* Create New Character Card */}
<div
  className="flex-shrink-0"
  style={{
    width: 'clamp(180px, 20vw, 240px)',
    opacity: selectedCharacter ? 0 : 1,
    pointerEvents: selectedCharacter ? 'none' : 'auto',
    transition: selectedCharacter
      ? 'opacity 100ms ease-out'
      : 'opacity 100ms ease-out 50ms'
  }}
>
  <button
    onClick={() => router.push('/character/create')}
    className="w-full rounded-sm overflow-hidden border-2 border-dashed hover:border-opacity-100"
    style={{
      aspectRatio: '3/4',
      backgroundColor: 'transparent',
      borderColor: `${THEME.borderActive}60`
    }}
  >
    <div className="h-full flex flex-col items-center justify-center p-4"
         style={{backgroundColor: `${THEME.bgPanel}40`}}>
      <FontAwesomeIcon
        icon={faPlus}
        className="text-4xl mb-3 opacity-50"
        style={{color: COLORS.smoke}}
      />
      <span className="text-sm font-medium opacity-50" style={{color: THEME.textPrimary}}>
        Create Character
      </span>
    </div>
  </button>
</div>
```

### Phase 6: Extract Clone Handler

**Move inline clone logic to a function** (for use in drawer):
```javascript
const handleClone = async (character) => {
  try {
    const response = await fetch(`/api/characters/${character.id}/clone`, {
      method: 'POST',
      credentials: 'include'
    })
    if (response.ok) {
      const clonedCharacter = await response.json()
      router.push(`/character/edit/${clonedCharacter.id}`)
    } else {
      const errorData = await response.json()
      console.error('Failed to clone character:', errorData.detail)
    }
  } catch (error) {
    console.error('Error cloning character:', error)
  }
}
```

---

## Verification & Testing

1. **Horizontal scroll**: Verify cards scroll horizontally with native scroll behavior
2. **Card sizing**: Check 3:4 aspect ratio maintained across viewport sizes
3. **Selection**: Click card → drawer expands, click again → collapses
4. **Drawer content**: All stats display correctly (ability scores, HP, AC)
5. **Action buttons**: Edit/Clone/Delete work from drawer
6. **Delete protection**: "In Game" characters can't be deleted
7. **Create card**: Fades when character selected, routes to create page
8. **Window resize**: No janky animations during resize
9. **Delete modal**: Still functions correctly
10. **Empty state**: Shows "No characters found" message

---

## Implementation Order

1. Add state variables and resize handler
2. Add toggle function and extract clone handler
3. Convert grid to horizontal flex container
4. Simplify card structure (remove action buttons)
5. Add stats drawer with full content
6. Add Create Character card at end
7. Remove header Create button
8. Test all interactions

---

## Future Enhancement (Next Feature)

**Portrait Upload**: After redesign is complete, add ability to upload custom character portraits:
- Backend: Add `portrait_image` field to character model
- Frontend: Add image upload in character form
- Display: Replace initial avatar with uploaded image
