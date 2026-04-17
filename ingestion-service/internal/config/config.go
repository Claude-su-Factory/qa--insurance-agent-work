package config

import (
	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Qdrant    QdrantConfig    `mapstructure:"qdrant"`
	Chunking  ChunkingConfig  `mapstructure:"chunking"`
	Embedding EmbeddingConfig `mapstructure:"embedding"`
}

type ServerConfig struct {
	Port int `mapstructure:"port"`
}

type QdrantConfig struct {
	BaseURL    string `mapstructure:"base_url"`
	Collection string `mapstructure:"collection"`
}

type ChunkingConfig struct {
	ChunkSize int `mapstructure:"chunk_size"`
	Overlap   int `mapstructure:"overlap"`
}

type EmbeddingConfig struct {
	Model   string `mapstructure:"model"`
	BaseURL string `mapstructure:"base_url"`
}

func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
