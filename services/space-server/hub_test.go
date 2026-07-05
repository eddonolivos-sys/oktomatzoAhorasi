package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
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

func TestPongFor_EchoesTimestamp(t *testing.T) {
	tVal := 12345.5
	got := pongFor(ClientMessage{Type: "ping", T: &tVal})
	if got.Type != "pong" {
		t.Fatalf("want type=pong, got %q", got.Type)
	}
	if got.T == nil || *got.T != tVal {
		t.Fatalf("want t echoed back as %v, got %+v", tVal, got.T)
	}
}

func TestPongFor_NilTimestampPassesThrough(t *testing.T) {
	got := pongFor(ClientMessage{Type: "ping"})
	if got.T != nil {
		t.Fatalf("want nil t passed through, got %v", *got.T)
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
