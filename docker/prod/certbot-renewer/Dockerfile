FROM certbot/certbot:latest

# Use a lightweight shell environment (the base certbot image is usually slim)
RUN apk add --no-cache bash curl

# Copy your renewal script into the container.
# The script will run in an infinite loop, renewing every 24 hours.
COPY ./renew.sh /renew.sh
RUN chmod +x /renew.sh

ENTRYPOINT [ "/renew.sh" ]