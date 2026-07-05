package service

import (
	"context"
	"testing"
	"time"

	"plataforma/backend/internal/domain"
)

type mockUserRepository struct {
	users         map[string]*domain.User
	usersByEmail  map[string]*domain.User
	findByIDCalls int
}

func newMockUserRepository() *mockUserRepository {
	return &mockUserRepository{
		users:        make(map[string]*domain.User),
		usersByEmail: make(map[string]*domain.User),
	}
}

func (m *mockUserRepository) Create(ctx context.Context, user *domain.User) error {
	m.users[user.ID] = user
	m.usersByEmail[user.Email] = user
	return nil
}

func (m *mockUserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	m.findByIDCalls++
	user, ok := m.users[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return user, nil
}

func (m *mockUserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	user, ok := m.usersByEmail[email]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return user, nil
}

func (m *mockUserRepository) FindAll(ctx context.Context) ([]*domain.User, error) {
	all := make([]*domain.User, 0, len(m.users))
	for _, u := range m.users {
		all = append(all, u)
	}
	return all, nil
}

func (m *mockUserRepository) Update(ctx context.Context, user *domain.User) error {
	m.users[user.ID] = user
	return nil
}

func (m *mockUserRepository) Delete(ctx context.Context, id string) error {
	delete(m.users, id)
	return nil
}

func TestGuestLogin_ReturnsStatelessGuestUser(t *testing.T) {
	repo := newMockUserRepository()
	svc := NewAuthService(repo, []byte("test-secret"), time.Hour, 24*time.Hour)

	result, err := svc.GuestLogin(context.Background())
	if err != nil {
		t.Fatalf("GuestLogin returned error: %v", err)
	}

	if result.User.Role != domain.RoleGuest {
		t.Errorf("expected role %q, got %q", domain.RoleGuest, result.User.Role)
	}

	if result.Token == "" {
		t.Error("expected non-empty token")
	}

	if repo.findByIDCalls != 0 {
		t.Errorf("expected 0 calls to FindByID, got %d", repo.findByIDCalls)
	}
}

func TestValidateToken_GuestShortCircuitsWithoutDBLookup(t *testing.T) {
	repo := newMockUserRepository()
	svc := NewAuthService(repo, []byte("test-secret"), time.Hour, 24*time.Hour)

	result, err := svc.GuestLogin(context.Background())
	if err != nil {
		t.Fatalf("GuestLogin returned error: %v", err)
	}

	user, err := svc.ValidateToken(context.Background(), result.Token)
	if err != nil {
		t.Fatalf("ValidateToken returned error: %v", err)
	}

	if user.Role != domain.RoleGuest {
		t.Errorf("expected role %q, got %q", domain.RoleGuest, user.Role)
	}

	if repo.findByIDCalls != 0 {
		t.Errorf("expected 0 calls to FindByID, got %d", repo.findByIDCalls)
	}
}

func TestValidateToken_RegularUserStillLooksUpDB(t *testing.T) {
	repo := newMockUserRepository()
	svc := NewAuthService(repo, []byte("test-secret"), time.Hour, 24*time.Hour)

	u := &domain.User{
		ID:        "user-1",
		Email:     "user@example.com",
		Name:      "Regular User",
		Role:      domain.RoleUser,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	repo.users[u.ID] = u
	repo.usersByEmail[u.Email] = u

	token, err := svc.generateToken(u)
	if err != nil {
		t.Fatalf("generateToken returned error: %v", err)
	}

	resolved, err := svc.ValidateToken(context.Background(), token)
	if err != nil {
		t.Fatalf("ValidateToken returned error: %v", err)
	}

	if resolved.ID != u.ID {
		t.Errorf("expected resolved user ID %q, got %q", u.ID, resolved.ID)
	}

	if repo.findByIDCalls != 1 {
		t.Errorf("expected 1 call to FindByID, got %d", repo.findByIDCalls)
	}
}

func TestGuestLogin_TokenExpiryShorterThanRegular(t *testing.T) {
	repo := newMockUserRepository()
	svc := NewAuthService(repo, []byte("test-secret"), 72*time.Hour, 24*time.Hour)

	result, err := svc.GuestLogin(context.Background())
	if err != nil {
		t.Fatalf("GuestLogin returned error: %v", err)
	}

	claims, err := parseToken(result.Token, svc.jwtSecret)
	if err != nil {
		t.Fatalf("parseToken returned error: %v", err)
	}

	duration := claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time)
	if duration < 23*time.Hour || duration > 25*time.Hour {
		t.Errorf("expected guest token expiry between 23h and 25h, got %v", duration)
	}
}
