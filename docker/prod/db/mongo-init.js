// Switch to admin database for user creation
db = db.getSiblingDB('admin');

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

db = db.getSiblingDB('rollplay');

db.createUser({
    user: "${MONGO_INITDB_ROOT_USERNAME}",
    pwd: "${MONGO_INITDB_ROOT_PASSWORD}",
    roles: [
        {
            role: "readWrite",
            db: "rollplay"
        }
    ]
});

// Create collections
db.createCollection("active_sessions");
db.createCollection("adventure_logs");


// Insert test data
var test_room = db.active_sessions.insertOne({
    _id: "test_room",   
    max_players: 8, 
    seat_layout: ["Matt", "empty", "empty", "empty", "empty", "empty", "empty", "empty"],
    created_at: ISODate("2025-06-08T12:00:00Z"),
    player_name: "Matt",
    seat_colors: {
        "0": "#3b82f6",  // blue
        "1": "#ef4444",  // red
        "2": "#22c55e",  // green
        "3": "#f97316",  // orange
        "4": "#a855f7",  // purple
        "5": "#06b6d4",  // cyan
        "6": "#ec4899",  // pink
        "7": "#65a30d"   // lime
    }
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

print("Database initialization completed successfully!");