# Single image for both the API server and the BullMQ worker — same code,
# different entrypoint (see docker-compose.yml `command:` overrides).
# Runs via tsx (no separate compile step), matching the verified dev setup.
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install workspace deps. Copy only manifests first for layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN npm install --workspace @tele/shared --workspace @tele/api --include-workspace-root

# Copy source
COPY packages/shared packages/shared
COPY packages/api packages/api

# Build shared (imported as compiled dist by api) + generate the Prisma client
RUN npm run build --workspace @tele/shared \
  && npm run prisma:generate --workspace @tele/api

EXPOSE 4000

# Default command runs the API server; the worker service overrides this.
CMD ["npm", "run", "dev", "--workspace", "@tele/api"]
