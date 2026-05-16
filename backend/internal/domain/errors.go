package domain

import "errors"

var (
	ErrNotFound       = errors.New("resource not found")
	ErrAlreadyExists  = errors.New("resource already exists")
	ErrInvalidInput   = errors.New("invalid input")
	ErrUnauthorized   = errors.New("unauthorized")
	ErrEmailTaken     = errors.New("email already in use")
	ErrInvalidCreds   = errors.New("invalid email or password")
	ErrForbidden      = errors.New("forbidden")
)
