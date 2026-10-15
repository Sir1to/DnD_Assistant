FROM node:24-alpine AS builder

ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_APP_VERSION=0.1.0
ARG NEXT_PUBLIC_APP_COMMIT=development
ARG NEXT_PUBLIC_APP_BUILD_TIME
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_COMMIT=$NEXT_PUBLIC_APP_COMMIT
ENV NEXT_PUBLIC_APP_BUILD_TIME=$NEXT_PUBLIC_APP_BUILD_TIME

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fog-of-lore/web... build

FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
