package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"plataforma/backend/internal/domain"
)

func TestRequireNonGuest_BlocksGuest(t *testing.T) {
	m := &Middleware{}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/apps", nil)
	ctx := context.WithValue(req.Context(), UserContextKey, &domain.User{Role: domain.RoleGuest})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	m.RequireNonGuest(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected status %d, got %d", http.StatusForbidden, rec.Code)
	}

	if called {
		t.Error("expected next handler not to be called")
	}
}

func TestRequireNonGuest_AllowsRegularUser(t *testing.T) {
	m := &Middleware{}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/apps", nil)
	ctx := context.WithValue(req.Context(), UserContextKey, &domain.User{Role: domain.RoleUser})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	m.RequireNonGuest(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	if !called {
		t.Error("expected next handler to be called")
	}
}

func TestRequireNonGuest_BlocksMissingUser(t *testing.T) {
	m := &Middleware{}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/apps", nil)

	rec := httptest.NewRecorder()
	m.RequireNonGuest(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected status %d, got %d", http.StatusForbidden, rec.Code)
	}

	if called {
		t.Error("expected next handler not to be called")
	}
}
