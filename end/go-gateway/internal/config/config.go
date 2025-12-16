package config

import (
	"os"
)

type Config struct {
	ServerPort    string
	RedisHost     string
	RedisPort     string
	RedisPassword string
	RedisDB       int
	
	// Database Config (For Processor)
	DBUser string
	DBPass string
	DBHost string
		DBPort string
		DBName string
	
		// Upstream Services
		NodeBackend string // URL of the Node.js service (e.g., http://localhost:8889)
	}
	
	func LoadConfig() *Config {
		return &Config{
			ServerPort:    getEnv("SERVER_PORT", "8080"),
			RedisHost:     getEnv("REDIS_HOST", "localhost"),
			RedisPort:     getEnv("REDIS_PORT", "6379"),
			RedisPassword: getEnv("REDIS_PASSWORD", ""),
			RedisDB:       0,
			
			DBUser: getEnv("DB_USER", "oauth2_user"),
			DBPass: getEnv("DB_PASSWORD", "oauth2_password_123456"),
			DBHost: getEnv("DB_HOST", "api-proxy-mysql"),
			DBPort: getEnv("DB_PORT", "3306"),
			DBName: getEnv("DB_NAME", "oauth2_mock"),
	
			NodeBackend: getEnv("NODE_BACKEND", "http://localhost:8889"),
		}
	}
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
