package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"plataforma/backend/internal/domain"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, user *domain.User) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO users (id, email, name, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		user.ID, user.Email, user.Name, user.Password, user.Role, user.CreatedAt, user.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}
	return nil
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, email, name, password, role, created_at, updated_at FROM users WHERE id = ?`, id)

	return scanUser(row)
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, email, name, password, role, created_at, updated_at FROM users WHERE email = ?`, email)

	return scanUser(row)
}

func (r *UserRepository) FindAll(ctx context.Context) ([]*domain.User, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, email, name, password, role, created_at, updated_at FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	if users == nil {
		return []*domain.User{}, nil
	}

	return users, rows.Err()
}

func (r *UserRepository) Update(ctx context.Context, user *domain.User) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET email = ?, name = ?, password = ?, role = ?, updated_at = ? WHERE id = ?`,
		user.Email, user.Name, user.Password, user.Role, user.UpdatedAt, user.ID)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}

func (r *UserRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanUser(row scanner) (*domain.User, error) {
	var user domain.User
	err := row.Scan(&user.ID, &user.Email, &user.Name, &user.Password, &user.Role, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to scan user: %w", err)
	}
	return &user, nil
}

func unmarshalTags(data string) ([]string, error) {
	var tags []string
	if data == "" {
		return []string{}, nil
	}
	if err := json.Unmarshal([]byte(data), &tags); err != nil {
		return []string{}, nil
	}
	return tags, nil
}

func marshalTags(tags []string) string {
	if tags == nil {
		return "[]"
	}
	b, _ := json.Marshal(tags)
	return string(b)
}
