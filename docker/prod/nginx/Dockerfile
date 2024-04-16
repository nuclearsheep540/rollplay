FROM nginx:1.23.3-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY cert.key  /etc/nginx/ssl/cert.key
COPY key.pem  /etc/nginx/ssl/key.pem

RUN mkdir -p /etc/keys/
RUN echo "rollplay" > /etc/keys/global.pass

EXPOSE 80
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]