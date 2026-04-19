package config

import (
	"os"
	"strconv"
)

// ApplyEnvOverrides 는 Config 의 프로덕션 민감 필드를 환경변수 값으로 덮어쓴다.
// 환경변수가 비어 있거나 잘못된 값이면 기존 config.toml 값을 유지한다.
// Railway 배포 환경에서 $PORT / $QDRANT_URL / $QDRANT_COLLECTION 을 주입받기 위함.
func ApplyEnvOverrides(cfg *Config) {
	if raw := os.Getenv("PORT"); raw != "" {
		if p, err := strconv.Atoi(raw); err == nil && p > 0 {
			cfg.Server.Port = p
		}
	}
	if v := os.Getenv("QDRANT_URL"); v != "" {
		cfg.Qdrant.BaseURL = v
	}
	if v := os.Getenv("QDRANT_COLLECTION"); v != "" {
		cfg.Qdrant.Collection = v
	}
}
