package handler

import (
	"net/http"

	"plataforma/backend/internal/domain"
	"plataforma/backend/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type registerRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError("invalid request body"))
		return
	}

	result, err := h.authService.Register(r.Context(), service.RegisterInput{
		Email:    req.Email,
		Name:     req.Name,
		Password: req.Password,
	})
	if err != nil {
		code := http.StatusInternalServerError
		switch err {
		case domain.ErrInvalidInput:
			code = http.StatusBadRequest
		case domain.ErrEmailTaken:
			code = http.StatusConflict
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusCreated, apiData(result))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError("invalid request body"))
		return
	}

	result, err := h.authService.Login(r.Context(), service.LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		code := http.StatusUnauthorized
		if err == domain.ErrInvalidInput {
			code = http.StatusBadRequest
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(result))
}

func (h *AuthHandler) GuestLogin(w http.ResponseWriter, r *http.Request) {
	result, err := h.authService.GuestLogin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, apiData(result))
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, apiError("not authenticated"))
		return
	}

	writeJSON(w, http.StatusOK, apiData(user))
}
