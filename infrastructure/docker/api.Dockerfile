FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fog-of-lore/api... build

FROM node:24-alpine AS runner

ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY --from=builder /app /app

USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@fog-of-lore/api", "start"]
