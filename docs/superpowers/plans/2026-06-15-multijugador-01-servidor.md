---
# Multijugador — servidor space-server (Go) + Redis + infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the new realtime `space-server` (Go + gorilla/websocket) with room-keyed presence, a server-tick broadcast, emoji emotes, and Redis-backed durable per-player state, plus the Caddy route and docker-compose wiring to deploy it.

**Architecture:** A standalone Go WebSocket service mirrors `services/game-server` but is keyed by `room` (`map[string]map[*Client]bool`): a client only receives broadcasts from its own room. Player state is 3D (`{id,name,x,y,z,yaw}`). A ~15–20 Hz server tick broadcasts the room snapshot (decoupled from client send rate). Durable per-player state lives in Redis (HSET + 1h TTL, restored on reconnect) behind a small `Store` interface so the hub is unit-testable with `miniredis`. Caddy reverse-proxies `/space-ws` → `space-server:8080`; compose adds `redis` (AOF volume) and `space-server`.

**Tech Stack:** Go 1.22, `github.com/gorilla/websocket`, `github.com/redis/go-redis/v9`, `github.com/alicebob/miniredis/v2` (test), Docker multi-stage, Caddy, docker-compose, Redis.

**Depends on:** none (the client plan, `2026-06-15-multijugador-02-cliente.md`, depends on the WebSocket protocol pinned here).

---

## Environment note (Go toolchain)

The Go unit tests in this plan (`go test ./...`) require the Go toolchain installed in the dev environment. **If Go is not available locally, the tests are validated when the user builds the Docker image** (the `golang:1.22-alpine` build stage compiles the package; for a test pass the user can run `docker run --rm -v ${PWD}:/app -w /app golang:1.22-alpine sh -c "go test ./..."` from `services/space-server`). Each Go task below still writes **real, complete table-driven tests** and states the run command + expected result; mark the step done once it passes locally OR note "deferred to Docker build" if Go is unavailable.

**Deploy reminder for the user (do NOT run deploy here):** before `docker compose build`, pre-pull base images to avoid the Docker Hub TLS-timeout previously hit:
```
docker pull golang:1.22-alpine
docker pull alpine:3.20
docker pull redis:alpine
```

---

## Shared WebSocket protocol (authoritative — server and client MUST agree)

- **Endpoint:** `GET /space-ws?room=home&id=<userId>&name=<userName>` (Upgrade to WebSocket).
- **Client → server (JSON):**
  - `{ "type": "state", "x": number, "y": number, "z": number, "yaw": number }`  (~20 Hz, throttled)
  - `{ "type": "emote", "emoji": "happy" | "sad" | "angry" }`
- **Server → client (JSON):**
  - `{ "type": "players", "players": Player[] }`        — snapshot sent once on join
  - `{ "type": "state_update", "players": Player[] }`   — broadcast on a ~15–20 Hz server tick, only to the same room
  - `{ "type": "joined", "player": Player }`
  - `{ "type": "left", "id": string }`
  - `{ "type": "emote", "id": string, "emoji": string }`
  - where `Player = { id: string, name: string, x: number, y: number, z: number, yaw: number }`
- **Rooms:** a client only receives broadcasts from its own room. MVP uses room `"home"`. Server keyed by room.
- **Persistence (Redis):** on each `state`, `HSET space:player:<id>` with `x,y,z,yaw,name,room` and `EXPIRE 3600`. On join, if `space:player:<id>` exists, restore it as the player's initial state. Presence (who is connected) is in-memory; durable per-player state is in Redis.
- **Identity:** `id` + `name` come from the query string (shell passes the JWT user). Server trusts them (MVP). Strict JWT validation is a NON-GOAL.

---

## File structure

| File | Action | Single responsibility |
|---|---|---|
| `services/space-server/go.mod` | Create | Module definition + deps (gorilla/websocket, go-redis/v9, miniredis test dep). |
| `services/space-server/types.go` | Create | Wire types: `PlayerState`, `ClientMessage`, `ServerMessage`. |
| `services/space-server/store.go` | Create | `Store` interface + `RedisStore` (go-redis impl): save/restore per-player state. |
| `services/space-server/store_test.go` | Create | Table-driven tests for `RedisStore` save/restore using `miniredis`. |
| `services/space-server/hub.go` | Create | Room-keyed hub: register/unregister/broadcast/getPlayers/applyState/emote/tick. |
| `services/space-server/hub_test.go` | Create | Table-driven tests: room isolation, join/leave broadcast, state_update snapshot, Redis restore on join. |
| `services/space-server/main.go` | Create | HTTP server: `/space-ws` upgrade + client pumps, `/health`, wires Store + Hub + tick loop. |
| `services/space-server/Dockerfile` | Create | Multi-stage Go build (mirror of game-server, builds `space-server`). |
| `services/space-server/.dockerignore` | Create | Keep build context lean. |
| `proxy/Caddyfile` | Modify | Add `handle /space-ws` → `space-server:8080` to BOTH blocks (production + dev `:8080`). |
| `deploy/docker-compose.yml` | Modify | Add `redis` (AOF volume) + `space-server` services; add both to `caddy` depends_on; add `redis_data` volume. |

---

### Task 1: Scaffold the Go module

**Files:** Create `services/space-server/go.mod`, `services/space-server/.dockerignore`.

- [ ] Create `services/space-server/go.mod` with:
  ```
  module space-server

  go 1.22

  require (
  	github.com/alicebob/miniredis/v2 v2.33.0
  	github.com/gorilla/websocket v1.5.3
  	github.com/redis/go-redis/v9 v9.6.1
  )
  ```
  > NOTE: `go mod download` / `go mod tidy` will populate `go.sum` and the indirect requires (e.g. `github.com/cespare/xxhash/v2`, `github.com/dgryski/go-rendezvous`, `github.com/alicebob/gopher-json`, `github.com/yuin/gopher-lua`). Do NOT hand-write `go.sum`.
- [ ] Create `services/space-server/.dockerignore` with:
  ```
  *.md
  *_test.go
  ```
- [ ] Verify the module path resolves: from `services/space-server` run `go mod tidy`. Expected: `go.sum` is created, no errors. **If Go is unavailable locally, defer to Docker build** (the build stage runs `go mod download`).
- [ ] Commit: `feat(space): scaffold space-server Go module`

---

### Task 2: Wire types (PlayerState + messages)

**Files:** Create `services/space-server/types.go`.

This is plain struct definitions (no logic to TDD); it is verified by `go build` in Task 3+ and by the hub tests. Write the COMPLETE file.

- [ ] Create `services/space-server/types.go`:
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
  }

  // ServerMessage is any JSON frame sent server -> client.
  type ServerMessage struct {
  	Type    string        `json:"type"`
  	Players []PlayerState `json:"players,omitempty"`
  	Player  *PlayerState  `json:"player,omitempty"`
  	ID      string        `json:"id,omitempty"`
  	Emoji   string        `json:"emoji,omitempty"`
  }
  ```
- [ ] Commit: `feat(space): define space-server wire types`

---

### Task 3: Redis Store interface + RedisStore impl (TDD with miniredis)

**Files:** Create `services/space-server/store.go`, `services/space-server/store_test.go`.

The `Store` abstracts persistence so the hub is testable. `RedisStore` does `HSET space:player:<id>` + `EXPIRE 3600` on save, and reads the hash on restore.

#### 3a — Failing test first

- [ ] Create `services/space-server/store_test.go`:
  ```go
  package main

  import (
  	"context"
  	"testing"
  	"time"

  	"github.com/alicebob/miniredis/v2"
  	"github.com/redis/go-redis/v9"
  )

  func newTestStore(t *testing.T) (*RedisStore, *miniredis.Miniredis) {
  	t.Helper()
  	mr, err := miniredis.Run()
  	if err != nil {
  		t.Fatalf("miniredis: %v", err)
  	}
  	t.Cleanup(mr.Close)
  	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
  	return &RedisStore{rdb: rdb}, mr
  }

  func TestRedisStore_SaveThenRestore(t *testing.T) {
  	store, _ := newTestStore(t)
  	ctx := context.Background()

  	in := PlayerState{ID: "u1", Name: "Ada", X: 10, Y: -2, Z: 30, Yaw: 1.5}
  	if err := store.Save(ctx, in, "home"); err != nil {
  		t.Fatalf("Save: %v", err)
  	}

  	got, ok, err := store.Restore(ctx, "u1")
  	if err != nil {
  		t.Fatalf("Restore: %v", err)
  	}
  	if !ok {
  		t.Fatal("expected restore ok=true for saved player")
  	}
  	if got != in {
  		t.Fatalf("restore mismatch: got %+v want %+v", got, in)
  	}
  }

  func TestRedisStore_RestoreMissing(t *testing.T) {
  	store, _ := newTestStore(t)
  	_, ok, err := store.Restore(context.Background(), "ghost")
  	if err != nil {
  		t.Fatalf("Restore: %v", err)
  	}
  	if ok {
  		t.Fatal("expected ok=false for unknown player")
  	}
  }

  func TestRedisStore_SaveSetsTTL(t *testing.T) {
  	store, mr := newTestStore(t)
  	if err := store.Save(context.Background(), PlayerState{ID: "u2", Name: "Lin"}, "home"); err != nil {
  		t.Fatalf("Save: %v", err)
  	}
  	ttl := mr.TTL("space:player:u2")
  	if ttl <= 0 || ttl > time.Hour {
  		t.Fatalf("expected TTL in (0, 1h], got %v", ttl)
  	}
  }
  ```
- [ ] Run: from `services/space-server`, `go test ./...`. **Expected: FAIL to compile** (`undefined: RedisStore`). If Go is unavailable, note "deferred to Docker build" and proceed.

#### 3b — Implementation

- [ ] Create `services/space-server/store.go`:
  ```go
  package main

  import (
  	"context"
  	"strconv"
  	"time"

  	"github.com/redis/go-redis/v9"
  )

  const playerTTL = time.Hour

  func playerKey(id string) string { return "space:player:" + id }

  // Store persists durable per-player state (survives server restart).
  type Store interface {
  	Save(ctx context.Context, p PlayerState, room string) error
  	Restore(ctx context.Context, id string) (PlayerState, bool, error)
  }

  // RedisStore is the production Store backed by go-redis.
  type RedisStore struct {
  	rdb *redis.Client
  }

  // NewRedisStore connects to addr (e.g. "redis:6379").
  func NewRedisStore(addr string) *RedisStore {
  	return &RedisStore{rdb: redis.NewClient(&redis.Options{Addr: addr})}
  }

  // Save writes the player hash and refreshes the 1h TTL.
  func (s *RedisStore) Save(ctx context.Context, p PlayerState, room string) error {
  	key := playerKey(p.ID)
  	if err := s.rdb.HSet(ctx, key,
  		"x", p.X,
  		"y", p.Y,
  		"z", p.Z,
  		"yaw", p.Yaw,
  		"name", p.Name,
  		"room", room,
  	).Err(); err != nil {
  		return err
  	}
  	return s.rdb.Expire(ctx, key, playerTTL).Err()
  }

  // Restore reads the player hash. ok=false when the key does not exist.
  func (s *RedisStore) Restore(ctx context.Context, id string) (PlayerState, bool, error) {
  	m, err := s.rdb.HGetAll(ctx, playerKey(id)).Result()
  	if err != nil {
  		return PlayerState{}, false, err
  	}
  	if len(m) == 0 {
  		return PlayerState{}, false, nil
  	}
  	atof := func(k string) float64 {
  		f, _ := strconv.ParseFloat(m[k], 64)
  		return f
  	}
  	return PlayerState{
  		ID:   id,
  		Name: m["name"],
  		X:    atof("x"),
  		Y:    atof("y"),
  		Z:    atof("z"),
  		Yaw:  atof("yaw"),
  	}, true, nil
  }
  ```
- [ ] Run: from `services/space-server`, `go test -run TestRedisStore ./...`. **Expected: PASS** (3 tests). If Go is unavailable, note "deferred to Docker build".
- [ ] Commit: `feat(space): Redis Store with HSET + 1h TTL persistence`

---

### Task 4: Room-keyed hub (TDD — isolation, join/leave, snapshot, restore)

**Files:** Create `services/space-server/hub.go`, `services/space-server/hub_test.go`.

The hub holds `map[room]map[*Client]bool`. The `Client` struct keeps a buffered `send` channel and its `room`/`state`, so tests can register a client with a buffered channel and assert what gets pushed — no real socket needed.

#### 4a — Failing test first

- [ ] Create `services/space-server/hub_test.go`:
  ```go
  package main

  import (
  	"context"
  	"encoding/json"
  	"testing"

  	"github.com/alicebob/miniredis/v2"
  	"github.com/redis/go-redis/v9"
  )

  // newClient makes a registerable client with a buffered channel (no socket).
  func newClient(id, name, room string) *Client {
  	return &Client{
  		send:  make(chan []byte, 16),
  		room:  room,
  		state: PlayerState{ID: id, Name: name},
  	}
  }

  // drain decodes all currently-buffered ServerMessages on a client's channel.
  func drain(c *Client) []ServerMessage {
  	var out []ServerMessage
  	for {
  		select {
  		case b := <-c.send:
  			var m ServerMessage
  			_ = json.Unmarshal(b, &m)
  			out = append(out, m)
  		default:
  			return out
  		}
  	}
  }

  func hubWithStore(t *testing.T) *Hub {
  	t.Helper()
  	mr, err := miniredis.Run()
  	if err != nil {
  		t.Fatalf("miniredis: %v", err)
  	}
  	t.Cleanup(mr.Close)
  	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
  	return newHub(&RedisStore{rdb: rdb})
  }

  func TestHub_JoinSendsSnapshotAndBroadcastsJoined(t *testing.T) {
  	hub := hubWithStore(t)
  	a := newClient("a", "A", "home")
  	hub.register(context.Background(), a)
  	// First client: gets its own "players" snapshot, no peers to broadcast to.
  	msgsA := drain(a)
  	if len(msgsA) != 1 || msgsA[0].Type != "players" {
  		t.Fatalf("first join: want [players], got %+v", msgsA)
  	}

  	b := newClient("b", "B", "home")
  	hub.register(context.Background(), b)
  	// b receives its snapshot (containing a and b).
  	msgsB := drain(b)
  	if len(msgsB) != 1 || msgsB[0].Type != "players" || len(msgsB[0].Players) != 2 {
  		t.Fatalf("b snapshot: want players with 2, got %+v", msgsB)
  	}
  	// a receives "joined" for b.
  	msgsA = drain(a)
  	if len(msgsA) != 1 || msgsA[0].Type != "joined" || msgsA[0].Player == nil || msgsA[0].Player.ID != "b" {
  		t.Fatalf("a should get joined(b), got %+v", msgsA)
  	}
  }

  func TestHub_RoomIsolation(t *testing.T) {
  	hub := hubWithStore(t)
  	home := newClient("h", "H", "home")
  	other := newClient("o", "O", "galaxy2")
  	hub.register(context.Background(), home)
  	hub.register(context.Background(), other)
  	drain(home)
  	drain(other)

  	// A join in "home" must NOT reach "galaxy2".
  	late := newClient("l", "L", "home")
  	hub.register(context.Background(), late)
  	if got := drain(other); len(got) != 0 {
  		t.Fatalf("cross-room leak: galaxy2 got %+v", got)
  	}
  	if got := drain(home); len(got) != 1 || got[0].Type != "joined" {
  		t.Fatalf("home should get joined(l), got %+v", got)
  	}
  }

  func TestHub_UnregisterBroadcastsLeftToRoomOnly(t *testing.T) {
  	hub := hubWithStore(t)
  	a := newClient("a", "A", "home")
  	b := newClient("b", "B", "home")
  	other := newClient("o", "O", "galaxy2")
  	hub.register(context.Background(), a)
  	hub.register(context.Background(), b)
  	hub.register(context.Background(), other)
  	drain(a)
  	drain(b)
  	drain(other)

  	hub.unregister(b)
  	if got := drain(a); len(got) != 1 || got[0].Type != "left" || got[0].ID != "b" {
  		t.Fatalf("a should get left(b), got %+v", got)
  	}
  	if got := drain(other); len(got) != 0 {
  		t.Fatalf("galaxy2 should not see home leave, got %+v", got)
  	}
  }

  func TestHub_StateUpdateSnapshotPerRoom(t *testing.T) {
  	hub := hubWithStore(t)
  	a := newClient("a", "A", "home")
  	o := newClient("o", "O", "galaxy2")
  	hub.register(context.Background(), a)
  	hub.register(context.Background(), o)
  	drain(a)
  	drain(o)

  	x := 5.0
  	hub.applyState(context.Background(), a, ClientMessage{Type: "state", X: &x})
  	hub.tickRoom("home") // broadcast state_update to home only

  	got := drain(a)
  	if len(got) != 1 || got[0].Type != "state_update" {
  		t.Fatalf("a want state_update, got %+v", got)
  	}
  	if len(got[0].Players) != 1 || got[0].Players[0].X != 5.0 {
  		t.Fatalf("snapshot should reflect X=5, got %+v", got[0].Players)
  	}
  	if leaked := drain(o); len(leaked) != 0 {
  		t.Fatalf("galaxy2 must not get home tick, got %+v", leaked)
  	}
  }

  func TestHub_EmoteBroadcastsToRoom(t *testing.T) {
  	hub := hubWithStore(t)
  	a := newClient("a", "A", "home")
  	b := newClient("b", "B", "home")
  	hub.register(context.Background(), a)
  	hub.register(context.Background(), b)
  	drain(a)
  	drain(b)

  	hub.emote(a, "happy")
  	for _, c := range []*Client{a, b} {
  		got := drain(c)
  		if len(got) != 1 || got[0].Type != "emote" || got[0].ID != "a" || got[0].Emoji != "happy" {
  			t.Fatalf("emote not delivered to %s: %+v", c.state.ID, got)
  		}
  	}
  }

  func TestHub_RegisterRestoresFromRedis(t *testing.T) {
  	hub := hubWithStore(t)
  	// Pre-seed persisted state for "a".
  	if err := hub.store.Save(context.Background(), PlayerState{ID: "a", Name: "A", X: 99, Y: 1, Z: 2, Yaw: 0.3}, "home"); err != nil {
  		t.Fatalf("seed: %v", err)
  	}
  	a := newClient("a", "A", "home")
  	hub.register(context.Background(), a)
  	if a.state.X != 99 || a.state.Z != 2 || a.state.Yaw != 0.3 {
  		t.Fatalf("expected restored state, got %+v", a.state)
  	}
  }

  func TestHub_ApplyStatePersists(t *testing.T) {
  	hub := hubWithStore(t)
  	a := newClient("a", "A", "home")
  	hub.register(context.Background(), a)
  	drain(a)

  	x, y, z, yaw := 7.0, 8.0, 9.0, 1.1
  	hub.applyState(context.Background(), a, ClientMessage{Type: "state", X: &x, Y: &y, Z: &z, Yaw: &yaw})

  	got, ok, err := hub.store.Restore(context.Background(), "a")
  	if err != nil || !ok {
  		t.Fatalf("expected persisted state, ok=%v err=%v", ok, err)
  	}
  	if got.X != 7 || got.Y != 8 || got.Z != 9 || got.Yaw != 1.1 {
  		t.Fatalf("persisted state wrong: %+v", got)
  	}
  }
  ```
- [ ] Run: from `services/space-server`, `go test -run TestHub ./...`. **Expected: FAIL to compile** (`undefined: Hub`, `newHub`, `Client`, etc.). If Go is unavailable, note "deferred to Docker build".

#### 4b — Implementation

- [ ] Create `services/space-server/hub.go`:
  ```go
  package main

  import (
  	"context"
  	"encoding/json"
  	"log"
  	"sync"
  )

  // Client is one connected presence. send is buffered; tests fill state/room directly.
  type Client struct {
  	conn  wsConn
  	send  chan []byte
  	room  string
  	state PlayerState
  }

  // wsConn is the minimal websocket surface the hub/pumps use (kept here so the
  // hub package compiles without importing gorilla in tests).
  type wsConn interface {
  	ReadMessage() (int, []byte, error)
  	WriteMessage(messageType int, data []byte) error
  	Close() error
  }

  // Hub holds presence keyed by room and persists durable state via store.
  type Hub struct {
  	mu    sync.RWMutex
  	rooms map[string]map[*Client]bool
  	store Store
  }

  func newHub(store Store) *Hub {
  	return &Hub{
  		rooms: make(map[string]map[*Client]bool),
  		store: store,
  	}
  }

  // roomPlayers returns a snapshot of states in a room (caller holds no lock).
  func (h *Hub) roomPlayers(room string) []PlayerState {
  	h.mu.RLock()
  	defer h.mu.RUnlock()
  	set := h.rooms[room]
  	out := make([]PlayerState, 0, len(set))
  	for c := range set {
  		out = append(out, c.state)
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
  	for c := range h.rooms[room] {
  		select {
  		case c.send <- data:
  		default:
  		}
  	}
  }

  // send pushes a single message to one client (snapshot on join).
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
  // sends it the room snapshot, then broadcasts "joined" to the room.
  func (h *Hub) register(ctx context.Context, c *Client) {
  	if prev, ok, err := h.store.Restore(ctx, c.state.ID); err != nil {
  		log.Printf("restore %s: %v", c.state.ID, err)
  	} else if ok {
  		// Keep the (fresh) name/id from the query; restore position+yaw.
  		c.state.X, c.state.Y, c.state.Z, c.state.Yaw = prev.X, prev.Y, prev.Z, prev.Yaw
  	}

  	h.mu.Lock()
  	if h.rooms[c.room] == nil {
  		h.rooms[c.room] = make(map[*Client]bool)
  	}
  	h.rooms[c.room][c] = true
  	h.mu.Unlock()

  	c.send1(ServerMessage{Type: "players", Players: h.roomPlayers(c.room)})
  	h.broadcastJoined(c)
  }

  // broadcastJoined notifies peers (NOT the joiner) that c arrived.
  func (h *Hub) broadcastJoined(c *Client) {
  	data, err := json.Marshal(ServerMessage{Type: "joined", Player: &c.state})
  	if err != nil {
  		return
  	}
  	h.mu.RLock()
  	defer h.mu.RUnlock()
  	for peer := range h.rooms[c.room] {
  		if peer == c {
  			continue
  		}
  		select {
  		case peer.send <- data:
  		default:
  		}
  	}
  }

  // unregister removes c and broadcasts "left" to the rest of its room.
  func (h *Hub) unregister(c *Client) {
  	h.mu.Lock()
  	set := h.rooms[c.room]
  	if set != nil {
  		delete(set, c)
  		if len(set) == 0 {
  			delete(h.rooms, c.room)
  		}
  	}
  	h.mu.Unlock()
  	close(c.send)
  	h.broadcastRoom(c.room, ServerMessage{Type: "left", ID: c.state.ID})
  }

  // applyState merges a "state" frame into the client and persists to the store.
  func (h *Hub) applyState(ctx context.Context, c *Client, msg ClientMessage) {
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
  	if err := h.store.Save(ctx, c.state, c.room); err != nil {
  		log.Printf("save %s: %v", c.state.ID, err)
  	}
  }

  // emote broadcasts an emoji from c to the whole room.
  func (h *Hub) emote(c *Client, emoji string) {
  	h.broadcastRoom(c.room, ServerMessage{Type: "emote", ID: c.state.ID, Emoji: emoji})
  }

  // tickRoom broadcasts the current snapshot of one room as a state_update.
  func (h *Hub) tickRoom(room string) {
  	h.broadcastRoom(room, ServerMessage{Type: "state_update", Players: h.roomPlayers(room)})
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
  > NOTE: `conn wsConn` lets tests construct a `Client` with a nil conn (they never call socket methods). `main.go` wraps the real `*websocket.Conn`, which satisfies `wsConn`.
- [ ] Run: from `services/space-server`, `go test -run TestHub ./...`. **Expected: PASS** (7 tests). If Go is unavailable, note "deferred to Docker build".
- [ ] Run the full package: `go test ./...`. **Expected: PASS** (Store + Hub tests). If Go unavailable, note deferral.
- [ ] Commit: `feat(space): room-keyed hub with presence, emotes and tick`

---

### Task 5: HTTP server, WebSocket upgrade, client pumps, tick loop (main.go)

**Files:** Create `services/space-server/main.go`.

This wires the real socket to the hub: upgrade on `/space-ws`, read id/name/room from the query, run a read pump (handles `state`/`emote`) and a write pump, and start the ~18 Hz server tick. This is integration glue — verify by build/compile + (user) running the stack.

- [ ] Create `services/space-server/main.go`:
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
  			hub.applyState(context.Background(), c, msg)
  		case "emote":
  			hub.emote(c, msg.Emoji)
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
  	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
  		w.Header().Set("Content-Type", "application/json")
  		w.Write([]byte(`{"status":"ok"}`))
  	})

  	log.Println("Space server listening on :8080")
  	log.Fatal(http.ListenAndServe(":8080", nil))
  }
  ```
  > NOTE: `*websocket.Conn` satisfies the `wsConn` interface from `hub.go` (it has `ReadMessage`, `WriteMessage(int, []byte) error`, and `Close() error`), so no adapter is needed.
- [ ] Run: from `services/space-server`, `go build ./...`. **Expected: builds with no errors.** If Go is unavailable, note "deferred to Docker build" (the build stage compiles this).
- [ ] Run the full test suite once more to confirm nothing regressed: `go test ./...`. **Expected: PASS.** (deferral note if Go unavailable).
- [ ] Commit: `feat(space): WebSocket server, pumps and 18Hz tick loop`

---

### Task 6: Dockerfile (multi-stage, mirror of game-server)

**Files:** Create `services/space-server/Dockerfile`.

Mirror `services/game-server/Dockerfile`, but copy `go.sum` too (this module has deps that produce a `go.sum`) and build the `space-server` binary.

- [ ] Create `services/space-server/Dockerfile`:
  ```dockerfile
  FROM golang:1.22-alpine AS builder

  WORKDIR /app
  COPY go.mod go.sum ./
  RUN go mod download
  COPY . .
  RUN CGO_ENABLED=0 GOOS=linux go build -o /space-server .

  FROM alpine:3.20
  RUN apk --no-cache add ca-certificates tzdata
  COPY --from=builder /space-server .
  EXPOSE 8080
  CMD ["./space-server"]
  ```
  > NOTE: `go.sum` must exist (created by `go mod tidy` in Task 1). If for any reason it is absent, the `COPY go.mod go.sum ./` line fails the build — run `go mod tidy` first.
- [ ] Verify (user, optional local): from `services/space-server`, `docker build -t space-server-test .`. **Expected: image builds; the `go build` step compiles the package and would surface any Go error.** This is where the Go tests/build are validated if no local toolchain exists; for a test pass run `docker run --rm -v ${PWD}:/app -w /app golang:1.22-alpine sh -c "go test ./..."`.
- [ ] Commit: `feat(space): Dockerfile for space-server (multi-stage Go)`

---

### Task 7: Caddy route — add /space-ws to BOTH blocks

**Files:** Modify `proxy/Caddyfile`.

Add `handle /space-ws { reverse_proxy space-server:8080 }` in BOTH the production `{$DOMAIN:localhost:8080}` block and the dev `:8080` block, placed right after the existing `handle /ws` (Game WebSocket) block and BEFORE the catch-all shell `handle {}`.

- [ ] In the production block, after the `handle /ws { reverse_proxy game-server:8080 }` block (around line 45), insert:
  ```
  	# Space WebSocket server (multiplayer presence)
  	handle /space-ws {
  		reverse_proxy space-server:8080
  	}
  ```
- [ ] In the dev `:8080` block, after its `handle /ws { reverse_proxy game-server:8080 }` block (around line 122), insert the identical block:
  ```
  	# Space WebSocket server (multiplayer presence)
  	handle /space-ws {
  		reverse_proxy space-server:8080
  	}
  ```
- [ ] Verify placement: both new blocks must appear BEFORE their block's catch-all `handle { root * /usr/share/shell ... }`. Confirm there are now TWO `handle /space-ws` blocks total (one per server block).
- [ ] Verify syntax (user, optional): `docker run --rm -v ${PWD}/proxy/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`. **Expected: "Valid configuration".**
- [ ] Commit: `feat(space): Caddy route /space-ws -> space-server`

---

### Task 8: docker-compose — add redis + space-server, wire caddy depends_on

**Files:** Modify `deploy/docker-compose.yml`.

Add a `redis` service (with AOF persistence on a named volume) and a `space-server` service (`REDIS_ADDR=redis:6379`, `depends_on: [redis]`). Add both to the `caddy` `depends_on`, and add the `redis_data` named volume.

- [ ] In the `caddy` service `depends_on` list (currently ending at `test-dos`), add two entries so it reads:
  ```yaml
      depends_on:
        - backend
        - app-dashboard
        - app-viewer-3d
        - app-mundo-3d
        - app-combate-3d
        - game-server
        - space-server
        - redis
        - oktomatzo2-app
        - test-uno
        - test-dos
  ```
- [ ] After the `game-server` service block (ends at its `ports:` mapping `"127.0.0.1:8091:8080"`, around line 84), add the `redis` and `space-server` services:
  ```yaml
    redis:
      image: redis:alpine
      restart: unless-stopped
      command: ["redis-server", "--appendonly", "yes"]
      volumes:
        - redis_data:/data
      ports:
        - "127.0.0.1:8092:6379"

    space-server:
      build:
        context: ../services/space-server
        dockerfile: Dockerfile
      restart: unless-stopped
      environment:
        - REDIS_ADDR=redis:6379
      depends_on:
        - redis
      ports:
        - "127.0.0.1:8093:8080"
  ```
- [ ] In the top-level `volumes:` block (currently `caddy_data`, `caddy_config`, `backend_data`), add `redis_data`:
  ```yaml
  volumes:
    caddy_data:
    caddy_config:
    backend_data:
    redis_data:
  ```
- [ ] Verify config (user, optional): from `deploy/`, `docker compose config` (with `JWT_SECRET` set in env). **Expected: prints the merged config with `redis` + `space-server` and no errors.**
- [ ] Commit: `feat(space): compose services redis + space-server`

---

### Task 9: Final verification + deploy handoff

**Files:** none (verification only).

- [ ] From `services/space-server`, run `go test ./...`. **Expected: PASS** (Store: 3 tests, Hub: 7 tests). If Go is unavailable locally, run `docker run --rm -v ${PWD}:/app -w /app golang:1.22-alpine sh -c "go test ./..."` (requires `golang:1.22-alpine` pulled) — note this in the step.
- [ ] From `services/space-server`, run `go vet ./...`. **Expected: no findings.** (deferral note if Go unavailable).
- [ ] Confirm the WebSocket protocol in `types.go` matches the pinned protocol exactly (field names `id,name,x,y,z,yaw`; message types `state`/`emote` in, `players`/`state_update`/`joined`/`left`/`emote` out). This contract is what the client plan (`2026-06-15-multijugador-02-cliente.md`) builds against.
- [ ] Deploy handoff (USER runs, NOT this plan): pre-pull `golang:1.22-alpine`, `alpine:3.20`, `redis:alpine` (avoids the Docker Hub TLS-timeout); then from `deploy/`: `docker compose build space-server redis && docker compose up -d redis space-server caddy`. Manual validation: open the shell in 2+ browsers post-login → remote ships move with names + emotes; disconnect/reconnect restores position (Redis continuity).
- [ ] Commit (if any verification fixups were needed): `test(space): verify space-server suite green`
