# Master Plan de Ejecución — Ramatzo (Constellation OS)

> **Para agentes constructores:** SUB-SKILL REQUERIDA: usar `superpowers:executing-plans` o `superpowers:subagent-driven-development`. Este es el plan MAESTRO por hitos; los hitos marcados `[SPEC PROPIO]` exigen su propio ciclo brainstorm→spec→plan detallado ANTES de tocar código. Los pasos usan checkboxes para seguimiento.

**Objetivo:** estabilizar el núcleo del espacio 3D, añadir acceso invitado, sistema de audio global, identidad visual de planetas, pista de carreras espacial y salas multijugador con host — sin degradar latencia ni romper contratos existentes.

**Arquitectura:** monorepo pnpm. Shell Lit+TS+Three.js 0.170 (`shell/`), backend Go+sqlite (`backend/`), presencia multijugador Go+Redis (`services/space-server/`), proxy Caddy (`proxy/`), Docker Compose (`deploy/`). Apps embebidas por iframe (`apps/` — INTOCABLE, igual que el app-registry y el contrato postMessage).

**Stack:** TypeScript, Lit, Three.js, Vitest (lógica pura, sin Three), Go 1.22 (stdlib + golang-jwt/v5 + gorilla/websocket + miniredis en tests), Docker Compose, Caddy.

---

## 0. Correcciones al enunciado original (verificadas contra el repo)

| Enunciado | Realidad verificada | Consecuencia en el plan |
|---|---|---|
| "Migrar el mapa 2D a 3D" | El mapa YA es 3D (Constellation OS v3: sistema solar navegable, 165 tests) | No hay migración. Hito 1 = estabilizar; Hito 4 = identidad visual |
| "Empaquetar con Docker" | YA dockerizado: 14 servicios en `deploy/docker-compose.yml`, shell como servicio (commit `3761a05`) | Hito 0 = higiene (comentario `internet.yml` erróneo, `dev.yml` incompleto) |
| "Sistema multiplayer nuevo" | `space-server` YA es multi-sala en el núcleo: salas lazy por `?room=`, broadcast POR sala, destrucción al vaciar, aislamiento testeado (`hub_test.go` TestHub_RoomIsolation) | Hito 6 añade SOLO: `Room struct {clients, host, phase}`, transferencia de host, fase lobby/carrera |
| "Cámara más cerca" | Ya se acercó en #4 (`chaseOffset {0,7,24}`, antes `{0,9,34}`) | Hito 4 la afina más (`{0,5,16}` aprox), con riesgos documentados |

## 1. Análisis de errores previos → protocolo de verificación

Errores recurrentes de esta iniciativa (sesiones 2026-06-13 → 2026-07-04) y su mitigación obligatoria:

1. **Build desplegado ≠ código actual** (bind-mount de `dist` obsoleto; caché inmutable 1 año). → Al cerrar cada hito: `docker compose up -d --build shell` desde `deploy/` + hard-refresh + **verificar el hash del bundle** (`curl -s http://localhost:8080/ | grep -o 'index-[A-Za-z0-9]*\.js'` debe cambiar).
2. **Estado no reiniciado al cruzar costuras** (pause/resume dejó la órbita atrapada — Bug B; auth sin rehidratar — Bug A). → Checklist por hito: "¿qué estado queda al cruzar pause/resume, entrar/salir de cabina, montaje fresco?".
3. **Verificación headless engañosa** (rAF congelado en pestaña oculta; `engine.resume()` tiene guarda `document.hidden`; login exige backend). → La evidencia runtime se toma en `http://localhost:8080` real. El arnés dev (`debug.html` + `debug-space.ts`, vite `--port 5311 --strictPort`; el 5173 está reservado por el SO) sirve para el motor sin login, conduciendo `engine.loop()` a mano; **se borra antes de commitear** (tsc compila `src/**`).
4. **Infra local con trampas**: TLS a Docker Hub falla en frío (pre-pull de imágenes base); el comentario de `deploy/docker-compose.internet.yml` apunta a `dev.yml` que está INCOMPLETO (faltan redis/space-server/oktomatzo2) → desplegaría sin multijugador ni TattooAR. El túnel de Cloudflare consume `caddy:8080` por red interna (no requiere puerto publicado en host).
5. **Divergencia del usuario**: hace commits propios entre sesiones. → `git log --oneline -10` ANTES de cada hito; si hay commits desconocidos, leerlos antes de editar.
6. **Sin emojis ni neón** en código, UI ni mensajes. Sci-fi sobrio y luminoso. Paleta ámbar/crema existente.

**Definition of Done global (todo hito la cumple):**
- `pnpm --filter @plataforma/shell test && pnpm --filter @plataforma/shell lint && pnpm --filter @plataforma/shell build` en verde (+ `go test ./...` en backend/space-server si se tocaron).
- Verificación runtime en `http://localhost:8080` con evidencia (hash de bundle, flujo manual descrito).
- Sin archivos del arnés dev en el commit. Sin tocar `apps/`, app-registry ni protocolo del iframe.
- UN commit por hito (ver estrategia), mensaje según plantilla del hito.

## 2. Estrategia de commits (hitos funcionales)

Commits SOLO al completar un hito funcional verificable (decisión del usuario 2026-07-04; sustituye la convención previa de commits pequeños). Convención:

```
<tipo>(<scope>): hito <N> — <título corto>

- <criterio de aceptación 1 verificado>
- <criterio de aceptación 2 verificado>
- Verificado: tests <n> verdes, build OK, runtime en localhost:8080

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Tipos/scopes: `fix(space)`, `feat(space)`, `feat(shell)`, `feat(auth)`, `feat(audio)`, `feat(race)`, `feat(rooms)`, `chore(deploy)`. Si un hito toca shell+backend, un commit por lado con el mismo "hito N".

## 3. Arquitectura propuesta (cambios clave)

### 3.1 Estructura de assets (audio)
```
shell/public/audio/
  ambient.ogg          # loop de música ambiental global (REEMPLAZABLE: mismo nombre, mismo sitio)
  sfx/
    thruster.ogg       # propulsor (loop corto, gain por velocidad)
    nitro.ogg
    collision.ogg
  projects/
    <appId>.ogg        # audio ambiental por planeta/proyecto (opcional; keyed por id del registry)
```
`shell/public/` ya se sirve tal cual en `/` (dev: Vite publicDir default; prod: dist→nginx→Caddy). Cero cambios en vite.config/deploy. Para reemplazar la música: sustituir el archivo y redesplegar el shell.

### 3.2 Estado de audio (nuevo servicio)
- `shell/src/services/audio-service.ts` — singleton con `subscribe()` (patrón exacto de `auth-client.ts`), SIN Three.js. Estado: `{masterMuted, masterVolume, sfxMuted, projectMuted: Record<appId, boolean>}`, persistido en `localStorage 'plataforma_audio'` (patrón de `'plataforma_theme'`, `shell-app.ts:86-119`).
- WebAudio: un `AudioContext` + `GainNode` maestro → ramas music/sfx/project. **Autoplay policy:** el contexto arranca `suspended`; `resume()` en el primer gesto (click del login o primer pointerdown del espacio).
- Lógica pura testeable: `audio-math.ts` (mapeo velocidad→gain del propulsor, ducking al entrar en cabina).

### 3.3 UI de configuración global
- Elemento nuevo `shell/src/components/shell-settings.ts` (registrado en `main.ts`), montado INCONDICIONALMENTE por `ShellSpace` (es el único componente vivo tanto en espacio como en cabina; renderiza en light DOM). Botón flotante `position:fixed` con `z-index:130` (> cabina 120) → visible también dentro de proyectos SIN tocar apps/ ni el iframe.
- Contenido del modal: mute/unmute general, volumen maestro, mute SFX; si `cockpitApp != null`, control dinámico adicional "Audio del proyecto <nombre>". (El selector de nave del antiguo #5 se pospone; el modal queda preparado por secciones.)
- Cuidado verificado: el modal NO usa Esc para cerrarse (colisiona con Esc de cabina, `shell-cockpit.ts:145-151`) — botón de cierre explícito. En el espacio, entrada duplicada en `PauseMenu` (callback `onSettings`) porque con pointer lock el botón fijo no es clicable.

### 3.4 Dockerización (estado + higiene)
Ya existe. Hito 0 corrige: comentario de uso de `internet.yml` (debe componer con `docker-compose.yml`, NO `dev.yml`), cabecera de advertencia en `dev.yml` (incompleto: sin redis/space-server/oktomatzo2/ruta `/space-ws`), y verifica `JWT_SECRET` real en `deploy/.env` (el default del backend es inseguro y con guest público sería crítico).

### 3.5 Instrumentación de rendimiento (base de la puerta de latencia)
- `shell/src/space/perf-stats.ts` — módulo PURO (patrón `multiplayer-math.ts`): ring buffer de frame times + p95/p99. Se alimenta con el **delta CRUDO** capturado antes del clamp de `space-engine.ts:286` (el clamp a 0.016 oculta hoy los peores frames). Registrar `pixelRatio` vigente junto a cada ventana (la degradación automática contamina comparaciones).
- Draw calls: leer `renderer.info.render.calls/triangles` tras `composer.render()` (`space-engine.ts:364`) — coste cero.
- RTT: mensaje `{type:'ping',t}` → `{type:'pong',t}` en `space-multiplayer.ts` + eco en el hub Go (~10 líneas); EWMA puro en `multiplayer-math.ts`.
- Umbrales y ventanas en `space-config.ts` → `PERF_CONFIG` (marcados `[UNIFORME]`).

## 4. Hitos de desarrollo (backlog)

### Hito 0 — Higiene de entorno + instrumentación de rendimiento
**Alcance:** correcciones de deploy (3.4) + `perf-stats.ts` + ping/pong RTT + captura de BASELINE (p95 frame time, draw calls, RTT en vuelo libre, cerca del cinturón, y en órbita) documentado en `docs/superpowers/notes/2026-XX-XX-baseline-perf.md`.
**Criterios de aceptación:**
- [ ] `internet.yml` con comentario correcto; `dev.yml` con advertencia de incompleto.
- [ ] `JWT_SECRET` en `deploy/.env` verificado no-default.
- [ ] `perf-stats.ts` con tests Vitest (p95 correcto con ventana llena/parcial); RTT visible vía `window.__space` o HUD de diagnóstico opcional.
- [ ] Baseline documentado ANTES de cualquier feature nueva.
**Commit:** `chore(deploy): hito 0 — higiene compose + instrumentacion perf baseline`

### Hito 1 — Estabilización del núcleo (spec ya escrito y commiteado)
**Alcance:** ejecutar el spec `docs/superpowers/specs/2026-07-04-orbita-cinematica-y-navegacion-design.md` (secciones S1–S8) en su orden interno: S1 planetas en marco de mundo (bug planetas desaparecen), S6 reset orbital al volver del proyecto (bug no-reentrada), S3 plano de órbita determinista orientado al sol + S5 bloqueo parcial con salir explícito, S4 cámara de composición planeta+sol, S2 recalibración de captura (influenceFactor 8→3 + radio de aviso), S7 suavizado real de mirada, S8 persistencia de sesión (rehidratar user al montar, no-logout ante fallos transitorios, localStorage).
**Decisiones de arquitecto ya tomadas** (el usuario pidió libertad técnica; reversibles si las rechaza): suavizado de mirada SÍ (su queja lo pide); al volver del proyecto → vuelo libre con cooldown anti-recaptura (causa raíz del bug); tecla salir-de-órbita = `S` + botón "Salir" en HUD (Esc queda reservado a salir del proyecto).
**Criterios de aceptación:**
- [ ] Los 4 bugs reproducidos por el usuario NO reproducibles: volver sin re-login, entrar a un 2.º planeta, planetas visibles tras vuelo largo, órbita estable encuadrando el sol.
- [ ] Nuevos tests puros de: `orbit-frame`, `orbit-camera pose`, `dampedFollow`, `stepOrbit` nuevo contrato, `captureState`, rehidratación de auth. Suite completa en verde.
- [ ] Este hito REQUIERE su propio plan detallado por tareas (el spec ya existe; generar plan con writing-plans antes de ejecutar).
**Commit:** `fix(space): hito 1 — nucleo estable (orbita determinista, marco de mundo, re-entrada, sesion)`

### Hito 2 — Acceso invitado (backend + shell)
**Alcance verificado contra el código:**
- Backend (~40-60 líneas, 4 archivos, sin cambio de schema): `RoleGuest` en `domain/user.go:10-13`; `GuestLogin()` en `auth_service.go` reutilizando `generateToken` (`helpers.go:23`) y devolviendo el MISMO contrato `{data:{user,token}}`; short-circuit en `ValidateToken` (`auth_service.go:101-113`) — `if claims.Role == RoleGuest` devolver user efímero SIN `FindByID` (guest 100% stateless); ruta pública `POST /api/auth/guest` en `main.go:46`; **gate `RequireNonGuest`** (análogo a `RequireAdmin`, `middleware.go:76-85`) envolviendo POST/PUT/DELETE `/api/apps` (hoy cualquier autenticado puede mutar apps — riesgo real con guest público).
- Shell: en `shell-login.ts` (~:307, junto al submit) botón secundario con el label EXACTO pedido por el usuario: **"Quién te crees que eres para pedirme el login?"** — estilizado sobrio/profesional (botón terciario, microcopy de apoyo "Continuar como invitado" como subtítulo pequeño). Llama a un `authClient.loginAsGuest()` que hace POST `/api/auth/guest` y sigue el flujo normal (`login-success` sin payload; el estado fluye por la suscripción). Ampliar el union `role` con `'guest'` (`auth-client.ts:5`).
- Nota verificada: `loadApps()` ya funciona para guest vía `/api/apps` con su token; el guard existente de `auth:token` a iframes tolera lo que haga falta. Apps protegidas en iframe degradan igual que hoy.
**Criterios de aceptación:**
- [ ] E2E: click en el botón guest → entra al espacio sin credenciales; usuario registrado sigue funcionando idéntico.
- [ ] Guest NO puede mutar `/api/apps` (test Go del middleware). Tests Go de GuestLogin/ValidateToken-shortcircuit.
- [ ] TTL del token guest parametrizado (más corto que 72h; p.ej. 24h).
**Commit:** `feat(auth): hito 2 — acceso invitado (endpoint guest stateless + boton en login)`

### Hito 3 — Sistema de audio global y por proyecto
**Alcance:** 3.1 + 3.2 + 3.3 completos. SFX iniciales: propulsor (gain por velocidad, `audio-math.ts` puro), nitro, y hook de colisión (se conecta de verdad en Hito 5). Audio por proyecto: al entrar en cabina, si existe `/audio/projects/<appId>.ogg`, reproducirlo en la rama project (con ducking de la música global); control dinámico en el modal cuando `cockpitApp != null`.
**Criterios de aceptación:**
- [ ] Botón de configuración visible y clicable en: espacio (vía PauseMenu + botón fijo cuando no hay lock), y DENTRO de la cabina de un proyecto (botón fijo sobre z-120).
- [ ] Mute/volumen persisten (localStorage) y sobreviven a recarga; el AudioContext se desbloquea con el primer gesto (probado en Chrome).
- [ ] Instrucciones de reemplazo de música en un README corto (`shell/public/audio/README.md`).
- [ ] Tests puros de `audio-math` y del reducer de estado del servicio. El modal NO cierra con Esc.
**Commit:** `feat(audio): hito 3 — audio global (musica/sfx/por-proyecto) + configuracion accesible en cabina`

### Hito 4 — Identidad visual: iniciales en planetas, nave, cámara
**Alcance verificado:**
- Iniciales: `THREE.Sprite` + `CanvasTexture` (patrón ya presente: `trailTexture`, `player-ship.ts:6`) como HIJO de `p.mesh` en el constructor de `SolarSystem` (`solar-system.ts:77-89`) → hereda órbita y rebase gratis. `position.y = planetRadius*1.3`, textura ≥256px, paleta ámbar/crema, color BAJO el umbral de bloom 0.6. Derivación pura `initialsFor(name)` (2-3 chars) con tests. Registrar sprite/textura en `dispose()` (`solar-system.ts:149`).
- Nave: rediseño estético DENTRO de `createPlayerShip()` (contrato externo intacto: `{object, update, dispose}`, nariz=-Z). Conservar: arrays `cores/flames/trails`, `navLights`, anclajes z=2.24/FLAME_BASE_LEN (moverlos coherentemente si cambia la cola), 3 PointLights, regla de no rotar el raíz (roll = pivote del controller).
- Cámara: `CAMERA_CONFIG.chaseOffset` → `{0, 5, 16}` (un solo número; probar con NITRO activo: las llamas invaden encuadre con z<~12).
**Criterios de aceptación:**
- [ ] Iniciales legibles desde la distancia de aviso de captura; sin florecer con bloom; sin fugas de memoria (dispose).
- [ ] Nave nueva sin regresión en toberas/estelas/estrobos; suite en verde; captura de pantalla comparativa antes/después para el usuario.
- [ ] p95 frame time sin degradación vs baseline del Hito 0 (los sprites son coste ~0).
**Commit:** `feat(space): hito 4 — rotulos de proyecto en planetas + nave rediseñada + camara cercana`

### Hito 5 — Pista de carreras espacial (single-player) `[SPEC PROPIO]`
**Alcance (requiere brainstorm→spec→plan propio antes de ejecutar; sustituye al antiguo #6 "circuito dentro del planeta"):** zona de carrera anclada a un planeta LEJANO del sistema (el mismo que servirá de acceso a salas en Hito 6). Pista larga con esferas guía semitransparentes (patrón F1/Mario Kart sobrio), checkpoints con respawn automático (fuera de pista >N segundos → volver al último checkpoint validado), minimapa/indicador de trayectoria en HUD, zonas de asteroides en movimiento y pasos entre planetas masivos.
**Arquitectura fijada:** lógica pura TDD en módulos nuevos (`race-track.ts` generación paramétrica de la spline/waypoints; `race-state.ts` máquina checkpoint/respawn/vuelta; `race-math.ts` distancia a pista/progreso), render en módulo Three separado; integración por la costura existente de aproximación (NO envolver `enterProject` de otros planetas; la costura del spec de #3/#6 se respeta). Colisión simple esfera-esfera contra obstáculos (no existe sistema de colisión hoy — riesgo alto reconocido; empezar por esferas). Física SIN maxSpeed → riesgo de tunneling: chequear colisión por segmento recorrido en el frame, no por posición puntual.
**Criterios de aceptación:**
- [ ] Completar una vuelta con checkpoints, respawn funcional, minimapa correcto.
- [ ] Todos los módulos de lógica con tests puros (generación determinista por semilla, progreso monotónico, respawn al checkpoint correcto).
- [ ] PUERTA DE RENDIMIENTO: p95 frame time en carrera ≤ baseline+20% y nunca <30 FPS sostenidos con la degradación de pixelRatio registrada; si falla, reducir densidad de obstáculos antes de aceptar.
**Commit:** `feat(race): hito 5 — pista de obstaculos espacial con checkpoints, respawn y minimapa`

### Hito 6 — Salas multijugador con host (CONDICIONADO a la puerta de latencia) `[SPEC PROPIO]`
**Precondición (gate go/no-go):** con Hito 5 en verde, medir con la instrumentación del Hito 0: (a) p95 frame time con 4+ naves remotas simuladas en zona de carrera ≤ baseline+25%; (b) RTT p95 del WS < 120 ms en LAN/local; (c) sin pérdida de mensajes de control. Si NO pasa → el hito se pospone y se documenta (el sistema queda single-player, sin deuda).
**Alcance servidor (verificado ~60% existente):** cambiar `rooms map[string]map[*Client]bool` → `map[string]*Room` con `Room{clients, host *Client, phase string}` (`hub.go:27-31`); primer usuario = host al crear sala (`hub.go:96-99`); transferencia al salir el host (`hub.go:130-142`, bajo el MISMO lock, orden cuidado con `close(c.send)`); sala vacía ya se destruye (conservar). **hostId y phase viajan EN CADA `state_update` del tick** (no solo como evento: el envío no bloqueante puede descartar mensajes — un `host_changed` perdido rompería la UX; como estado repetido es autocorrectivo). `ClientMessage type:"start_race"` validado contra `c == room.host`. Throttle de escrituras Redis (hoy HSET+EXPIRE por CADA frame de CADA cliente — insostenible en carrera; persistir 1x/s o al desconectar). Cap de salas y validación de `?room=`. Endpoint `GET /rooms` (lista de salas con conteo) leyendo bajo RLock.
**Alcance cliente:** al aproximarse al planeta de carreras (sin capturar): panel de lista de salas (fetch `/rooms`) + crear/unirse; en sala, fase lobby = naves fijas en línea de salida (controles bloqueados, patrón del bloqueo orbital del Hito 1), el host ve botón "Iniciar carrera"; countdown sincronizado por mensaje de fase; botón salir de sala (si sale el host → transferencia automática visible).
**Riesgos conocidos (del mapeo):** identidad débil (id por query param sin auth — aceptable en MVP interno, documentar); reconexión del host entra como usuario nuevo (la transferencia ya ocurrió — comportamiento aceptado); `-race` de Go correr en Docker (sin compilador C en Windows).
**Criterios de aceptación:**
- [ ] 2 navegadores: crear sala, host inicia, naves bloqueadas hasta el inicio, transferencia al salir el host, destrucción al vaciar. Tests Go (miniredis) de host/transfer/phase.
- [ ] Puerta de latencia PASADA y documentada con números (antes/después).
- [ ] Carrera multijugador comparte pista y código del Hito 5 (misma `race-track.ts`).
**Commit:** `feat(rooms): hito 6 — salas con host, lobby y carrera sincronizada (gate de latencia superado)`

### Hito 7 — Endurecimiento y despliegue final
**Alcance:** e2e completo de los flujos (guest y registrado); revisión de consumo (docker stats vs baseline); documentación de despliegue definitiva (VPS: `docker compose -f docker-compose.yml -f docker-compose.internet.yml up -d --build`; local: `http://localhost:8080`); limpieza de flags/documentos; verificación de caché (hash de bundle nuevo servido).
**Criterios de aceptación:**
- [ ] Checklist completo de flujos manuales documentado y ejecutado.
- [ ] `docs/` actualizado (cómo reemplazar audio, cómo desplegar, cómo correr tests).
**Commit:** `chore(deploy): hito 7 — endurecimiento, e2e y documentacion de despliegue`

## 5. Estrategia de mitigación de latencia (transversal)

1. **Baseline primero (Hito 0):** nada se compara sin medir antes. p95/p99 de frame time con delta CRUDO, draw calls (`renderer.info`), RTT WS (ping/pong nuevo), registrando el `pixelRatio` vigente en cada ventana de medición.
2. **Presupuestos explícitos** en `PERF_CONFIG` (`space-config.ts`): p95 ≤ baseline+20% (Hito 5) / +25% (Hito 6), RTT p95 < 120 ms, FPS sostenidos ≥ 30. Superar el presupuesto = no se acepta el hito, se reduce alcance (densidad de obstáculos, jugadores por sala) hasta cumplir.
3. **El servidor ya aísla por sala** (broadcast y tick por sala, un Marshal por sala): añadir salas no degrada a las demás. El riesgo real medido es (a) Redis: HSET por frame por cliente → throttle a 1x/s; (b) mensajes de control descartables → estado repetido en el tick, no eventos únicos; (c) `setSnapshot` re-mapea la sala entera a 20 Hz → aceptable a decenas de jugadores, medir en el gate.
4. **Cliente:** interpolación existente (`LERP_RATE=12`) se conserva; en fase lobby los remotos son estáticos (coste mínimo); la degradación automática de pixelRatio ya existe y se registra junto a las mediciones para no falsear comparaciones.
5. **Kill-switch:** la zona de carrera/salas se activa por flag en `space-config.ts` (`RACE_CONFIG.enabled`) → si algo degrada en producción, apagar sin revertir código.

## 6. Orden de ejecución y dependencias

```
Hito 0 (higiene+perf) → Hito 1 (núcleo estable) → Hito 2 (guest) → Hito 3 (audio) → Hito 4 (visual)
                                                                    ↘ Hito 5 (carrera SP) → [GATE] → Hito 6 (salas MP) → Hito 7 (cierre)
```
2, 3 y 4 son independientes entre sí (pueden reordenarse si el usuario prioriza), pero TODOS dependen de 1 (no construir sobre un núcleo con bugs). 5 depende de 1 (órbita/aproximación) y de 0 (gate). 6 depende de 5.

## 7. Referencias obligatorias para el constructor

- Spec del Hito 1 (ya commiteado): `docs/superpowers/specs/2026-07-04-orbita-cinematica-y-navegacion-design.md`.
- Causas raíz verificadas de los 4 bugs (en el spec, sección "Causas raíz verificadas").
- Contratos intocables: `apps/**`, `shell/public/app-registry.yaml` (estructura), protocolo postMessage (`shell/src/services/protocol.ts` — solo AÑADIR tipos, nunca cambiar existentes), costura `enterProject` (`space-engine.ts:515`).
- Configuración centralizada: TODO parámetro afinable nuevo va a `shell/src/space/space-config.ts` marcado `[UNIFORME]` o `[PERSONALIZABLE]`.
- Bug latente conocido (no bloquea, no arreglar de pasada sin hito): `broadcastAuth/broadcastTheme` buscan iframes en `shadowRoot` de shell-app pero los iframes viven en shell-cockpit → el camino real es el reactivo `app:ready/auth:request`.
