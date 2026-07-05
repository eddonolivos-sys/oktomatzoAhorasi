# Hito 2 — Acceso invitado: reporte de cierre

Fecha: 2026-07-05 · Rama: `ramatzo`

## Criterios de aceptación (master plan, Hito 2)

- [x] **E2E: click en el botón guest → entra al espacio sin credenciales.** Verificado en el navegador real contra `localhost:8080` (build de producción, tras redeploy de `backend`+`shell`): clic en "Quién te crees que eres para pedirme el login?" → entra directo al espacio 3D, `localStorage` contiene `{role:'guest', name:'Invitado', email:''}`, sin errores de consola.
- [x] **Usuario registrado sigue funcionando idéntico.** El guest es aditivo (nueva ruta pública + rol nuevo); no se tocó el flujo de `login`/`register` existente. Ya verificado además en el cierre del Hito 1 (cuenta real, login + F5 sin re-pedir credenciales).
- [x] **Guest NO puede mutar `/api/apps`.** Verificado con curl contra el backend real: `GET /api/apps` con token guest → `200`; `POST /api/apps` con token guest → `403 {"error":"guest access not allowed"}`. Tests Go (`TestRequireNonGuest_*`, 3 tests) cubren el middleware en aislamiento.
- [x] **Tests Go de `GuestLogin`/`ValidateToken`-shortcircuit.** 4 tests en `auth_service_test.go`, incluido uno que verifica explícitamente `findByIDCalls == 0` en el camino de guest (100% stateless, sin tocar el repositorio de usuarios).
- [x] **TTL del token guest parametrizado y más corto que 72h.** `guestTokenExpiryHours := 24` en `main.go`; test `TestGuestLogin_TokenExpiryShorterThanRegular` verifica que el TTL real decodificado del JWT está entre 23h y 25h.

## Verificado

- Backend: `go build ./...`, `go vet ./...`, `go test ./...` → **7 tests nuevos en verde** (4 en `internal/service`, 3 en `internal/handler`); no había ningún test Go en el repo antes de este hito.
- Shell: `pnpm --filter @plataforma/shell test` → **234/234 tests** (232 del Hito 1 + 2 nuevos de `loginAsGuest`); `lint` (tsc --noEmit) sin errores; `build` OK.
- Runtime real en `http://localhost:8080` (redeploy vía `deploy/ejec-servicio.bat backend shell`, NO `docker-compose.dev.yml`): hash del shell cambió a `index-BK9YdJ6V.js`; flujo guest verificado en el navegador (snapshot de accesibilidad + `localStorage`), gate de mutación verificado con `curl` directo contra el backend.

## Implementación (verificada contra el código, sin cambio de schema)

- `backend/internal/domain/user.go`: `RoleGuest Role = "guest"`.
- `backend/internal/service/helpers.go`: `generateToken`/`generateGuestToken` como wrappers de `generateTokenWithExpiry(user, expiry)` (antes solo había un TTL fijo por servicio).
- `backend/internal/service/auth_service.go`: `AuthService.guestTokenExpiry` nuevo campo; `NewAuthService` con un parámetro más; `GuestLogin(ctx)` construye un usuario efímero `guest-<uuid>` sin tocar `userRepo`; `ValidateToken` corta-circuita para `claims.Role == RoleGuest` devolviendo el usuario efímero sin `FindByID`.
- `backend/internal/handler/auth_handler.go` + `middleware.go`: `GuestLogin` handler; `RequireNonGuest` (403 si no hay usuario o es guest).
- `backend/cmd/api/main.go`: ruta pública `POST /api/auth/guest`; `RequireNonGuest` añadido a `POST/PUT/DELETE /api/apps(/{id})` (las `GET` siguen abiertas a guest).
- `shell/src/services/auth-client.ts`: `User.role` amplía a `'admin'|'user'|'guest'`; `loginAsGuest()` sigue el mismo patrón que `login`/`register`.
- `shell/src/components/shell-login.ts`: botón con el label EXACTO pedido, microcopy "Continuar como invitado" debajo, estilo terciario (transparente, sin competir con el botón primario).

## Desviación menor encontrada durante TDD (no bloquea)

El subagente de shell encontró que `login`/`register`/`loginAsGuest` llaman `startRefresh()` (usa `window.setInterval`), y ningún test previo del Hito 1 ejercitaba ese camino con éxito bajo `environment:'node'` (donde `window` no existe por defecto) — el gap era preexistente, no introducido por este hito. Se corrigió extendiendo el mismo patrón `vi.hoisted`+`vi.stubGlobal` ya usado para `localStorage`/`sessionStorage`/`fetch`, añadiendo `window` a la lista.

## Bloqueos

Ninguno.
