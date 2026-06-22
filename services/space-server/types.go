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
