FROM node:18

WORKDIR /rollplay
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD npm run dev