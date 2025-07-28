# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock/pnpm-lock.yaml)
COPY package.json .
COPY yarn.lock .

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy rest of the app
COPY . .

# Build Next.js app
RUN yarn build

# Expose port 3000
EXPOSE 3000

# Start Next.js app
CMD ["yarn", "start"]
