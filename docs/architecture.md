# Arquitectura de la Plataforma Orquestadora

## Principios

1. **Aislamiento máximo**: cada sub-app vive en su propio documento (iframe). No comparten JS, CSS, DOM ni contexto WebGL.
2. **Stack-agnóstico**: cada app elige su tecnología. La shell no impone restricciones.
3. **Comunicación mínima**: solo postMessage para auth, tema y eventos explícitos.
4. **Despliegue independiente**: cada app tiene su propio contenedor y se despliega sin afectar a las demás.
5. **Simplicidad operativa**: SQLite + Docker Compose. Sin Kubernetes, sin colas de mensajes, sin orquestación compleja.

## Diagrama de arquitectura

```
                   ┌──────────────────────────────────────────────────┐
                   │                    Caddy                         │
                   │              (Reverse Proxy)                     │
                   │        :80/:443 → HTTPS + routing               │
                   └────┬──────┬──────┬──────┬──────┬────────────────┘
                        │      │      │      │      │
                   ┌────┘      │      │      │      └──────┐
                   │           │      │      │              │
            ┌──────┴─────┐    │ ┌────┴─────┐ │    ┌────────┴───────┐
            │  Shell SPA │    │ │  App A   │ │    │    App B       │
            │  (Lit/WC)  │    │ │ (React)  │ │    │  (Three.js)    │
            │  /         │    │ │ /dashboard│ │    │  /viewer-3d    │
            └──────┬─────┘    │ └──────────┘ │    └────────────────┘
                   │          │              │
                   └──────┬───┘              │
                          │                  │
                   ┌──────┴──────────────────┴──────┐
                   │          Backend API             │
                   │    (Go, arquitectura hexagonal)  │
                   │         :8080/api/*              │
                   └──────────────┬───────────────────┘
                                  │
                          ┌───────┴───────┐
                          │    SQLite      │
                          │  plataforma.db │
                          └───────────────┘
```

## Flujo de autenticación

```
Usuario          Shell             Backend API       Iframe (App)
  │                │                  │                  │
  │  Login form    │                  │                  │
  │───────────────>│                  │                  │
  │                │ POST /auth/login │                  │
  │                │─────────────────>│                  │
  │                │    { token }     │                  │
  │                │<─────────────────│                  │
  │                │                  │                  │
  │                │ Almacena token en sessionStorage    │
  │                │                  │                  │
  │                │ Navega a app     │                  │
  │                │────────────────────────────────────>│
  │                │                  │                  │
  │                │ postMessage: auth:token             │
  │                │────────────────────────────────────>│
  │                │                  │                  │
  │                │         App usa el token            │
  │                │         para llamadas API           │
  │                │<─ postMessage ─────────────────────│
  │                │   (resize, notify, navigate)        │
```

## Decisiones técnicas

### Frontend: Lit + Web Components

**Por qué**: La shell debe ser mínima (<10KB JS). Lit compila a Web Components nativos, sin runtime pesado. Cualquier framework existente (React, Vue, Svelte) puede consumir Web Components. No lock-in.

### Backend: Go + SQLite

**Por qué**: Un solo binario, despliegue trivial, rendimiento excelente en hardware mínimo. SQLite es suficiente para <50 usuarios (escribe ~1M requests/día sin problemas). Sin dependencias externas (no Redis, no PostgreSQL).

### Proxy: Caddy

**Por qué**: HTTPS automático (Let's Encrypt), configuración legible (Caddyfile), binario estático. Mucho más simple que nginx para este caso.

### Iframes

**Por qué**:
- Aislamiento total de CSS, JS y WebGL
- Cleanup automático de GPU al desmontar
- Fallos aislados por app
- Sin coordinación de builds ni versionado

**Trade-off**: UX menos fluida que micro-frontends. Mitigado con altura dinámica (postMessage resize), sin doble scroll, carga lazy.

## Estructura hexagonal del backend

```
backend/
├── cmd/api/main.go         # Wiring (inyección de dependencias)
├── internal/
│   ├── domain/             # Entidades, interfaces de repositorio
│   │   ├── user.go         # User entity + UserRepository interface
│   │   ├── app.go          # App entity + AppRepository interface
│   │   └── errors.go       # Errores de dominio
│   ├── service/            # Casos de uso (lógica de negocio pura)
│   │   ├── auth_service.go # Register, Login, ValidateToken
│   │   ├── user_service.go # CRUD de usuarios
│   │   └── app_service.go  # CRUD de aplicaciones
│   ├── handler/            # Adaptadores de entrada (HTTP)
│   │   ├── auth_handler.go
│   │   ├── user_handler.go
│   │   ├── app_handler.go
│   │   └── middleware.go
│   └── repository/         # Adaptadores de salida (persistencia)
│       ├── sqlite.go       # Conexión y migraciones
│       ├── user_repo.go    # SQLite UserRepository
│       └── app_repo.go     # SQLite AppRepository
```

Las dependencias apuntan hacia adentro:
`handler → service → domain` y `repository → domain`.
