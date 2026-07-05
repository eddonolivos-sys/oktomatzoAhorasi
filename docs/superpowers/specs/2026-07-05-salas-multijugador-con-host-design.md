# Salas multijugador con host — diseño

Fecha: 2026-07-05 · Rama: `ramatzo` · Alcance: `services/space-server/*.go` (refactor de salas) + `proxy/Caddyfile` + `Makefile` + `shell/src/space/space-multiplayer.ts` (protocolo) + nuevos `race-grid.ts`/`rooms-panel.ts` + costura en `space-engine.ts`/`space-config.ts`/`space.css`.

## Contexto y proceso

Hito 6 del master plan (`docs/superpowers/plans/2026-07-04-master-plan-ramatzo.md`), marcado `[SPEC PROPIO]` y **condicionado** a la puerta de latencia. La puerta ya se midió y PASÓ (`docs/superpowers/notes/2026-07-05-puerta-latencia-hito-6.md`, commit `8ed5c04`): p95 8.5ms con 5 naves remotas en la zona de carrera (presupuesto ≤10.6ms), RTT 1.1-1.8ms (presupuesto <120ms), 0 mensajes perdidos. El hito procede sin condicionamientos.

**Nota de proceso:** sesión de ejecución autónoma continua, con libertad técnica ya concedida por el usuario para decisiones de arquitecto reversibles (precedente: Hitos 1 y 5). Las decisiones de abajo las tomé yo, documentadas con su justificación, abiertas a revisión posterior.

El master plan YA fija alcance y arquitectura de alto nivel (no se cuestionan aquí):
- Servidor: `rooms map[string]map[*Client]bool` → `map[string]*Room` con `Room{clients, host *Client, phase string}`; primer usuario = host al crear sala; transferencia al salir el host; sala vacía se destruye (ya ocurre, se conserva); `hostId`+`phase` viajan EN CADA `state_update` (no solo como evento, por si el envío no bloqueante lo descarta); `start_race` validado contra `c == room.host`; throttle de escritura Redis a 1x/s o al desconectar; cap de salas + validación de `?room=`; `GET /rooms`.
- Cliente: al aproximarse a la zona de carrera (sin capturar la nave): panel de salas (fetch `/rooms`) + crear/unirse; en sala, fase lobby = naves fijas en línea de salida (controles bloqueados, patrón del bloqueo orbital del Hito 1), el host ve "Iniciar carrera"; countdown sincronizado por mensaje de fase; salir de sala (si sale el host → transferencia visible).
- Riesgos aceptados tal cual (documentados, no se resuelven aquí): identidad débil (id por query param, sin auth); reconexión del host entra como usuario nuevo; sin `-race` en Docker (Windows sin CGO).

## Estado actual verificado (antes del hito)

- `services/space-server/hub.go`: `Hub{mu sync.RWMutex, rooms map[string]map[*Client]bool, store Store}`. `register` (líneas 82-104) inserta al cliente y crea la sala lazy; `unregister` (130-142) borra al cliente y destruye la sala si queda vacía; `applyState` (148-169) hace `Save` a Redis en CADA llamada (sin throttle); `tickRoom`/`tickAll` (183-198) difunden `state_update` con solo `Players`.
- `services/space-server/types.go`: `ServerMessage` (28-36) sin campos de host/fase. `ClientMessage.Type` acepta `"state"|"emote"|"ping"` (main.go:70-80), no hay `"start_race"`.
- `services/space-server/main.go`: `handleSpaceWS` (22-54) no valida `room` ni aplica cap; rutas HTTP actuales solo `/space-ws` y `/health` (111-117).
- `services/space-server/hub_test.go`: 10 tests existentes con miniredis (incluye `TestHub_RoomIsolation`), patrón `newClient`/`drain`/`hubWithStore` reutilizable tal cual.
- `proxy/Caddyfile`: sin ruta `/rooms` (ni en el bloque de producción ni en el de desarrollo `:8080`).
- `Makefile`: `test-backend` existe; no hay target para `services/space-server`.
- `shell/src/space/space-multiplayer.ts`: `SpaceMultiplayer` conecta UNA vez en `mount()` a la sala fija `'home'` (`space-engine.ts:318`); no hay forma de cambiar de sala ni de enviar `start_race`.
- `shell/src/space/ship-controller.ts`: `setOrbiting(on)` (líneas 135-139) ya congela posición+mirada+empuje — es el "bloqueo de controles" que pide el master plan para el lobby, reutilizable tal cual.

## Decisiones de diseño (mías, documentadas para revisión)

### Decisión 1 — Progreso de carrera: local por cliente, NO sincronizado por el servidor
El master plan pide compartir la MISMA pista y código del Hito 5, y sincronizar host/fase/inicio — pero los criterios de aceptación NO piden un marcador de posiciones ni un ranking de llegada sincronizado. Decisión: cada cliente ejecuta su PROPIA `race-state.ts` (`startRace`/`stepRace`, sin cambios) de forma independiente, igual que en single-player; el servidor solo sincroniza **quién es el host**, **la fase de la sala** (`lobby`/`racing`) y **la presencia** (posición/yaw de cada nave, ya existente). Ves a los demás corriendo la MISMA pista determinista (misma semilla) a tu lado, pero cada uno gestiona sus propios checkpoints/vueltas/respawns localmente — exactamente como ya lo hace el Hito 5, sin duplicar esa lógica en el servidor. Esto evita construir un protocolo de replicación de estado de carrera (fuera de alcance de los criterios) y reutiliza el 100% del código del Hito 5 sin tocarlo.

### Decisión 2 — Fases: solo `lobby` y `racing` (sin `countdown` en el protocolo)
"Countdown sincronizado por mensaje de fase" se resuelve SIN añadir una tercera fase en el servidor: cuando el cliente observa el flip `lobby`→`racing` en `state_update` (recibido por todos los clientes de la sala casi al mismo tiempo, RTT <2 ms en local), arranca una cuenta atrás LOCAL fija de `ROOMS_CONFIG.countdownSeconds` (3 s) con la nave aún congelada (`setOrbiting(true)`); al terminar, descongela y llama `startRace()`. La sincronización real es el momento en que TODOS ven el mismo mensaje de fase, no un timestamp numérico coordinado — más simple, sin problemas de reloj, y evita una fase extra que el servidor tendría que temporizar él mismo.

### Decisión 3 — Una sola sala a la vez: cambiar de sala reemplaza la conexión a `'home'`
El cliente mantiene UNA única conexión `SpaceMultiplayer`. Entrar a una sala de carrera hace `switchRoom('race:XXXX')` (desconecta de `'home'` y reconecta a la nueva sala con el mismo `id`/`name`); salir de la sala hace `switchRoom('home')`. Mientras estás en una sala de carrera NO ves ni eres visto por los exploradores de `'home'` — es una instancia dedicada, coherente con el concepto de "sala" que describe el master plan (distinto de la presencia general siempre activa). Alternativa descartada: mantener dos conexiones WS simultáneas (una a `home`, otra a la sala) — innecesariamente complejo para lo que pide el hito, y el servidor ya aísla por sala así que no hay beneficio de mezclar ambas vistas.

### Decisión 4 — Creación de sala: código corto generado por el cliente, sin formulario de texto
"Crear sala" no pide un nombre por teclado (evita validar/sanear texto libre en el cliente): al pulsar "Crear sala" se genera un código de 4 caracteres (alfabeto sin ambiguos `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, sin `0/O/1/I`) y se conecta a `race:<código>`. El servidor no conoce el prefijo `race:` — es una convención puramente del cliente para poder filtrar en el listado (Decisión 5). Unirse a una sala existente es un clic sobre una fila del listado (usa el `name` devuelto por `GET /rooms` tal cual).

### Decisión 5 — `GET /rooms` es genérico; el cliente filtra por prefijo `race:`
El servidor no necesita saber qué es una "sala de carrera" — devuelve TODAS las salas activas (`[]RoomInfo{Name, Count, Phase}`) bajo `RLock`. El panel de salas del cliente solo muestra las que empiezan por `race:` (oculta `'home'` y cualquier otra sala futura). Las salas con `Phase:"racing"` se listan pero sin botón "Unirse" (evita que alguien entre a mitad de una carrera en curso con la nave congelada sin cuenta atrás que la libere).

### Decisión 6 — Parrilla de salida: posición determinista por índice en la lista de jugadores de la sala
"Naves fijas en línea de salida" se resuelve con una función PURA nueva (`race-grid.ts`, ver Arquitectura) que, dados los `waypoints` de la pista (Hito 5, misma semilla) y un índice de fila, devuelve una posición lateral junto a `waypoints[0]`, perpendicular a la dirección `waypoints[0]→waypoints[1]`. El índice de cada jugador es su posición (ordenada por `id`) dentro de la lista de jugadores de la sala que llega en cada `state_update` — se recalcula y reaplica CADA frame mientras `phase==='lobby'` (barato: un `position.set`), así que si alguien más se une o sale antes del inicio, las naves se reacomodan solas sin lógica adicional (mismo espíritu "autocorrectivo" que ya usa el master plan para host/fase).

### Decisión 7 — Cap de salas y validación de nombre: límites fijos en el servidor, rechazo por cierre de conexión
`maxRooms = 20` (Go const). Nombre de sala validado contra `^[a-zA-Z0-9_:-]{1,32}$` (permite el prefijo `race:` del cliente y `home`). Si el nombre es inválido O la sala no existe aún y ya se alcanzó el cap, el servidor cierra la conexión WS inmediatamente tras el upgrade (antes de `hub.register`), sin registrar al cliente. El cliente interpreta un cierre inmediato (sin haber recibido nunca un mensaje `"players"`) como fallo de conexión a esa sala y vuelve a `'home'`.

### Decisión 8 — Throttle de Redis: 1x/s por cliente + flush garantizado al desconectar
`Client` gana un campo `lastSaved time.Time` (protegido por el mismo `Hub.mu`). `applyState` solo llama a `store.Save` si pasó ≥1s desde el último guardado de ESE cliente; `unregister` fuerza un `Save` final (sin importar el throttle) antes de cerrar, para no perder la última posición conocida. Esto no cambia la frecuencia de `state_update` (sigue en `tickHz=18`) ni el throttle de envío del cliente (sigue en 20 Hz) — solo reduce la escritura a Redis, que es el recurso caro mencionado por el master plan.

## Arquitectura

### Servidor (`services/space-server/`)

**`hub.go` — cambios:**
```go
type Client struct {
	conn      wsConn
	send      chan []byte
	room      string
	state     PlayerState
	lastSaved time.Time // Decisión 8: throttle de Save a Redis
}

type Room struct {
	clients map[*Client]bool
	host    *Client
	phase   string // "lobby" | "racing"
}

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	store Store
}

const maxRooms = 20
const saveThrottle = time.Second
```
- `newHub`: `rooms: make(map[string]*Room)`.
- `roomSnapshot(room string) (players []PlayerState, hostID string, phase string, ok bool)`: sustituye a `roomPlayers` como fuente ÚNICA para `tickRoom`/`register` (una sola `RLock`, evita leer host/players en dos pasadas separadas con riesgo de que la sala se destruya entre medias).
- `register`: si `h.rooms[c.room] == nil`, crea `&Room{clients: map[*Client]bool{}, host: c, phase: "lobby"}` (el creador es host); si ya existe, añade el cliente al mapa `clients` existente SIN tocar `host`/`phase`. `c.send1` y `broadcastJoined` usan `roomSnapshot` para incluir `HostID`/`Phase`.
- `unregister`: si `c == room.host` y quedan otros clientes, transferir el host a cualquier otro cliente restante (iterar el mapa, primer valor — el orden de un mapa Go es no determinista pero determinista-por-ejecución no es un requisito; el criterio de aceptación solo pide que "alguien" tome el rol). Guardar el estado final a Redis (`h.store.Save`, ignorando el throttle) ANTES de `close(c.send)`. Si la sala queda vacía, se destruye igual que hoy.
- `applyState`: aplica el throttle de Decisión 8 (compara `time.Since(c.lastSaved)` bajo el lock, actualiza `c.lastSaved` si toca guardar, libera el lock, y solo entonces llama `store.Save` si correspondía).
- `startRace(c *Client)`: bajo lock, si `h.rooms[c.room] != nil && h.rooms[c.room].host == c`, pone `phase = "racing"`. Si `c` no es el host, no hace nada (silencioso; el cliente ya oculta el botón de inicio a los no-host, esto es solo la validación de servidor que pide el master plan).
- `tickRoom`/`tickAll`: usan `roomSnapshot` para incluir `HostID`/`Phase` en el `state_update`.
- `validRoomName(name string) bool`: regex `^[a-zA-Z0-9_:-]{1,32}$`, función pura de paquete.
- `canJoinRoom(room string) bool`: bajo `RLock`, `true` si la sala ya existe O `len(h.rooms) < maxRooms`.

**`types.go` — cambios:**
```go
type ServerMessage struct {
	Type    string        `json:"type"`
	Players []PlayerState `json:"players,omitempty"`
	Player  *PlayerState  `json:"player,omitempty"`
	ID      string        `json:"id,omitempty"`
	Emoji   string        `json:"emoji,omitempty"`
	T       *float64      `json:"t,omitempty"`
	HostID  string        `json:"hostId,omitempty"` // NUEVO: viaja en "players" y "state_update"
	Phase   string        `json:"phase,omitempty"`  // NUEVO: "lobby" | "racing"
}
```
`ClientMessage` no gana campos nuevos — `start_race` se distingue solo por `Type`.

```go
// RoomInfo is one row of the GET /rooms listing.
type RoomInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Phase string `json:"phase"`
}
```

**`main.go` — cambios:**
- En `handleSpaceWS`, tras resolver `room`/`id`/`name` y ANTES de `hub.register`: si `!validRoomName(room)` o `!hub.canJoinRoom(room)`, cerrar la conexión (`conn.Close()`) y `return` sin registrar.
- Switch de `readPump`: añadir `case "start_race": hub.startRace(c)`.
- Nueva ruta `GET /rooms`: `http.HandleFunc("/rooms", func(w, r) { ... })` que llama a un nuevo `Hub.listRooms() []RoomInfo` (bajo `RLock`, recorre `h.rooms` devolviendo `{Name, Count: len(clients), Phase}`) y escribe JSON. `RoomInfo` se define en `types.go`.

**`hub_test.go` — tests nuevos (además de conservar los 10 existentes sin modificar, que deben seguir pasando con el nuevo tipo `*Room`):**
- `TestHub_FirstJoinBecomesHost`: el primer cliente en una sala nueva es `room.host`.
- `TestHub_SecondJoinDoesNotBecomeHost`: el segundo cliente en una sala existente NO reemplaza al host.
- `TestHub_HostTransferOnLeave`: con 2 clientes, `unregister` del host transfiere el rol al restante (verificable vía el `HostID` del siguiente `state_update`/`roomSnapshot`).
- `TestHub_StartRaceOnlyByHost`: `startRace` desde el host cambia `phase` a `"racing"`; desde un no-host, `phase` permanece `"lobby"`.
- `TestHub_StateUpdateIncludesHostAndPhase`: `tickRoom` produce un `state_update` con `HostID`/`Phase` correctos.
- `TestHub_RoomDestroyedWhenEmptyStillWorks`: adaptar el spíritu del test ya implícito en `unregister` (líneas 130-142) al nuevo tipo `*Room` — última salida borra la entrada de `h.rooms`.
- `TestHub_ApplyStateThrottlesRedisSaves`: dos `applyState` seguidos (mismo cliente, <1s de diferencia) solo persisten una vez; usar un store de prueba que cuenta llamadas a `Save` (fake `Store`, no `RedisStore`, para no depender de temporización real de miniredis).
- `TestHub_UnregisterFlushesFinalState`: `unregister` persiste el último estado aunque el throttle no haya vencido.
- `TestValidRoomName`: acepta `"home"`, `"race:AB12"`; rechaza cadena vacía, con espacios, o >32 caracteres.
- `TestHub_CanJoinRoom_RespectsCap`: con `maxRooms` salas ya creadas, una sala NUEVA es rechazada; una EXISTENTE sigue aceptando clientes.

### Proxy (`proxy/Caddyfile`)
Añadir, en AMBOS bloques (producción y `:8080` desarrollo), justo después del `handle /space-ws`:
```
handle /rooms {
	reverse_proxy space-server:8080
}
```

### Build (`Makefile`)
Añadir junto a `test-backend` un target análogo:
```makefile
test-space-server:
	cd services/space-server && go test ./...
```

### Cliente puro (Vitest, sin Three.js)

**`shell/src/space/race-grid.ts` (nuevo):**
- `startingSlotPosition(waypoints: V3[], slotIndex: number, spacing: number): V3` — punto junto a `waypoints[0]`, desplazado `slotIndex * spacing` a lo largo de la perpendicular (en el plano XZ) a la dirección `waypoints[0]→waypoints[1]`; `slotIndex` puede ser negativo (alterna lados: 0, 1, -1, 2, -2... calculado por quien llama, ver cableado). Reutiliza `sub`/`normalize` de `vec3-math.ts`.
- Tests: `slotIndex=0` devuelve `waypoints[0]` exactamente; `slotIndex=1` y `slotIndex=-1` quedan a `spacing` de distancia en direcciones opuestas; la posición resultante conserva la `y` de `waypoints[0]` (parrilla plana, no desplaza verticalmente); con menos de 2 waypoints devuelve `waypoints[0]` (o `{0,0,0}` si la lista está vacía) sin lanzar excepción.

### Cliente impuro (sin tests unitarios, verificado en runtime — mismo patrón que `race-render.ts`/`remote-ships.ts`)

**`shell/src/space/space-multiplayer.ts` — cambios:**
- `Player`/mensajes: `handleMessage` extrae `hostId`/`phase` de los mensajes `"players"` y `"state_update"` y los reporta vía un nuevo callback `onRoomState: (hostId: string, phase: string) => void` (añadido a `SpaceMultiplayerHandlers`), llamado ANTES o DESPUÉS de `onPlayers` indistintamente (no hay orden implícito requerido).
- `sendStartRace()`: `this.ws.send(JSON.stringify({type:'start_race'}))` (mismo guard de `readyState` que `sendEmote`).
- `switchRoom(room: string)`: equivalente a `disconnect()` + `connect({room, id: this.opts.id, name: this.opts.name})`, reutilizando el `id`/`name` ya guardados en `this.opts` (lanza si `connect()` no se llamó antes, igual que el resto de métodos que asumen `this.opts` no nulo).

**`shell/src/space/rooms-panel.ts` (nuevo, patrón de `race-hud.ts`/`perf-hud.ts`):**
- Clase `RoomsPanel` con:
  - `showList(rooms: {name: string; count: number; phase: string}[]): void` — filtra por prefijo `race:` para mostrar; cada fila con nombre corto (sin el prefijo), conteo, y un botón "Unirse" (deshabilitado si `phase==='racing'`); un botón fijo "Crear sala nueva".
  - `showLobby(opts: {room: string; players: {id:string; name:string}[]; hostId: string; selfId: string; countdown: number | null}): void` — lista de jugadores (marca visualmente al host), botón "Iniciar carrera" SOLO si `selfId === hostId` y `countdown === null`, texto "Esperando al host..." en caso contrario; si `countdown !== null`, muestra el número grande en vez de la lista.
  - `hide(): void`.
  - Callbacks inyectados por constructor: `onCreateRoom: () => void`, `onJoinRoom: (name: string) => void`, `onStartRace: () => void`, `onLeaveRoom: () => void` (botón "Salir" visible en ambos estados: lista y lobby).
  - `dispose(): void`.

**`shell/src/space/space-config.ts` — nuevo bloque:**
```ts
/** Salas multijugador con host (Hito 6). */
export const ROOMS_CONFIG = {
  enabled: true, // [UNIFORME] kill-switch, mismo patrón que RACE_CONFIG.enabled
  countdownSeconds: 3, // [PERSONALIZABLE] cuenta atrás local tras el flip lobby->racing
  startLineSpacing: 60, // [UNIFORME] separación lateral entre naves en la parrilla de salida
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // [UNIFORME] sin 0/O/1/I (Decisión 4)
  roomCodeLength: 4, // [UNIFORME]
  roomsListRefreshMs: 2000, // [UNIFORME] refresco del listado mientras el panel está abierto
};
```

**Cableado en `space-engine.ts`:**
- Nuevos campos: `raceRoom: { name: string; hostId: string; phase: 'lobby'|'racing'; players: Player[] } | null`, `roomsPanel: RoomsPanel | null`, `roomCountdown: number | null`, `roomsPanelVisible: boolean`, `roomsListTimer: number | null`.
- `mount()`: crea `this.roomsPanel` (si `ROOMS_CONFIG.enabled`) con los callbacks:
  - `onCreateRoom`: genera código con `ROOMS_CONFIG.roomCodeAlphabet`/`roomCodeLength`, `this.multiplayer?.switchRoom('race:' + code)`, `this.raceRoom = {name:'race:'+code, hostId:'', phase:'lobby', players:[]}`.
  - `onJoinRoom(name)`: `this.multiplayer?.switchRoom(name)`, `this.raceRoom = {name, hostId:'', phase:'lobby', players:[]}`.
  - `onStartRace`: `this.multiplayer?.sendStartRace()`.
  - `onLeaveRoom`: función `leaveRaceRoom()` compartida (ver abajo).
- El callback `onRoomState` de `SpaceMultiplayer` (pasado en la construcción existente de `SpaceMultiplayer`, junto a `onPlayers`/`onJoined`/etc.) actualiza `this.raceRoom.hostId/phase` cuando `this.raceRoom !== null`; detecta el flip `lobby`→`racing` (comparando con el valor previo) y arranca `this.roomCountdown = ROOMS_CONFIG.countdownSeconds`.
- El callback `onPlayers` existente (línea 310) gana una línea: si `this.raceRoom !== null`, también `this.raceRoom.players = players`.
- Tecla **R** (nueva, libre — no colisiona con E/Q/C/P/Esc/WASD/Shift/flechas): dentro de `onKeyDown`, si `this.raceZoneActive` y `this.raceState.phase !== 'racing'` (no interrumpe una carrera SP en curso) y `ROOMS_CONFIG.enabled`: alterna `this.roomsPanelVisible`; al abrir sin `raceRoom` activo, hace fetch de `/rooms` y llama `roomsPanel.showList(...)`, arrancando `roomsListTimer` (refresco cada `roomsListRefreshMs` mientras esté visible y sin sala unida); al abrir con `raceRoom` activo, muestra `showLobby(...)` en su lugar (sin fetch).
- Tecla **Q**: unifica el abandono — si `this.raceRoom !== null`, llama `leaveRaceRoom()` (además de resetear `raceState` a `idle` si estaba `racing`); si no, conserva el comportamiento actual (solo resetea `raceState`).
- `leaveRaceRoom()`: `this.multiplayer?.switchRoom('home')`, `this.raceRoom = null`, `this.roomCountdown = null`, `this.ship.setOrbiting(false)`, `this.raceState = {phase:'idle', currentCheckpoint:0, lap:0, offTrackSeconds:0}`, `this.roomsPanel?.hide()`, limpia `roomsListTimer`.
- Bloque por frame (junto al bloque existente de carrera, líneas ~446-527): si `this.raceRoom !== null`:
  - Si `phase === 'lobby'`: `ship.setOrbiting(true)`; calcula el índice propio ordenando `raceRoom.players` por `id` y buscando `selfId`; alterna signo para repartir a ambos lados (`index=0→0, 1→+1, 2→-1, 3→+2...`); `startingSlotPosition(raceTrack.waypoints, signedIndex, ROOMS_CONFIG.startLineSpacing)` + suma `raceGroupPos`; `ship.object.position.set(...)`; `roomsPanel.showLobby(...)` con el `countdown` actual si `roomCountdown !== null` (decrementado por `delta` cada frame; al llegar a 0: `ship.setOrbiting(false)`, `this.raceState = startRace()`, `roomCountdown = null`, `roomsPanel.hide()` — a partir de aquí el bloque YA EXISTENTE de Hito 5 (líneas 447-527) toma el control exactamente igual que en single-player, sin cambios).
  - Si `phase === 'racing'`: no hace nada especial — el bloque existente de Hito 5 ya cubre `raceState.phase==='racing'` sea cual sea el origen (SP o sala).
- `dispose()`: `this.roomsPanel?.dispose()`, limpia `roomsListTimer` si activo.

**`shell/src/space/space.css` — nuevo bloque `#roomsPanel`:** overlay fijo centrado, paleta ámbar/crema sobria (mismo lenguaje visual que `#raceHud`/`shell-settings.css`: fondo oscuro semitransparente, borde sutil, tipografía monoespaciada para el conteo/countdown), filas de sala con hover sutil, botón "Iniciar carrera" en ámbar sólido (`#E6A817`) reservado al host, resto de botones en contorno.

## Flujo de datos

1. Jugador entra en `raceZoneActive` (igual que Hito 5) → puede pulsar **E** para carrera SP (sin cambios) o **R** para abrir el panel de salas.
2. **R** sin sala activa → `GET /rooms` → `roomsPanel.showList(...)` filtrado a `race:*`.
3. "Crear sala" o clic en una fila → `switchRoom(...)` + `raceRoom` local inicializado; servidor responde con `"players"` (incluye `hostId`/`phase` ya calculados en el `register`).
4. Mientras `phase==='lobby'`: naves de todos los jugadores de la sala congeladas en la parrilla (recalculada cada frame por índice); host ve "Iniciar carrera", el resto "Esperando al host...".
5. Host pulsa **E**/botón → `sendStartRace()` → servidor valida host, `phase="racing"` → próximo `state_update` (≤1/18s) lo propaga a todos.
6. Cada cliente detecta el flip vía `onRoomState`, arranca `roomCountdown` local (3s, naves aún congeladas) y al llegar a 0 descongela + `startRace()` local — desde aquí, código del Hito 5 sin cambios, por jugador.
7. **Q** o botón "Salir" en cualquier momento → `leaveRaceRoom()` → vuelve a `'home'`, sala se destruye en el servidor si quedó vacía (o transfiere host si no).

## Testing

- Go (`services/space-server`, miniredis): los 10 tests existentes + los 10 nuevos listados arriba (host al crear, host no se reemplaza, transferencia al salir, `start_race` solo-host, `hostId`/`phase` en el tick, destrucción de sala con el nuevo tipo, throttle de Redis, flush al desconectar, validación de nombre, cap de salas).
- Vitest puro: `race-grid.test.ts` (nuevo).
- Verificación runtime: Go tests vía `go test ./...` en `services/space-server`; cliente real (arnés dev + stack real, mismo método que la puerta de latencia) + clientes WebSocket simulados actuando como "segundo jugador" para observar desde el cliente real: creación de sala (yo = host), un segundo cliente simulado uniéndose (aparece en el lobby, no ve el botón de inicio), inicio de carrera (countdown + arranque), y el caso de transferencia de host simulando la desconexión del cliente WS que se unió primero mientras un segundo permanece.
- Redeploy real de `space-server` (`deploy/ejec-space-server.bat`) + `shell` (`deploy/ejec-shell.bat`) y verificación de hash/comportamiento en `localhost:8080`.

## Riesgos y notas

- El progreso de carrera NO sincronizado (Decisión 1) significa que no hay "posición 1º/2º/3º" visible — cada quien ve su propio HUD de carrera (checkpoint/vuelta) como en single-player, solo que ahora ve las naves de los demás moviéndose alrededor. Es una limitación consciente, documentada, y no contradice ningún criterio de aceptación del master plan.
- El orden de transferencia de host al salir (`unregister`) no es determinista (iteración de mapa Go) — aceptable porque el criterio de aceptación solo exige que "alguien" tome el rol, no un orden específico (p. ej. el más antiguo).
- La parrilla de salida (Decisión 6) puede reacomodar naves ya congeladas si alguien más se une justo antes del inicio — es una superficie pequeña (unos frames) y el propio master plan ya acepta ese tipo de "autocorrección" para host/fase; se documenta como comportamiento esperado, no como bug.
- No se implementa reconexión-como-mismo-jugador dentro de una sala (ya aceptado como riesgo conocido por el master plan): si el host recarga la página, entra como cliente nuevo y ya ocurrió la transferencia.
