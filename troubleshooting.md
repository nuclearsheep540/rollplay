### troubleshooting
###
Deployment

- ssh to EC2
- spin down containers
- pull new images
- update env with new versions

# GitHub
echo <GH_PAT> | docker login ghcr.io -u nuclearsheep540 --password-stdin

# Self Cert Dev
```
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout selfsigned.key \
  -out selfsigned.crt

```
# Build Images
first log in as above
* docker compose build
* docker compose push

# AWS
matt+tabletoptavern@jackalmedia.co.uk

# EC2 Fresh Instance
Locate your private key file. The key used to launch this instance is ec2-key.pem

Run this command, if necessary, to ensure your key is not publicly viewable.
 chmod 400 "ec2-key.pem"

Connect to your instance using its Public DNS:
 ec2-18-200-239-2.eu-west-1.compute.amazonaws.com

Example:
cd into .ssh

ssh -i "new-ec2-key.pem" ubuntu@ec2-108-129-134-117.eu-west-1.compute.amazonaws.com 

 ubuntu@ec2-34.243.218.196.eu-west-1.compute.amazonaws.com

 ### Once in

mkdir app
cd app
git init
sudo apt update
sudo apt install gh

### creating the auth key 

ssh-keygen -t ed25519 -C "matt@jackalmedia.co.uk"

eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub

Then take the cat output and add it as a key in:
https://github.com/settings/keys


vim ~/.ssh/config
Host github.com
        User git
        Hostname github.com
        PreferredAuthentications publickey
        IdentityFile /home/ubuntu/.ssh/id_ed25519.pub


### logging in to github and cloning

sudo snap install docker

echo $PAT_SECRET | docker login ghcr.io -u nuclearsheep540 --password-stdin

git clone git@github.com:nuclearsheep540/rollplay.git

sudo groupadd docker
sudo usermod -aG docker $USER


### force certbot to renew
# On your production server - remove the existing directory and let certbot create a fresh one
docker exec certbot-renewer rm -rf /etc/letsencrypt/live/tabletop-tavern.uk
docker exec certbot-renewer rm -rf /etc/letsencrypt/archive/tabletop-tavern.uk
docker exec certbot-renewer rm -f /etc/letsencrypt/renewal/tabletop-tavern.uk.conf

# Now run certbot again - it should successfully save the certificate
docker exec certbot-renewer certbot certonly --webroot \
  -w /var/www/certbot \
  -d tabletop-tavern.uk \
  -d www.tabletop-tavern.uk \
  --email matt@jackalmedia.co.uk \
  --agree-tos --non-interactive

# Reload nginx to use the new certificate
docker exec nginx nginx -s reload




create room doesn't await the roomID

roll dice can be clicked always

hanging active prompts even though all players rolled (broadcast message isnt working server side, 
only local state is updating)

dice action modal needs to remove the blur

attack roll will never need anything other than a D20
	keep the modal
	remove the other dice options including 2nd
	keep adv/disc
	keep bonuses


damage roll mulit dice will only ever be the same dice

add bonus, can we write sums into it instead

we need a DM seat


need an NPC system for DM to prep mobs and players to summon

feature request: weighted dice?
feature request: DM to grant favour/disfavour

campagin / area / location (map / image)