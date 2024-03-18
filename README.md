# rollplay
Online Dice Rolling

Create .env at project root
```
environment=dev
app_version=0.0.1
logging_log_level=DEBUG
logging_email_from=""
logging_email_to=""
logging_email_subject=test

```
###
Create new Next.js
https://nextjs.org/learn-pages-router/basics/create-nextjs-app/setup
`npx create-next-app@13 app --use-npm`

###
Dockerising Next.js
https://medium.com/@2018.itsuki/dockerize-a-next-js-app-4b03021e084d

`docker-compose -f docker-compose.dev.yml build`
`docker-compose -f docker-compose.dev.yml up`

###
database
https://www.mongodb.com/compatibility/docker

`mongosh -u mdavey`
`use rollplay`
`db.active_sessions.find()`

### troubleshooting

for debugging
`docker-compose -f docker-compose.dev.yml up -d && docker attach api-dev`


ERROR `mount path must be absolute`
* remove the `.` absolute path, up the containers, down the containers, add the absolute path back in, up the containers.