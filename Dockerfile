# Multi-stage production Dockerfile for Granules CMS
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and workspace package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies (including devDependencies for client build)
RUN npm ci

# Copy full source and build the client
COPY . .
RUN npm run build -w client

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install production server dependencies only
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --omit=dev -w server

# Copy server code and compiled client dist
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 4000

CMD ["node", "server/src/index.js"]
