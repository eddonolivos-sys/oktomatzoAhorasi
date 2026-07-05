package service

import (
	"time"

	"plataforma/backend/internal/domain"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type TokenClaims struct {
	UserID string       `json:"user_id"`
	Email  string       `json:"email"`
	Role   domain.Role  `json:"role"`
	jwt.RegisteredClaims
}

func generateID() string {
	return uuid.New().String()
}

func (s *AuthService) generateToken(user *domain.User) (string, error) {
	return s.generateTokenWithExpiry(user, s.tokenExpiry)
}

func (s *AuthService) generateGuestToken(user *domain.User) (string, error) {
	return s.generateTokenWithExpiry(user, s.guestTokenExpiry)
}

func (s *AuthService) generateTokenWithExpiry(user *domain.User, expiry time.Duration) (string, error) {
	claims := TokenClaims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			Subject:   user.ID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func parseToken(tokenString string, secret []byte) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}

	return claims, nil
}
