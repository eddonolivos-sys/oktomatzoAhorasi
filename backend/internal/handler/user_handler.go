package handler

import (
	"net/http"

	"plataforma/backend/internal/domain"
	"plataforma/backend/internal/service"
)

type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

type updateUserRequest struct {
	Name  *string      `json:"name"`
	Email *string      `json:"email"`
	Role  *domain.Role `json:"role"`
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.userService.ListUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(users))
}

func (h *UserHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing user id"))
		return
	}

	user, err := h.userService.GetUser(r.Context(), id)
	if err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	user.Password = ""
	writeJSON(w, http.StatusOK, apiData(user))
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing user id"))
		return
	}

	var req updateUserRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError("invalid request body"))
		return
	}

	user, err := h.userService.UpdateUser(r.Context(), service.UpdateUserInput{
		ID:    id,
		Name:  req.Name,
		Email: req.Email,
		Role:  req.Role,
	})
	if err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	user.Password = ""
	writeJSON(w, http.StatusOK, apiData(user))
}

func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing user id"))
		return
	}

	if err := h.userService.DeleteUser(r.Context(), id); err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(map[string]string{"message": "user deleted"}))
}

func (h *UserHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing user id"))
		return
	}

	var req changePasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError("invalid request body"))
		return
	}

	if err := h.userService.ChangePassword(r.Context(), id, req.OldPassword, req.NewPassword); err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		} else if err == domain.ErrInvalidCreds {
			code = http.StatusUnauthorized
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(map[string]string{"message": "password changed"}))
}
