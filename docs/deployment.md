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

# 5. Construir y desplegar
docker compose -f deploy/docker-compose.yml up --build -d
```

---

## Opción 3: Cloudflare Tunnel (gratuito, desde casa)

```bash
# 1. Instalar cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

# 2. Autenticar
cloudflared tunnel login

# 3. Crear túnel
cloudflared tunnel create plataforma

# 4. Configurar DNS
cloudflared tunnel route dns plataforma plataforma.tudominio.com

# 5. Iniciar la plataforma y el túnel
docker compose -f deploy/docker-compose.dev.yml up --build -d
cloudflared tunnel run plataforma
```

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
| Caddy (entrada) | 8080 | Punto de acceso principal |
| Backend API | 8081 | Acceso directo para debug |
| Dashboard | 8082 | App A (React) |
| Visor 3D | 8083 | App B (Three.js) |
| Test Uno | 8084 | App de prueba 1 |
| Test Dos | 8085 | App de prueba 2 |
| Shell | 8086 | Interfaz orquestadora |

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
