FROM nginx:1.28.0

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY ./ssl /etc/nginx/ssl

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]