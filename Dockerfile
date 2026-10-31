# Production Multi-Stage Dockerfile for ArewaSafe
FROM node:22-alpine AS builder

WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install SQLite runtime dependencies
RUN apk add --no-cache dumb-init

COPY --from=builder /app/node_modules ./node_modules
COPY server/ ./server/
COPY dashboard/ ./dashboard/

WORKDIR /app/server
EXPOSE 3000

USER node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]
