package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type contextKey string
const RequestIDKey contextKey = "req_id"

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func Logging(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := uuid.New().String()
		ctx := context.WithValue(r.Context(), RequestIDKey, reqID)
		
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next(rw, r.WithContext(ctx))
		
		safePath := strings.ReplaceAll(r.URL.Path, "\n", "")
		safePath = strings.ReplaceAll(safePath, "\r", "")
		
		log.Printf("[ACCESS] %s | %s | %s | %s | %d | %v", 
			reqID, r.RemoteAddr, r.Method, safePath, rw.statusCode, time.Since(start))
	}
}
