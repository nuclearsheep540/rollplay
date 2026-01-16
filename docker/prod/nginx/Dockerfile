FROM nginx:1.28.0

# Install required packages: Python3, pip, flask, waitress (prod WSGI), and openssl for self-signed cert generation.
RUN apt-get update && apt-get install -y python3 python3-pip openssl && \
    pip3 install --break-system-packages flask waitress

# Copy your production NGINX configuration.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the reload server script into the container.
COPY reload_server.py /reload_server.py

# Copy the entrypoint script and ensure it's executable.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose HTTP, HTTPS, and reload endpoint ports.
EXPOSE 80 443 81

CMD ["/entrypoint.sh"]