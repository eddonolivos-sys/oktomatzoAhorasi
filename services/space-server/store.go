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
