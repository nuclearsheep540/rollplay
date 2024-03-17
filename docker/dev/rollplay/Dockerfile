FROM node:18

WORKDIR /rollplay
COPY . .
COPY package*.json ./

RUN npm install
EXPOSE 3000
CMD npm run dev