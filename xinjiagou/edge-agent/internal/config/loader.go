package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	HubAddr        string
	AgentID        string
	KeyFile        string
	UIPort         string
	RateLimitRPM   int
	RateLimitBurst int
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		HubAddr:        getEnv("HUB_ADDRESS", "localhost:8080"),
		AgentID:        getEnv("AGENT_ID", "agent-default"),
		KeyFile:        getEnv("KEY_FILE", "agent.key"),
		UIPort:         getEnv("UI_PORT", "9999"),
		RateLimitRPM:   getEnvInt("RATE_LIMIT_RPM", 120),
		RateLimitBurst: getEnvInt("RATE_LIMIT_BURST", 10),
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	str := getEnv(key, "")
	if str == "" {
		return fallback
	}
	val, err := strconv.Atoi(str)
	if err != nil {
		log.Printf("[Config] Invalid int for %s, using default", key)
		return fallback
	}
	return val
}
