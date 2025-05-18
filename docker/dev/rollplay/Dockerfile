FROM node:18

WORKDIR /rollplay

# Copy only the package files first
COPY package*.json ./

# Install all dependencies (including Next.js if it's listed in package.json)
RUN npm install

# Now copy the rest of your application code
COPY . .

EXPOSE 3000

# Use exec form array syntax for CMD
CMD ["npm", "run", "dev"]