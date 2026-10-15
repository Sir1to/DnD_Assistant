FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fog-of-lore/api... build

FROM node:24-alpine AS runner

ARG APP_VERSION=0.1.0
ARG APP_COMMIT=development
ARG APP_BUILD_TIME
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION
ENV APP_COMMIT=$APP_COMMIT
ENV APP_BUILD_TIME=$APP_BUILD_TIME
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY --from=builder /app /app

USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@fog-of-lore/api", "start"]
