# Multi-stage Dockerfile for mini-agent
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Copy frontend package files
COPY client/package*.json ./

# Upgrade npm to latest version
RUN npm install -g npm@11.11.1

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY client/ ./

# Build frontend
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy backend package files
COPY package*.json ./
COPY tsconfig.json ./

# Upgrade npm to latest version
RUN npm install -g npm@11.11.1
# Install backend dependencies
RUN npm ci

# Copy backend source
COPY src ./src

# Build backend
RUN npm run build

# Remove dev dependencies to keep runtime small
RUN npm prune --omit=dev

# Stage 3: Production Runtime
FROM node:20-alpine

# Ensure running as root for maximum permissions
USER root

# Install runtime and build dependencies for better-sqlite3
RUN apk add --no-cache sqlite python3 make g++

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

RUN mkdir -p ~/.claude && \
    echo '{"env":{"ANTHROPIC_AUTH_TOKEN":"d7a8f1c1ca33434ca66897e6010a556e.DYOFlZnzpTNSRQ8h","ANTHROPIC_BASE_URL":"https://open.bigmodel.cn/api/anthropic","ANTHROPIC_DEFAULT_HAIKU_MODEL":"glm-4.7","ANTHROPIC_DEFAULT_OPUS_MODEL":"glm-4.7","ANTHROPIC_DEFAULT_SONNET_MODEL":"glm-4.7","ANTHROPIC_MODEL":"glm-4.7"},"includeCoAuthoredBy":false,"language":"中文"}' > ~/.claude/settings.json

# Create app directory
WORKDIR /app

# Copy backend package files and build output
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist

# Copy frontend build output
COPY --from=frontend-builder /app/client/dist ./client/dist

# Copy env file into image
COPY .env ./.env

# Copy skills (used at runtime)
COPY skills ./skills

# Copy workspace content
COPY workspace ./workspace

# Create necessary directories with full permissions
RUN mkdir -p /app/data /app/workspace /app/workspace/output /app/workspace/conversations && \
  chmod -R 777 /app


# Expose port
EXPOSE 3410

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3410

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3410/api-docs', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/index.js"]
