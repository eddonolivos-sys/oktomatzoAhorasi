package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type PlayerState struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	X       float64 `json:"x"`
	Z       float64 `json:"z"`
	Heading float64 `json:"heading"`
	Speed   float64 `json:"speed"`
	Alive   bool    `json:"alive"`
	Health  float64 `json:"health"`
}

type HazardState struct {
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Z       float64 `json:"z"`
	Landed  bool    `json:"landed"`
	Index   int     `json:"index"`
}

type ServerMessage struct {
	Type    string        `json:"type"`
	Players []PlayerState `json:"players,omitempty"`
	Player  *PlayerState  `json:"player,omitempty"`
	ID      string        `json:"id,omitempty"`
	Hazards []HazardState `json:"hazards,omitempty"`
	Shooter string        `json:"shooter,omitempty"`
	Origin  [3]float64    `json:"origin,omitempty"`
	Dir     [3]float64    `json:"dir,omitempty"`
	Amount  float64       `json:"amount,omitempty"`
}

type ClientMessage struct {
	Type    string     `json:"type"`
	ID      string     `json:"id"`
	Name    string     `json:"name,omitempty"`
	X       *float64   `json:"x,omitempty"`
	Z       *float64   `json:"z,omitempty"`
	Heading *float64   `json:"heading,omitempty"`
	Speed   *float64   `json:"speed,omitempty"`
	Alive   *bool      `json:"alive,omitempty"`
	Health  *float64   `json:"health,omitempty"`
	Origin  [3]float64 `json:"origin,omitempty"`
	Dir     [3]float64 `json:"dir,omitempty"`
	Index   *int       `json:"index,omitempty"`
	TargetID string    `json:"targetId,omitempty"`
	Amount   *float64  `json:"amount,omitempty"`
}

type Client struct {
	conn  *websocket.Conn
	send  chan []byte
	state PlayerState
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
	hazards []HazardState
	hazardN int
}

func newHub() *Hub {
	return &Hub{
		clients: make(map[*Client]bool),
		hazards: make([]HazardState, 0),
	}
}

func (h *Hub) broadcast(msg ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) getPlayers() []PlayerState {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]PlayerState, 0, len(h.clients))
	for c := range h.clients {
		out = append(out, c.state)
	}
	return out
}

func (h *Hub) register(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	// Send current state to the new client
	h.mu.RLock()
	hazardCopy := make([]HazardState, len(h.hazards))
	copy(hazardCopy, h.hazards)
	h.mu.RUnlock()
	c.sendState(ServerMessage{Type: "hazards", Hazards: hazardCopy})
	c.sendState(ServerMessage{Type: "players", Players: h.getPlayers()})
	// Broadcast new player
	h.broadcast(ServerMessage{Type: "player_joined", Player: &c.state})
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	close(c.send)
	h.broadcast(ServerMessage{Type: "player_left", ID: c.state.ID})
}

func (h *Hub) addHazards(count int) {
	h.mu.Lock()
	for i := 0; i < count; i++ {
		h.hazardN++
		h.hazards = append(h.hazards, HazardState{
		X:     (float64(time.Now().UnixNano()%1000)/1000 - 0.5) * 960,
		Y:     120,
		Z:     (float64(time.Now().UnixNano()%1000+int64(h.hazardN)*100)/1000 - 0.5) * 960,
			Index: h.hazardN,
		})
	}
	hazCopy := make([]HazardState, len(h.hazards))
	copy(hazCopy, h.hazards)
	h.mu.Unlock()
	h.broadcast(ServerMessage{Type: "hazards", Hazards: hazCopy})
}

func (h *Hub) removeHazard(index int) {
	h.mu.Lock()
	for i, hz := range h.hazards {
		if hz.Index == index {
			h.hazards = append(h.hazards[:i], h.hazards[i+1:]...)
			break
		}
	}
	hazCopy := make([]HazardState, len(h.hazards))
	copy(hazCopy, h.hazards)
	h.mu.Unlock()
	h.broadcast(ServerMessage{Type: "hazards", Hazards: hazCopy})
}

func (c *Client) sendState(msg ServerMessage) {
	data, _ := json.Marshal(msg)
	select {
	case c.send <- data:
	default:
	}
}

func (h *Hub) hazardLoop() {
	ticker := time.NewTicker(5 * time.Second)
	for range ticker.C {
		h.addHazards(10)
	}
}

func handleWebSocket(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 64),
		state: PlayerState{
			ID:     r.URL.Query().Get("id"),
			Name:   r.URL.Query().Get("name"),
			Alive:  true,
			Health: 100,
		},
	}

	if client.state.ID == "" {
		client.state.ID = fmt.Sprintf("p%d", time.Now().UnixNano()%100000)
	}
	if client.state.Name == "" {
		client.state.Name = "Player_" + client.state.ID[len(client.state.ID)-4:]
	}

	hub.register(client)

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
			if msg.X != nil {
				c.state.X = *msg.X
			}
			if msg.Z != nil {
				c.state.Z = *msg.Z
			}
			if msg.Heading != nil {
				c.state.Heading = *msg.Heading
			}
			if msg.Speed != nil {
				c.state.Speed = *msg.Speed
			}
			if msg.Alive != nil {
				c.state.Alive = *msg.Alive
			}
			if msg.Health != nil {
				c.state.Health = *msg.Health
			}
			hub.broadcast(ServerMessage{
				Type:    "state_update",
				Players: hub.getPlayers(),
			})

		case "shoot":
			hub.broadcast(ServerMessage{
				Type:    "shoot",
				Shooter: msg.ID,
				Origin:  msg.Origin,
				Dir:     msg.Dir,
			})

		case "hit_hazard":
			if msg.Index != nil {
				hub.removeHazard(*msg.Index)
			}

		case "damage":
			amount := 25.0
			if msg.Amount != nil {
				amount = *msg.Amount
			}
			hub.broadcast(ServerMessage{
				Type:    "damage",
				ID:      msg.TargetID,
				Shooter: msg.ID,
				Amount:  amount,
			})
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

func main() {
	hub := newHub()
	go hub.hazardLoop()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleWebSocket(hub, w, r)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","players":`))
		p := hub.getPlayers()
		data, _ := json.Marshal(p)
		w.Write(data)
		w.Write([]byte(`}`))
	})

	log.Println("Game server listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
