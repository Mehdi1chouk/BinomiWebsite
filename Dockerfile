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

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3003}/health || exit 1

CMD ["node", "server.js"]
