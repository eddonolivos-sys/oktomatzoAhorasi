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
