# Despliegue

## Contexto: monorepo con pnpm workspaces

Este proyecto es un **monorepo**. Todos los Dockerfiles necesitan acceso a archivos de la raíz
(`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/`). Por eso:

- `docker compose` siempre se ejecuta desde la raíz del repo (o con la ruta al compose file)
- El `context:` en docker-compose apunta a `..` (la raíz)
- Si construyes una imagen individual, usa `-f` con la ruta al Dockerfile y `.` como contexto desde la raíz

```bash
# ✓ Correcto — imagen individual desde la raíz
docker build -f apps/app-b-viewer-3d/Dockerfile -t visor-3d .

# ✗ Incorrecto — desde el directorio de la app
cd apps/app-b-viewer-3d && docker build .   # falla: no encuentra pnpm-lock.yaml
```

---

## Requisitos

- Docker y Docker Compose
- Git
- Node.js 20+ y pnpm 9+ (solo para desarrollo local sin Docker)

---

## Opción 1: Local / Desarrollo

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/tu-usuario/plataforma.git
cd plataforma
pnpm install

# 2. Iniciar todos los servicios (construye imágenes la primera vez)
docker compose -f deploy/docker-compose.dev.yml up --build
```

Acceder en **http://localhost:8080**

La primera vez, la base de datos arranca vacía. El backend **inserta automáticamente**
los 4 proyectos de ejemplo al detectar que la tabla `apps` está vacía.

> Si borras el volumen `backend_data`, la DB se recrea y el seed vuelve a correr.

### Desarrollo sin Docker (hot-reload por app)

```bash
# Terminal 1 — backend Go
cd backend && go run ./cmd/api

# Terminal 2 — shell
pnpm --filter @plataforma/shell dev

# Terminal 3 — una app específica
pnpm --filter @plataforma/app-b-viewer-3d dev
```

### Reconstruir solo una app

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build app-dashboard
```

---

## Opción 2: VPS económico (Hetzner CX22, ~€5/mes)

```bash
# 1. Conectar por SSH
ssh user@tu-vps

# 2. Instalar Docker
curl -fsSL https://get.docker.com | sh

# 3. Clonar repositorio
git clone https://github.com/tu-usuario/plataforma.git
cd plataforma

# 4. Configurar variables de entorno
cp deploy/.env.example deploy/.env
# Editar .env con dominio y JWT_SECRET seguro:
#   JWT_SECRET=$(openssl rand -base64 32)

# 5. Construir y desplegar (compose de producción, 14 servicios)
docker compose -f deploy/docker-compose.yml up --build -d

# 5b. Si además necesitas exposición a internet vía Cloudflare Tunnel,
#     compón con el overlay dedicado (ver Opción 3 para el flujo completo):
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.internet.yml up -d --build
```

### Redespliegue selectivo tras un cambio

Para no reconstruir los 14 servicios en cada cambio, usa los scripts de
`deploy/` (Windows: `.bat`, VPS: `.sh`):

```bash
deploy/ejec-shell.sh              # solo el shell (frontend)
deploy/ejec-backend.sh            # solo el backend (Go/API)
deploy/ejec-space-server.sh       # solo el space-server (WS multijugador/salas)
deploy/ejec-servicio.sh <nombre>  # cualquier otro servicio del compose (p.ej. caddy)
deploy/ejec-todo.sh               # los 14 servicios (con pre-pull de imágenes base)
```

> Un cambio en `proxy/Caddyfile` requiere reiniciar el contenedor `caddy`
> explícitamente (`deploy/ejec-servicio.sh caddy` o `docker restart
> deploy-caddy-1`): al ser un archivo montado por bind mount, `docker
> compose up -d` no detecta el cambio de contenido por sí solo.

---

## Opción 3: Cloudflare Tunnel (gratuito, desde casa)

Requiere tener Docker en ejecución. Se usa un contenedor `cloudflared` que crea
un túnel seguro hacia tu máquina local sin necesidad de abrir puertos.

La URL del túnel aparece en los logs del contenedor `cloudflared`.

### Rápido (túnel efímero, ideal para pruebas)

```bash
# Iniciar plataforma + túnel
docker compose -f deploy/docker-compose.dev.yml -f deploy/docker-compose.internet.yml up --build -d

# Obtener la URL pública
docker logs deploy-cloudflared-1 --tail 10 2>/dev/null | grep -oP 'https?://[a-z0-9.-]+\.trycloudflare\.com'
```

### Permanente (con dominio propio y Cloudflare)

```bash
# 1. Instalar cloudflared (una sola vez)
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

# 2. Autenticar
cloudflared tunnel login

# 3. Crear túnel nombrado
cloudflared tunnel create plataforma

# 4. Configurar DNS (reemplaza tudominio.com con tu dominio real)
cloudflared tunnel route dns plataforma plataforma.tudominio.com

# 5. Iniciar la plataforma
docker compose -f deploy/docker-compose.dev.yml up --build -d

# 6. Ejecutar el túnel (en otra terminal o como servicio)
cloudflared tunnel run plataforma
```

> ⚠️ Sin el archivo `docker-compose.internet.yml`, la plataforma solo es
> accesible desde `localhost:8080`. Usa el overlay para exponerla a internet.

> ⚠️ **El túnel "Permanente" (paso 6) es un proceso/servicio systemd propio
> del VPS, DISTINTO del contenedor `cloudflared` del overlay
> `docker-compose.internet.yml`** (ese es el "Rápido", pensado para pruebas
> puntuales con URL efímera de `trycloudflare.com`). Si el túnel permanente
> se desconecta (Cloudflare 530/1033 al visitar el dominio), es un problema
> de ese servicio systemd en el VPS — revisar con `systemctl status
> cloudflared` (o el nombre del servicio que se le haya dado) y sus logs, NO
> el overlay de este repo ni el código de la plataforma (el WebSocket del
> shell ya usa `wss://` relativo al dominio actual, sin `localhost`
> hardcodeado — verificado, no es la causa si el túnel está caído).

### Verificación e2e contra el dominio público

Los checklists de flujos manuales (login/invitado/registro, entrar y salir
de un proyecto, carrera, salas multijugador — ver
`docs/superpowers/notes/2026-07-05-hito-7-reporte.md`) solo se validaron
contra `http://localhost:8080`. Antes de dar por buena una entrega expuesta
a internet, repetir al menos el flujo básico (login o invitado → entrar a
un proyecto → volver) contra el dominio público real (`https://tudominio.com`
o la URL de `trycloudflare.com`), no solo contra `localhost` — un túnel caído,
mal configurado, o un certificado TLS inválido no se detectan probando en
local.

---

## Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DOMAIN` | Dominio de producción | `plataforma.ejemplo.com` |
| `JWT_SECRET` | Secreto para firmar tokens JWT | `openssl rand -base64 32` |
| `DB_PATH` | Ruta a la base de datos SQLite | `/app/data/plataforma.db` |
| `PORT` | Puerto del backend | `8080` |

---

## Puertos en modo desarrollo

| Servicio | Puerto host | Descripción |
|----------|-------------|-------------|
| Caddy (entrada) | 8080 | Punto de acceso principal — único puerto que necesita el usuario final |
| Backend API | 8081 | Acceso directo para debug |
| Dashboard | 8082 | App A (React) |
| Visor 3D | 8083 | App B (Three.js) |
| Test Uno | 8084 | App de prueba 1 |
| Test Dos | 8085 | App de prueba 2 |
| Mundo 3D | 8087 | App CesiumJS |
| Combate 3D | 8088 | App multijugador de combate |
| Oktomatzo2 API | 8089 | Backend de TattooAR |
| Oktomatzo2 App | 8090 | Frontend de TattooAR (Next.js) |
| Game Server | 8091 | WebSocket de `app-combate-3d` (`/ws`) |
| Redis | 8092 | Presencia del espacio 3D (solo loopback, `127.0.0.1`) |
| Space Server | 8093 | WebSocket del espacio 3D (`/space-ws`, salas + `/rooms`) |

Todos los puertos salvo el 8080 (Caddy) están publicados solo en
`127.0.0.1` en el compose de producción — no son accesibles desde fuera
del host salvo a través del proxy.

### Consumo de recursos (referencia, hardware de desarrollo)

Snapshot de `docker stats --no-stream` con los 14 servicios en reposo
(sin usuarios activos), tomado el 2026-07-05 tras el Hito 7. No es un
límite ni un SLA — sirve como referencia relativa para detectar
regresiones de consumo entre despliegues:

| Servicio | CPU | Memoria |
|---|---|---|
| shell, backend, caddy, apps (dashboard/viewer-3d/mundo-3d/combate-3d/test-uno/test-dos) | ~0% en reposo | 3–33 MiB cada uno |
| game-server | ~0% en reposo | ~34 MiB |
| space-server | ~0.4% (tick de 18 Hz) | ~7 MiB |
| redis | ~0.2% | ~9 MiB |
| oktomatzo2-api / oktomatzo2-app | ~0–0.3% | 67 / 87 MiB |

El conjunto completo cabe cómodamente en un VPS de 1 GB de RAM en reposo;
el margen real depende de la carga de usuarios concurrentes en el
espacio 3D (naves remotas) y en TattooAR (procesamiento de imágenes).

---

## Tests

```bash
# Suite completa (Vitest del shell + todos los paquetes con script "test")
pnpm --recursive run test

# Solo el shell (lógica pura del espacio 3D: órbita, carrera, salas, audio...)
pnpm --filter @plataforma/shell test    # Vitest
pnpm --filter @plataforma/shell lint    # tsc --noEmit
pnpm --filter @plataforma/shell build   # tsc + vite build

# Backend (Go, autenticación/apps)
make test-backend      # equivalente a: cd backend && go test ./...

# Space server (Go, presencia/salas multijugador — miniredis, sin Redis real)
make test-space-server # equivalente a: cd services/space-server && go test ./...
```

No hay tests end-to-end automatizados: los flujos completos (login,
invitado, entrar/salir de un proyecto, carrera single-player, salas
multijugador) se verifican manualmente contra el stack real desplegado
localmente (`http://localhost:8080`) antes de cada hito — ver
`docs/superpowers/notes/` para los checklists ya ejecutados.

---

## Respaldo

```bash
# Backup manual de la base de datos
./scripts/backup.sh

# La DB es un único archivo — también puedes copiarlo directamente
docker cp deploy-backend-1:/app/data/plataforma.db ./backup-$(date +%Y%m%d).db

# Backup automático (cron diario a las 3:00 AM)
0 3 * * * /opt/plataforma/scripts/backup.sh
```

---

## Monitoreo

- **Logs en tiempo real**: `docker compose -f deploy/docker-compose.dev.yml logs -f`
- **Estado de servicios**: `docker compose -f deploy/docker-compose.dev.yml ps`
- **Uptime externo**: Uptime Robot (gratis, 5 monitores)
- **Health check**: `curl http://localhost:8081/api/apps` (requiere token)

---

## CI/CD

El pipeline de GitHub Actions (`.github/workflows/`):
1. `git push` a cualquier rama dispara CI: lint → build frontend → build backend
2. Push a `main`: build → deploy automático al servidor vía SSH
3. Secrets necesarios en GitHub: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`
