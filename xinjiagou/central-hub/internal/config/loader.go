package config

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port            string
	MaxAgents       int
	HTTPReadTimeout time.Duration
	HTTPWriteTimeout time.Duration
	HTTPIdleTimeout  time.Duration
	WSPingWait      time.Duration
	WSWriteWait     time.Duration
	WSReadLimit     int64
}

// Load 读取 .env 并返回配置对象
func Load() *Config {
	// 尝试加载 .env，如果不存在也不报错 (使用系统环境变量)
	_ = godotenv.Load()

	return &Config{
		Port:             getEnv("HUB_PORT", "8080"),
		MaxAgents:        getEnvInt("MAX_AGENTS", 10000),
		HTTPReadTimeout:  getEnvDuration("HTTP_READ_TIMEOUT", 5),
		HTTPWriteTimeout: getEnvDuration("HTTP_WRITE_TIMEOUT", 30),
		HTTPIdleTimeout:  getEnvDuration("HTTP_IDLE_TIMEOUT", 120),
		WSPingWait:       getEnvDuration("WS_PING_WAIT", 60),
		WSWriteWait:      getEnvDuration("WS_WRITE_WAIT", 5),
		WSReadLimit:      int64(getEnvInt("WS_READ_LIMIT_BYTES", 1048576)),
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	log.Printf("[Config] %s not found, using default: %s", key, fallback)
	return fallback
}

func getEnvInt(key string, fallback int) int {
	str := getEnv(key, "")
	if str == "" {
		return fallback
	}
	val, err := strconv.Atoi(str)
	if err != nil {
		log.Printf("[Config] Invalid int for %s: %v, using default", key, err)
		return fallback
	}
	return val
}

func getEnvDuration(key string, fallbackSeconds int) time.Duration {
	val := getEnvInt(key, fallbackSeconds)
	return time.Duration(val) * time.Second
}
