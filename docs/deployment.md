# Despliegue

## Requisitos

- Docker y Docker Compose
- Git
- Un dominio (opcional para producción)

## Opciones de despliegue

### Opción 1: Local / Desarrollo

```bash
# 1. Instalar dependencias
pnpm install

# 2. Construir frontends
pnpm build

# 3. Iniciar servicios
docker compose -f deploy/docker-compose.dev.yml up --build
```

Acceder en http://localhost:8080

### Opción 2: VPS económico (Hetzner CX22, ~5€/mes)

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
# Editar .env con dominio y JWT_SECRET

# 5. Construir y desplegar
docker compose -f deploy/docker-compose.yml up --build -d
```

### Opción 3: Cloudflare Tunnel (gratuito, desde casa)

```bash
# 1. Instalar cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

# 2. Autenticar
cloudflared tunnel login

# 3. Crear túnel
cloudflared tunnel create plataforma

# 4. Configurar DNS
cloudflared tunnel route dns plataforma plataforma.tudominio.com

# 5. Ejecutar
docker compose -f deploy/docker-compose.dev.yml up --build -d
cloudflared tunnel run plataforma
```

## Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DOMAIN` | Dominio de producción | `plataforma.ejemplo.com` |
| `JWT_SECRET` | Secreto para firmar tokens JWT | `openssl rand -base64 32` |
| `DB_PATH` | Ruta a la base de datos SQLite | `/app/data/plataforma.db` |

## Respaldo

```bash
# Backup manual
./scripts/backup.sh

# Backup automático (cron)
0 3 * * * /opt/plataforma/scripts/backup.sh
```

## Monitoreo

- **Uptime**: Uptime Robot (gratis, 5 monitores)
- **Logs**: `docker compose logs -f`
- **Health check**: `curl http://localhost:8081/api/health`

## CI/CD

El pipeline de GitHub Actions:
1. `git push` a `main` dispara CI (lint + build + test)
2. Si CI pasa y es `main`, despliega automáticamente al servidor
3. Configurar secrets en GitHub: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`
