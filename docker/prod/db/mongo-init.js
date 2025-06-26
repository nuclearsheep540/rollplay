// Switch to admin database for user creation
db = db.getSiblingDB('admin');

// Try to create admin user, ignore if already exists
try {
    db.createUser({
        user: "${MONGO_INITDB_ROOT_USERNAME}",
        pwd: "${MONGO_INITDB_ROOT_PASSWORD}",
        roles: [
            {
                role: "root",
                db: "admin"
            }
        ]
    });
    print("Created admin user");
} catch (error) {
    print("Admin user already exists: " + error.message);
}

db = db.getSiblingDB('rollplay');

// Try to create rollplay user, ignore if already exists
try {
    db.createUser({
        user: "${MONGO_INITDB_ROOT_USERNAME}",
        pwd: "${MONGO_INITDB_ROOT_PASSWORD}",
        roles: [
            {
                role: "readWrite",
                db: "rollplay"
            }]
    });
    print("Created rollplay user");
} catch (error) {
    print("Rollplay user already exists: " + error.message);
}

// Create collections (createCollection is idempotent)
db.createCollection("active_sessions");
print("Created active_sessions collection");

db.createCollection("adventure_logs");
print("Created adventure_logs collection");

db.createCollection("active_maps");
print("Created active_maps collection");

// Insert test data
var test_room = db.active_sessions.insertOne({
    _id: "test_room",   
    max_players: 8, 
    seat_layout: ["matt", "empty", "empty", "empty", "empty", "empty", "empty", "empty"],
    created_at: ISODate("2025-06-08T12:00:00Z"),
    room_host: "matt",  // Updated field name
    seat_colors: {
        "0": "#3b82f6",  // blue
        "1": "#ef4444",  // red
        "2": "#22c55e",  // green
        "3": "#f97316",  // orange
        "4": "#a855f7",  // purple
        "5": "#06b6d4",  // cyan
        "6": "#ec4899",  // pink
        "7": "#65a30d"   // lime
    },
    moderators: [],        // New field: array of moderator names
    dungeon_master: ""     // New field: current DM name
});
var testRoomId = test_room.insertedId;


db.adventure_logs.insertMany([
    {   
        room_id: testRoomId.toString(), 
        message: "this is a test message from the system",
        type: "system",
        timestamp: ISODate("2025-01-09T10:30:00Z"),
        player_name: null,
        log_id: 1736420200000000
    },
    {   
        room_id: testRoomId.toString(), 
        message: "this is a pre-loaded message",
        type: "chat",
        timestamp: ISODate("2025-01-09T10:32:00Z"),
        player_name: "matt",
        log_id: 1736420320000000
    },
    {   
        room_id: testRoomId.toString(), 
        message: "D20 + 1: 6",
        type: "player-roll",
        timestamp: ISODate("2025-01-09T10:33:00Z"),
        player_name: "matt",
        log_id: 1736420380000000
    }
]);

// Insert test map data
db.active_maps.insertOne({
    room_id: testRoomId.toString(),
    map_id: "test-map-1",
    filename: "map-bg-no-grid.jpg",
    original_filename: "Test Battle Map",
    file_path: "/map-bg-no-grid.jpg",
    upload_date: ISODate("2025-01-09T10:00:00Z"),
    grid_config: {
        grid_width: 8,
        grid_height: 12,
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
    },
    map_image_config: null,
    uploaded_by: "matt",
    active: true
});
print("Inserted test map data");

// Create indexes for optimal query performance
db.active_maps.createIndex({ "room_id": 1 });
db.active_maps.createIndex({ "room_id": 1, "active": 1 });
print("Created indexes for active_maps collection");

print("Database initialization completed successfully!");