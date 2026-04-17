package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var ErrDuplicateDocument = errors.New("duplicate document")

type Client struct {
	url            string
	serviceRoleKey string
}

func New(url, serviceRoleKey string) *Client {
	return &Client{url: url, serviceRoleKey: serviceRoleKey}
}

type documentRecord struct {
	UserID     string `json:"user_id"`
	Filename   string `json:"filename"`
	ChunkCount int    `json:"chunk_count"`
}

type insertedDoc struct {
	ID string `json:"id"`
}

func (c *Client) InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) (string, error) {
	body, err := json.Marshal(documentRecord{
		UserID:     userID,
		Filename:   filename,
		ChunkCount: chunkCount,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/rest/v1/documents", c.url),
		bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusConflict {
		return "", ErrDuplicateDocument
	}

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("supabase insert document failed: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var docs []insertedDoc
	if err := json.Unmarshal(respBody, &docs); err != nil {
		return "", fmt.Errorf("supabase response parse failed: %w", err)
	}
	if len(docs) == 0 {
		return "", fmt.Errorf("supabase returned empty response")
	}
	return docs[0].ID, nil
}

func (c *Client) UpdateDocumentReady(ctx context.Context, documentID string, chunkCount int) error {
	body, _ := json.Marshal(map[string]any{"chunk_count": chunkCount, "status": "ready"})
	return c.patchDocument(ctx, documentID, body)
}

func (c *Client) UpdateDocumentFailed(ctx context.Context, documentID string) error {
	body, _ := json.Marshal(map[string]any{"status": "failed"})
	return c.patchDocument(ctx, documentID, body)
}

func (c *Client) patchDocument(ctx context.Context, documentID string, body []byte) error {
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPatch,
		fmt.Sprintf("%s/rest/v1/documents?id=eq.%s", c.url, documentID),
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("supabase patch document failed: status %d", resp.StatusCode)
	}
	return nil
}
