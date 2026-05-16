.PHONY: dev build lint clean format fmt db-up db-down

# Desarrollo
dev:
	pnpm dev

# Build
build:
	pnpm build

# Linting
lint:
	pnpm lint

# Formateo
fmt format:
	pnpm format

format-check:
	pnpm format:check

# Limpieza
clean:
	pnpm clean
	rm -rf apps/*/dist apps/*/node_modules
	rm -rf shell/dist shell/node_modules
	rm -rf packages/*/dist packages/*/node_modules
	rm -rf backend/bin

# Go backend
backend-dev:
	cd backend && air --port 8080

backend-build:
	cd backend && CGO_ENABLED=0 go build -o bin/api ./cmd/api

# Docker
docker-dev:
	docker compose -f deploy/docker-compose.dev.yml up --build

docker-dev-down:
	docker compose -f deploy/docker-compose.dev.yml down

docker-prod:
	docker compose -f deploy/docker-compose.yml up --build -d

docker-prod-down:
	docker compose -f deploy/docker-compose.yml down

# Tests
test:
	pnpm --recursive run test

test-backend:
	cd backend && go test ./...
