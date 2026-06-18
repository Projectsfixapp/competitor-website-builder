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

  COPY package.json ./
  COPY patches/ ./patches/

  # node_modules vom Builder übernehmen (enthält alle deps inkl. vite)
  COPY --from=builder /app/node_modules ./node_modules

  # Gebaute Artefakte kopieren
  COPY --from=builder /app/dist ./dist

  EXPOSE 3000

  ENV NODE_ENV=production

  CMD ["node", "dist/index.js"]

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
