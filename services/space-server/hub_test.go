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
