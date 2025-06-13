# rollplay
Table-Top management app for virtual D&D sessions.

Rollplay is not intended to replace actual gameplay mechanics nor automate gameplay for players. The tools here are to help manage the manual intervention players conduct in order to play Dungeons & Dragons in a online format.

Features intended from the app:
- Map management
- Sound/Music
- Roll management
- Tracking combat turns
- Player map position tracking

Alongside these features I've tried my best to implement the game lobby style application, allowing users to manage their own characters as well as users in the lobby and party, enabling as much agency over their experience as reasonably possible.

## License
This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for
details.

---

# Setup

Dependencies
- Node v18.20.6
- Python 3.8


Create .env at project root
```
environment=dev

# NEXT.JS
NEXT_PUBLIC_API_URL=http://localhost

# VERSION CONTROL
app_version=0.0.3
nginx_version=0.1.4
mongo_db_version=0.0.1
certbot_version=0.1.2
api_version=0.2.4

# DATABASE
MONGO_INITDB_ROOT_USERNAME=<your creds>
MONGO_INITDB_ROOT_PASSWORD=<your creds>
MONGO_INITDB_DATABASE=rollplay

# LOGGING
logging_log_level=DEBUG
logging_email_from=""
logging_email_to=""
logging_email_subject=test
```

###
Build and run your development server via Docker.

`docker-compose -f docker-compose.dev.yml build`
`docker-compose -f docker-compose.dev.yml up`


###
Mongo access

`docker exec -it dev-db bash`
`mongosh -u <MONGO_INITDB_ROOT_USERNAME>`
`use rollplay`
`db.active_sessions.find()`
`db.adventure_logs.find()`

