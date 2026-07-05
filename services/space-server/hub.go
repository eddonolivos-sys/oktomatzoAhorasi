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
