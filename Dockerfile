# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.4.1

# Copy dependency manifests first (layer caching)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend + backend
RUN pnpm build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm for production deps only
RUN npm install -g pnpm@10.4.1

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
