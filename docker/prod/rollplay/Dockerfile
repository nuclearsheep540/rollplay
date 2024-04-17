FROM node:18

WORKDIR /rollplay
COPY . .
COPY package*.json ./

EXPOSE 3000

RUN npm install next
RUN npm run build
CMD npm run start