package repository

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

func NewSQLiteDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to set WAL mode: %w", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	if err := seedApps(db); err != nil {
		return nil, fmt.Errorf("failed to seed apps: %w", err)
	}

	return db, nil
}

func seedApps(db *sql.DB) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM apps`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	apps := []struct {
		id, name, description, icon, route, src, version, sandbox, category, tags string
	}{
		{"dashboard", "Dashboard Comercial", "Métricas y reportes de ventas", "bar-chart", "/dashboard", "/apps/dashboard/", "1.0.0", "allow-scripts allow-same-origin allow-forms", "Analítica", `["react","chartjs"]`},
		{"viewer-3d", "Visor 3D", "Visualización interactiva de modelos 3D", "cube", "/viewer-3d", "/apps/viewer-3d/", "1.0.0", "allow-scripts allow-same-origin", "Herramientas", `["threejs","webgl"]`},
		{"test-uno", "Proyecto de prueba 1", "Verificación del sistema con iframes", "home", "/test-uno", "/apps/test-uno/", "1.0.0", "allow-scripts allow-same-origin", "Pruebas", `["test","vanilla"]`},
		{"test-dos", "Proyecto de prueba 2", "Segunda verificación con navegación cross-app", "home", "/test-dos", "/apps/test-dos/", "1.0.0", "allow-scripts allow-same-origin", "Pruebas", `["test","vanilla"]`},
	}

	for _, a := range apps {
		_, err := db.Exec(
			`INSERT INTO apps (id, name, description, icon, route, src, version, sandbox, category, tags, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
			a.id, a.name, a.description, a.icon, a.route, a.src, a.version, a.sandbox, a.category, a.tags,
		)
		if err != nil {
			return fmt.Errorf("failed to seed app %s: %w", a.id, err)
		}
	}
	return nil
}

func runMigrations(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			password TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'user',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS apps (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			icon TEXT NOT NULL DEFAULT '',
			route TEXT NOT NULL UNIQUE,
			src TEXT NOT NULL DEFAULT '',
			version TEXT NOT NULL DEFAULT '0.1.0',
			sandbox TEXT NOT NULL DEFAULT 'allow-scripts allow-same-origin',
			category TEXT NOT NULL DEFAULT '',
			tags TEXT NOT NULL DEFAULT '[]',
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_apps_route ON apps(route)`,
		`CREATE INDEX IF NOT EXISTS idx_apps_category ON apps(category)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	return nil
}
