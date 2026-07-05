# Hito 6 — Salas multijugador con host — Plan de implementación

> **Para ejecutores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Objetivo:** salas multijugador de carrera con host (crear/unirse, lobby con naves congeladas en parrilla, inicio sincronizado por el host, transferencia de host, destrucción de sala vacía), sobre la infraestructura de presencia por salas ya existente en `space-server`.

**Arquitectura:** servidor Go (`services/space-server`) pasa de `map[string]map[*Client]bool` a `map[string]*Room{clients, host, phase}`; `hostId`/`phase` viajan en cada `state_update`/`players`; nuevo mensaje `start_race` validado contra el host; throttle de Redis a 1x/s + flush al desconectar; `GET /rooms`. Cliente: `SpaceMultiplayer` gana `switchRoom()`/`sendStartRace()`; nuevo módulo puro `race-grid.ts` (parrilla de salida) y nuevo componente `rooms-panel.ts` (listado + lobby); `space-engine.ts` los cablea reutilizando el 100% del código de carrera del Hito 5 (progreso de carrera local, no replicado por el servidor).

**Tech Stack:** Go 1.22 + gorilla/websocket + go-redis + miniredis (servidor); TypeScript + Vitest (cliente puro); Lit/vanilla DOM (cliente impuro); Caddy (proxy).

**Spec:** `docs/superpowers/specs/2026-07-05-salas-multijugador-con-host-design.md` (8 decisiones de diseño documentadas ahí, no se repiten aquí).

---

## Grupo A — Servidor: `Room`, host, fase, throttle de Redis

**Archivos:**
- Modificar: `services/space-server/hub.go` (reescritura completa, ver abajo)
- Modificar: `services/space-server/types.go` (reescritura completa, ver abajo)
- Modificar: `services/space-server/hub_test.go` (añadir tests, conservar los 10 existentes sin cambios de comportamiento)
- Test: los mismos archivos `_test.go`

### Task A1: Reescribir `types.go` con `HostID`/`Phase`/`RoomInfo`

- [ ] **Paso 1: Reemplazar el contenido completo de `services/space-server/types.go`**

```go
package main

// PlayerState is the 3D presence record for one player (matches the wire Player shape).
type PlayerState struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Z    float64 `json:"z"`
	Yaw  float64 `json:"yaw"`
}

// ClientMessage is any JSON frame sent client -> server.
// x/y/z/yaw are pointers so we can tell "absent" from "0".
type ClientMessage struct {
	Type  string   `json:"type"`
	X     *float64 `json:"x,omitempty"`
	Y     *float64 `json:"y,omitempty"`
	Z     *float64 `json:"z,omitempty"`
	Yaw   *float64 `json:"yaw,omitempty"`
	Emoji string   `json:"emoji,omitempty"`
	// T is the client's local timestamp (ms) for a "ping" frame; echoed back
	// verbatim in "pong" so the client computes RTT = now - t.
	T *float64 `json:"t,omitempty"`
	// Type "start_race" carries no extra fields: the sender's room/identity are
	// already known from the connection; hub.startRace validates the sender is
	// that room's current host.
}

// ServerMessage is any JSON frame sent server -> client.
type ServerMessage struct {
	Type    string        `json:"type"`
	Players []PlayerState `json:"players,omitempty"`
	Player  *PlayerState  `json:"player,omitempty"`
	ID      string        `json:"id,omitempty"`
	Emoji   string        `json:"emoji,omitempty"`
	// T carries back the "t" from a "pong" frame (see ClientMessage.T).
	T *float64 `json:"t,omitempty"`
	// HostID and Phase (Hito 6) ride on every "players" and "state_update"
	// frame (not just a one-shot event): a dropped non-blocking send
	// self-corrects on the next tick instead of desyncing the client's UI.
	HostID string `json:"hostId,omitempty"`
	Phase  string `json:"phase,omitempty"`
}

// RoomInfo is one row of the GET /rooms listing (Hito 6).
type RoomInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Phase string `json:"phase"`
}
```

- [ ] **Paso 2: Verificar que compila (fallará hasta completar A2, es esperado)**

Run: `cd services/space-server && go build ./...`
Expected: errores de `hub.go` referenciando el tipo antiguo (aún no tocado) — normal, se resuelve en A2.

### Task A2: Reescribir `hub.go` con `Room{clients, host, phase}`, throttle y `startRace`

- [ ] **Paso 1: Reemplazar el contenido completo de `services/space-server/hub.go`**

```go
package main

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"sync"
	"time"
)

// Client is one connected presence. send is buffered; tests fill state/room directly.
type Client struct {
	conn      wsConn
	send      chan []byte
	room      string
	state     PlayerState
	lastSaved time.Time // Hito 6: throttles Redis Save to saveThrottle
}

// wsConn is the minimal websocket surface the hub/pumps use (kept here so the
// hub package compiles without importing gorilla in tests).
type wsConn interface {
	ReadMessage() (int, []byte, error)
	WriteMessage(messageType int, data []byte) error
	Close() error
}

// Room holds one room's clients plus its host and lifecycle phase (Hito 6).
type Room struct {
	clients map[*Client]bool
	host    *Client
	phase   string // "lobby" | "racing"
}

// Hub holds presence keyed by room and persists durable state via store.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	store Store
}

// maxRooms caps the number of simultaneously active rooms (Hito 6).
const maxRooms = 20

// saveThrottle bounds how often a single client's state is persisted to Redis.
const saveThrottle = time.Second

var roomNameRe = regexp.MustCompile(`^[a-zA-Z0-9_:-]{1,32}$`)

// validRoomName reports whether name is an acceptable room identifier.
func validRoomName(name string) bool {
	return roomNameRe.MatchString(name)
}

func newHub(store Store) *Hub {
	return &Hub{
		rooms: make(map[string]*Room),
		store: store,
	}
}

// canJoinRoom reports whether a client may join room: existing rooms always
// accept more clients; a brand-new room name is rejected once maxRooms is reached.
func (h *Hub) canJoinRoom(room string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if _, ok := h.rooms[room]; ok {
		return true
	}
	return len(h.rooms) < maxRooms
}

// roomSnapshot returns players, the current host id, and phase for room in a
// single locked read (avoids reading host/phase and players in two separate
// lock windows, which could race with the room being destroyed in between).
func (h *Hub) roomSnapshot(room string) (players []PlayerState, hostID string, phase string, ok bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r := h.rooms[room]
	if r == nil {
		return nil, "", "", false
	}
	players = make([]PlayerState, 0, len(r.clients))
	for c := range r.clients {
		players = append(players, c.state)
	}
	if r.host != nil {
		hostID = r.host.state.ID
	}
	return players, hostID, r.phase, true
}

// listRooms returns a snapshot of every active room for GET /rooms.
func (h *Hub) listRooms() []RoomInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]RoomInfo, 0, len(h.rooms))
	for name, r := range h.rooms {
		out = append(out, RoomInfo{Name: name, Count: len(r.clients), Phase: r.phase})
	}
	return out
}

// broadcastRoom marshals msg once and pushes to every client in room.
func (h *Hub) broadcastRoom(room string, msg ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	r := h.rooms[room]
	if r == nil {
		return
	}
	for c := range r.clients {
		select {
		case c.send <- data:
		default:
		}
	}
}

// send1 pushes a single message to one client (snapshot on join).
func (c *Client) send1(msg ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

// register adds a client to its room, restores persisted state if present,
// sends it the room snapshot, then broadcasts "joined" to the room. The
// first client to join a brand-new room becomes its host (Hito 6).
func (h *Hub) register(ctx context.Context, c *Client) {
	// Redis I/O is done WITHOUT the lock; only the assignment to c.state and the
	// insertion into the room map happen under h.mu, before c becomes visible to
	// readers (roomSnapshot/tick) that hold RLock.
	prev, ok, err := h.store.Restore(ctx, c.state.ID)
	if err != nil {
		log.Printf("restore %s: %v", c.state.ID, err)
	}

	h.mu.Lock()
	if ok {
		// Keep the (fresh) name/id from the query; restore position+yaw.
		c.state.X, c.state.Y, c.state.Z, c.state.Yaw = prev.X, prev.Y, prev.Z, prev.Yaw
	}
	r := h.rooms[c.room]
	if r == nil {
		r = &Room{clients: make(map[*Client]bool), host: c, phase: "lobby"}
		h.rooms[c.room] = r
	}
	r.clients[c] = true
	h.mu.Unlock()

	players, hostID, phase, _ := h.roomSnapshot(c.room)
	c.send1(ServerMessage{Type: "players", Players: players, HostID: hostID, Phase: phase})
	h.broadcastJoined(c)
}

// broadcastJoined notifies peers (NOT the joiner) that c arrived.
func (h *Hub) broadcastJoined(c *Client) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	// Marshal a COPY of c.state taken under the lock: c is already in the room
	// map, so other goroutines (the tick) may read it concurrently; we must not
	// marshal the live &c.state without the lock held.
	state := c.state
	data, err := json.Marshal(ServerMessage{Type: "joined", Player: &state})
	if err != nil {
		return
	}
	r := h.rooms[c.room]
	if r == nil {
		return
	}
	for peer := range r.clients {
		if peer == c {
			continue
		}
		select {
		case peer.send <- data:
		default:
		}
	}
}

// unregister removes c, transfers host if needed, flushes its final state to
// the store, and broadcasts "left" to the rest of its room.
func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	r := h.rooms[c.room]
	if r != nil {
		delete(r.clients, c)
		if r.host == c {
			r.host = nil
			for peer := range r.clients {
				r.host = peer
				break
			}
		}
		if len(r.clients) == 0 {
			delete(h.rooms, c.room)
		}
	}
	state := c.state
	room := c.room
	h.mu.Unlock()

	close(c.send)

	// Final flush (Hito 6): ignore the throttle so the last known position is
	// never lost just because the 1s window hadn't elapsed yet.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	if err := h.store.Save(ctx, state, room); err != nil {
		log.Printf("final save %s: %v", state.ID, err)
	}
	cancel()

	h.broadcastRoom(room, ServerMessage{Type: "left", ID: c.state.ID})
}

// applyState merges a "state" frame into the client and persists to the
// store, throttled to at most once per saveThrottle per client (Hito 6): the
// mutation of c.state is always applied under the lock (so readers that hold
// RLock are actually protected); the Redis Save is skipped when the client's
// last save is still fresh.
func (h *Hub) applyState(ctx context.Context, c *Client, msg ClientMessage) {
	h.mu.Lock()
	if msg.X != nil {
		c.state.X = *msg.X
	}
	if msg.Y != nil {
		c.state.Y = *msg.Y
	}
	if msg.Z != nil {
		c.state.Z = *msg.Z
	}
	if msg.Yaw != nil {
		c.state.Yaw = *msg.Yaw
	}
	shouldSave := time.Since(c.lastSaved) >= saveThrottle
	if shouldSave {
		c.lastSaved = time.Now()
	}
	state := c.state
	room := c.room
	h.mu.Unlock()

	if !shouldSave {
		return
	}
	if err := h.store.Save(ctx, state, room); err != nil {
		log.Printf("save %s: %v", state.ID, err)
	}
}

// emote broadcasts an emoji from c to the whole room.
func (h *Hub) emote(c *Client, emoji string) {
	h.broadcastRoom(c.room, ServerMessage{Type: "emote", ID: c.state.ID, Emoji: emoji})
}

// startRace flips a room's phase to "racing", but only when c is its current
// host (Hito 6). Silently ignored for non-hosts and unknown rooms — the
// client already hides the control from non-hosts; this is server-side
// validation, not user-facing feedback.
func (h *Hub) startRace(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.rooms[c.room]
	if r == nil || r.host != c {
		return
	}
	r.phase = "racing"
}

// pongFor builds the direct reply to a "ping" frame, echoing its timestamp
// unchanged (pure, no lock/IO: the RTT clock lives entirely on the client).
func pongFor(msg ClientMessage) ServerMessage {
	return ServerMessage{Type: "pong", T: msg.T}
}

// tickRoom broadcasts the current snapshot of one room as a state_update,
// including the room's host and phase (Hito 6) so a dropped one-shot event
// self-corrects on the next tick.
func (h *Hub) tickRoom(room string) {
	players, hostID, phase, ok := h.roomSnapshot(room)
	if !ok {
		return
	}
	h.broadcastRoom(room, ServerMessage{Type: "state_update", Players: players, HostID: hostID, Phase: phase})
}

// tickAll broadcasts state_update to every room (called by the server tick loop).
func (h *Hub) tickAll() {
	h.mu.RLock()
	roomNames := make([]string, 0, len(h.rooms))
	for r := range h.rooms {
		roomNames = append(roomNames, r)
	}
	h.mu.RUnlock()
	for _, r := range roomNames {
		h.tickRoom(r)
	}
}
```

- [ ] **Paso 2: Compilar**

Run: `cd services/space-server && go build ./...`
Expected: compila sin errores.

### Task A3: Añadir tests nuevos a `hub_test.go` (conservando los 10 existentes intactos)

- [ ] **Paso 1: Añadir `"fmt"` al bloque de imports de `services/space-server/hub_test.go`**

El bloque de imports actual es:
```go
import (
	"context"
	"encoding/json"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)
```
Reemplazar por:
```go
import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)
```

- [ ] **Paso 2: Añadir el helper `countingStore` y `hubWithCountingStore` justo después de `hubWithStore` (después de la línea `}` que la cierra)**

```go
// countingStore is a fake Store that counts Save calls without touching
// Redis, so throttle tests don't depend on real timing against miniredis.
type countingStore struct {
	mu    sync.Mutex
	saves int
}

func (s *countingStore) Save(ctx context.Context, p PlayerState, room string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saves++
	return nil
}

func (s *countingStore) Restore(ctx context.Context, id string) (PlayerState, bool, error) {
	return PlayerState{}, false, nil
}

func hubWithCountingStore() (*Hub, *countingStore) {
	s := &countingStore{}
	return newHub(s), s
}
```

- [ ] **Paso 3: Añadir los tests nuevos al final del archivo (después de `TestHub_ApplyStatePersists`)**

```go
func TestHub_FirstJoinBecomesHost(t *testing.T) {
	hub := hubWithStore(t)
	a := newClient("a", "A", "home")
	hub.register(context.Background(), a)
	_, hostID, phase, ok := hub.roomSnapshot("home")
	if !ok || hostID != "a" || phase != "lobby" {
		t.Fatalf("want host=a phase=lobby, got hostID=%q phase=%q ok=%v", hostID, phase, ok)
	}
}

func TestHub_SecondJoinDoesNotBecomeHost(t *testing.T) {
	hub := hubWithStore(t)
	a := newClient("a", "A", "home")
	b := newClient("b", "B", "home")
	hub.register(context.Background(), a)
	hub.register(context.Background(), b)
	_, hostID, _, _ := hub.roomSnapshot("home")
	if hostID != "a" {
		t.Fatalf("want host still a, got %q", hostID)
	}
}

func TestHub_HostTransferOnLeave(t *testing.T) {
	hub := hubWithStore(t)
	a := newClient("a", "A", "home")
	b := newClient("b", "B", "home")
	hub.register(context.Background(), a)
	hub.register(context.Background(), b)
	hub.unregister(a)
	_, hostID, _, ok := hub.roomSnapshot("home")
	if !ok || hostID != "b" {
		t.Fatalf("want host transferred to b, got hostID=%q ok=%v", hostID, ok)
	}
}

func TestHub_StartRaceOnlyByHost(t *testing.T) {
	hub := hubWithStore(t)
	a := newClient("a", "A", "home")
	b := newClient("b", "B", "home")
	hub.register(context.Background(), a)
	hub.register(context.Background(), b)

	hub.startRace(b) // non-host: no-op
	_, _, phase, _ := hub.roomSnapshot("home")
	if phase != "lobby" {
		t.Fatalf("non-host start_race must not change phase, got %q", phase)
	}

	hub.startRace(a) // host
	_, _, phase, _ = hub.roomSnapshot("home")
	if phase != "racing" {
		t.Fatalf("host start_race must set phase=racing, got %q", phase)
	}
}

func TestHub_StateUpdateIncludesHostAndPhase(t *testing.T) {
	hub := hubWithStore(t)
	a := newClient("a", "A", "home")
	hub.register(context.Background(), a)
	drain(a)

	hub.tickRoom("home")
	got := drain(a)
	if len(got) != 1 || got[0].Type != "state_update" {
		t.Fatalf("want state_update, got %+v", got)
	}
	if got[0].HostID != "a" || got[0].Phase != "lobby" {
		t.Fatalf("want hostId=a phase=lobby, got %+v", got[0])
	}
}

func TestHub_RoomDestroyedWhenEmptyStillWorks(t *testing.T) {
	hub := hubWithStore(t)
	a := newClient("a", "A", "home")
	hub.register(context.Background(), a)
	hub.unregister(a)
	if _, _, _, ok := hub.roomSnapshot("home"); ok {
		t.Fatalf("room should be destroyed when empty")
	}
}

func TestHub_ApplyStateThrottlesRedisSaves(t *testing.T) {
	hub, store := hubWithCountingStore()
	a := newClient("a", "A", "home")
	hub.register(context.Background(), a)

	x1, x2 := 1.0, 2.0
	hub.applyState(context.Background(), a, ClientMessage{Type: "state", X: &x1})
	hub.applyState(context.Background(), a, ClientMessage{Type: "state", X: &x2})

	store.mu.Lock()
	saves := store.saves
	store.mu.Unlock()
	if saves != 1 {
		t.Fatalf("want 1 throttled save, got %d", saves)
	}
}

func TestHub_UnregisterFlushesFinalState(t *testing.T) {
	hub, store := hubWithCountingStore()
	a := newClient("a", "A", "home")
	hub.register(context.Background(), a)

	x := 1.0
	hub.applyState(context.Background(), a, ClientMessage{Type: "state", X: &x})
	hub.unregister(a)

	store.mu.Lock()
	saves := store.saves
	store.mu.Unlock()
	if saves != 2 {
		t.Fatalf("want 2 saves (applyState + final flush), got %d", saves)
	}
}

func TestValidRoomName(t *testing.T) {
	valid := []string{"home", "race:AB12", "a", "abc-DEF_123"}
	for _, name := range valid {
		if !validRoomName(name) {
			t.Errorf("want %q valid", name)
		}
	}
	invalid := []string{"", "with space", "toolongtoolongtoolongtoolongtoolong12345"}
	for _, name := range invalid {
		if validRoomName(name) {
			t.Errorf("want %q invalid", name)
		}
	}
}

func TestHub_CanJoinRoom_RespectsCap(t *testing.T) {
	hub := hubWithStore(t)
	for i := 0; i < maxRooms; i++ {
		room := fmt.Sprintf("race:%d", i)
		if !hub.canJoinRoom(room) {
			t.Fatalf("room %d should be joinable under cap", i)
		}
		hub.register(context.Background(), newClient(fmt.Sprintf("p%d", i), "P", room))
	}
	if hub.canJoinRoom("race:overflow") {
		t.Fatalf("new room over cap should be rejected")
	}
	if !hub.canJoinRoom("race:0") {
		t.Fatalf("existing room should still accept clients over cap")
	}
}
```

- [ ] **Paso 4: Ejecutar TODOS los tests de `space-server`**

Run: `cd services/space-server && go test ./... -v`
Expected: 10 tests preexistentes + 10 nuevos, todos `PASS` (20 total). Si algún test preexistente falla, es una regresión del refactor de Task A2 — diagnosticar antes de continuar (no se pasa a Grupo B con tests rotos).

- [ ] **Paso 5: Commit (parte del commit único del Grupo A+B+C, ver Task C2 — NO commitear todavía)**

---

## Grupo B — Servidor: validación de sala, `start_race` en el switch, `GET /rooms`

**Archivos:**
- Modificar: `services/space-server/main.go` (reescritura completa, ver abajo)

**Depende de:** Grupo A (usa `validRoomName`, `canJoinRoom`, `hub.startRace`, `hub.listRooms`).

### Task B1: Reescribir `main.go`

- [ ] **Paso 1: Reemplazar el contenido completo de `services/space-server/main.go`**

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// tickHz is the server broadcast rate (decoupled from client send rate).
const tickHz = 18

func handleSpaceWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}

	q := r.URL.Query()
	id := q.Get("id")
	name := q.Get("name")
	room := q.Get("room")
	if room == "" {
		room = "home"
	}
	if id == "" {
		id = fmt.Sprintf("p%d", time.Now().UnixNano()%100000)
	}
	if name == "" {
		name = "Player_" + id
	}

	// Hito 6: reject invalid room names and rooms over the cap BEFORE
	// registering the client (the WS upgrade already happened, so we just
	// close without ever calling hub.register).
	if !validRoomName(room) || !hub.canJoinRoom(room) {
		conn.Close()
		return
	}

	client := &Client{
		conn:  conn,
		send:  make(chan []byte, 64),
		room:  room,
		state: PlayerState{ID: id, Name: name},
	}

	hub.register(r.Context(), client)

	go client.writePump()
	client.readPump(hub)
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.unregister(c)
		c.conn.Close()
	}()
	for {
		_, msgBytes, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var msg ClientMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "state":
			// Bound the per-state Save so a hung Redis can't pin this goroutine.
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			hub.applyState(ctx, c, msg)
			cancel()
		case "emote":
			hub.emote(c, msg.Emoji)
		case "ping":
			c.send1(pongFor(msg))
		case "start_race":
			hub.startRace(c)
		}
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}

func tickLoop(hub *Hub) {
	ticker := time.NewTicker(time.Second / tickHz)
	defer ticker.Stop()
	for range ticker.C {
		hub.tickAll()
	}
}

func handleRooms(hub *Hub, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(hub.listRooms()); err != nil {
		log.Printf("encode rooms: %v", err)
	}
}

func main() {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "redis:6379"
	}
	store := NewRedisStore(addr)
	hub := newHub(store)

	go tickLoop(hub)

	http.HandleFunc("/space-ws", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceWS(hub, w, r)
	})
	http.HandleFunc("/rooms", func(w http.ResponseWriter, r *http.Request) {
		handleRooms(hub, w, r)
	})
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	log.Println("Space server listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

- [ ] **Paso 2: Compilar y correr TODOS los tests de nuevo**

Run: `cd services/space-server && go build ./... && go test ./... -v`
Expected: build limpio, 20/20 tests `PASS`.

---

## Grupo C — Proxy y build: `/rooms` en Caddy, target de test en Makefile

**Archivos:**
- Modificar: `proxy/Caddyfile`
- Modificar: `Makefile`

**Depende de:** ninguno (independiente, puede ejecutarse en paralelo a A/B).

### Task C1: Añadir la ruta `/rooms` al Caddyfile (ambos bloques)

- [ ] **Paso 1: En `proxy/Caddyfile`, bloque de producción (`{$DOMAIN:localhost:8080} { ... }`), justo después de:**

```
	# Space WebSocket server (multiplayer presence)
	handle /space-ws {
		reverse_proxy space-server:8080
	}
```

**insertar:**

```

	# Room listing (Hito 6)
	handle /rooms {
		reverse_proxy space-server:8080
	}
```

- [ ] **Paso 2: Repetir la misma inserción en el bloque de desarrollo `:8080 { ... }`** (hay un `handle /space-ws { reverse_proxy space-server:8080 }` idéntico ahí; añadir el mismo bloque `handle /rooms` justo después).

- [ ] **Paso 3: Verificar sintácticamente (Caddy valida al arrancar; no hay un linter standalone en este repo) — revisar visualmente que las llaves están balanceadas y el bloque nuevo tiene la misma indentación (tabs) que sus vecinos.**

### Task C2: Añadir target `test-space-server` al Makefile

- [ ] **Paso 1: Leer `Makefile` para localizar el target `test-backend` exacto y añadir uno análogo justo después**

El target existente es:
```makefile
test-backend:
	cd backend && go test ./...
```

Añadir inmediatamente después:
```makefile

test-space-server:
	cd services/space-server && go test ./...
```

- [ ] **Paso 2: Verificar**

Run: `make test-space-server`
Expected: ejecuta `go test ./...` dentro de `services/space-server` y muestra 20 tests `PASS` (mismo resultado que Task A3 Paso 4, ahora vía el target de Makefile).

### Task C3: Commit único del servidor (Grupos A+B+C)

- [ ] **Paso 1: Commit**

```bash
git add services/space-server/hub.go services/space-server/types.go services/space-server/main.go services/space-server/hub_test.go proxy/Caddyfile Makefile
git commit -m "$(cat <<'EOF'
feat(rooms): hito 6 (servidor) — salas con host, fase y throttle de Redis

Room{clients,host,phase} sustituye al mapa plano de clientes por sala.
El primer cliente en crear una sala es su host; al salir, se transfiere
a otro cliente restante. hostId/phase viajan en cada state_update/players
(autocorrectivo si un envio no bloqueante se descarta). Nuevo mensaje
start_race validado contra el host actual de la sala. Escritura a Redis
throttled a 1x/s por cliente + flush garantizado al desconectar. Cap de
20 salas simultaneas y validacion de nombre de sala. Nuevo endpoint
GET /rooms (listado con conteo y fase) expuesto via Caddy.

Tests: 20/20 (10 existentes intactos + 10 nuevos: host al crear, host no
se reemplaza, transferencia al salir, start_race solo-host, hostId/phase
en el tick, destruccion de sala, throttle de Redis, flush al desconectar,
validacion de nombre, cap de salas).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Grupo D — Cliente puro: `race-grid.ts`

**Archivos:**
- Crear: `shell/src/space/race-grid.ts`
- Test: `shell/src/space/race-grid.test.ts`

**Depende de:** ninguno (independiente de A/B/C, puede ejecutarse en paralelo).

### Task D1: TDD de `startingSlotPosition`

- [ ] **Paso 1: Escribir el test — crear `shell/src/space/race-grid.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { startingSlotPosition } from './race-grid';

describe('startingSlotPosition', () => {
  const waypoints = [
    { x: 100, y: 50, z: 0 },
    { x: 0, y: 80, z: 100 },
  ];

  it('slotIndex=0 returns waypoints[0] exactly', () => {
    const pos = startingSlotPosition(waypoints, 0, 60);
    expect(pos).toEqual({ x: 100, y: 50, z: 0 });
  });

  it('slotIndex=1 and slotIndex=-1 are equidistant on opposite sides', () => {
    const plus = startingSlotPosition(waypoints, 1, 60);
    const minus = startingSlotPosition(waypoints, -1, 60);
    const distPlus = Math.hypot(plus.x - waypoints[0].x, plus.z - waypoints[0].z);
    const distMinus = Math.hypot(minus.x - waypoints[0].x, minus.z - waypoints[0].z);
    expect(distPlus).toBeCloseTo(60, 5);
    expect(distMinus).toBeCloseTo(60, 5);
    expect(plus.x).toBeCloseTo(-minus.x + 2 * waypoints[0].x, 5);
    expect(plus.z).toBeCloseTo(-minus.z + 2 * waypoints[0].z, 5);
  });

  it('keeps the y of waypoints[0] (flat grid)', () => {
    const pos = startingSlotPosition(waypoints, 2, 60);
    expect(pos.y).toBe(50);
  });

  it('with fewer than 2 waypoints returns waypoints[0] unchanged', () => {
    const pos = startingSlotPosition([{ x: 5, y: 6, z: 7 }], 3, 60);
    expect(pos).toEqual({ x: 5, y: 6, z: 7 });
  });

  it('with an empty list returns the origin without throwing', () => {
    expect(() => startingSlotPosition([], 0, 60)).not.toThrow();
    expect(startingSlotPosition([], 0, 60)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
```

- [ ] **Paso 2: Correr el test y verificar que falla (el módulo no existe aún)**

Run: `cd shell && npx vitest run src/space/race-grid.test.ts`
Expected: FAIL — `Cannot find module './race-grid'`.

- [ ] **Paso 3: Crear `shell/src/space/race-grid.ts`**

```ts
import { sub, normalize, type V3 } from './vec3-math';

/**
 * Posición de la parrilla de salida (Hito 6): un punto junto a `waypoints[0]`,
 * desplazado `slotIndex * spacing` a lo largo de la perpendicular (plano XZ) a
 * la dirección de viaje inicial `waypoints[0]->waypoints[1]`. `slotIndex`
 * puede ser negativo para repartir naves a ambos lados de la línea de salida.
 * Con menos de 2 waypoints no hay dirección de viaje que perpendicularizar:
 * devuelve `waypoints[0]` (o el origen si la lista está vacía) sin desplazar.
 */
export function startingSlotPosition(waypoints: V3[], slotIndex: number, spacing: number): V3 {
  const start = waypoints[0];
  if (!start) return { x: 0, y: 0, z: 0 };
  const next = waypoints[1];
  if (!next) return { ...start };

  const dir = sub(next, start);
  // Perpendicular en el plano XZ (rotación de 90° alrededor de Y); altura fija
  // porque la parrilla es plana (no desplaza en Y).
  const flatDir = normalize({ x: dir.x, y: 0, z: dir.z });
  const perp = { x: -flatDir.z, y: 0, z: flatDir.x };

  return {
    x: start.x + perp.x * slotIndex * spacing,
    y: start.y,
    z: start.z + perp.z * slotIndex * spacing,
  };
}
```

- [ ] **Paso 4: Correr el test de nuevo**

Run: `cd shell && npx vitest run src/space/race-grid.test.ts`
Expected: PASS (5/5).

- [ ] **Paso 5: No commitear todavía (se junta con el resto del cliente en el commit del Grupo G).**

---

## Grupo E — Cliente impuro: protocolo `space-multiplayer.ts`

**Archivos:**
- Modificar: `shell/src/space/space-multiplayer.ts` (reescritura completa, ver abajo)

**Depende de:** ninguno (independiente de A/B/C/D). Nota: este archivo no tiene tests unitarios (patrón ya establecido — es cableado de WebSocket, verificado en runtime, igual que `race-render.ts`).

### Task E1: Añadir `onRoomState`, `sendStartRace`, `switchRoom`

- [ ] **Paso 1: Reemplazar el contenido completo de `shell/src/space/space-multiplayer.ts`**

```ts
import { shouldSendState, rttEwma, type PlayerState } from './multiplayer-math';
import { PERF_CONFIG } from './space-config';

/** Jugador tal como lo envía el servidor (coordenadas absolutas de mundo). */
export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Emoticonos del protocolo (identificadores, no glifos). */
export type Emote = 'happy' | 'sad' | 'angry';

/** Mapa único identificador→glifo sobrio (sin emojis a color). Fuente compartida. */
export const EMOTE_GLYPH: Record<string, string> = { happy: ':)', sad: ':(', angry: '>:(' };

export interface SpaceMultiplayerHandlers {
  onPlayers: (players: Player[]) => void; // snapshot al unirse + state_update por tick
  onJoined: (player: Player) => void;
  onLeft: (id: string) => void;
  onEmote: (id: string, emoji: string) => void;
  /** Host y fase de la sala actual (Hito 6); viaja en CADA "players"/"state_update". */
  onRoomState: (hostId: string, phase: string) => void;
}

export interface ConnectOpts {
  room: string;
  id: string;
  name: string;
}

/**
 * Cliente WebSocket del espacio multijugador (espejo de MultiplayerClient de
 * app-combate-3d). Conecta a /space-ws, envía estado con throttle (~20 Hz vía
 * shouldSendState), envía emoticonos, expone callbacks y reconecta con backoff.
 * Sin Three.js. El parseo de mensajes sigue el protocolo anclado del plan.
 */
export class SpaceMultiplayer {
  private ws: WebSocket | null = null;
  private handlers: SpaceMultiplayerHandlers;
  private opts: ConnectOpts | null = null;

  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000; // backoff inicial
  private readonly maxReconnectDelay = 15000;

  private lastSentAt = 0;
  private readonly sendIntervalMs = 50; // ~20 Hz

  private lastPingSentAt = 0;
  private rttEwmaMs: number | null = null;

  private closedByUser = false;

  constructor(handlers: SpaceMultiplayerHandlers) {
    this.handlers = handlers;
  }

  connect(opts: ConnectOpts) {
    this.opts = opts;
    this.closedByUser = false;
    this.open();
  }

  /** Cambia de sala (Hito 6): desconecta y reconecta con el mismo id/name. */
  switchRoom(room: string) {
    if (!this.opts) return;
    this.disconnect();
    this.connect({ room, id: this.opts.id, name: this.opts.name });
  }

  private open() {
    if (!this.opts) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host;
    const q =
      `room=${encodeURIComponent(this.opts.room)}` +
      `&id=${encodeURIComponent(this.opts.id)}` +
      `&name=${encodeURIComponent(this.opts.name)}`;
    const url = `${protocol}//${host}/space-ws?${q}`;

    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // reset del backoff al conectar
    };
    this.ws.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch {
        // mensaje no-JSON: ignora
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.scheduleReconnect();
    };
    // onerror no agenda reconexión: onclose siempre se dispara tras un error.
    this.ws.onerror = () => {};
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.maxReconnectDelay, this.reconnectDelay * 2);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private handleMessage(msg: { type?: string; [k: string]: unknown }) {
    switch (msg.type) {
      case 'players':
        this.handlers.onPlayers((msg.players as Player[]) || []);
        this.handlers.onRoomState((msg.hostId as string) || '', (msg.phase as string) || '');
        break;
      case 'state_update':
        this.handlers.onPlayers((msg.players as Player[]) || []);
        this.handlers.onRoomState((msg.hostId as string) || '', (msg.phase as string) || '');
        break;
      case 'joined':
        if (msg.player) this.handlers.onJoined(msg.player as Player);
        break;
      case 'left':
        if (typeof msg.id === 'string') this.handlers.onLeft(msg.id);
        break;
      case 'emote':
        if (typeof msg.id === 'string' && typeof msg.emoji === 'string') {
          this.handlers.onEmote(msg.id, msg.emoji);
        }
        break;
      case 'pong':
        if (typeof msg.t === 'number') {
          const sampleMs = performance.now() - msg.t;
          this.rttEwmaMs = rttEwma(this.rttEwmaMs, sampleMs, PERF_CONFIG.rttEwmaAlpha);
        }
        break;
    }
  }

  /**
   * Ping periódico (PERF_CONFIG.pingIntervalMs) para medir el RTT del WS. `now`
   * (timestamp del rAF, inicio del frame) regula SOLO el throttle; el `t` del
   * ping se toma con performance.now() EN el envío. El send ocurre al final del
   * update del frame: usar el `now` del rAF como `t` sumaría el coste de CPU
   * del frame a cada muestra (sesgo sistemático, máximo justo bajo el jank que
   * esta instrumentación existe para medir).
   */
  maybeSendPing(now: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (now - this.lastPingSentAt < PERF_CONFIG.pingIntervalMs) return;
    this.lastPingSentAt = now;
    this.ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
  }

  /** RTT suavizado (EWMA) en ms; null hasta el primer pong. Instrumentación (Hito 0). */
  get rttMs(): number | null {
    return this.rttEwmaMs;
  }

  /** Envía el estado absoluto de la nave, con throttle (~20 Hz). `now` en ms. */
  sendState(state: PlayerState, now: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!shouldSendState(now, this.lastSentAt, this.sendIntervalMs)) return;
    this.lastSentAt = now;
    this.ws.send(
      JSON.stringify({ type: 'state', x: state.x, y: state.y, z: state.z, yaw: state.yaw }),
    );
  }

  sendEmote(emoji: Emote) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'emote', emoji }));
  }

  /** Solicita iniciar la carrera de la sala (Hito 6); el servidor valida que seas el host. */
  sendStartRace() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'start_race' }));
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

- [ ] **Paso 2: Lint (chequeo de tipos; este archivo no tiene test unitario, ver nota arriba)**

Run: `cd shell && npx tsc --noEmit`
Expected: falla en `space-engine.ts` (todavía no construye `SpaceMultiplayer` con `onRoomState` — se resuelve en el Grupo G). Es esperado en este punto intermedio; no es una regresión de este archivo.

---

## Grupo F — Cliente impuro: componente `rooms-panel.ts` + estilos

**Archivos:**
- Crear: `shell/src/space/rooms-panel.ts`
- Modificar: `shell/src/space/space.css` (añadir bloque `#roomsPanel` al final)

**Depende de:** ninguno (independiente; el componente no importa nada del motor).

### Task F1: Crear `rooms-panel.ts`

- [ ] **Paso 1: Crear `shell/src/space/rooms-panel.ts`**

```ts
/**
 * Panel de salas multijugador (Hito 6): listado (crear/unirse) y lobby
 * (jugadores, host, countdown). Vanilla DOM, sin Three.js — mismo patrón que
 * race-hud.ts/perf-hud.ts. Oculto por defecto.
 */
export interface RoomSummary {
  name: string;
  count: number;
  phase: string;
}

export interface LobbyView {
  room: string;
  players: { id: string; name: string }[];
  hostId: string;
  selfId: string;
  /** `null` = sin cuenta atrás en curso (aún esperando al host). */
  countdown: number | null;
}

export interface RoomsPanelCallbacks {
  onCreateRoom: () => void;
  onJoinRoom: (name: string) => void;
  onStartRace: () => void;
  /** Cierra el panel: en el listado equivale a "Cerrar"; en el lobby, a salir de la sala. */
  onLeaveRoom: () => void;
}

const RACE_PREFIX = 'race:';

export class RoomsPanel {
  private root: HTMLDivElement;
  private callbacks: RoomsPanelCallbacks;

  constructor(host: HTMLElement, callbacks: RoomsPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.id = 'roomsPanel';
    host.appendChild(this.root);
  }

  showList(rooms: RoomSummary[]) {
    const raceRooms = rooms.filter((r) => r.name.startsWith(RACE_PREFIX));
    this.root.classList.add('visible');
    this.root.innerHTML = `
      <div class="rooms-title">Salas de carrera</div>
      <button class="rooms-create">Crear sala nueva</button>
      <div class="rooms-list">
        ${
          raceRooms.length === 0
            ? '<div class="rooms-empty">No hay salas activas.</div>'
            : raceRooms
                .map(
                  (r) => `
          <div class="rooms-row">
            <span class="rooms-row-name">${r.name.slice(RACE_PREFIX.length)}</span>
            <span class="rooms-row-count">${r.count} jugador${r.count === 1 ? '' : 'es'}</span>
            <button class="rooms-join" ${r.phase === 'racing' ? 'disabled' : ''} data-room="${r.name}">
              ${r.phase === 'racing' ? 'En curso' : 'Unirse'}
            </button>
          </div>`,
                )
                .join('')
        }
      </div>
      <button class="rooms-close">Cerrar</button>
    `;
    this.root.querySelector('.rooms-create')?.addEventListener('click', () => this.callbacks.onCreateRoom());
    this.root.querySelector('.rooms-close')?.addEventListener('click', () => this.callbacks.onLeaveRoom());
    this.root.querySelectorAll<HTMLButtonElement>('.rooms-join').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = btn.dataset.room;
        if (room) this.callbacks.onJoinRoom(room);
      });
    });
  }

  showLobby(view: LobbyView) {
    this.root.classList.add('visible');
    if (view.countdown !== null) {
      this.root.innerHTML = `<div class="rooms-countdown">${Math.ceil(view.countdown)}</div>`;
      return;
    }
    const isHost = view.selfId === view.hostId;
    this.root.innerHTML = `
      <div class="rooms-title">Sala ${view.room.slice(RACE_PREFIX.length)}</div>
      <div class="rooms-players">
        ${view.players
          .map(
            (p) =>
              `<div class="rooms-player${p.id === view.hostId ? ' is-host' : ''}">${p.name}${
                p.id === view.hostId ? ' (host)' : ''
              }</div>`,
          )
          .join('')}
      </div>
      ${
        isHost
          ? '<button class="rooms-start">Iniciar carrera</button>'
          : '<div class="rooms-waiting">Esperando al host...</div>'
      }
      <button class="rooms-close">Salir de la sala</button>
    `;
    this.root.querySelector('.rooms-start')?.addEventListener('click', () => this.callbacks.onStartRace());
    this.root.querySelector('.rooms-close')?.addEventListener('click', () => this.callbacks.onLeaveRoom());
  }

  hide() {
    this.root.classList.remove('visible');
    this.root.innerHTML = '';
  }

  dispose() {
    this.root.remove();
  }
}
```

- [ ] **Paso 2: Verificar tipos**

Run: `cd shell && npx tsc --noEmit`
Expected: sin errores nuevos atribuibles a este archivo (los errores pendientes de `space-engine.ts` sin resolver todavía son esperados hasta el Grupo G).

### Task F2: Añadir estilos `#roomsPanel` a `space.css`

- [ ] **Paso 1: Añadir al final de `shell/src/space/space.css` (después del bloque `#raceHud` existente)**

```css
#roomsPanel {
  position: fixed;
  inset: 0;
  z-index: 190;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(10, 5, 3, 0.6);
  cursor: default;
}
#roomsPanel.visible {
  display: flex;
}
#roomsPanel > * {
  background: rgba(10, 5, 3, 0.95);
  border: 1px solid var(--metal-brass);
  border-radius: 12px;
  padding: 24px 28px;
  min-width: 280px;
  text-align: center;
}
#roomsPanel .rooms-title {
  font-family: var(--font-display);
  color: var(--orange-amber);
  letter-spacing: 0.1em;
  font-size: 15px;
  margin-bottom: 16px;
}
#roomsPanel .rooms-list {
  max-height: 220px;
  overflow-y: auto;
  margin: 14px 0;
}
#roomsPanel .rooms-empty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--space-text-2);
  padding: 12px 0;
}
#roomsPanel .rooms-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--metal-iron);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--space-text);
}
#roomsPanel .rooms-row-count {
  color: var(--space-text-2);
  font-size: 10px;
}
#roomsPanel .rooms-players {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--space-text);
  margin-bottom: 16px;
}
#roomsPanel .rooms-player {
  padding: 4px 0;
}
#roomsPanel .rooms-player.is-host {
  color: var(--orange-amber);
}
#roomsPanel .rooms-waiting {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--space-text-2);
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
#roomsPanel .rooms-countdown {
  font-family: var(--font-display);
  font-size: 64px;
  color: var(--orange-amber);
  min-width: 120px;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
#roomsPanel button {
  display: block;
  width: 100%;
  margin: 8px 0 0;
  padding: 10px 20px;
  border: 1px solid var(--metal-steel);
  border-radius: 6px;
  background: transparent;
  color: var(--space-text);
  font-family: var(--font-serif);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
}
#roomsPanel button:hover:not(:disabled) {
  border-color: var(--orange-burnt);
  color: var(--orange-burnt);
}
#roomsPanel button:disabled {
  opacity: 0.4;
  cursor: default;
}
#roomsPanel .rooms-start {
  border-color: var(--orange-amber);
  background: var(--orange-amber);
  color: #1a0e08;
  font-weight: 600;
}
#roomsPanel .rooms-start:hover {
  border-color: var(--orange-amber);
  color: #1a0e08;
  opacity: 0.9;
}
#roomsPanel .rooms-join {
  width: auto;
  margin: 0;
  padding: 4px 12px;
  font-size: 10px;
}
```

- [ ] **Paso 2: No hay verificación automática de CSS en este repo; se confirma visualmente en el Grupo H (runtime).**

---

## Grupo G — Cableado en `space-engine.ts` + `space-config.ts`

**Depende de:** Grupos A-F completos (usa `ROOMS_CONFIG`, `SpaceMultiplayer.switchRoom/sendStartRace/onRoomState`, `RoomsPanel`, `startingSlotPosition`).

**Archivos:**
- Modificar: `shell/src/space/space-config.ts` (añadir bloque)
- Modificar: `shell/src/space/space-engine.ts` (cableado, varios puntos)

### Task G1: Añadir `ROOMS_CONFIG` a `space-config.ts`

- [ ] **Paso 1: Añadir al final de `shell/src/space/space-config.ts`**

```ts

/** Salas multijugador con host (Hito 6). */
export const ROOMS_CONFIG = {
  enabled: true, // [UNIFORME] kill-switch, mismo patrón que RACE_CONFIG.enabled
  countdownSeconds: 3, // [PERSONALIZABLE] cuenta atrás local tras el flip lobby->racing
  startLineSpacing: 60, // [UNIFORME] separación lateral entre naves en la parrilla de salida
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // [UNIFORME] sin 0/O/1/I (ambiguos)
  roomCodeLength: 4, // [UNIFORME]
  roomsListRefreshMs: 2000, // [UNIFORME] refresco del listado mientras el panel está abierto
};
```

- [ ] **Paso 2: Verificar**

Run: `cd shell && npx tsc --noEmit`
Expected: sin errores nuevos.

### Task G2: Cablear `space-engine.ts`

Este task se hace en UNA sola pasada porque los cambios son interdependientes (campos nuevos, construcción de `SpaceMultiplayer`, `onKeyDown`, bloque por frame, `dispose()`). Aplicar los siguientes cambios EXACTOS sobre el archivo actual:

- [ ] **Paso 1: Imports.** La línea existente:
```ts
import { SOLAR_CONFIG, CAMERA_CONFIG, ORBIT_CONFIG, PERF_CONFIG, AUDIO_CONFIG, RACE_CONFIG } from './space-config';
```
Reemplazarla por:
```ts
import { SOLAR_CONFIG, CAMERA_CONFIG, ORBIT_CONFIG, PERF_CONFIG, AUDIO_CONFIG, RACE_CONFIG, ROOMS_CONFIG } from './space-config';
```
La línea existente:
```ts
import { SpaceMultiplayer, EMOTE_GLYPH, type Emote } from './space-multiplayer';
```
Reemplazarla por:
```ts
import { SpaceMultiplayer, EMOTE_GLYPH, type Emote, type Player } from './space-multiplayer';
```
Y añadir, después de la línea `import { RaceHud } from './race-hud';`, estas dos líneas nuevas:
```ts
import { startingSlotPosition } from './race-grid';
import { RoomsPanel, type RoomSummary } from './rooms-panel';
```

- [ ] **Paso 2: Campos nuevos de la clase — añadir junto a los campos de carrera existentes (después de `private readonly racePrevShipPos = new THREE.Vector3();`)**

```ts
  // ── Salas multijugador con host (Hito 6) ──
  private raceRoom: { name: string; hostId: string; phase: 'lobby' | 'racing'; players: Player[] } | null = null;
  private roomsPanel: RoomsPanel | null = null;
  private roomsPanelVisible = false;
  private roomCountdown: number | null = null;
  private roomsListTimer: number | null = null;
  private prevRoomPhase: 'lobby' | 'racing' | null = null;
```

- [ ] **Paso 3: Construcción de `SpaceMultiplayer` — la sección existente (dentro de `mount()`, bloque `if (this.opts.user) { ... }`) es:**

```ts
      this.multiplayer = new SpaceMultiplayer({
        onPlayers: (players) => this.remoteShips?.setSnapshot(players, this.worldOffset),
        onJoined: (player) => this.remoteShips?.addPlayer(player, this.worldOffset),
        onLeft: (id) => this.remoteShips?.removePlayer(id),
        onEmote: (id, emoji) => {
          if (id === user.id) this.showSelfEmote(emoji);
          else this.remoteShips?.showEmote(id, emoji);
        },
      });
      this.multiplayer.connect({ room: 'home', id: user.id, name: user.name });
```

Reemplazarla por:

```ts
      this.multiplayer = new SpaceMultiplayer({
        onPlayers: (players) => {
          this.remoteShips?.setSnapshot(players, this.worldOffset);
          if (this.raceRoom) this.raceRoom.players = players;
        },
        onJoined: (player) => this.remoteShips?.addPlayer(player, this.worldOffset),
        onLeft: (id) => this.remoteShips?.removePlayer(id),
        onEmote: (id, emoji) => {
          if (id === user.id) this.showSelfEmote(emoji);
          else this.remoteShips?.showEmote(id, emoji);
        },
        onRoomState: (hostId, phase) => {
          if (!this.raceRoom) return;
          this.raceRoom.hostId = hostId;
          if (phase === 'lobby' || phase === 'racing') this.raceRoom.phase = phase;
        },
      });
      this.multiplayer.connect({ room: 'home', id: user.id, name: user.name });

      if (ROOMS_CONFIG.enabled) {
        this.roomsPanel = new RoomsPanel(host, {
          onCreateRoom: () => this.createRaceRoom(),
          onJoinRoom: (name) => this.joinRaceRoom(name),
          onStartRace: () => this.multiplayer?.sendStartRace(),
          onLeaveRoom: () => (this.raceRoom ? this.leaveRaceRoom() : this.closeRoomsList()),
        });
      }
```

- [ ] **Paso 4: Nuevos métodos privados — añadir junto a `leaveRaceRoom`-adjacent code; ubicarlos después del método `enterCurrentProject` (o cualquier punto entre métodos privados existentes; el orden dentro de la clase no afecta compilación). Insertar:**

```ts
  private roomCode(): string {
    const { roomCodeAlphabet, roomCodeLength } = ROOMS_CONFIG;
    let code = '';
    for (let i = 0; i < roomCodeLength; i++) {
      code += roomCodeAlphabet[Math.floor(Math.random() * roomCodeAlphabet.length)];
    }
    return code;
  }

  private createRaceRoom() {
    const name = 'race:' + this.roomCode();
    this.multiplayer?.switchRoom(name);
    this.raceRoom = { name, hostId: '', phase: 'lobby', players: [] };
    this.prevRoomPhase = null;
    this.ship.setEnabled(true);
    this.stopRoomsListTimer();
  }

  private joinRaceRoom(name: string) {
    this.multiplayer?.switchRoom(name);
    this.raceRoom = { name, hostId: '', phase: 'lobby', players: [] };
    this.prevRoomPhase = null;
    this.ship.setEnabled(true);
    this.stopRoomsListTimer();
  }

  private leaveRaceRoom() {
    this.multiplayer?.switchRoom('home');
    this.raceRoom = null;
    this.roomCountdown = null;
    this.prevRoomPhase = null;
    this.ship.setOrbiting(false);
    this.raceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
    this.roomsPanel?.hide();
    this.roomsPanelVisible = false;
    this.stopRoomsListTimer();
  }

  private stopRoomsListTimer() {
    if (this.roomsListTimer !== null) {
      window.clearInterval(this.roomsListTimer);
      this.roomsListTimer = null;
    }
  }

  private async fetchAndShowRoomsList() {
    try {
      const res = await fetch('/rooms');
      const rooms = (await res.json()) as RoomSummary[];
      if (!this.roomsPanelVisible || this.raceRoom) return; // se cerró o ya se unió mientras esperábamos
      this.roomsPanel?.showList(rooms);
    } catch {
      // sin conexión al endpoint: deja el panel como estaba (reintenta en el próximo refresco)
    }
  }

  private openRoomsList() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.ship.setEnabled(false);
    this.roomsPanelVisible = true;
    this.fetchAndShowRoomsList();
    this.stopRoomsListTimer();
    this.roomsListTimer = window.setInterval(() => this.fetchAndShowRoomsList(), ROOMS_CONFIG.roomsListRefreshMs);
  }

  private closeRoomsList() {
    this.ship.setEnabled(true);
    this.roomsPanelVisible = false;
    this.roomsPanel?.hide();
    this.stopRoomsListTimer();
  }
```

**Nota de diseño (documentada en el spec, Decisión 3/verificación de controles):** `createRaceRoom`/`joinRaceRoom` llaman `ship.setEnabled(true)` porque `openRoomsList` lo había puesto en `false` mientras se navegaba el listado; a partir de aquí, el bloque por frame del Paso 6 asume el control vía `ship.setOrbiting(true)` mientras `raceRoom.phase === 'lobby'`.

- [ ] **Paso 5: Tecla `KeyR` — en `onKeyDown`, insertar ANTES del bloque `if (e.code === 'KeyQ')` existente:**

```ts
    // R: abre/cierra el panel de salas (Hito 6). Solo dentro de la zona de
    // carrera y sin una carrera SP en curso (no interrumpe al jugador solo).
    if (e.code === 'KeyR') {
      if (!ROOMS_CONFIG.enabled || !this.raceZoneActive || this.raceState.phase === 'racing') return;
      if (this.roomsPanelVisible) {
        if (this.raceRoom) this.leaveRaceRoom();
        else this.closeRoomsList();
      } else if (this.raceRoom) {
        this.roomsPanelVisible = true; // reabrir la vista de lobby de una sala ya unida
      } else {
        this.openRoomsList();
      }
      return;
    }
```

- [ ] **Paso 6: Tecla `KeyQ` existente — es:**

```ts
    // Q: abandona la carrera en curso (vuelo libre, no se pierde el control).
    if (e.code === 'KeyQ') {
      if (this.raceState.phase === 'racing') {
        this.raceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
      }
      return;
    }
```

Reemplazarla por:

```ts
    // Q: abandona la sala/carrera en curso (vuelo libre, no se pierde el control).
    if (e.code === 'KeyQ') {
      if (this.raceRoom) {
        this.leaveRaceRoom();
        return;
      }
      if (this.raceState.phase === 'racing') {
        this.raceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
      }
      return;
    }
```

- [ ] **Paso 7: `ship.setEnabled` ya condicionado al menú de pausa — la línea existente (justo antes de `const ship = this.ship.update(delta);`) es:**

```ts
    this.ship.setEnabled(!this.pauseMenu.visible);
```

Reemplazarla por:

```ts
    this.ship.setEnabled(!this.pauseMenu.visible && !this.roomsPanelVisible);
```

**Nota:** esto solo aplica mientras `raceRoom` es `null` (navegando el listado); una vez unido a una sala, `ship.setOrbiting(true)` (Paso 8) toma el control exclusivo de congelar la nave independientemente de este flag — ver Decisión de diseño en el spec.

- [ ] **Paso 8: Bloque por frame — el bloque existente de Hito 5 empieza con:**

```ts
    // ── Carrera espacial (Hito 5) ──
    if (RACE_CONFIG.enabled && this.raceRender && this.raceTrack) {
      const raceGroupPos = this.raceRender.object.position;
```

Justo DESPUÉS de la línea `const raceGroupPos = this.raceRender.object.position;` (y ANTES de `const shipLocal = {...}` que le sigue), insertar el bloque de salas:

```ts
      // ── Salas multijugador con host (Hito 6) ──
      if (this.raceRoom) {
        const phaseChanged = this.prevRoomPhase !== null && this.prevRoomPhase !== this.raceRoom.phase;
        if (phaseChanged && this.raceRoom.phase === 'racing') {
          this.roomCountdown = ROOMS_CONFIG.countdownSeconds;
        }
        this.prevRoomPhase = this.raceRoom.phase;

        if (this.raceRoom.phase === 'lobby' || this.roomCountdown !== null) {
          this.ship.setOrbiting(true);
          const sorted = [...this.raceRoom.players].sort((p1, p2) => (p1.id < p2.id ? -1 : 1));
          const selfIndex = sorted.findIndex((p) => p.id === this.opts.user?.id);
          const signedIndex =
            selfIndex <= 0 ? 0 : selfIndex % 2 === 1 ? Math.ceil(selfIndex / 2) : -Math.ceil(selfIndex / 2);
          const slot = startingSlotPosition(this.raceTrack.waypoints, signedIndex, ROOMS_CONFIG.startLineSpacing);
          this.ship.object.position.set(raceGroupPos.x + slot.x, raceGroupPos.y + slot.y, raceGroupPos.z + slot.z);

          if (this.roomCountdown !== null) {
            this.roomCountdown = Math.max(0, this.roomCountdown - delta);
            this.roomsPanel?.showLobby({
              room: this.raceRoom.name,
              players: this.raceRoom.players,
              hostId: this.raceRoom.hostId,
              selfId: this.opts.user?.id ?? '',
              countdown: this.roomCountdown,
            });
            if (this.roomCountdown <= 0) {
              this.roomCountdown = null;
              this.ship.setOrbiting(false);
              this.raceState = startRace();
              this.roomsPanel?.hide();
              this.roomsPanelVisible = false;
            }
          } else if (this.roomsPanelVisible) {
            this.roomsPanel?.showLobby({
              room: this.raceRoom.name,
              players: this.raceRoom.players,
              hostId: this.raceRoom.hostId,
              selfId: this.opts.user?.id ?? '',
              countdown: null,
            });
          }
        }
      }

```

**Nota importante:** este bloque se ejecuta DENTRO del `if (RACE_CONFIG.enabled && this.raceRender && this.raceTrack)` ya existente — reutiliza `raceGroupPos`/`this.raceTrack.waypoints` sin recalcularlos. Cuando el countdown llega a 0 y se llama `startRace()`, el resto del bloque de Hito 5 (que sigue INMEDIATAMENTE después, sin cambios) ve `this.raceState.phase === 'racing'` en el MISMO frame y empieza a evaluar checkpoints con normalidad — no se requiere ningún cambio adicional en el bloque de Hito 5 ya existente.

- [ ] **Paso 9: `dispose()` — localizar la línea existente `this.multiplayer?.disconnect();` dentro de `dispose()` y añadir justo después:**

```ts
    this.roomsPanel?.dispose();
    this.stopRoomsListTimer();
```

- [ ] **Paso 10: Verificación de tipos completa**

Run: `cd shell && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 11: Suite completa de Vitest**

Run: `cd shell && npx vitest run`
Expected: todos los tests existentes + los 5 nuevos de `race-grid.test.ts` en verde (no se espera ningún cambio de comportamiento en módulos puros ya existentes).

- [ ] **Paso 12: Lint y build**

Run: `cd shell && pnpm lint && pnpm build` (o desde la raíz: `pnpm --filter @plataforma/shell lint` / `build`)
Expected: ambos verdes.

---

## Grupo H — Verificación runtime, redeploy y commit del cliente

**Depende de:** Grupo G completo + Grupo A/B/C ya desplegados (el servidor debe tener el protocolo nuevo para probar el cliente end-to-end).

### Task H1: Redeploy de `space-server` y verificación de los tests Go en el contenedor

- [ ] **Paso 1: Redeploy**

Run (PowerShell, repo root): `deploy\ejec-space-server.bat`
Expected: build y redeploy exitoso, contenedor `deploy-space-server-1` reiniciado.

- [ ] **Paso 2: Verificar salud**

Run: `curl -s http://localhost:8093/health`
Expected: `{"status":"ok"}`.

- [ ] **Paso 3: Verificar el nuevo endpoint a través de Caddy**

Run: `curl -s http://localhost:8080/rooms`
Expected: `[]` (JSON, sin salas activas todavía) — confirma que la ruta de Caddy (Grupo C) y el handler nuevo (Grupo B) funcionan end-to-end.

### Task H2: Verificación runtime del cliente (arnés dev temporal + stack real)

Sigue el MISMO método ya usado para la puerta de latencia (`docs/superpowers/notes/2026-07-05-puerta-latencia-hito-6.md`): recrear temporalmente `shell/debug.html` + `shell/src/debug-space.ts` (idéntico al usado antes, con un usuario fabricado) + el proxy WS temporal en `shell/vite.config.ts`, verificar, y BORRAR/REVERTIR todo antes de continuar. No se repite aquí el contenido de esos archivos (ver la nota de la puerta de latencia); usar exactamente el mismo patrón.

- [ ] **Paso 1: Recrear el arnés y el proxy temporal, arrancar `pnpm --filter @plataforma/shell dev --port 5311 --strictPort`, navegar a `/debug.html` en la preview.**

- [ ] **Paso 2: Verificar creación de sala — desde la consola de la preview:**
```js
document.querySelector('#roomsPanel')?.classList.contains('visible') // false inicialmente
```
Simular la entrada a la zona de carrera (teletransportar como en la puerta de latencia) y disparar `KeyR` (o invocar directamente el método privado vía `window.__space.engine['openRoomsList']()` si el evento de teclado no llega a la pestaña de forma fiable). Confirmar que `#roomsPanel` se vuelve visible y el listado (inicialmente vacío) se muestra.

- [ ] **Paso 3: Crear una sala** (clic en "Crear sala nueva" o invocar `window.__space.engine['createRaceRoom'](window.__space.engine['opts'].user.id, 'DebugPilot')`), y confirmar:
  - `window.__space.engine['raceRoom'].name` empieza por `race:`.
  - La nave queda congelada (`window.__space.engine['ship']['orbiting']` — si es privado y no accesible, verificar indirectamente comprobando que `ship.object.position` no cambia tras simular unos frames con W presionado).
  - El panel muestra "Iniciar carrera" (eres el único jugador ⇒ host).

- [ ] **Paso 4: Simular un segundo jugador uniéndose vía WebSocket directo** (mismo patrón que la puerta de latencia: `new WebSocket('ws://127.0.0.1:8093/space-ws?room=<nombre_de_la_sala>&id=sim1&name=Sim1')`, enviando `state` cada 50ms). Confirmar en la consola de la preview:
  - `window.__space.engine['raceRoom'].players` pasa a tener 2 entradas.
  - El panel de lobby (si estaba abierto) muestra ambos jugadores, marcando al host correctamente.

- [ ] **Paso 5: Verificar `start_race` y countdown** — pulsar "Iniciar carrera" (o `window.__space.engine['multiplayer'].sendStartRace()`), confirmar:
  - `window.__space.engine['raceRoom'].phase` pasa a `'racing'` tras el próximo tick (≤1s).
  - `window.__space.engine['roomCountdown']` arranca en `3` y decrece.
  - Al llegar a 0, `window.__space.engine['raceState'].phase === 'racing'` y la nave responde de nuevo al control (W mueve la nave).

- [ ] **Paso 6: Verificar transferencia de host** — cerrar el WebSocket simulado `sim1` (`ws.close()`) ANTES del paso 5 (repetir con una sala nueva si hace falta, ya que tras iniciar la carrera no aplica). Con 2 jugadores en lobby (real + `sim1`) donde `sim1` es el segundo en unirse (no host), esto NO transfiere nada interesante — para probar la transferencia real, unir el simulado ANTES de crear la sala del cliente real no es posible (el cliente real siempre es el creador en este flujo de prueba). Alternativa: usar DOS clientes simulados (`sim1` primero = host, `sim2` segundo), confirmar vía un tercer WebSocket de inspección (o los propios mensajes recibidos por `sim2`) que al cerrar `sim1` el siguiente `state_update` trae `hostId === 'sim2'`.

- [ ] **Paso 7: Verificar destrucción de sala vacía** — cerrar todos los WebSockets de la sala de prueba (simulados) y `leaveRaceRoom()` en el cliente real; confirmar `curl -s http://localhost:8080/rooms` vuelve a `[]` (o ya no incluye esa sala).

- [ ] **Paso 8: Limpieza** — cerrar todos los WebSockets simulados, detener el servidor de preview, borrar `shell/debug.html` y `shell/src/debug-space.ts`, revertir el proxy temporal de `shell/vite.config.ts` (`git diff shell/vite.config.ts` debe quedar limpio).

Run: `git status --short shell/ | grep -i debug` → sin salida. `git diff shell/vite.config.ts` → sin salida.

### Task H3: Redeploy del shell y verificación del hash

- [ ] **Paso 1: Capturar el hash servido ANTES del redeploy**

Run: `curl -s http://localhost:8080/ | grep -o 'index-[A-Za-z0-9_]*\.js'`

- [ ] **Paso 2: Redeploy**

Run (PowerShell, repo root): `deploy\ejec-shell.bat`

- [ ] **Paso 3: Confirmar el nuevo hash servido**

Run: `curl -s http://localhost:8080/ | grep -o 'index-[A-Za-z0-9_]*\.js'`
Expected: hash distinto al del Paso 1.

### Task H4: Reporte y commit único del cliente

- [ ] **Paso 1: Escribir `docs/superpowers/notes/2026-07-05-hito-6-reporte.md`** con: criterios de aceptación verificados (crear sala, host inicia, naves bloqueadas hasta el inicio, transferencia al salir el host, destrucción al vaciar — cada uno con cómo se verificó, ver Task H2), número de tests (Go: 20/20; Vitest: total de la suite + los 5 nuevos de `race-grid.test.ts`), hash del bundle antes/después, referencia a la puerta de latencia ya pasada (`docs/superpowers/notes/2026-07-05-puerta-latencia-hito-6.md`), y cualquier desviación encontrada durante la ejecución de este plan.

- [ ] **Paso 2: Commit único del cliente**

```bash
git add shell/src/space/race-grid.ts shell/src/space/race-grid.test.ts shell/src/space/space-multiplayer.ts shell/src/space/rooms-panel.ts shell/src/space/space.css shell/src/space/space-config.ts shell/src/space/space-engine.ts docs/superpowers/notes/2026-07-05-hito-6-reporte.md
git commit -m "$(cat <<'EOF'
feat(rooms): hito 6 (cliente) — salas con host, lobby y carrera sincronizada

Panel de salas (listar/crear/unirse) accesible con R dentro de la zona
de carrera; lobby con parrilla de salida determinista (race-grid.ts,
nuevo modulo puro), naves congeladas (ship.setOrbiting, mismo patron de
bloqueo del Hito 1) hasta que el host inicia; countdown local de 3s
disparado por el flip de fase lobby->racing (autocorrectivo, sin fase
de countdown en el protocolo); progreso de carrera LOCAL por jugador
reutilizando el 100% del codigo del Hito 5 sin modificarlo. Q sale de
la sala/carrera; transferencia de host visible en el lobby.

Gate de latencia superado (ver 2026-07-05-puerta-latencia-hito-6.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Autorevisión del plan (cobertura del spec)

- Decisión 1 (progreso local): Grupo G Paso 8, no se toca el bloque existente de Hito 5.
- Decisión 2 (countdown sin fase nueva): Grupo G Paso 8 (`phaseChanged`/`roomCountdown`).
- Decisión 3 (una sola sala, `switchRoom`): Grupo E Task E1; Grupo G `createRaceRoom`/`joinRaceRoom`/`leaveRaceRoom`.
- Decisión 4 (código corto, sin formulario): Grupo G `roomCode()`.
- Decisión 5 (`/rooms` genérico, filtro `race:` en cliente): Grupo B (`listRooms` genérico) + Grupo F (`RoomsPanel.showList` filtra).
- Decisión 6 (parrilla determinista por índice): Grupo D (`race-grid.ts`) + Grupo G Paso 8 (`signedIndex`).
- Decisión 7 (cap + validación de nombre): Grupo A (`canJoinRoom`/`validRoomName`) + Grupo B (chequeo antes de `register`).
- Decisión 8 (throttle Redis + flush): Grupo A (`applyState`/`unregister`).
- Criterios de aceptación del master plan: cubiertos por Task H2 (verificación runtime de los 4 escenarios) + tests Go de Grupo A3.
