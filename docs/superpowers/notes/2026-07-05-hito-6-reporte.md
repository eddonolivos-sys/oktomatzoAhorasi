# Hito 6 — Salas multijugador con host: reporte de cierre

**Fecha:** 2026-07-05
**Spec:** `docs/superpowers/specs/2026-07-05-salas-multijugador-con-host-design.md`
**Plan:** `docs/superpowers/plans/2026-07-05-hito-6-salas-multijugador-plan.md`
**Puerta de latencia (precondición):** PASADA — `docs/superpowers/notes/2026-07-05-puerta-latencia-hito-6.md` (commit `8ed5c04`).

## Resumen

Salas multijugador de carrera con host sobre la infraestructura de
presencia por salas ya existente en `space-server`. Servidor: `Room{clients,
host, phase}` sustituye al mapa plano de clientes por sala; `hostId`/`phase`
viajan en cada `state_update`/`players`; nuevo mensaje `start_race`
validado contra el host; escritura a Redis throttled a 1x/s + flush al
desconectar; cap de 20 salas y validación de nombre; nuevo endpoint `GET
/rooms`. Cliente: panel de salas (listar/crear/unirse) accesible con **R**
dentro de la zona de carrera; lobby con parrilla de salida determinista
(`race-grid.ts`); naves congeladas (`ship.setOrbiting`, mismo patrón de
bloqueo del Hito 1) hasta que el host inicia; countdown local de 3s
disparado por el flip de fase `lobby`→`racing`; progreso de carrera **local
por jugador**, reutilizando el 100% del código de `race-state.ts` del Hito
5 sin modificarlo.

## Criterios de aceptación verificados

- **Crear sala**: `onCreateRoom` genera un código corto y llama
  `switchRoom('race:<código>')`; el primer cliente en una sala nueva es su
  host (`Hub.register`). Verificado en runtime: sala `race:XX4P` creada,
  `hostId === 'debug-local-pilot'`.
- **Unirse a una sala**: un segundo cliente (WebSocket simulado) conectado a
  la misma sala aparece en `raceRoom.players` del cliente real y en el
  panel de lobby, sin reemplazar al host. Verificado en runtime.
- **Host inicia la carrera**: `sendStartRace()` desde el host cambia
  `phase` a `"racing"` en el servidor (validado contra `room.host`); un
  no-host que lo intentara sería ignorado (cubierto por el test Go
  `TestHub_StartRaceOnlyByHost`). Verificado end-to-end en runtime:
  countdown local de 3s, `raceState.phase` pasa a `'racing'` con el código
  del Hito 5 sin cambios (checkpoint avanzado correctamente tras el
  arranque).
- **Naves bloqueadas hasta el inicio**: `ship.setOrbiting(true)` mientras
  `phase==='lobby'` o durante el countdown; verificado que la posición de
  la nave se recalcula cada frame a la parrilla de salida
  (`raceGroupPos + startingSlotPosition(...)`) y permanece fija.
- **Transferencia de host al salir**: verificado con dos clientes WebSocket
  simulados (`simA` primero, `simB` segundo) contra una sala de prueba:
  `simA` es host; al cerrar su conexión, el siguiente `state_update` que
  recibe `simB` trae `hostId === 'simB'`. Cubierto también por el test Go
  `TestHub_HostTransferOnLeave`.
- **Destrucción de sala vacía**: tras cerrar ambos clientes simulados,
  `GET /rooms` (vía Caddy, `http://localhost:8080/rooms`) deja de listar
  la sala de prueba. Cubierto también por
  `TestHub_RoomDestroyedWhenEmptyStillWorks`.
- **Puerta de latencia**: ya pasada y documentada antes de iniciar este
  hito (ver referencia arriba); no se repite la medición porque el hito no
  modifica el camino de datos de presencia (frecuencia de tick, formato de
  `state_update`) de forma que pudiera degradarlo — solo añade dos campos
  (`hostId`/`phase`) al mensaje ya existente.
- **Comparte pista y código del Hito 5**: el progreso de carrera
  (checkpoints/vueltas/respawn/colisión) es exactamente
  `race-state.ts`/`race-math.ts`/`race-track.ts` del Hito 5, sin ninguna
  modificación — el flip de fase de la sala solo invoca `startRace()` en
  vez de que el jugador pulse E.

## Bug encontrado y corregido durante la verificación runtime

**Conexión fantasma duplicada en `SpaceMultiplayer.switchRoom()`:**
`switchRoom()` llama `disconnect()` (que marca `closedByUser=true` y cierra
el WebSocket) seguido INMEDIATAMENTE de `connect()` (que resetea
`closedByUser=false` y abre un socket nuevo). El cierre del socket VIEJO es
asíncrono: su evento `onclose` podía llegar DESPUÉS de que `connect()` ya
hubiera reseteado `closedByUser` a `false`, haciendo que el hándler de
cierre del socket viejo interpretara la desconexión como "inesperada" y
agendara una reconexión — que, al ejecutarse ~1s después, usaba
`this.opts` (ya apuntando a la sala NUEVA), creando una SEGUNDA conexión
duplicada a la misma sala con el mismo `id`. Efecto observable: el hub Go
indexa clientes por puntero (`map[*Client]bool`), no por `id`, así que dos
conexiones con el mismo `id` producían DOS entradas de jugador idénticas en
`roomSnapshot`, visibles como un jugador fantasma en el lobby.

Encontrado mediante verificación runtime dirigida (crear una sala y
esperar ~1-2s antes de leer `raceRoom.players`, en vez de leerlo
inmediatamente). Corregido capturando el socket en una variable local
(`sock`) y comparando `this.ws !== sock` al inicio del handler `onclose`
del socket VIEJO — si `this.ws` ya no es ese socket (porque `switchRoom`/un
`connect()` posterior ya lo sustituyó), el cierre se ignora sin agendar
reconexión, sin importar el valor de `closedByUser`. Verificado
re-ejecutando el mismo escenario tras el fix: exactamente 1 entrada de
jugador, estable durante 2+ segundos (antes del fix, aparecía la segunda
entrada fantasma en ese margen de tiempo).

## Tests

- Go (`services/space-server`): **22/22** (9 preexistentes intactos +
  10 nuevos de este hito en `hub_test.go`: host al crear sala, host no se
  reemplaza con el segundo join, transferencia al salir, `start_race`
  solo-host, `hostId`/`phase` en el tick, destrucción de sala con el
  nuevo tipo `*Room`, throttle de Redis, flush al desconectar, validación
  de nombre de sala, cap de salas; + 3 preexistentes de `store_test.go`,
  no tocados).
- Vitest (shell): **289/289** (26 archivos; +5 de `race-grid.test.ts`,
  nuevo en este hito).
- `pnpm --filter @plataforma/shell lint`: limpio.
- `pnpm --filter @plataforma/shell build`: verde.

## Hashes de bundle

- Antes del hito (Hito 5): `index-CdwiM77E.js`.
- Después (redesplegado con `deploy/ejec-shell.bat`): `index-BgnRfGH_.js`,
  verificado servido en `http://localhost:8080/`.
- `space-server` redesplegado con `deploy/ejec-space-server.bat`; Caddy
  reiniciado manualmente (`docker restart deploy-caddy-1`) para recargar
  la nueva ruta `/rooms` del `Caddyfile` — el compose `up -d` no detecta
  cambios en el contenido de un archivo montado por bind mount, solo en la
  definición del servicio, así que un simple redeploy vía script no basta
  para cambios de `Caddyfile`; queda documentado aquí para futuros hitos
  que toquen el proxy.
- `GET http://localhost:8080/rooms` verificado end-to-end (Caddy →
  space-server): `[]` en reposo.

## Arnés de depuración

`shell/debug.html` y `shell/src/debug-space.ts` (idénticos en patrón al
usado para la puerta de latencia, con identidad de usuario fabricada) se
recrearon temporalmente junto con un proxy WS/`+rooms` temporal en
`shell/vite.config.ts`, se usaron para toda la verificación runtime
descrita arriba, y se borraron/revirtieron antes de este commit
(`git status --short shell/` sin rastro; `git diff shell/vite.config.ts`
limpio).

## Desviaciones del plan

- El bug de `switchRoom()` (ver arriba) no estaba previsto en el plan;
  se diagnosticó y corrigió durante la Task H2 de verificación runtime,
  y el archivo afectado (`space-multiplayer.ts`) se incluye en este commit
  junto con un comentario explicando la causa raíz.
- El conteo de tests Go mencionado en el plan como "10 preexistentes"
  era impreciso (son 9); el número real y verificado es 22/22 en total
  (9+10 en `hub_test.go` + 3 en `store_test.go`). No afecta ningún
  criterio de aceptación, solo la cifra exacta reportada.
- Observación menor (no bug): al arrancar en la parrilla de salida en el
  slot 0, la nave queda posicionada exactamente sobre `waypoints[0]`, que
  también es la posición del primer checkpoint — el primer checkpoint se
  marca alcanzado en el primer frame de carrera. Cosmético, no viola
  ningún criterio de aceptación (el circuito y el conteo de checkpoints
  siguen siendo correctos); no se ajustó para no alterar `race-grid.ts`
  sin necesidad.

## Bloqueos

Ninguno.
