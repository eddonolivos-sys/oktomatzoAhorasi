package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"plataforma/backend/internal/handler"
	"plataforma/backend/internal/repository"
	"plataforma/backend/internal/service"
)

func main() {
	dbPath := getEnv("DB_PATH", "data/plataforma.db")
	jwtSecret := getEnv("JWT_SECRET", "dev-secret-change-in-production")
	port := getEnv("PORT", "8080")
	tokenExpiryHours := 72

	// Initialize database
	db, err := repository.NewSQLiteDB(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Repositories
	userRepo := repository.NewUserRepository(db)
	appRepo := repository.NewAppRepository(db)

	// Services
	authService := service.NewAuthService(userRepo, []byte(jwtSecret), time.Duration(tokenExpiryHours)*time.Hour)
	userService := service.NewUserService(userRepo)
	appService := service.NewAppService(appRepo)

	// Handlers
	authHandler := handler.NewAuthHandler(authService)
	userHandler := handler.NewUserHandler(userService)
	appHandler := handler.NewAppHandler(appService)
	middleware := handler.NewMiddleware(authService)

	// Router
	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)

	// Authenticated routes
	mux.Handle("GET /api/auth/me", middleware.Authenticate(http.HandlerFunc(authHandler.Me)))

	// App routes (authenticated)
	mux.Handle("GET /api/apps", middleware.Authenticate(http.HandlerFunc(appHandler.List)))
	mux.Handle("GET /api/apps/{id}", middleware.Authenticate(http.HandlerFunc(appHandler.GetByID)))
	mux.Handle("POST /api/apps", middleware.Authenticate(http.HandlerFunc(appHandler.Create)))
	mux.Handle("PUT /api/apps/{id}", middleware.Authenticate(http.HandlerFunc(appHandler.Update)))
	mux.Handle("DELETE /api/apps/{id}", middleware.Authenticate(http.HandlerFunc(appHandler.Delete)))

	// User routes (admin)
	mux.Handle("GET /api/users", middleware.Authenticate(middleware.RequireAdmin(http.HandlerFunc(userHandler.List))))
	mux.Handle("GET /api/users/{id}", middleware.Authenticate(middleware.RequireAdmin(http.HandlerFunc(userHandler.GetByID))))
	mux.Handle("PUT /api/users/{id}", middleware.Authenticate(middleware.RequireAdmin(http.HandlerFunc(userHandler.Update))))
	mux.Handle("DELETE /api/users/{id}", middleware.Authenticate(middleware.RequireAdmin(http.HandlerFunc(userHandler.Delete))))
	mux.Handle("PUT /api/users/{id}/password", middleware.Authenticate(http.HandlerFunc(userHandler.ChangePassword)))

	// Global middleware
	wrapped := middleware.CORSSetup(middleware.Logging(mux))

	// Create data directory
	os.MkdirAll("data", 0755)

	log.Printf("Backend server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, wrapped); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
