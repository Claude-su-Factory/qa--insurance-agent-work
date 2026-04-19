package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
)

type Store interface {
	Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error
	EnsureCollection(ctx context.Context, vectorSize uint64) error
	EnsurePayloadIndex(ctx context.Context, field string, schema string) error
}

type QdrantStore struct {
	baseURL    string
	collection string
	apiKey     string
}

func New(baseURL, collection, apiKey string) Store {
	return &QdrantStore{baseURL: baseURL, collection: collection, apiKey: apiKey}
}

func (q *QdrantStore) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	if q.apiKey != "" {
		req.Header.Set("api-key", q.apiKey)
	}
}

type point struct {
	ID      string         `json:"id"`
	Vector  []float32      `json:"vector"`
	Payload map[string]any `json:"payload"`
}

func (q *QdrantStore) Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error {
	points := make([]point, len(chunks))
	for i, chunk := range chunks {
		points[i] = point{
			ID:     uuid.New().String(),
			Vector: vectors[i],
			Payload: map[string]any{
				"content":       chunk,
				"document_name": docName,
				"chunk_index":   i,
				"user_id":       userID,
				"document_id":   documentID,
			},
		}
	}

	body, err := json.Marshal(map[string]any{"points": points})
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/collections/%s/points", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	q.setHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant upsert error: status %d", resp.StatusCode)
	}
	return nil
}

func (q *QdrantStore) EnsurePayloadIndex(ctx context.Context, field string, schema string) error {
	url := fmt.Sprintf("%s/collections/%s/index", q.baseURL, q.collection)
	body, _ := json.Marshal(map[string]any{
		"field_name":   field,
		"field_schema": schema,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	q.setHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 이미 존재하는 인덱스는 200 또는 409 — 둘 다 정상 취급
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("qdrant create index error: status %d", resp.StatusCode)
	}
	return nil
}

func (q *QdrantStore) EnsureCollection(ctx context.Context, vectorSize uint64) error {
	url := fmt.Sprintf("%s/collections/%s", q.baseURL, q.collection)
	body, _ := json.Marshal(map[string]any{
		"vectors": map[string]any{
			"size":     vectorSize,
			"distance": "Cosine",
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	q.setHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("qdrant create collection error: status %d", resp.StatusCode)
	}
	return nil
}
