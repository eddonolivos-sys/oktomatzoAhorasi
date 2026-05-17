# Guía del Sistema — Plataforma Orquestadora

## Comandos de limpieza

### Limpiar todo (contenedores + volúmenes + imágenes)

```bash
# Detener y eliminar contenedores, redes y volúmenes (¡borra la BD!)
docker compose -f deploy/docker-compose.dev.yml down -v

# Eliminar también imágenes no usadas
docker image prune -a -f

# Eliminar volúmenes huérfanos
docker volume prune -f

# Desde cero: limpieza total del proyecto
docker compose -f deploy/docker-compose.dev.yml down -v --rmi all
docker system prune -a -f --volumes
```

### Limpiar solo contenedores (mantiene volúmenes)

```bash
docker compose -f deploy/docker-compose.dev.yml down
```

### Limpiar solo volúmenes (mantiene imágenes)

```bash
docker compose -f deploy/docker-compose.dev.yml down -v
```

### Reconstruir desde cero (después de limpieza)

```bash
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up --build -d
```

---

## Apps integradas

| App | ID | Ruta | Puerto | Tecnología |
|-----|----|------|--------|------------|
| Dashboard Comercial | `dashboard` | `/apps/dashboard/` | 8082 | React + Recharts |
| Visor 3D | `viewer-3d` | `/apps/viewer-3d/` | 8083 | Three.js |
| Mundo 3D | `mundo-3d` | `/apps/mundo-3d/` | 8087 | CesiumJS |
| Combate 3D | `combate-3d` | `/apps/combate-3d/` | 8088 | Three.js (juego) |
| TattooAR | `oktomatzo2` | `/apps/oktomatzo2/` | 8090 | Next.js + Three.js |
| Búsqueda | `busqueda` | `/docs/search.html` | — | HTML + JS |
| Test Uno | `test-uno` | `/apps/test-uno/` | 8084 | Vanilla JS |
| Test Dos | `test-dos` | `/apps/test-dos/` | 8085 | Vanilla JS |

---

## Búsqueda inteligente

La página de búsqueda (`/docs/search.html`) indexa toda la documentación del
proyecto usando un motor TF-IDF que permite encontrar información por
relevancia, similar a cómo funcionan los embeddings de búsqueda semántica.

**Características:**
- Tokenización y frecuencia de términos (TF-IDF)
- Bonus por coincidencia exacta
- Fragmentos con contexto alrededor del término buscado
- Enlaces de resultado con doble destino:
  - 🌐 **Ver en web** — abre el archivo en el navegador
  - 📂 **Abrir en Explorer** — abre la ubicación exacta en el explorador de Windows
- Rankings ordenados por relevancia

---

## Exposición a internet (Cloudflare Tunnel)

```bash
# Túnel efímero (nueva URL cada vez)
docker compose -f deploy/docker-compose.dev.yml -f deploy/docker-compose.internet.yml up --build -d

# Obtener URL
docker logs deploy-cloudflared-1 2>&1 | grep -oP 'https?://[a-z0-9.-]+\.trycloudflare\.com'

# Túnel permanente (con dominio propio)
# Ver docs/deployment.md para instrucciones detalladas
```
