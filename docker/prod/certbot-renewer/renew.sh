#!/bin/bash
DOMAIN="tabletop-tavern.uk"
WWW_DOMAIN="www.tabletop-tavern.uk"
WEBROOT="/var/www/certbot"
EMAIL="matt@jackalmedia.co.uk"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

# If the certificate does not exist, or if it appears to be self-signed (issuer equals subject), then obtain a proper certificate.
if [ ! -f "$CERT_PATH" ]; then
    echo "Certificate not found. Generating certificate using webroot..."
    certbot certonly --non-interactive --agree-tos --email "${EMAIL}" \
      --webroot -w "${WEBROOT}" -d "${DOMAIN}" -d "${WWW_DOMAIN}"
else
    # Use openssl to check if the certificate is self-signed.
    if openssl x509 -in "$CERT_PATH" -noout -issuer -subject | grep -q "issuer=subject"; then
        echo "Self-signed certificate detected. Forcing certificate issuance using webroot..."
        certbot certonly --non-interactive --agree-tos --email "${EMAIL}" \
          --webroot -w "${WEBROOT}" -d "${DOMAIN}" -d "${WWW_DOMAIN}" --force-renewal
    fi
fi

while true; do
  echo "Running certbot renewal..."
  certbot renew --quiet

  # Trigger NGINX reload via the dedicated reload endpoint.
  echo "Notifying NGINX to reload certificates..."
  curl -X POST http://nginx:81/reload

  # Wait for 24 hours (86400 seconds) before rechecking.
  sleep 86400
done