FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/ apps/
COPY packages/ packages/
COPY shell/ shell/

RUN pnpm install --frozen-lockfile

RUN cd /app/shell && node_modules/.bin/tsc && node_modules/.bin/vite build

FROM nginx:alpine

COPY --from=builder /app/shell/dist /usr/share/nginx/html
COPY --from=builder /app/shell/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
