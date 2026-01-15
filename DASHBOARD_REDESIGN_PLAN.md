# Dashboard Redesign Plan - Custom Color Palette & UX Overhaul

## Overview

Complete dashboard redesign focused on improving information hierarchy and UX flow with a clean, modern aesthetic.

### 🎯 Core Goals
- **Improved UX**: Better information hierarchy, simpler navigation, contextual grouping
- **Custom Color Palette**: Onyx, Silver, Carbon, Dim Grey, Parchment (NO Tailwind colors)
- **Clean Design**: No gradients, minimal border-radius (`rounded-sm`), flat aesthetic
- **Streamlined Navigation**: 2 tabs instead of 5 (Campaigns, Characters)
- **Enhanced Campaign View**: Expansions take substantial real-estate for session management
- **Floating Friends Widget**: Bottom-right, collapsible, real-time online status
- **Custom Typography**: "New Rocker" Google Font for logo

### 📊 Major Changes
- ❌ **Removed Sidebar** → ✅ Horizontal tab bar (gain 256px width)
- ❌ **Removed Sessions Tab** → ✅ Content moved to campaign expansions
- ❌ **Removed Friends Tab** → ✅ Bottom-right floating widget
- ❌ **Removed Profile Tab** → ✅ Icon stays in header
- ❌ **Removed Gradients** → ✅ Solid colors only
- ❌ **Removed Large Border-Radius** → ✅ `rounded-sm` (2-4px max)
- ✅ **Enhanced Campaign Expansions** - Substantial section for session management
- ✅ **Custom Color System** - Complete replacement of Tailwind colors

## User Requirements

### ✅ Confirmed Decisions
- **Primary Goal**: Improve information hierarchy and UX flow
- **Navigation**: Switch from sidebar to horizontal tab bar (below header, full-width)
- **Tab Structure**: **Campaigns** and **Characters** tabs only (Profile icon stays in header)
- **Sessions Tab**: **REMOVED** - all session content now lives in expanded campaign sections
- **Color System**: Custom hex palette ONLY (no Tailwind color classes)
- **Campaign Interaction**: **KEEP existing click-to-expand behavior** - banner stays same size, details section below expands to take "as much real-estate as campaign tile"
- **Expansion Behavior**: Push other campaign cards down (current behavior maintained)
- **Friends System**: **Moved to bottom-right floating widget** (collapsible, shows online status, friend request management)
- **Priority Components**: Hero cards, expanded campaign sections, friends widget, modals

### 🎨 Custom Color Palette

**CRITICAL: These are the ONLY colors to use on the dashboard**

```javascript
// Custom Color Palette - DO NOT USE TAILWIND COLOR CLASSES
const COLORS = {
  onyx: '#0B0A09',      // Dark backgrounds, deep contrast
  silver: '#BEB7B1',    // Light text, borders, accents
  carbon: '#1F1F1F',    // Mid-dark backgrounds, panels
  dimGrey: '#6B6B6B',   // Secondary text, subtle borders
  parchment: '#F5F1EB'  // Lightest accent, highlights
}
```

**Color Usage Philosophy**:
- **Onyx (#0B0A09)**: Main background, deepest contrast areas
- **Silver (#BEB7B1)**: Primary text color, active borders, important accents
- **Carbon (#1F1F1F)**: Panel backgrounds, cards, raised surfaces
- **Dim Grey (#6B6B6B)**: Secondary text, inactive states, subtle dividers
- **Parchment (#F5F1EB)**: Hover highlights, active states, focus indicators

**Implementation Strategy**:
- Create `colorTheme.js` in `/app/styles/` with color constants
- Use inline styles (`style={{backgroundColor: COLORS.carbon}}`) for colors
- Use Tailwind ONLY for layout, spacing, positioning, responsiveness
- No `text-slate-200`, `bg-purple-500`, etc. - all custom colors

## Current Dashboard Analysis

### Existing Structure
```
┌─────────────────────────────────────────────────────────────┐
│  Header (Fixed) - Logo, Notifications, Profile, Logout      │
└─────────────────────────────────────────────────────────────┘
┌──────────────────┬──────────────────────────────────────────┐
│  Sidebar (256px) │  Main Content (Scrollable)               │
│  - Campaigns     │  Active Tab Content                      │
│  - Sessions      │                                          │
│  - Characters    │                                          │
│  - Friends       │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

### Key Files
- **Layout**: `/app/dashboard/components/DashboardLayout.js` (165 lines)
- **Main Page**: `/app/dashboard/page.js`
- **Tab Components**:
  - `CampaignManager.js` (1000+ lines, complex state)
  - `GamesManager.js` (300+ lines, read-only sessions)
  - `CharacterManager.js`
  - `FriendsManager.js`
  - `ProfileManager.js`
- **Modals**: Various modals for campaign/game actions

### Current Issues
1. **Sidebar**: Fixed 256px width reduces content space
2. **Hero Cards**: `min-w-[800px]` forces horizontal scroll on mobile/tablet
3. **Hardcoded Colors**: Purple (#9333ea) and Tailwind colors everywhere
4. **Campaign Expansion**: Click-to-expand behavior is unintuitive
5. **State Management**: 20+ useState variables in CampaignManager
6. **No Visual Consistency**: Different button/badge styles throughout

## Redesign Architecture

### New Structure
```
┌─────────────────────────────────────────────────────────────┐
│  Header (Fixed) - Logo, Notifications, Profile, Logout      │
├─────────────────────────────────────────────────────────────┤
│  Horizontal Tab Bar (Full Width)                           │
│  [Campaigns] [Characters]                                  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Main Content Area (Full Width, Scrollable)                │
│  - More horizontal space for content                       │
│  - Responsive grid layouts                           ┌──────┐
│  - Hero cards WITHOUT min-width constraints          │Friend│
│  - Expanded campaign sections (sessions inline)      │Widget│
│                                                       │(bot- │
│                                                       │right)│
└───────────────────────────────────────────────────────┴──────┘
```

**Key Changes from Current**:
- ❌ Removed sidebar (gain 256px horizontal space)
- ❌ Removed Sessions tab (content moved to campaign expansions)
- ❌ Removed Friends tab (moved to floating widget)
- ✅ Horizontal tabs: Campaigns, Characters only
- ✅ Profile stays in header (not a tab)
- ✅ Friends widget: Fixed bottom-right position
- ✅ Campaign expansion: Keeps existing behavior but enhanced

### Campaign Expansion System (Enhanced, Keep Existing Behavior)

**KEEP current click-to-expand pattern, but make it take more real-estate**:

```
┌─────────────────────────────────────────────────────────────┐
│  Campaign Hero Card (16:4 aspect ratio)                    │
│  [Click anywhere to expand]                                 │
└─────────────────────────────────────────────────────────────┘
                        ↓ (Click)
┌─────────────────────────────────────────────────────────────┐
│  Campaign Hero Banner (Same size, stays visible)           │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│  ┃ EXPANDED DETAILS SECTION (Large, Same Width as Banner) ┃ │
│  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫ │
│  ┃ Campaign Info: Players, Description, Settings          ┃ │
│  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫ │
│  ┃ Game Sessions (formerly Sessions tab content):         ┃ │
│  ┃   ┌────────────────────────────────────┐              ┃ │
│  ┃   │ Session Card 1                     │              ┃ │
│  ┃   │ [Start] [Enter] [Pause] [Delete]   │              ┃ │
│  ┃   └────────────────────────────────────┘              ┃ │
│  ┃   ┌────────────────────────────────────┐              ┃ │
│  ┃   │ Session Card 2                     │              ┃ │
│  ┃   └────────────────────────────────────┘              ┃ │
│  ┃   [+ Create New Session]                              ┃ │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Next Campaign Card (Pushed down)                          │
└─────────────────────────────────────────────────────────────┘
```

**Key Principles**:
- ✅ Keep existing expansion behavior (click card → expands below → pushes others down)
- ✅ Expanded section takes "as much real-estate as campaign tile" (full width, substantial height)
- ✅ All game session management moves into this expanded section
- ✅ Sessions tab removed - content now lives here
- ❌ No slide-out drawer
- ❌ No modal overlay

**Benefits**:
- Familiar interaction pattern (current users already understand it)
- More vertical space for session management
- Sessions contextually grouped with their campaign
- Cleaner navigation (2 tabs instead of 5)

### Friends Widget (Bottom-Right Floating)

**New floating widget replaces Friends tab**:

```
                                    ┌─────────────────────────┐
                                    │ Friends (5) [Collapse]  │
                                    ├─────────────────────────┤
                                    │ 🟢 Alice (Online)       │
                                    │ 🟢 Bob (Online)         │
                                    │ ⚫ Charlie (Offline)    │
                                    │ ⚫ Dave (Offline)       │
                                    │ ⚫ Eve (Offline)        │
                                    ├─────────────────────────┤
                                    │ Pending Requests (2)    │
                                    │ ▸ Frank [Accept/Decline]│
                                    │ ▸ Grace [Accept/Decline]│
                                    ├─────────────────────────┤
                                    │ [+ Add Friend]          │
                                    └─────────────────────────┘
                                             ↓ (Collapsed)
                                    ┌─────────────────┐
                                    │ Friends (5) 🟢2 │
                                    └─────────────────┘
```

**Features**:
- **Fixed position**: `bottom-right` of viewport
- **Collapsible**: Click header to collapse/expand
- **Online status**: Green dot for online, grey for offline
- **Friend requests**: Inline accept/decline actions
- **Add friend**: Quick add button at bottom
- **Notification badge**: Shows online count when collapsed
- **Z-index layering**: Floats above content, below modals

**States**:
- **Expanded** (default): Shows full list, ~300px height, 250px width
- **Collapsed**: Just header bar, shows online count badge
- **Mobile**: Auto-collapses on screens <768px

**Benefits**:
- Always accessible (no need to switch tabs)
- Real-time online status visibility
- Quick friend invites to campaigns
- Doesn't take up tab navigation space

### Design Constraints

**Visual Style Guidelines**:
- ❌ **NO gradients** - Use solid colors only for clean look
- ❌ **Minimal border-radius** - `rounded` (4px) or `rounded-sm` (2px) max, avoid `rounded-lg`, `rounded-xl`
- ✅ **Clean, flat design** - Rely on borders and spacing for depth
- ✅ **Sharp edges preferred** - More modern, less "bubbly"

**Before (Current)**:
```css
rounded-lg (8px)           ❌ Too round
rounded-xl (12px)          ❌ Way too round
linear-gradient(...)       ❌ No gradients
```

**After (New)**:
```css
rounded (4px)              ✅ Acceptable
rounded-sm (2px)           ✅ Preferred for most elements
border + solid colors      ✅ Depth through structure
```

**Example comparisons**:
- **Buttons**: `rounded-sm` instead of `rounded-lg`
- **Cards**: `rounded` instead of `rounded-xl`
- **Modals**: `rounded` instead of `rounded-2xl`
- **Hero cards**: `rounded-sm` for crisp edges on images
- **Badges**: `rounded-sm` instead of `rounded-full` (less pill-like)

## Implementation Plan

### Phase 1: Color System Foundation

**Create color theme constants**:

**File**: `/app/styles/colorTheme.js` (NEW)
```javascript
// Custom Color Palette - Dashboard Redesign
// Copyright (C) 2025 Matthew Davey
// SPDX-License-Identifier: GPL-3.0-or-later

export const COLORS = {
  onyx: '#0B0A09',
  silver: '#BEB7B1',
  carbon: '#1F1F1F',
  dimGrey: '#6B6B6B',
  parchment: '#F5F1EB'
}

// Semantic color mappings for clarity
export const THEME = {
  // Backgrounds
  bgPrimary: COLORS.onyx,
  bgSecondary: COLORS.carbon,
  bgPanel: COLORS.carbon,

  // Text
  textPrimary: COLORS.silver,
  textSecondary: COLORS.dimGrey,
  textAccent: COLORS.parchment,

  // Borders
  borderDefault: COLORS.dimGrey,
  borderActive: COLORS.silver,
  borderSubtle: `${COLORS.dimGrey}40`, // 25% opacity

  // Interactive states
  hoverBg: COLORS.parchment,
  activeBg: COLORS.parchment,
  focusBorder: COLORS.silver,

  // Overlays
  overlayDark: `${COLORS.onyx}CC`, // 80% opacity
  overlayLight: `${COLORS.carbon}80` // 50% opacity
}

// Common style objects (for inline styles)
export const STYLES = {
  card: {
    backgroundColor: THEME.bgPanel,
    borderColor: THEME.borderSubtle,
    color: THEME.textPrimary
  },

  button: {
    backgroundColor: THEME.bgSecondary,
    color: THEME.textPrimary,
    borderColor: THEME.borderDefault
  },

  buttonHover: {
    backgroundColor: THEME.bgSecondary,
    borderColor: THEME.borderActive,
    color: THEME.textAccent
  },

  tabActive: {
    borderBottomColor: THEME.borderActive,
    color: THEME.textAccent
  },

  tabInactive: {
    borderBottomColor: 'transparent',
    color: THEME.textSecondary
  }
}
```

**Update constants.js to export color theme**:

**File**: `/app/styles/constants.js` (MODIFY)
- Add `export * from './colorTheme'` at top
- Keep existing DM/Moderator styles (for game page use)
- Dashboard will import from colorTheme.js directly

### Phase 2: Horizontal Tab Bar Navigation

**Redesign DashboardLayout.js**:

**File**: `/app/dashboard/components/DashboardLayout.js` (MAJOR REWRITE)

**Changes**:
1. **Remove sidebar** (`<aside>` element)
2. **Add horizontal tab bar** below header
3. **Update color scheme** to custom palette
4. **Full-width main content** area

**New Structure**:
```jsx
<div className="h-screen flex flex-col" style={{backgroundColor: THEME.bgPrimary, color: THEME.textPrimary}}>
  {/* Header - Keep existing but update colors */}
  <header className="flex-shrink-0 border-b p-4 flex justify-between items-center"
          style={{backgroundColor: THEME.bgSecondary, borderBottomColor: THEME.borderSubtle}}>
    <div className="text-2xl font-extrabold flex items-center" style={{color: THEME.textAccent}}>
      <span>Tabletop Tavern</span>
    </div>
    <nav className="flex items-center gap-6">
      <NotificationBell ... />
      <button ... style={{color: THEME.textSecondary}}>Profile</button>
      <button ... style={{color: THEME.textSecondary}}>Logout</button>
    </nav>
  </header>

  {/* NEW: Horizontal Tab Bar */}
  <nav className="flex-shrink-0 border-b"
       style={{backgroundColor: THEME.bgSecondary, borderBottomColor: THEME.borderSubtle}}>
    <div className="flex">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => switchSection(tab.id)}
          className="flex-1 py-4 px-6 border-b-2 transition-all duration-200 font-semibold uppercase text-sm"
          style={activeSection === tab.id ? STYLES.tabActive : STYLES.tabInactive}
        >
          <FontAwesomeIcon icon={tab.icon} className="mr-2" />
          {tab.label}
        </button>
      ))}
    </div>
  </nav>

  {/* Main Content - Full Width */}
  <main className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-10">
    {children}
  </main>
</div>
```

**Tab Configuration** (Sessions and Friends removed):
```javascript
const tabs = [
  { id: 'campaigns', label: 'Campaigns', icon: faMap },
  { id: 'characters', label: 'Characters', icon: faUsers }
]
// Note: Profile stays in header (not a tab)
// Note: Friends moved to floating widget (not a tab)
// Note: Sessions content moved into campaign expansions
```

**Responsive Behavior**:
- **Desktop**: Full-width tabs with icons + labels
- **Tablet**: Tabs wrap if needed
- **Mobile**: Icons only OR scrollable horizontal tabs

### Phase 3: Friends Widget Component

**Create floating friends widget**:

**File**: `/app/dashboard/components/FriendsWidget.js` (NEW)

**Purpose**: Bottom-right floating widget for friends list, online status, and friend requests

**Features**:
- **Fixed bottom-right position**
- **Collapsible** (click header to toggle)
- **Online status indicators** (green dot for online friends)
- **Friend request management** (inline accept/decline)
- **Add friend button**
- **Notification badge** when collapsed

**Structure**:
```jsx
export default function FriendsWidget({ user, friends, friendRequests, refreshTrigger }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const onlineFriends = friends.filter(f => f.is_online)

  return (
    <div
      className="fixed bottom-4 right-4 z-30 border-2 rounded-sm transition-all"
      style={{
        backgroundColor: THEME.bgPanel,
        borderColor: THEME.borderDefault,
        width: isExpanded ? '250px' : 'auto',
        maxHeight: isExpanded ? '400px' : 'auto'
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 border-b flex justify-between items-center"
        style={{borderBottomColor: THEME.borderSubtle, color: THEME.textPrimary}}
      >
        <span className="font-semibold text-sm">
          Friends ({friends.length})
        </span>
        {!isExpanded && onlineFriends.length > 0 && (
          <span
            className="px-2 py-0.5 rounded-sm text-xs"
            style={{backgroundColor: '#166534', color: THEME.textAccent}}
          >
            {onlineFriends.length} online
          </span>
        )}
        <FontAwesomeIcon
          icon={isExpanded ? faChevronDown : faChevronUp}
          className="text-xs"
        />
      </button>

      {/* Content (when expanded) */}
      {isExpanded && (
        <div className="overflow-y-auto" style={{maxHeight: '300px'}}>
          {/* Friends List */}
          <div className="p-2">
            {friends.map(friend => (
              <div
                key={friend.id}
                className="flex items-center gap-2 p-2 rounded-sm mb-1"
                style={{color: THEME.textPrimary}}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{backgroundColor: friend.is_online ? '#16a34a' : THEME.dimGrey}}
                />
                <span className="text-sm truncate">{friend.screen_name}</span>
              </div>
            ))}
          </div>

          {/* Friend Requests */}
          {friendRequests.length > 0 && (
            <div className="border-t p-2" style={{borderTopColor: THEME.borderSubtle}}>
              <p className="text-xs font-semibold mb-2" style={{color: THEME.textSecondary}}>
                Pending Requests ({friendRequests.length})
              </p>
              {friendRequests.map(request => (
                <div key={request.id} className="mb-2">
                  <p className="text-sm mb-1" style={{color: THEME.textPrimary}}>
                    {request.screen_name}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="success" size="xs" onClick={() => acceptRequest(request.id)}>
                      Accept
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => declineRequest(request.id)}>
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Friend */}
          <div className="border-t p-2" style={{borderTopColor: THEME.borderSubtle}}>
            <Button variant="primary" className="w-full text-xs" onClick={openAddFriendModal}>
              + Add Friend
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Positioning**:
- `fixed bottom-4 right-4` (16px from bottom-right corner)
- `z-30` (above content, below modals which use z-40/z-50)

**Responsive**:
- **Desktop/Tablet**: Normal behavior (250px width when expanded)
- **Mobile (<768px)**: Auto-collapsed by default, full width when expanded

### Phase 4: Enhanced Campaign Expansion

**Update campaign expansion in CampaignManager.js**:

**File**: `/app/dashboard/components/CampaignManager.js` (MODIFY)

**Changes**:
1. **Keep existing expansion logic** (click-to-expand, push cards down)
2. **Increase expansion section height** - make it substantial (match campaign card width)
3. **Move all session management** into expansion (from GamesManager.js)
4. **Consolidate session actions** (Start, Play, Pause, Finish, Delete all in one place)

**Expansion Section Structure**:
```jsx
{selectedCampaign === campaign.id && (
  <div
    ref={gameSessionsPanelRef}
    className="w-full border-2 border-t-0 p-6 rounded-b-sm"
    style={{
      backgroundColor: THEME.bgSecondary,
      borderColor: THEME.borderDefault,
      minHeight: '400px' // Substantial real-estate
    }}
  >
    {/* Campaign Info Section */}
    <div className="mb-6 pb-6 border-b" style={{borderBottomColor: THEME.borderSubtle}}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold" style={{color: THEME.textAccent}}>
            Campaign Details
          </h3>
          <p className="text-sm mt-1" style={{color: THEME.textSecondary}}>
            {campaign.description}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => openInviteModal(campaign)}>
            <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
            Invite Players
          </Button>
          <Button variant="danger" onClick={() => openDeleteModal(campaign)}>
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </div>
      </div>

      {/* Player Count */}
      <div className="flex gap-4 text-sm" style={{color: THEME.textSecondary}}>
        <span>Players: {campaign.player_ids?.length || 0}</span>
        <span>Sessions: {campaign.games?.length || 0}</span>
      </div>
    </div>

    {/* Game Sessions Section (formerly Sessions tab content) */}
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold" style={{color: THEME.textPrimary}}>
          Game Sessions
        </h3>
        <Button variant="primary" onClick={() => openCreateGameModal(campaign)}>
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Create Session
        </Button>
      </div>

      {/* Session Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {campaign.games?.map(game => (
          <SessionCard key={game.id} game={game} campaign={campaign} />
        ))}
      </div>

      {/* Empty State */}
      {(!campaign.games || campaign.games.length === 0) && (
        <div className="text-center py-8" style={{color: THEME.textSecondary}}>
          <p className="mb-4">No sessions yet</p>
          <Button variant="primary" onClick={() => openCreateGameModal(campaign)}>
            Create Your First Session
          </Button>
        </div>
      )}
    </div>
  </div>
)}
```

**Benefits**:
- All session management contextually grouped with campaign
- Substantial screen real-estate (min-height: 400px)
- Keeps familiar expansion interaction pattern
- Sessions tab no longer needed

### Phase 5: Hero Cards Redesign

**Update campaign cards in CampaignManager.js**:

**File**: `/app/dashboard/components/CampaignManager.js` (MODIFY)

**Changes**:
1. **Remove `min-w-[800px]`** - let cards be responsive
2. **Keep aspect ratio** - `aspect-[16/4]` works well, responsive on mobile
3. **No gradients** - solid colors only
4. **Minimal border-radius** - `rounded-sm` instead of `rounded-lg`
5. **Click expands** inline (existing behavior)

**New Card Structure** (NO gradients, minimal border-radius):
```jsx
<button
  onClick={() => toggleCampaignExpansion(campaign.id)}
  className="w-full aspect-[16/4] relative rounded-sm overflow-hidden
             border-2 transition-all duration-200"
  style={{
    backgroundImage: campaign.hero_image
      ? `url(${campaign.hero_image})`
      : 'none',
    backgroundColor: campaign.hero_image ? 'transparent' : COLORS.carbon,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderColor: selectedCampaign === campaign.id ? THEME.borderActive : THEME.borderDefault
  }}
>
  {/* Solid dark overlay for text readability (NO gradient) */}
  <div
    className="absolute inset-0 flex flex-col justify-end p-6"
    style={{
      backgroundColor: campaign.hero_image
        ? `${COLORS.onyx}B3` // 70% opacity solid overlay
        : 'transparent'
    }}
  >
    <div className="flex justify-between items-end">
      <div className="text-left">
        <h3 className="text-2xl font-bold mb-2" style={{color: THEME.textAccent}}>
          {campaign.title}
        </h3>
        <p className="text-sm line-clamp-2" style={{color: THEME.textSecondary}}>
          {campaign.description}
        </p>
      </div>

      <div className="flex gap-2">
        <Badge>{campaign.games?.length || 0} Sessions</Badge>
        <Badge>{campaign.player_ids?.length || 0} Players</Badge>
      </div>
    </div>
  </div>
</button>
```

**Key Changes**:
- ✅ `rounded-sm` instead of `rounded-lg` (minimal curvature)
- ✅ Solid color overlay (`${COLORS.onyx}B3`) instead of gradient
- ✅ Solid `backgroundColor: COLORS.carbon` for cards without hero images
- ✅ No `hover:scale` transform (cleaner, less animation)
- ✅ Badge uses `rounded-sm` (updated in Badge component)
- ✅ Border changes color when expanded (visual feedback)

**Responsive Grid**:
```jsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {campaigns.map(campaign => (
    <CampaignCard key={campaign.id} campaign={campaign} />
  ))}
</div>
```

**Benefits**:
- Cards work on mobile (no horizontal scroll from min-width constraint)
- Click expands inline (existing familiar behavior)
- Clean, flat design (no gradients)
- Sharp edges (minimal border-radius)
- Better visual feedback (border color change on expansion)

### Phase 5: Button & Badge System

**Create reusable button components**:

**File**: `/app/dashboard/components/shared/Button.js` (NEW)

```javascript
import { COLORS, THEME, STYLES } from '@/app/styles/colorTheme'

export function Button({
  variant = 'default',
  children,
  className = '',
  ...props
}) {
  const variants = {
    default: {
      ...STYLES.button,
      transition: 'all 200ms'
    },

    primary: {
      backgroundColor: THEME.bgSecondary,
      color: THEME.textAccent,
      borderColor: THEME.borderActive
    },

    danger: {
      backgroundColor: '#991b1b',
      color: THEME.textAccent,
      borderColor: '#dc2626'
    },

    success: {
      backgroundColor: '#166534',
      color: THEME.textAccent,
      borderColor: '#16a34a'
    },

    ghost: {
      backgroundColor: 'transparent',
      color: THEME.textSecondary,
      borderColor: 'transparent'
    }
  }

  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      className={`px-4 py-2 rounded-sm border font-medium text-sm transition-all ${className}`}
      style={{
        ...variants[variant],
        ...(isHovered && { borderColor: THEME.borderActive, color: THEME.textAccent })
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({ children, className = '', ...props }) {
  return (
    <span
      className={`px-3 py-1 rounded-sm text-xs font-semibold border ${className}`}
      style={{
        backgroundColor: `${THEME.bgSecondary}CC`,
        color: THEME.textPrimary,
        borderColor: THEME.borderDefault
      }}
      {...props}
    >
      {children}
    </span>
  )
}
```

**Usage**:
```jsx
<Button variant="primary" onClick={handleCreate}>Create Campaign</Button>
<Button variant="danger" onClick={handleDelete}>Delete</Button>
<Badge>5 Players</Badge>
<Badge>Active</Badge>
```

### Phase 6: Modal System Redesign

**Update existing modals to use custom colors**:

**Files to modify**:
- `CampaignInviteModal.js`
- `CharacterSelectionModal.js`
- `PauseSessionModal.js`
- `FinishSessionModal.js`
- `DeleteCampaignModal.js`
- `DeleteSessionModal.js`

**Pattern for all modals**:
```jsx
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from '../shared/Button'

export default function ExampleModal({ isOpen, onClose, ... }) {
  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{backgroundColor: THEME.overlayDark}}>

      <div className="max-w-2xl w-full rounded-xl border shadow-2xl p-6"
           style={{
             backgroundColor: THEME.bgSecondary,
             borderColor: THEME.borderDefault
           }}>

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold" style={{color: THEME.textAccent}}>
            Modal Title
          </h2>
          <button onClick={onClose} style={{color: THEME.textSecondary}}>
            <FontAwesomeIcon icon={faXmark} className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Form fields, content, etc. */}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit}>Confirm</Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

**Key Changes**:
- Replace all Tailwind color classes with inline styles
- Use `THEME` constants for consistency
- Use shared `Button` component
- Maintain existing functionality, just update visuals

### Phase 7: Sessions Tab Redesign

**Update GamesManager.js**:

**File**: `/app/dashboard/components/GamesManager.js` (MODIFY)

**Changes**:
1. Update card styling to custom colors
2. Improve responsive grid for player rosters
3. Better visual hierarchy for session metadata

**Session Card Pattern** (within campaign expansion):
```jsx
<div className="p-6 rounded-sm border"
     style={{
       backgroundColor: THEME.bgPanel,
       borderColor: THEME.borderSubtle
     }}>

  {/* Header */}
  <div className="flex justify-between items-start mb-4">
    <div>
      <h3 className="text-xl font-bold" style={{color: THEME.textAccent}}>
        {game.name}
      </h3>
      <div className="flex gap-2 mt-2">
        <Badge>{game.status}</Badge>
        <Badge>{userRole}</Badge>
      </div>
    </div>

    <Button variant="primary" onClick={() => enterSession(game.id)}>
      <FontAwesomeIcon icon={faRightToBracket} className="mr-2" />
      Enter
    </Button>
  </div>

  {/* Metadata */}
  <div className="grid grid-cols-2 gap-4 mb-4 text-sm"
       style={{color: THEME.textSecondary}}>
    <div>
      <span className="font-semibold">DM:</span> {game.dm_name}
    </div>
    <div>
      <span className="font-semibold">Players:</span> {game.players.length}/{game.max_players}
    </div>
  </div>

  {/* Roster */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
    {game.roster?.map(player => (
      <PlayerRosterCard key={player.user_id} player={player} />
    ))}
  </div>
</div>
```

### Phase 8: State Management Simplification

**Consolidate modal states in CampaignManager.js**:

**Current** (20+ useState variables):
```javascript
const [showCampaignModal, setShowCampaignModal] = useState(false)
const [showGameModal, setShowGameModal] = useState(false)
const [showDeleteCampaignModal, setShowDeleteCampaignModal] = useState(false)
const [campaignToDelete, setCampaignToDelete] = useState(null)
// ... 16+ more state variables
```

**Refactored** (consolidated approach):
```javascript
const [modals, setModals] = useState({
  campaignCreate: { open: false },
  campaignEdit: { open: false, campaign: null },
  campaignDelete: { open: false, campaign: null },
  campaignDrawer: { open: false, campaign: null },
  gameCreate: { open: false, campaign: null },
  gameDelete: { open: false, game: null },
  gamePause: { open: false, game: null },
  gameFinish: { open: false, game: null },
  campaignInvite: { open: false, campaign: null }
})

// Helper functions
const openModal = (modalName, data = {}) => {
  setModals(prev => ({
    ...prev,
    [modalName]: { open: true, ...data }
  }))
}

const closeModal = (modalName) => {
  setModals(prev => ({
    ...prev,
    [modalName]: { open: false }
  }))
}
```

**Benefits**:
- Single source of truth for modal state
- Easier to track what's open
- Simpler to add new modals
- Less boilerplate

## File Structure Changes

### New Files to Create
```
/app/styles/
  colorTheme.js (NEW) - Custom color palette and theme constants

/app/dashboard/components/
  FriendsWidget.js (NEW) - Bottom-right floating friends widget

/app/dashboard/components/shared/ (NEW)
  Button.js (NEW) - Reusable button component with variants
  Badge.js (NEW) - Status badges (can be in Button.js)
```

### Files to Modify
```
/app/dashboard/components/
  DashboardLayout.js (MAJOR REWRITE) - Remove sidebar, add horizontal tabs, integrate FriendsWidget
  CampaignManager.js (MAJOR CHANGES) - Enhanced expansion section, session management integration, color updates, state refactor
  page.js (MINOR) - Add FriendsWidget, remove Sessions/Friends tabs
  CharacterManager.js (MINOR CHANGES) - Color updates only
  ProfileManager.js (MINOR CHANGES) - Color updates only

/app/dashboard/components/modals/ (ALL)
  CampaignInviteModal.js - Color updates, rounded-sm
  CharacterSelectionModal.js - Color updates, rounded-sm
  PauseSessionModal.js - Color updates, rounded-sm
  FinishSessionModal.js - Color updates, rounded-sm
  DeleteCampaignModal.js - Color updates, rounded-sm
  DeleteSessionModal.js - Color updates, rounded-sm

/app/styles/
  constants.js (MINOR) - Add export for colorTheme
  globals.css (MINOR) - Add Google Font import for "New Rocker"

/app/layout.js (MINOR) - Configure Google Font "New Rocker"
```

### Files to Remove/Deprecate
```
/app/dashboard/components/
  GamesManager.js (DEPRECATED) - Sessions tab removed, functionality moved to CampaignManager expansions
  FriendsManager.js (DEPRECATED) - Friends tab removed, functionality moved to FriendsWidget
```

## Custom Typography - "New Rocker" Font

**Google Font**: [New Rocker](https://fonts.google.com/specimen/New+Rocker)

**Purpose**: Display font for "Tabletop Tavern" logo in header

**Implementation**:

### Step 1: Add to Next.js layout

**File**: `/app/layout.js`
```javascript
import { New_Rocker } from 'next/font/google'

const newRocker = New_Rocker({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-new-rocker',
  display: 'swap'
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={newRocker.variable}>
      <body>{children}</body>
    </html>
  )
}
```

### Step 2: Use in DashboardLayout header

**File**: `/app/dashboard/components/DashboardLayout.js`
```jsx
<div className="text-2xl font-extrabold flex items-center font-[family-name:var(--font-new-rocker)]"
     style={{color: THEME.textAccent}}>
  <span>Tabletop Tavern</span>
</div>
```

**Alternative (if CSS variable doesn't work)**:
```jsx
<div className="text-2xl flex items-center"
     style={{
       color: THEME.textAccent,
       fontFamily: 'New Rocker, serif',
       fontWeight: 400
     }}>
  <span>Tabletop Tavern</span>
</div>
```

## Implementation Order

### Step 1: Color System & Typography Foundation
1. Add Google Font "New Rocker" to `/app/layout.js`
2. Create `/app/styles/colorTheme.js`
3. Update `/app/styles/constants.js` to export colorTheme
4. Create shared Button/Badge components in `/app/dashboard/components/shared/`

### Step 2: Layout Transformation
1. Rewrite `DashboardLayout.js` - remove sidebar, add horizontal tabs (Campaigns, Characters only)
2. Update header with "New Rocker" font for logo
3. Test navigation still works (URL-based routing)
4. Verify responsive behavior (tabs on all screen sizes)

### Step 3: Friends Widget
1. Create `FriendsWidget.js` component (bottom-right floating)
2. Integrate into `dashboard/page.js`
3. Fetch friends list and requests data
4. Test collapsible behavior and online status
5. Verify z-index layering (above content, below modals)

### Step 4: Enhanced Campaign Expansion
1. Update `CampaignManager.js` expansion section
2. Increase expansion height (min-height: 400px, substantial real-estate)
3. Move session management from GamesManager into expansions
4. Add campaign info section (players, description, actions)
5. Test expansion behavior (push cards down, keep existing logic)

### Step 5: Hero Cards & Content
1. Update campaign cards - remove `min-width`, add `rounded-sm`, remove gradients
2. Replace gradients with solid color overlays
3. Update invited campaign cards with same styling
4. Add border color change on expansion (visual feedback)
5. Test on mobile/tablet/desktop (no horizontal scroll)

### Step 6: Modal Updates
1. Update all modal components to use custom colors and `rounded-sm`
2. Integrate shared Button/Badge components
3. Remove all Tailwind color classes
4. Test modal functionality unchanged

### Step 7: State Management
1. Refactor `CampaignManager.js` state to consolidated modal object
2. Test all modals still work correctly
3. Verify no regressions in functionality

### Step 8: Deprecate Old Components
1. Remove references to `GamesManager.js` (Sessions tab deprecated)
2. Remove references to `FriendsManager.js` (Friends tab deprecated)
3. Clean up unused imports and routes
4. Update page.js to only render Campaigns/Characters tabs

### Step 9: Polish & Refinement
1. Add subtle hover states (border color changes, no scale transforms)
2. Test accessibility (keyboard navigation, focus states with custom colors)
3. Verify responsive breakpoints (especially Friends widget on mobile)
4. Final color consistency check (no Tailwind colors remaining)
5. Test "New Rocker" font loads correctly on all browsers

## Verification Checklist

### Visual Testing
- [ ] All Tailwind color classes removed from dashboard components
- [ ] Only custom hex colors used (`#0B0A09`, `#BEB7B1`, `#1F1F1F`, `#6B6B6B`, `#F5F1EB`)
- [ ] **NO gradients** used anywhere (solid colors only)
- [ ] **Minimal border-radius** (`rounded-sm` or `rounded` only, no `rounded-lg`/`rounded-xl`)
- [ ] Horizontal tab bar displays correctly (only Campaigns & Characters tabs)
- [ ] "New Rocker" font displays for "Tabletop Tavern" logo
- [ ] Campaign expansion takes substantial real-estate (min-height: 400px)
- [ ] Hero cards responsive (no horizontal scroll, no `min-w-[800px]`)
- [ ] Friends widget displays in bottom-right corner
- [ ] Friends widget collapses/expands correctly
- [ ] Modals use consistent custom colors and `rounded-sm`
- [ ] Buttons and badges use shared components with `rounded-sm`

### Functional Testing
- [ ] Tab navigation works (only Campaigns & Characters, URL updates)
- [ ] Campaign expansion opens/closes (push cards down behavior)
- [ ] Campaign CRUD operations work
- [ ] Game session management works within campaign expansions
- [ ] Player invites work
- [ ] Friends widget shows online status
- [ ] Friend requests can be accepted/declined from widget
- [ ] Sessions tab removed (content moved to campaign expansions)
- [ ] Friends tab removed (functionality in bottom-right widget)
- [ ] All modals function correctly
- [ ] WebSocket events trigger refreshes
- [ ] Toast notifications appear

### Responsive Testing
- [ ] Desktop (1920x1080): Full layout works
- [ ] Laptop (1366x768): Tabs and content fit
- [ ] Tablet (768x1024): Cards stack properly, drawer full-width
- [ ] Mobile (375x667): Everything accessible, no horizontal scroll

### Accessibility
- [ ] Keyboard navigation works for tabs
- [ ] Focus states visible with custom colors
- [ ] Drawer closes on Escape key
- [ ] Color contrast meets WCAG AA standards

## Design Considerations

### Color Accessibility
**Potential Issue**: Limited color palette may affect contrast ratios

**Mitigation**:
- Onyx (#0B0A09) + Silver (#BEB7B1): ~13:1 contrast (excellent)
- Carbon (#1F1F1F) + Silver (#BEB7B1): ~8:1 contrast (good)
- Use Parchment (#F5F1EB) for important text on dark backgrounds
- Test with contrast checker tools

### State Colors (Success/Error/Warning)
**Challenge**: Only 5 colors, no green/red for states

**Approach**:
- **Success/Active**: Use Parchment (#F5F1EB) backgrounds with Silver text
- **Danger/Delete**: Exception - use red (#991b1b, #dc2626) for destructive actions only
- **Warning**: Use Dim Grey (#6B6B6B) with Parchment accents
- **Info**: Use Silver with Onyx backgrounds

**Rationale**: Safety-critical actions (delete) warrant color exceptions

### Animation Performance
- Use CSS transitions for drawer/modal (GPU-accelerated)
- `transform` for slide animations (better performance than `left`/`right`)
- `opacity` for fades
- Keep transitions under 300ms for snappy feel

### Mobile Considerations
- **Drawer**: Full-width on mobile (<640px), partial on desktop
- **Tabs**: Consider scrollable horizontal tabs on very small screens
- **Cards**: Stack to 1 column on mobile
- **Touch targets**: Minimum 44x44px for buttons

## Notes for Implementation

### Inline Styles vs Tailwind
- **Colors**: Always use inline styles (`style={{backgroundColor: THEME.bgPrimary}}`)
- **Layout**: Use Tailwind (`className="flex items-center gap-4"`)
- **Spacing**: Use Tailwind (`className="p-6 mb-4"`)
- **Positioning**: Use Tailwind (`className="absolute top-0 right-0"`)
- **Responsive**: Use Tailwind (`className="grid grid-cols-1 lg:grid-cols-2"`)

### Hover States Implementation
```javascript
const [isHovered, setIsHovered] = useState(false)

<button
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  style={{
    backgroundColor: isHovered ? THEME.hoverBg : THEME.bgSecondary,
    borderColor: isHovered ? THEME.borderActive : THEME.borderDefault
  }}
>
  Hover me
</button>
```

### Gradient Overlays
```javascript
// For hero cards with background images
style={{
  background: `linear-gradient(to bottom, transparent 0%, ${COLORS.onyx}E6 100%)`
}}

// For drawer overlays
style={{
  backgroundColor: `${COLORS.onyx}CC` // 80% opacity
}}
```

### Portal Pattern for Modals/Drawers
```javascript
import { createPortal } from 'react-dom'

return createPortal(
  <div>Modal/Drawer Content</div>,
  document.body
)
```

## Critical Files Reference

### Layout & Navigation
- [DashboardLayout.js](rollplay/app/dashboard/components/DashboardLayout.js) - Main layout wrapper

### Campaign Management
- [CampaignManager.js](rollplay/app/dashboard/components/CampaignManager.js) - Campaign CRUD and display

### Sessions View
- [GamesManager.js](rollplay/app/dashboard/components/GamesManager.js) - Active sessions list

### Styling
- [constants.js](rollplay/app/styles/constants.js) - Existing style constants
- [colorTheme.js](rollplay/app/styles/colorTheme.js) - NEW custom color palette

### Shared Components
- [NotificationBell.js](rollplay/app/shared/components/NotificationBell.js) - Keep existing, update colors

## Success Criteria

### User Experience
- ✅ **Navigation is intuitive** - horizontal tabs are discoverable
- ✅ **Campaign details accessible** - drawer provides clear access to all features
- ✅ **No horizontal scroll** - works on all screen sizes
- ✅ **Visual consistency** - custom color palette used throughout
- ✅ **Smooth interactions** - animations feel polished

### Technical
- ✅ **No Tailwind color classes** on dashboard (only custom hex colors)
- ✅ **State management simplified** - consolidated modal state
- ✅ **Reusable components** - Button, Badge shared across dashboard
- ✅ **Responsive design** - works from 375px to 1920px+ widths
- ✅ **Performance maintained** - no regressions in load times

### Code Quality
- ✅ **DRY principle** - no repeated color definitions
- ✅ **Semantic naming** - `THEME.textPrimary` vs hardcoded hex
- ✅ **Maintainable** - easy to update colors globally
- ✅ **Type safe** - proper prop types/TypeScript (if applicable)

---

## Ready to Begin Implementation?

This plan provides:
1. **Clear color system** with custom hex palette only
2. **Horizontal tab navigation** with full-width layout
3. **Campaign drawer** for better information hierarchy
4. **Responsive hero cards** without horizontal scroll
5. **Consistent component styling** with shared Button/Badge
6. **Simplified state management** in CampaignManager
7. **Complete modal system redesign** with custom colors

**Next steps**: Review plan, confirm approach, then begin implementation starting with Phase 1 (Color System Foundation).
