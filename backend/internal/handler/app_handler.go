package handler

import (
	"net/http"

	"plataforma/backend/internal/domain"
	"plataforma/backend/internal/service"
)

type AppHandler struct {
	appService *service.AppService
}

func NewAppHandler(appService *service.AppService) *AppHandler {
	return &AppHandler{appService: appService}
}

type createAppRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	Route       string   `json:"route"`
	Src         string   `json:"src"`
	Version     string   `json:"version"`
	Sandbox     string   `json:"sandbox"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
}

type updateAppRequest struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	Icon        *string   `json:"icon"`
	Route       *string   `json:"route"`
	Src         *string   `json:"src"`
	Version     *string   `json:"version"`
	Sandbox     *string   `json:"sandbox"`
	Category    *string   `json:"category"`
	Tags        *[]string `json:"tags"`
	Enabled     *bool     `json:"enabled"`
}

func (h *AppHandler) List(w http.ResponseWriter, r *http.Request) {
	apps, err := h.appService.List(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(apps))
}

func (h *AppHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing app id"))
		return
	}

	app, err := h.appService.GetByID(r.Context(), id)
	if err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(app))
}

func (h *AppHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createAppRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError("invalid request body"))
		return
	}

	app, err := h.appService.Create(r.Context(), service.CreateAppInput{
		Name:        req.Name,
		Description: req.Description,
		Icon:        req.Icon,
		Route:       req.Route,
		Src:         req.Src,
		Version:     req.Version,
		Sandbox:     req.Sandbox,
		Category:    req.Category,
		Tags:        req.Tags,
	})
	if err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrInvalidInput {
			code = http.StatusBadRequest
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusCreated, apiData(app))
}

func (h *AppHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing app id"))
		return
	}

	var req updateAppRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError("invalid request body"))
		return
	}

	app, err := h.appService.Update(r.Context(), service.UpdateAppInput{
		ID:          id,
		Name:        req.Name,
		Description: req.Description,
		Icon:        req.Icon,
		Route:       req.Route,
		Src:         req.Src,
		Version:     req.Version,
		Sandbox:     req.Sandbox,
		Category:    req.Category,
		Tags:        req.Tags,
		Enabled:     req.Enabled,
	})
	if err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(app))
}

func (h *AppHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, apiError("missing app id"))
		return
	}

	if err := h.appService.Delete(r.Context(), id); err != nil {
		code := http.StatusInternalServerError
		if err == domain.ErrNotFound {
			code = http.StatusNotFound
		}
		writeJSON(w, code, apiError(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, apiData(map[string]string{"message": "app deleted"}))
}
