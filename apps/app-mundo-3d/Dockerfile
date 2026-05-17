FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Monorepo root config files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# All apps and shared packages (required for workspace resolution)
COPY apps/ apps/
COPY packages/ packages/

RUN pnpm install --frozen-lockfile

# Build args for env vars (injected by orchestrator, no hardcoded secrets)
ARG VITE_CESIUM_ION_TOKEN=""
ARG VITE_MAP_SERVICE_URL=""
ARG VITE_MODEL_CAR_URL=""
ARG VITE_MODEL_PLANE_URL=""
ARG VITE_MODEL_BOAT_URL=""

ENV VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN
ENV VITE_MAP_SERVICE_URL=$VITE_MAP_SERVICE_URL
ENV VITE_MODEL_CAR_URL=$VITE_MODEL_CAR_URL
ENV VITE_MODEL_PLANE_URL=$VITE_MODEL_PLANE_URL
ENV VITE_MODEL_BOAT_URL=$VITE_MODEL_BOAT_URL

RUN cd /app/apps/app-mundo-3d && node_modules/.bin/tsc -b && node_modules/.bin/vite build

FROM nginx:alpine

COPY --from=builder /app/apps/app-mundo-3d/dist /usr/share/nginx/html
COPY --from=builder /app/apps/app-mundo-3d/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
