#create plugin directory for all users
sudo mkdir -p /usr/local/lib/docker/cli-plugins
#download current version of docker compose plugin
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/libexec/docker/cli-plugins/docker-compose
#make plugin executable
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
# restart docker service
sudo systemctl restart docker
#verify docker compose works
docker compose version