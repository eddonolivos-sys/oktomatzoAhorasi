package service

import (
	"context"
	"errors"
	"time"

	"plataforma/backend/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo    domain.UserRepository
	jwtSecret   []byte
	tokenExpiry time.Duration
}

func NewAuthService(userRepo domain.UserRepository, jwtSecret []byte, tokenExpiry time.Duration) *AuthService {
	return &AuthService{
		userRepo:    userRepo,
		jwtSecret:   jwtSecret,
		tokenExpiry: tokenExpiry,
	}
}

type RegisterInput struct {
	Email    string
	Name     string
	Password string
}

type LoginInput struct {
	Email    string
	Password string
}

type AuthResult struct {
	User  *domain.User `json:"user"`
	Token string       `json:"token"`
}

func (s *AuthService) Register(ctx context.Context, input RegisterInput) (*AuthResult, error) {
	if input.Email == "" || input.Name == "" || input.Password == "" {
		return nil, domain.ErrInvalidInput
	}

	existing, _ := s.userRepo.FindByEmail(ctx, input.Email)
	if existing != nil {
		return nil, domain.ErrEmailTaken
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("failed to hash password")
	}

	user := &domain.User{
		ID:        generateID(),
		Email:     input.Email,
		Name:      input.Name,
		Password:  string(hashed),
		Role:      domain.RoleUser,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResult{User: user, Token: token}, nil
}

func (s *AuthService) Login(ctx context.Context, input LoginInput) (*AuthResult, error) {
	if input.Email == "" || input.Password == "" {
		return nil, domain.ErrInvalidInput
	}

	user, err := s.userRepo.FindByEmail(ctx, input.Email)
	if err != nil {
		return nil, domain.ErrInvalidCreds
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		return nil, domain.ErrInvalidCreds
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResult{User: user, Token: token}, nil
}

func (s *AuthService) ValidateToken(ctx context.Context, tokenString string) (*domain.User, error) {
	claims, err := parseToken(tokenString, s.jwtSecret)
	if err != nil {
		return nil, domain.ErrUnauthorized
	}

	user, err := s.userRepo.FindByID(ctx, claims.UserID)
	if err != nil {
		return nil, domain.ErrUnauthorized
	}

	return user, nil
}
