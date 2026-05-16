package service

import (
	"context"
	"time"

	"plataforma/backend/internal/domain"
)

type AppService struct {
	appRepo domain.AppRepository
}

func NewAppService(appRepo domain.AppRepository) *AppService {
	return &AppService{appRepo: appRepo}
}

type CreateAppInput struct {
	Name        string
	Description string
	Icon        string
	Route       string
	Src         string
	Version     string
	Sandbox     string
	Category    string
	Tags        []string
}

type UpdateAppInput struct {
	ID          string
	Name        *string
	Description *string
	Icon        *string
	Route       *string
	Src         *string
	Version     *string
	Sandbox     *string
	Category    *string
	Tags        *[]string
	Enabled     *bool
}

func (s *AppService) Create(ctx context.Context, input CreateAppInput) (*domain.App, error) {
	if input.Name == "" || input.Route == "" {
		return nil, domain.ErrInvalidInput
	}

	app := &domain.App{
		ID:          generateID(),
		Name:        input.Name,
		Description: input.Description,
		Icon:        input.Icon,
		Route:       input.Route,
		Src:         input.Src,
		Version:     input.Version,
		Sandbox:     input.Sandbox,
		Category:    input.Category,
		Tags:        input.Tags,
		Enabled:     true,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	if app.Sandbox == "" {
		app.Sandbox = "allow-scripts allow-same-origin"
	}

	if err := s.appRepo.Create(ctx, app); err != nil {
		return nil, err
	}

	return app, nil
}

func (s *AppService) GetByID(ctx context.Context, id string) (*domain.App, error) {
	return s.appRepo.FindByID(ctx, id)
}

func (s *AppService) List(ctx context.Context) ([]*domain.App, error) {
	return s.appRepo.FindAll(ctx)
}

func (s *AppService) ListByCategory(ctx context.Context, category string) ([]*domain.App, error) {
	return s.appRepo.FindByCategory(ctx, category)
}

func (s *AppService) Update(ctx context.Context, input UpdateAppInput) (*domain.App, error) {
	app, err := s.appRepo.FindByID(ctx, input.ID)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	if input.Name != nil {
		app.Name = *input.Name
	}
	if input.Description != nil {
		app.Description = *input.Description
	}
	if input.Icon != nil {
		app.Icon = *input.Icon
	}
	if input.Route != nil {
		app.Route = *input.Route
	}
	if input.Src != nil {
		app.Src = *input.Src
	}
	if input.Version != nil {
		app.Version = *input.Version
	}
	if input.Sandbox != nil {
		app.Sandbox = *input.Sandbox
	}
	if input.Category != nil {
		app.Category = *input.Category
	}
	if input.Tags != nil {
		app.Tags = *input.Tags
	}
	if input.Enabled != nil {
		app.Enabled = *input.Enabled
	}
	app.UpdatedAt = time.Now().UTC()

	if err := s.appRepo.Update(ctx, app); err != nil {
		return nil, err
	}

	return app, nil
}

func (s *AppService) Delete(ctx context.Context, id string) error {
	return s.appRepo.Delete(ctx, id)
}
