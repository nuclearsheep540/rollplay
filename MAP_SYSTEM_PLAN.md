# Map System Implementation Plan

## Overview
Build a comprehensive map system for the D&D Tabletop Tavern that allows DMs to upload battle maps, overlay customizable grids, and provide shared visual reference points for all players.

## Core Concepts

### Two-Layer System
1. **Map Configuration Layer** (DM only, persistent)
   - Map image upload and storage
   - Grid alignment, sizing, and visual styling
   - Saved to database, affects all players
   
2. **Client View Layer** (per-player, local)
   - Personal zoom/pan controls
   - Individual viewing preferences
   - Local state only, doesn't affect others

### Grid Alignment Philosophy
- **Visual Operation**: DMs align grids by sight, not by entering numbers
- **Click & Drag**: Move grid position across the map image
- **Mouse Wheel**: Resize grid cells (zoom grid in/out)
- **Real-time Feedback**: Immediate visual response during manipulation

### Zoom Normalization
- DMs can zoom into images while configuring grids
- All grid config values are normalized to base zoom (1.0) when saved
- Ensures consistent grid alignment regardless of player zoom level
- "Flattens" the composition of map zoom + grid config into immutable relationship

## Data Architecture

### MongoDB Schema Extension
Add to `active_sessions` collection:
```javascript
{
  // existing fields...
  maps: {
    active_map_id: null,
    uploaded_maps: [
      {
        id: "uuid-string",
        filename: "dungeon.jpg",
        original_filename: "My Epic Dungeon.jpg", 
        upload_date: "2025-01-15T10:30:00Z",
        file_path: "/static/maps/room123/dungeon.jpg",
        dimensions: { width: 1200, height: 800 },
        grid_config: {
          cell_size: 40,           // normalized pixels per cell
          offset_x: -12,           // normalized grid position
          offset_y: 8,             // normalized grid position  
          enabled: true,
          colors: {
            edit_mode: {
              line_color: "#ff0000",
              opacity: 0.8,
              line_width: 2
            },
            display_mode: {
              line_color: "#ffffff", 
              opacity: 0.3,
              line_width: 1
            }
          }
        }
      }
    ]
  }
}
```

### Client-Side State Management
```javascript
// Per-player viewport state (local only)
view_state: {
  zoom: 1.2,              // player's zoom level
  pan_x: -50,             // player's pan position  
  pan_y: 100,
  show_grid: true,        // toggle grid visibility
  show_labels: true,      // toggle coordinate labels (A1, B2, etc.)
  grid_label_size: 12     // coordinate label font size
}

// DM edit mode state (temporary during config)
edit_state: {
  map_zoom: 1.5,          // DM's current zoom while editing
  grid_cell_size: 60,     // grid size at current zoom
  grid_offset_x: -18,     // grid position at current zoom
  grid_offset_y: 12,
  is_editing: true,
  drag_active: false,
  color_picker_open: false
}
```

## Technical Implementation

### Backend Components

#### FastAPI Endpoints
```python
# File upload and management
POST   /api/game/{room_id}/maps/upload
GET    /api/game/{room_id}/maps
DELETE /api/game/{room_id}/maps/{map_id}

# Grid configuration
PUT    /api/game/{room_id}/maps/{map_id}/grid
GET    /api/game/{room_id}/maps/{map_id}/grid

# Map activation
PUT    /api/game/{room_id}/maps/active/{map_id}
DELETE /api/game/{room_id}/maps/active
```

#### GameService Methods
```python
# Add to gameservice.py
@staticmethod
def upload_map(room_id: str, file_data: bytes, filename: str) -> dict
@staticmethod  
def get_room_maps(room_id: str) -> list
@staticmethod
def delete_map(room_id: str, map_id: str) -> bool
@staticmethod
def save_grid_config(room_id: str, map_id: str, config: dict) -> bool
@staticmethod
def set_active_map(room_id: str, map_id: str) -> bool
@staticmethod
def get_active_map(room_id: str) -> dict
```

#### File Storage Structure
```
/static/maps/
  ├── room123/
  │   ├── map_uuid1.jpg
  │   ├── map_uuid2.png
  │   └── thumbnails/
  │       ├── map_uuid1_thumb.jpg
  │       └── map_uuid2_thumb.png
  └── room456/
      └── ...
```

### Frontend Components

#### Component Architecture
```
app/map_management/
├── components/
│   ├── MapManager.js          # Main map system coordinator
│   ├── MapUpload.js           # File upload interface (DM only)
│   ├── MapEditor.js           # Grid alignment interface (DM only)  
│   ├── MapDisplay.js          # Player map view
│   ├── GridOverlay.js         # SVG grid rendering
│   ├── GridControls.js        # Color pickers, toggles (DM only)
│   └── MapViewControls.js     # Zoom/pan controls (all players)
├── hooks/
│   ├── useMapState.js         # Map state management
│   ├── useGridEditor.js       # Grid manipulation logic
│   ├── useMapUpload.js        # File upload handling
│   └── webSocketMapEvents.js  # Map WebSocket event handlers
└── index.js                   # Exports all map functionality
```

#### Key Component Responsibilities

**MapManager.js**
- Coordinates between all map components
- Manages WebSocket events for map updates
- Handles mode switching (edit vs. display)
- Integrates with existing DMControlCenter

**MapEditor.js** (DM only)
- Interactive grid manipulation (drag, zoom)
- Real-time visual feedback
- Zoom normalization on save
- Color picker integration

**GridOverlay.js**
- SVG-based grid rendering
- Coordinate labeling (A1, B2, C3...)
- Responsive to zoom/pan changes
- Dual color modes (edit vs. display)

**MapDisplay.js** (All players)
- Map image rendering
- Personal zoom/pan controls
- Grid toggle options
- Responsive design

### WebSocket Events

#### Atomic Event Design
Following the audio batch pattern, map events are atomic and comprehensive:

```javascript
// Single atomic event for all map state changes
{
  event_type: "map_state_change",
  data: {
    operation: "activate" | "deactivate" | "grid_update",
    map_id: "uuid" | null,           // null when deactivating
    map_data: {                      // only when activating/updating
      filename: "dungeon.jpg",
      dimensions: { width: 1200, height: 800 },
      grid_config: {
        cell_size: 40,
        offset_x: -12,
        offset_y: 8,
        enabled: true,
        colors: {
          edit_mode: { line_color: "#ff0000", opacity: 0.8, line_width: 2 },
          display_mode: { line_color: "#ffffff", opacity: 0.3, line_width: 1 }
        }
      }
    },
    triggered_by: "dm_name",
    timestamp: "2025-01-15T10:30:00Z"
  }
}
```

#### Operation Types
- **`activate`**: Sets new active map with complete config
- **`deactivate`**: Removes active map (map_id = null, no map_data)  
- **`grid_update`**: Updates grid config for active map

#### WebSocket Integration
- Extend existing ConnectionManager in `api/app.py`
- Add map event handlers to `websocket_events.py`
- Update frontend `useWebSocket.js` hook for map events
- Ensure atomic event publishing for consistency

## User Experience Flows

### DM Workflow: Upload & Configure Map
1. **Upload**: Click "Upload Map" → Select image file → Auto-upload
2. **Configure**: Map appears in edit mode with bright grid overlay
3. **Align**: Drag grid to align with map features
4. **Scale**: Mouse wheel to resize grid cells until they fit
5. **Style**: Adjust edit/display colors via color pickers
6. **Save**: Click "Save Grid" → Grid normalizes and switches to display mode
7. **Activate**: Map broadcasts to all players automatically

### DM Workflow: Manage Multiple Maps
1. **View Maps**: Expandable list shows uploaded maps with thumbnails
2. **Switch Maps**: Click different map → Loads with saved grid config
3. **Edit Existing**: Click "Edit Grid" → Re-enters edit mode
4. **Delete**: Remove maps no longer needed

### Player Experience
1. **View Map**: See active map with subtle grid overlay
2. **Navigate**: Personal zoom/pan without affecting others
3. **Reference**: Use grid coordinates in chat ("Moving to D7")
4. **Customize**: Toggle grid visibility, label size per preference

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Backend API endpoints for file upload
- [ ] MongoDB schema updates
- [ ] Basic file storage system
- [ ] WebSocket event framework

### Phase 2: DM Upload & Basic Display  
- [ ] MapUpload component integration
- [ ] File upload UI in DMControlCenter
- [ ] Basic MapDisplay component
- [ ] Simple map activation system

### Phase 3: Grid System
- [ ] GridOverlay SVG component
- [ ] Grid coordinate labeling (A1, B2, etc.)
- [ ] Basic grid display functionality
- [ ] Static grid configuration

### Phase 4: Interactive Grid Editor
- [ ] Drag and drop grid positioning
- [ ] Mouse wheel grid scaling
- [ ] Real-time visual feedback
- [ ] Edit vs. display modes

### Phase 5: Advanced Features
- [ ] Color picker integration
- [ ] Zoom normalization system
- [ ] Player view controls
- [ ] Map management (multiple maps, thumbnails)

### Phase 6: Polish & Optimization
- [ ] Performance optimization for large maps
- [ ] Mobile responsiveness
- [ ] Accessibility features
- [ ] Error handling and edge cases

## Technical Considerations

### Performance
- **Image Optimization**: Auto-generate thumbnails for map selection
- **Lazy Loading**: Load map images only when activated
- **SVG Rendering**: Use SVG for grid to maintain crispness at all zoom levels
- **Event Throttling**: Limit grid update frequency during drag operations

### File Management
- **File Validation**: Accept only image formats (jpg, png, gif, webp)
- **Size Limits**: Reasonable file size limits (5MB max recommended)
- **Cleanup**: Remove orphaned files when maps are deleted
- **Security**: Validate file types, sanitize filenames

### Browser Compatibility
- **File API**: Modern file upload with drag-and-drop support
- **SVG Support**: Grid overlay requires SVG capabilities
- **WebSocket Events**: Ensure consistent event handling across browsers

### Mobile Considerations
- **Touch Events**: Support touch-based drag and pinch-zoom
- **Responsive Design**: Grid controls adapt to smaller screens  
- **Performance**: Optimize for mobile rendering performance

## Integration Points

### Existing Codebase Integration
- **DMControlCenter**: Extend existing "Map Controls" section
- **Styling**: Use DM styling constants (`DM_HEADER`, `DM_CHILD`, etc.)
- **WebSocket**: Extend existing event system
- **GameService**: Follow established static method patterns
- **Error Handling**: Consistent with existing error patterns

### Future Enhancements
- **Player Tokens**: Drag-and-drop player representations on map
- **Fog of War**: Hide/reveal map sections dynamically
- **Drawing Tools**: Allow DM to annotate maps in real-time
- **Initiative Integration**: Show turn order on map
- **Measurement Tools**: Distance calculation between grid points

## Success Criteria
1. **DM can upload and configure maps** with intuitive visual controls
2. **Grid alignment is precise** and maintains consistency across zoom levels
3. **All players see synchronized maps** with personal viewing flexibility
4. **Performance is smooth** even with large map images
5. **Integration is seamless** with existing game interface
6. **Code follows project patterns** and maintains architecture consistency

---

This plan provides a comprehensive roadmap for implementing the map system over multiple development sessions while maintaining the existing codebase architecture and user experience standards.