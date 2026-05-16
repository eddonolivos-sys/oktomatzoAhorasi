package handler

import (
	"errors"
	"net/http"

	"plataforma/backend/internal/domain"
)

func getUserFromContext(r *http.Request) (*domain.User, error) {
	user, ok := r.Context().Value(UserContextKey).(*domain.User)
	if !ok || user == nil {
		return nil, errors.New("user not found in context")
	}
	return user, nil
}
