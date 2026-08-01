#! /bin/bash

### force certbot to renew
# On your production server - remove the existing directory and let certbot create a fresh one
echo "clearing existing certs..."
docker exec certbot-renewer rm -rf /etc/letsencrypt/live/tabletop-tavern.uk
docker exec certbot-renewer rm -rf /etc/letsencrypt/archive/tabletop-tavern.uk
docker exec certbot-renewer rm -f /etc/letsencrypt/renewal/tabletop-tavern.uk.conf


# Now run certbot again - it should successfully save the certificate
echo "running certbot..."
docker exec certbot-renewer certbot certonly --webroot \
-w /var/www/certbot \
-d tabletop-tavern.uk \
-d www.tabletop-tavern.uk \
--email matt@jackalmedia.co.uk \
--agree-tos --non-interactive

# Delay for the above step
sleep 5
# Reload nginx to use the new certificate
echo "reloading nginx container..."
docker exec nginx nginx -s reload

echo "end of script."