FROM nginx:1.23.3-alpine

COPY nginx.conf /etc/nginx/nginx.conf
ADD cert.key  /etc/nginx/ssl/cert.key
ADD key.pem  /etc/nginx/ssl/key.pem

RUN mkdir -p /etc/keys/
RUN echo "rollplay" > /etc/keys/global.pass

EXPOSE 80
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]