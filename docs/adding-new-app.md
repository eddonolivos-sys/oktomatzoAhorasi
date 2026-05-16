# Guía para añadir una nueva sub-app

## 1. Crear la aplicación

Crea un nuevo directorio en `apps/`:

```bash
mkdir -p apps/mi-app/src apps/mi-app/public
```

Crea los archivos base:
- `package.json` — con `@plataforma/shell-protocol` como dependencia
- `vite.config.ts` — configurar `base: '/apps/mi-app/'` y puerto de desarrollo
- `index.html`
- `Dockerfile`
- `tsconfig.json`

## 2. Integrar el protocolo de comunicación

```typescript
import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('mi-app');

client.onToken = (token, user) => {
  // Autenticación recibida
};

client.onTheme = (mode) => {
  // Aplicar tema
};

// Reportar altura dinámica (necesario para iframe)
function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);
```

## 3. Configurar ruta en Caddy

Edita `proxy/Caddyfile` y añade:

```
handle_path /apps/mi-app/* {
    reverse_proxy mi-app:80
}
```

## 4. Añadir al app-registry

Edita `shell/public/app-registry.yaml` o usa la API:

```bash
curl -X POST http://localhost:8081/api/apps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Mi App",
    "route": "/mi-app",
    "src": "/apps/mi-app/",
    "icon": "home",
    "category": "General",
    "version": "1.0.0"
  }'
```

## 5. Añadir al Docker Compose

Edita `deploy/docker-compose.yml` o `deploy/docker-compose.dev.yml`:

```yaml
mi-app:
  build:
    context: ../apps/mi-app
    dockerfile: Dockerfile
  restart: unless-stopped
```

## 6. Script de dev

La app debe correr con `pnpm dev` en su propio puerto. El proxy Caddy la enrutará correctamente.

## Checklist de integración

- [ ] `ShellClient` creado con ID único
- [ ] `client.onToken` implementado
- [ ] `client.reportHeight()` reportando dimensión
- [ ] Tema oscuro/claro soportado
- [ ] `base` en vite.config.ts correcto
- [ ] Ruta en Caddyfile añadida
- [ ] App registrada en app-registry.yaml o API
- [ ] Dockerfile creado
- [ ] Servicio añadido a docker-compose
