FROM node:20-alpine

WORKDIR /app

# sharp ships prebuilt binaries but still needs libvips' runtime libs present
# on musl (alpine) to load them.
RUN apk add --no-cache vips

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Upload targets — mounted as volumes in compose so files survive container
# recreation instead of living only in this layer.
RUN mkdir -p UsersImages RoomImages

# Running as root means a code-execution bug anywhere in this app (or one of
# its dependencies) gets root inside the container for free. node:20-alpine
# already ships an unprivileged `node` user (uid 1000) — just needs to own
# the app dir and the upload folders it writes to at runtime.
RUN chown -R node:node /app
USER node

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3003}/health || exit 1

CMD ["node", "server.js"]
