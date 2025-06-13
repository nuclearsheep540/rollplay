#!/bin/bash
DOMAIN="tabletop-tavern.uk"
WWW_DOMAIN="www.tabletop-tavern.uk"
WEBROOT="/var/www/certbot"
EMAIL="matt@jackalmedia.co.uk"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

# Clean up any broken renewal configs before attempting certificate generation
find /etc/letsencrypt/renewal -name "*.conf" -exec grep -L "cert = " {} \; | xargs rm -f

# If the certificate does not exist, or if it appears to be self-signed (issuer equals subject), then obtain a proper certificate.
if [ ! -f "$CERT_PATH" ]; then
    echo "Certificate not found. Generating certificate using webroot..."
    if ! certbot certonly --non-interactive --agree-tos --email "${EMAIL}" \
      --webroot -w "${WEBROOT}" -d "${DOMAIN}" -d "${WWW_DOMAIN}"; then
        echo "Certificate generation failed. Cleaning up broken configs..."
        rm -f /etc/letsencrypt/renewal/${DOMAIN}.conf
    fi
else
    # Use openssl to check if the certificate is self-signed.
    if openssl x509 -in "$CERT_PATH" -noout -issuer -subject | grep -q "issuer=subject"; then
        echo "Self-signed certificate detected. Forcing certificate issuance using webroot..."
        if ! certbot certonly --non-interactive --agree-tos --email "${EMAIL}" \
          --webroot -w "${WEBROOT}" -d "${DOMAIN}" -d "${WWW_DOMAIN}" --force-renewal; then
            echo "Certificate renewal failed. Cleaning up broken configs..."
            rm -f /etc/letsencrypt/renewal/${DOMAIN}.conf
        fi
    fi
fi

while true; do
  echo "Running certbot renewal..."
  if certbot renew --quiet; then
    echo "Certificate renewal successful"
    # Trigger NGINX reload via the dedicated reload endpoint.
    echo "Notifying NGINX to reload certificates..."
    curl -X POST http://nginx:81/reload
  else
    echo "Certificate renewal failed or no renewal needed"
  fi

  # Wait for 24 hours (86400 seconds) before rechecking.
  sleep 86400
done