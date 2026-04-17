package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

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

func (c *Client) InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) error {
	body, err := json.Marshal(documentRecord{
		UserID:     userID,
		Filename:   filename,
		ChunkCount: chunkCount,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/rest/v1/documents", c.url),
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("supabase insert document failed: status %d", resp.StatusCode)
	}
	return nil
}
