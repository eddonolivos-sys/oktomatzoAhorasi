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
