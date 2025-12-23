package middleware

import (
	"net/http"
	"os"
)

func AdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Load from Env (or Config)
		adminToken := os.Getenv("ADMIN_TOKEN")
		if adminToken == "" {
			// Fail secure: If token not set, disable admin API
			http.Error(w, "Admin API disabled (ADMIN_TOKEN not set)", http.StatusForbidden)
			return
		}

		userToken := r.Header.Get("X-Admin-Token")
		if userToken != adminToken {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}
