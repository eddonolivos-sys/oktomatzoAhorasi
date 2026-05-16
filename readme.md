# Plataforma Orquestadora

Plataforma web que actúa como punto de entrada único para múltiples aplicaciones web independientes. Cada sub-app convive bajo el mismo dominio, se desarrolla con su propio stack, y comparte solo autenticación y navegación.

## Arquitectura

- **Shell SPA** (Lit + Web Components) — orquestador que provee login, navegación y contenedor de iframes
- **Sub-apps** — cada una en su propio iframe, stack independiente
- **Backend API** (Go + arquitectura hexagonal) — autenticación JWT, registro de apps, gestión de usuarios
- **Proxy** (Caddy) — reverse proxy con HTTPS automático y ruteo por subruta
- **Base de datos** SQLite — cero operación, embebida

## Estructura

```
plataforma/
├── shell/              # Orquestador SPA
├── backend/            # API Go con hexagonal architecture
├── packages/           # Librerías compartidas
│   └── shell-protocol/ # Protocolo postMessage shell ↔ apps
├── apps/               # Sub-aplicaciones
│   ├── app-a-dashboard/  # Dashboard con React + Recharts
│   └── app-b-viewer-3d/  # Visor 3D con Three.js
├── proxy/              # Configuración de Caddy
├── deploy/             # Docker Compose
└── docs/               # Documentación
```

## Inicio rápido

```bash
# Requisitos: node 20+, pnpm 9+, go 1.22+, docker

# 1. Instalar dependencias frontend
pnpm install

# 2. Generar go.sum del backend
cd backend && go mod tidy && cd ..

# 3. Construir frontends
pnpm build

# 4. Iniciar servicios
docker compose -f deploy/docker-compose.dev.yml up --build
```

Abrir http://localhost:8080 — registra un usuario y comienza.

## Stack

| Componente | Tecnología |
|-----------|------------|
| Shell | Lit + Web Components + Vite |
| Sub-apps | Cualquier stack (React, Three.js, Svelte, Vue, vanilla) |
| Backend | Go 1.22 |
| Base de datos | SQLite |
| Proxy | Caddy 2 |
| Contenedores | Docker + Docker Compose |
| Comunicación | postMessage (shell-protocol) |
| Paquete | pnpm workspaces (monorepo) |

## Documentación

- [Arquitectura](docs/architecture.md)
- [Protocolo shell ↔ apps](docs/protocol.md)
- [Añadir nueva app](docs/adding-new-app.md)
- [Despliegue](docs/deployment.md)
