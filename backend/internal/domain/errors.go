package domain

import "errors"

var (
	ErrNotFound       = errors.New("recurso no encontrado")
	ErrAlreadyExists  = errors.New("el recurso ya existe")
	ErrInvalidInput   = errors.New("datos inválidos")
	ErrUnauthorized   = errors.New("no autorizado")
	ErrEmailTaken     = errors.New("correo ya registrado")
	ErrInvalidCreds   = errors.New("correo o contraseña incorrectos")
	ErrForbidden      = errors.New("acceso denegado")
)
