// Switch to admin database for user creation
db = db.getSiblingDB('admin');

// Create root user (using hardcoded values or process.env)
db.createUser({
    user: "admin",  // Your actual username
    pwd: "admin",     // Your actual password  
    roles: [
        {
            role: "root",
            db: "admin"
        }
    ]
});

// Switch to your application database
db = db.getSiblingDB('rollplay');

// Create application user with access to rollplay database
db.createUser({
    user: "admin",
    pwd: "admin", 
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
    player_name: "Matt"
});
var testRoomId = test_room.insertedId;


db.adventure_logs.insertMany([
    {   
        room_id: testRoomId.toString(), 
        message: "this is a test message from the system",
        type: "system",
        timestamp: ISODate("2025-01-09T10:30:00Z"),
        player_name: null,  // Changed from "null" string to actual null
        log_id: 1
    },
    {   
        room_id: testRoomId.toString(), 
        message: "this is a pre-loaded message",
        type: "user",
        timestamp: ISODate("2025-01-09T10:32:00Z"),
        player_name: "matt",
        log_id: 2
    },
    {   
        room_id: testRoomId.toString(), 
        message: "D20 + 1: 6",
        type: "dice",
        timestamp: ISODate("2025-01-09T10:33:00Z"),
        player_name: "matt",
        log_id: 3
    }
]);

print("Database initialization completed successfully!");