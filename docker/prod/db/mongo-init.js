db.createUser(
    {
        user: "${MONGO_INITDB_ROOT_USERNAME}",
        pwd: "${MONGO_INITDB_ROOT_PASSWORD}",
        roles: [
            {
                role: "readWrite",
                db: "rollplay"
            }
        ]
    }
);

db.createCollection("active_sessions")
db.active_sessions.insert( { room_id: 0, room_max_players: 5 } )