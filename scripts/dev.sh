#!/bin/bash
set -e

echo "🚀 Starting development environment..."

# Check prerequisites
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required. Install: corepack enable && corepack prepare pnpm@9 --activate"; exit 1; }
command -v go >/dev/null 2>&1 || { echo "Go is required: https://go.dev/dl/"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build the shell for the reverse proxy to serve
echo "🏗️  Building shell..."
cd shell && pnpm build && cd ..

# Build backend
echo "🏗️  Building backend..."
cd backend && go build -o bin/api ./cmd/api && cd ..

# Start services with Docker Compose
echo "🐳 Starting services..."
docker compose -f deploy/docker-compose.dev.yml up --build -d

echo ""
echo "✅ Development environment is running!"
echo "   Platform: http://localhost:8080"
echo "   API:      http://localhost:8081/api"
echo ""
echo "   To stop: docker compose -f deploy/docker-compose.dev.yml down"
echo "   To see logs: docker compose -f deploy/docker-compose.dev.yml logs -f"
