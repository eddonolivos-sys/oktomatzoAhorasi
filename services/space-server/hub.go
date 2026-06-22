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
