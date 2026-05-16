package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"plataforma/backend/internal/domain"
)

type AppRepository struct {
	db *sql.DB
}

func NewAppRepository(db *sql.DB) *AppRepository {
	return &AppRepository{db: db}
}

func (r *AppRepository) Create(ctx context.Context, app *domain.App) error {
	tagsJSON, _ := json.Marshal(app.Tags)
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO apps (id, name, description, icon, route, src, version, sandbox, category, tags, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		app.ID, app.Name, app.Description, app.Icon, app.Route, app.Src, app.Version, app.Sandbox, app.Category, string(tagsJSON), boolToInt(app.Enabled), app.CreatedAt, app.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create app: %w", err)
	}
	return nil
}

func (r *AppRepository) FindByID(ctx context.Context, id string) (*domain.App, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, name, description, icon, route, src, version, sandbox, category, tags, enabled, created_at, updated_at FROM apps WHERE id = ?`, id)
	return scanApp(row)
}

func (r *AppRepository) FindAll(ctx context.Context) ([]*domain.App, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, icon, route, src, version, sandbox, category, tags, enabled, created_at, updated_at FROM apps ORDER BY name ASC`)
	if err != nil {
		return nil, fmt.Errorf("failed to query apps: %w", err)
	}
	defer rows.Close()

	var apps []*domain.App
	for rows.Next() {
		app, err := scanApp(rows)
		if err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}

	if apps == nil {
		return []*domain.App{}, nil
	}

	return apps, rows.Err()
}

func (r *AppRepository) FindByCategory(ctx context.Context, category string) ([]*domain.App, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, icon, route, src, version, sandbox, category, tags, enabled, created_at, updated_at FROM apps WHERE category = ? ORDER BY name ASC`, category)
	if err != nil {
		return nil, fmt.Errorf("failed to query apps by category: %w", err)
	}
	defer rows.Close()

	var apps []*domain.App
	for rows.Next() {
		app, err := scanApp(rows)
		if err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}

	if apps == nil {
		return []*domain.App{}, nil
	}

	return apps, rows.Err()
}

func (r *AppRepository) Update(ctx context.Context, app *domain.App) error {
	tagsJSON, _ := json.Marshal(app.Tags)
	_, err := r.db.ExecContext(ctx,
		`UPDATE apps SET name = ?, description = ?, icon = ?, route = ?, src = ?, version = ?, sandbox = ?, category = ?, tags = ?, enabled = ?, updated_at = ? WHERE id = ?`,
		app.Name, app.Description, app.Icon, app.Route, app.Src, app.Version, app.Sandbox, app.Category, string(tagsJSON), boolToInt(app.Enabled), app.UpdatedAt, app.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update app: %w", err)
	}
	return nil
}

func (r *AppRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM apps WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete app: %w", err)
	}
	return nil
}

func scanApp(row scanner) (*domain.App, error) {
	var app domain.App
	var tagsJSON string
	var enabledInt int

	err := row.Scan(&app.ID, &app.Name, &app.Description, &app.Icon, &app.Route, &app.Src, &app.Version, &app.Sandbox, &app.Category, &tagsJSON, &enabledInt, &app.CreatedAt, &app.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to scan app: %w", err)
	}

	json.Unmarshal([]byte(tagsJSON), &app.Tags)
	if app.Tags == nil {
		app.Tags = []string{}
	}

	app.Enabled = enabledInt == 1

	return &app, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func intToBool(i int) bool {
	return i == 1
}
