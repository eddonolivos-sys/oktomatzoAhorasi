# Multijugador del espacio (presencia + emoticonos + persistencia) — diseño

> **Origen:** Siguiente bloque del rediseño Constellation OS v3 (ver [Bloque 1](2026-06-14-rediseno-experiencia-espacio-3d-design.md)). Mundo compartido: ver las naves de otros jugadores moverse en tiempo real, comunicarse con emoticonos, y persistir posiciones/estado.
>
> **Fecha:** 2026-06-15 · **Rama:** `ramatzo`

## 1. Objetivo

En el espacio post-login, ver y sentir a **otros jugadores conectados**: sus naves moviéndose con su nombre, comunicación rápida por **emoticonos**, y **persistencia** de posiciones/estado (al reconectar, recuperas tu sitio; el mundo sobrevive a reinicios del servidor).

## 2. Alcance

**Dentro (esta entrega):** servidor de tiempo real nuevo + persistencia; cliente del shell (presencia + emoticonos + render de naves remotas).

**Fuera (piezas futuras, su propio ciclo):** "otras galaxias" interactuables (se diseñan como **salas** adicionales más adelante; el servidor ya soporta `room` desde el inicio), validación estricta de JWT / anti-cheat, chat de texto libre, voz.

**Despliegue:** lo realiza el usuario (VPS). Este spec añade servicios al `docker-compose` y una ruta a Caddy, pero el build/despliegue lo ejecuta el usuario.

## 3. Decisiones (acordadas)

| Decisión | Elección |
|---|---|
| Primera entrega | Presencia (ver otras naves) **+ chat de emoticonos** |
| Servidor | **Servicio nuevo separado** (no se reutiliza `game-server`) |
| Lenguaje del servidor | **Go + gorilla/websocket** (espeja el `game-server` probado; consistente con el repo) |
| Persistencia | **Redis** (caché de posiciones/estado en vivo, con TTL; sobrevive a reinicios) |
| Salas | Soportadas desde el inicio; MVP usa una sala `home` |
| Identidad | `id` + `name` del **login (JWT)** |

## 4. Arquitectura

**Servicios nuevos (Docker):**
- `services/space-server/` (Go): hub WebSocket con **salas** y **persistencia en Redis**. Espeja la estructura de `services/game-server` (sin hazards ni combate).
- `redis` (imagen `redis:alpine`): caché de estado.

**Enrutado/infra:**
- Caddy: ruta nueva `handle /space-ws` → `reverse_proxy space-server:8080` (en los dos bloques, producción y `:8080` dev). No choca con `/ws` (combate).
- `deploy/docker-compose.yml`: servicios `space-server` (build `../services/space-server`) y `redis`; `space-server` con `REDIS_ADDR=redis:6379` y `depends_on: [redis]`.

**Cliente (shell, `shell/src/space/`):**
- `space-multiplayer.ts` — `SpaceMultiplayer` (patrón de `MultiplayerClient`): conexión, envío de estado con throttle, emoticonos, callbacks, reconexión.
- `remote-ships.ts` — gestiona naves remotas (alta/baja/actualización) con **interpolación** entre snapshots y **etiqueta de nombre** flotante; emoji flotante temporal.
- `emote-wheel.ts` — rueda radial DOM para elegir emoticono.
- `space-engine.ts` — orquesta: conecta tras el login, difunde la posición de la nave, coloca las remotas (convirtiendo con `worldOffset`).
- `shell-space.ts` / `shell-app.ts` — pasan la identidad del usuario (`{id, name}` de `authState.user`) al motor (nuevo campo en `MountOpts`).

## 5. Protocolo (WebSocket, JSON)

Conexión: `GET /space-ws?room=home&id=<userId>&name=<userName>` (Upgrade a WS).

**Cliente → servidor:**
- `{ "type": "state", "x": n, "y": n, "z": n, "yaw": n }` (~20 Hz, throttled)
- `{ "type": "emote", "emoji": "happy" | "sad" | "angry" }`

**Servidor → cliente:**
- `{ "type": "players", "players": [ { id, name, x, y, z, yaw } ] }` (snapshot al unirse)
- `{ "type": "state_update", "players": [...] }` (tick de difusión, ~15–20 Hz; solo de la sala)
- `{ "type": "joined", "player": { id, name, x, y, z, yaw } }`
- `{ "type": "left", "id": "<id>" }`
- `{ "type": "emote", "id": "<id>", "emoji": "..." }`

> **Difusión por tick:** el servidor difunde el snapshot de la sala en un bucle a ~15–20 Hz (desacoplado de la frecuencia de envío de cada cliente) → tráfico acotado. Adecuado para baja concurrencia.

## 6. Servidor `space-server` (Go) + Redis

- **Hub por sala:** `map[room]map[*client]bool`. Un cliente solo recibe difusiones de su sala. Unirse/salir difunde `joined`/`left` solo a la sala.
- **Estado 3D** por jugador: `{id, name, x, y, z, yaw}` (a diferencia del `game-server`, que es 2D `x,z`).
- **Persistencia (Redis):**
  - Al recibir `state`: `HSET space:player:<id> x y z yaw name room` + `EXPIRE space:player:<id> 3600` (TTL 1 h).
  - Al `join`: si existe `space:player:<id>`, restaura su última posición como estado inicial (continuidad al reconectar).
  - El servidor mantiene la lista de conectados en memoria (presencia) y el estado durable en Redis (sobrevive a reinicios del server).
- **Sin hazards** (no es el modo combate).
- **Identidad:** confía en `id`/`name` de la query (como el `game-server`). La validación de JWT (compartiendo `JWT_SECRET` con el backend) queda como endurecimiento futuro (no-objetivo).
- **Ficheros:** `main.go`, `go.mod`, `Dockerfile` (multi-stage Go, espejo del `game-server`). Dependencia: cliente Redis (`github.com/redis/go-redis/v9`).

## 7. Cliente + render

- **`SpaceMultiplayer`**: `connect({room,id,name})`, `sendState({x,y,z,yaw})` (throttle ~20 Hz vía helper puro), `sendEmote(emoji)`, callbacks `onPlayers/onJoined/onLeft/onEmote`, reconexión con backoff. Sin Three.js (testeable salvo el WebSocket).
- **`remote-ships.ts`**: `Map<id, RemoteShip>` donde `RemoteShip = { object, from, to, t, nameLabel, emote }`. En cada `state_update` fija `to` (objetivo) y resetea `t`; en `update(delta)` interpola `from→to` (lerp de posición + yaw) para suavizar. Modelo de nave ligero (variante de `createPlayerShip`, menos detalle/luz). Etiqueta de nombre proyectada a pantalla (helper `project` del motor). Emoji: sprite/elemento flotante temporal (≈3 s) sobre la nave.
- **Integración `space-engine`:** tras `mount` con `opts.user`, crea `SpaceMultiplayer` y conecta. Cada frame: `sendState({ x: ship.x+worldOffset.x, y: ..., z: ..., yaw })` (coords absolutas) con throttle; `remoteShips.update(delta)` coloca cada nave remota en `pos - worldOffset` (coords de escena). Al `rebase`, las remotas se recolocan automáticamente porque se posicionan cada frame desde coords absolutas.
- **worldOffset:** el servidor trabaja en **coords de mundo absolutas**; el cliente suma `worldOffset` al enviar y lo resta al colocar remotas. (Lógica pura testeable.)

## 8. Emoticonos

- Tecla `C` abre una **rueda radial** (overlay DOM, centrada) con 3 caras: feliz / triste / enojada. Selección por clic en el sector o teclas `1/2/3`; `Esc`/soltar cierra sin enviar.
- Al elegir: `sendEmote(emoji)` → el servidor difunde → aparece el emoji **flotando sobre la nave** del emisor (propia y remotas) ≈3 s.
- Sobrio, sin neón. Lógica pura testeable: ángulo del cursor → sector seleccionado.

## 9. Identidad (login → motor)

`shell-app` ya tiene `authState.user = { id, email, name, role }`. Se añade `user?: { id: string; name: string }` a `MountOpts` del motor; `shell-app` → `shell-space` → `engine.mount({ ..., user })`. Si no hay usuario, el multijugador no se activa (no debería ocurrir post-login).

## 10. Estrategia de pruebas

- **Unitarias (Vitest, lógica pura, sin DOM/WS):**
  - `shouldSendState(now, last, intervalMs)` (throttle).
  - Interpolación `lerpState(from, to, t)` (posición + yaw; t∈[0,1]).
  - Conversión `worldOffset` (absoluto↔escena), ida y vuelta.
  - Rueda de emoticonos: ángulo→sector (3 sectores).
- **Go (`space-server`):** tests del hub — aislamiento por sala, join/leave difunde solo a la sala, `state_update` refleja el estado, persistencia (Redis mockeado / `miniredis`): `state` escribe y `join` restaura.
- **Manual (usuario, con el stack):** 2+ navegadores → ver naves moverse con nombre + emoticonos; reconexión restaura posición.

## 11. Riesgos y notas

- **No verificable headless:** el multijugador necesita 2+ clientes y el stack vivo; se valida manualmente. El servidor Go sí se testea en unidad.
- **Despliegue (usuario):** nuevos contenedores `space-server` + `redis` y ruta Caddy → **requiere build Docker** (recordar el fallo de pull de Docker Hub: pre-`docker pull golang:1.22-alpine` y `redis:alpine`).
- **Concurrencia:** diseño para baja concurrencia (difusión de snapshot por tick). Si crece, optimizar (deltas, áreas de interés).
- **Seguridad:** el servidor confía en el `id`/`name` de la query (MVP). Validación JWT = endurecimiento futuro.

## 12. No-objetivos

Otras galaxias (siguiente pieza, como salas), anti-cheat/validación JWT estricta, chat de texto/voz, físicas/colisiones entre naves.
