package domain

import (
	"context"
	"time"
)

type App struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Icon        string    `json:"icon"`
	Route       string    `json:"route"`
	Src         string    `json:"src"`
	Version     string    `json:"version"`
	Sandbox     string    `json:"sandbox"`
	Category    string    `json:"category"`
	Tags        []string  `json:"tags"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type AppRepository interface {
	Create(ctx context.Context, app *App) error
	FindByID(ctx context.Context, id string) (*App, error)
	FindAll(ctx context.Context) ([]*App, error)
	FindByCategory(ctx context.Context, category string) ([]*App, error)
	Update(ctx context.Context, app *App) error
	Delete(ctx context.Context, id string) error
}
