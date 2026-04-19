package config

import (
	"testing"
)

func TestApplyEnvOverrides_PortFromEnv(t *testing.T) {
	cfg := &Config{Server: ServerConfig{Port: 8081}}

	t.Setenv("PORT", "9999")
	ApplyEnvOverrides(cfg)

	if cfg.Server.Port != 9999 {
		t.Fatalf("expected port 9999 from env, got %d", cfg.Server.Port)
	}
}

func TestApplyEnvOverrides_PortFallsBackToConfig(t *testing.T) {
	cfg := &Config{Server: ServerConfig{Port: 8081}}

	t.Setenv("PORT", "")
	ApplyEnvOverrides(cfg)

	if cfg.Server.Port != 8081 {
		t.Fatalf("expected fallback port 8081, got %d", cfg.Server.Port)
	}
}

func TestApplyEnvOverrides_PortInvalidIgnored(t *testing.T) {
	cfg := &Config{Server: ServerConfig{Port: 8081}}

	t.Setenv("PORT", "not-a-number")
	ApplyEnvOverrides(cfg)

	if cfg.Server.Port != 8081 {
		t.Fatalf("expected fallback port 8081 on invalid env, got %d", cfg.Server.Port)
	}
}

func TestApplyEnvOverrides_QdrantFromEnv(t *testing.T) {
	cfg := &Config{Qdrant: QdrantConfig{BaseURL: "http://qdrant:6333", Collection: "insurance_clauses"}}

	t.Setenv("QDRANT_URL", "https://xyz.qdrant.cloud")
	t.Setenv("QDRANT_COLLECTION", "prod_clauses")
	ApplyEnvOverrides(cfg)

	if cfg.Qdrant.BaseURL != "https://xyz.qdrant.cloud" {
		t.Fatalf("expected qdrant url from env, got %q", cfg.Qdrant.BaseURL)
	}
	if cfg.Qdrant.Collection != "prod_clauses" {
		t.Fatalf("expected qdrant collection from env, got %q", cfg.Qdrant.Collection)
	}
}

func TestApplyEnvOverrides_QdrantFallsBackToConfig(t *testing.T) {
	cfg := &Config{Qdrant: QdrantConfig{BaseURL: "http://qdrant:6333", Collection: "insurance_clauses"}}

	t.Setenv("QDRANT_URL", "")
	t.Setenv("QDRANT_COLLECTION", "")
	ApplyEnvOverrides(cfg)

	if cfg.Qdrant.BaseURL != "http://qdrant:6333" {
		t.Fatalf("expected fallback qdrant url, got %q", cfg.Qdrant.BaseURL)
	}
	if cfg.Qdrant.Collection != "insurance_clauses" {
		t.Fatalf("expected fallback collection, got %q", cfg.Qdrant.Collection)
	}
}
