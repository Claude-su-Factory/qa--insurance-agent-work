package embedder

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Embedder는 텍스트를 벡터로 변환하는 인터페이스다.
type Embedder interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
}

// VoyageEmbedder는 Voyage AI API를 사용하여 Embedder를 구현한다.
type VoyageEmbedder struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
}

// New는 30초 타임아웃을 가진 VoyageEmbedder를 반환한다.
func New(apiKey, model, baseURL string) Embedder {
	return &VoyageEmbedder{
		apiKey:  apiKey,
		model:   model,
		baseURL: baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

type embedRequest struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
}

type embedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
		Index     int       `json:"index"`
	} `json:"data"`
}

func (v *VoyageEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	body, err := json.Marshal(embedRequest{Input: texts, Model: v.model})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.baseURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+v.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("voyage api error: status %d: %s", resp.StatusCode, bytes.TrimSpace(errBody))
	}

	var result embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	vectors := make([][]float32, len(texts))
	for _, d := range result.Data {
		if d.Index < 0 || d.Index >= len(vectors) {
			return nil, fmt.Errorf("voyage api: unexpected index %d in response (expected 0-%d)", d.Index, len(vectors)-1)
		}
		vectors[d.Index] = d.Embedding
	}
	return vectors, nil
}

var _ Embedder = (*VoyageEmbedder)(nil)
