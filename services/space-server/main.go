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
			// Bound the per-state Save so a hung Redis can't pin this goroutine.
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			hub.applyState(ctx, c, msg)
			cancel()
		case "emote":
			hub.emote(c, msg.Emoji)
		case "ping":
			c.send1(pongFor(msg))
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
