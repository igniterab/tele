# Serves the dashboard + public KB + widget-frame via the Vite dev server.
# For a local docker-compose demo this is the simplest reliable option (the
# Vite proxy handles /api and /socket.io). A production build would instead
# `vite build` and serve the static output behind the same edge proxy that
# terminates TLS for custom domains — see docs/CUSTOM_DOMAINS.md.
FROM node:20-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/widget/package.json packages/widget/
COPY packages/web/package.json packages/web/
RUN npm install \
  --workspace @tele/shared \
  --workspace @tele/widget \
  --workspace @tele/web \
  --include-workspace-root

COPY packages/shared packages/shared
COPY packages/widget packages/widget
COPY packages/web packages/web

# Build shared (imported by web) and the embeddable widget loader
# (emits into packages/web/public/tele-widget.js).
RUN npm run build --workspace @tele/shared \
  && npm run build --workspace @tele/widget

EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@tele/web"]
