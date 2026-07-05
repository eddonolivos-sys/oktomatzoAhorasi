FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Solo manifiestos: la capa de pnpm install se cachea mientras no cambien
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY shell/package.json shell/
COPY packages/shell-protocol/package.json packages/shell-protocol/
COPY apps/app-a-dashboard/package.json apps/app-a-dashboard/
COPY apps/app-b-viewer-3d/package.json apps/app-b-viewer-3d/
COPY apps/app-combate-3d/package.json apps/app-combate-3d/
COPY apps/app-mundo-3d/package.json apps/app-mundo-3d/
COPY apps/test-dos/package.json apps/test-dos/
COPY apps/test-uno/package.json apps/test-uno/

RUN pnpm install --frozen-lockfile

# Código fuente después del install; selectivo para no arrastrar
# node_modules/dist del host (no hay .dockerignore en la raíz)
COPY packages/shell-protocol/tsconfig.json packages/shell-protocol/
COPY packages/shell-protocol/src packages/shell-protocol/src
COPY shell/tsconfig.json shell/vite.config.ts shell/index.html shell/nginx.conf shell/
COPY shell/public shell/public
COPY shell/src shell/src

RUN cd /app/shell && node_modules/.bin/tsc && node_modules/.bin/vite build

FROM nginx:alpine

COPY --from=builder /app/shell/dist /usr/share/nginx/html
COPY --from=builder /app/shell/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
