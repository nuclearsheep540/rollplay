# rollplay
Table-Top management app for virtual D&D sessions.

![GitHub release (latest by date)](https://img.shields.io/github/v/release/nuclearsheep540/rollplay?include_prereleases)
![GitHub](https://img.shields.io/github/license/nuclearsheep540/rollplay)

Rollplay is a virtual table-top application for dungeons and dragons campaigns.

The goal is to enable users a way to easily create characters, campaigns and instantiate online multiplayer games to interactively track high level attributes of your campaign and characters, while also providing some fun unique story telling tools such as music/SFX, interactive maps with grid, and story telling visuals.

This repository is currently a monolith containing the multi-services required to run both the core site application as well as the main game api, application and other infra services.

Core services are:
* api-auth
  * contains global user authentication including OTP and Magic Links
* api-game
  * contains all backend logic for the game app, including websockets and state management with the mongoDB service
* api-site
  * high level site application used to create an account, campaign, character etc..
* rollplay
  * the core game application handling the frontend for both the site and game (needs to be separated in a later release)

The api-site service is structured in a Domain Driven Design (DDD) pattern, aggregating our core business services around character and campaign creation. We're using a Command Query Responsibility Segregation (CQRS) pattern to handle reading and writing data.

Currently this application is deployed to a single t2.micro instance in AWS, credits expire frequently so production downtime is expected during this early development phase of the application.

## License
This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for
details.

---

To reach the local running application just visit localhost, dont provide the port numbers as nginx will handle service discovery.

---

# Setup

Dependencies
- Node v18.20.6
- Python 3.8
- Docker


Create .env at project root
```
environment=dev

# NEXT.JS
NEXT_PUBLIC_API_URL=http://localhost

# VERSION CONTROL
app_version=0.0.0
nginx_version=0.0.0
mongo_db_version=0.0.0
certbot_version=0.0.0
api_version=0.0.0

# DATABASE
MONGO_INITDB_ROOT_USERNAME=<your creds>
MONGO_INITDB_ROOT_PASSWORD=<your creds>
MONGO_INITDB_DATABASE=rollplay

# LOGGING
logging_log_level=DEBUG
logging_email_from=""
logging_email_to=""
logging_email_subject=test

# MAIL
SMTP_SERVER=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
FROM_EMAIL=

# REDIS CONFIGURATION (for short code storage)
REDIS_URL=redis://redis:6379

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

