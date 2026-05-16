# Guía para añadir una nueva sub-app

## Contexto: monorepo con pnpm workspaces

Este proyecto es un **monorepo**. El `pnpm-lock.yaml`, el paquete compartido `packages/shell-protocol/`
y los archivos de configuración raíz viven en la raíz del repositorio, no en cada app.

Esto tiene una consecuencia importante para Docker: **el build context siempre debe ser la raíz del repo**.

---

## 1. Crear la estructura de la app

```bash
# Desde la raíz del repo
mkdir -p apps/mi-app/src apps/mi-app/public
```

### `apps/mi-app/package.json`
```json
{
  "name": "@plataforma/mi-app",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build"
  },
  "dependencies": {
    "@plataforma/shell-protocol": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vite": "^6.0.0"
  }
}
```

### `apps/mi-app/vite.config.ts`
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/apps/mi-app/',   // ← debe coincidir con la ruta en Caddyfile
  build: { outDir: 'dist' },
});
```

### `apps/mi-app/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

---

## 2. Integrar el protocolo de comunicación

```typescript
import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('mi-app');

// Recibir token JWT cuando el usuario está autenticado
client.onToken = (token, user) => {
  console.log('Autenticado como', user.name);
  // Usar token para llamadas a la API
};

// Reaccionar al cambio de tema
client.onTheme = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

// Reportar altura dinámica (necesario para que el iframe no tenga doble scroll)
function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);
reportHeight();

// Navegar a otra app
client.navigate('/dashboard');

// Mostrar notificación en la shell
client.notify('success', 'Operación completada');

// Limpiar al desmontar
window.addEventListener('unload', () => client.destroy());
```

---

## 3. Crear el Dockerfile

> ⚠️ El contexto de build **siempre es la raíz del repo**. El Dockerfile puede estar en el
> directorio de la app, pero el comando `docker build` se ejecuta desde la raíz.

```dockerfile
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Archivos de configuración raíz del monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# Todas las apps y paquetes compartidos
# (necesario para que pnpm resuelva correctamente el workspace)
COPY apps/ apps/
COPY packages/ packages/
# NO incluir shell/ — las apps no dependen de ella

RUN pnpm install --frozen-lockfile

RUN cd /app/apps/mi-app && node_modules/.bin/tsc -b && node_modules/.bin/vite build

FROM nginx:alpine

COPY --from=builder /app/apps/mi-app/dist /usr/share/nginx/html
COPY --from=builder /app/apps/mi-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### `apps/mi-app/nginx.conf`
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 4. Añadir al Docker Compose

Edita `deploy/docker-compose.dev.yml`:

```yaml
mi-app:
  build:
    context: ..          # ← raíz del repo, no el directorio de la app
    dockerfile: apps/mi-app/Dockerfile
  ports:
    - "8087:80"          # elige un puerto libre
```

---

## 5. Configurar la ruta en Caddy

Edita `proxy/Caddyfile.dev`:

```
handle_path /apps/mi-app/* {
    reverse_proxy mi-app:80
}
```

---

## 6. Registrar la app en la base de datos

Una vez desplegado, registra la app vía API (necesitas un token de admin):

```bash
curl -X POST http://localhost:8081/api/apps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tu-token>" \
  -d '{
    "id": "mi-app",
    "name": "Mi App",
    "description": "Descripción de la app",
    "icon": "home",
    "route": "/mi-app",
    "src": "/apps/mi-app/",
    "version": "1.0.0",
    "sandbox": "allow-scripts allow-same-origin allow-forms",
    "category": "General",
    "tags": ["mi-tecnologia"]
  }'
```

O alternativamente, edita `shell/public/app-registry.yaml` para añadirla al fallback estático.

---

## 7. Comandos para construir la app individualmente

```bash
# Desde la RAÍZ del repo — siempre desde aquí
docker build -f apps/mi-app/Dockerfile -t mi-app .

# Ejecutar el contenedor individualmente
docker run -p 8087:80 mi-app
```

---

## 8. Desarrollo sin Docker

```bash
# Instalar dependencias (desde la raíz, una sola vez)
pnpm install

# Correr la app en modo dev
pnpm --filter @plataforma/mi-app dev
# → disponible en http://localhost:5173 (o el puerto que configure Vite)
```

En modo dev, la app corre en su propio puerto sin Caddy. Para probarla integrada
con la shell, usa `docker compose up --build`.

---

## Checklist de integración

- [ ] `package.json` con nombre `@plataforma/mi-app` y dependencia `@plataforma/shell-protocol`
- [ ] `vite.config.ts` con `base: '/apps/mi-app/'` correcto
- [ ] `ShellClient` creado con ID único
- [ ] `client.onToken` implementado
- [ ] `client.reportHeight()` reportando dimensión en resize
- [ ] Tema oscuro/claro soportado via `client.onTheme`
- [ ] `Dockerfile` creado (sin `COPY shell/`)
- [ ] Servicio añadido a `docker-compose.dev.yml` con `context: ..`
- [ ] Ruta añadida en `proxy/Caddyfile.dev`
- [ ] App registrada en la DB o en `app-registry.yaml`
