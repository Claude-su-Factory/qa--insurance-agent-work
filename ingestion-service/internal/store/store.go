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
}

type QdrantStore struct {
	baseURL    string
	collection string
}

func New(baseURL, collection string) Store {
	return &QdrantStore{baseURL: baseURL, collection: collection}
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
	req.Header.Set("Content-Type", "application/json")

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
	req.Header.Set("Content-Type", "application/json")

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
