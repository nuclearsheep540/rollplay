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

MONGO_INITDB_ROOT_USERNAME=mdavey
MONGO_INITDB_ROOT_PASSWORD=pass
MONGO_INITDB_DATABASE=rollplay

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
forms
https://nextjs.org/docs/pages/building-your-application/data-fetching/forms-and-mutations

for debugging
`docker-compose -f docker-compose.dev.yml up -d && docker attach api-dev`

# GitHub
echo <GH_PAT> | docker login ghcr.io -u nuclearsheep540 --password-stdin

# EC2 Fresh Instance
Locate your private key file. The key used to launch this instance is ec2-key.pem

Run this command, if necessary, to ensure your key is not publicly viewable.
 chmod 400 "ec2-key.pem"

Connect to your instance using its Public DNS:
 ec2-18-200-239-2.eu-west-1.compute.amazonaws.com

Example:

 ssh -i "ec2-key.pem" ubuntu@ec2-18-200-239-2.eu-west-1.compute.amazonaws.com

 ### Once in

mkdir app
cd app
git init
sudo apt update
sudo apt install gh
gh auth login
    > ssh
    > gnerate ssh - yes
    > passphrase
    > paste auth token

ssh-keygen -t rsa -C "matt@jackalmedia.co.uk"
/home/ubuntu/.ssh/id_git.pub
vim ~/.ssh/config
Host github.com
        User git
        Hostname github.com
        PreferredAuthentications publickey
        IdentityFile /home/ubuntu/.ssh/id_git.pub