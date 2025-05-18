#!/bin/bash
# Define the certificate directory and file paths
CERT_DIR="/etc/letsencrypt/live/tabletop-tavern.uk"
FULLCHAIN="$CERT_DIR/fullchain.pem"
PRIVKEY="$CERT_DIR/privkey.pem"

# Check if the certificate files exist; if not, generate a temporary self-signed certificate.
if [ ! -f "$FULLCHAIN" ] || [ ! -f "$PRIVKEY" ]; then
    echo "Certificate not found at $CERT_DIR. Generating a temporary self-signed certificate..."
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$PRIVKEY" \
        -out "$FULLCHAIN" \
        -subj "/CN=tabletop-tavern.uk"
fi

# Start the reload server in the background.
python3 /reload_server.py &

# Start NGINX in the foreground.
nginx -g "daemon off;"
