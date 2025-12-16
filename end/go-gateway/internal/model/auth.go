package model

// ChannelConfig 对应 Redis 中的 oauth2:channel:<id>
type ChannelConfig struct {
	ID           int                    `json:"id"`
	Type         string                 `json:"type"`          // vertex, openai, etc.
	Key          string                 `json:"key,omitempty"` // Service Account JSON or API Key
	Credentials  string                 `json:"credentials,omitempty"` // Alternative for key
	ModelsConfig map[string]ModelConfig `json:"models_config"`
	State        int                    `json:"state"` // 1=Enabled
	RpmLimit     int                    `json:"rpm_limit,omitempty"`
}

// ModelConfig 对应 ChannelConfig 中的 models_config 项
type ModelConfig struct {
	Region string `json:"region,omitempty"` // e.g. us-central1
}

// ClientTokenData 对应 Redis 中的 oauth2:apikey:<token> 或 oauth2:vtoken:<token>
type ClientTokenData struct {
	UserID     interface{} `json:"user_id"` // int or string
	ChannelID  int         `json:"channel_id,omitempty"` // For Vertex vtoken
	Routes     []Route     `json:"routes,omitempty"`     // For API Key
	ExtraConfig map[string]interface{} `json:"extra_config,omitempty"`
}

// Route 路由规则
type Route struct {
	ChannelID int     `json:"channel_id"`
	Weight    int     `json:"weight"`
	Type      string  `json:"type"` // vertex, openai
	RpmLimit  int     `json:"rpm_limit,omitempty"`
}

// AuthContext 存储在 Gin Context 中的鉴权结果
type AuthContext struct {
	ClientToken   string
	RealToken     string
	ChannelID     int
	ChannelType   string
	TargetHost    string
	ModelName     string
	Metadata      *ClientTokenData
}
