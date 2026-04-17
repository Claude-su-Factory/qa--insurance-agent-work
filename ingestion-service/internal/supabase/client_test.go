package supabase_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/supabase"
)

func TestInsertDocument_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/rest/v1/documents", r.URL.Path)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		assert.Equal(t, "return=representation", r.Header.Get("Prefer"))

		body, _ := io.ReadAll(r.Body)
		var record map[string]any
		json.Unmarshal(body, &record)
		assert.Equal(t, "user-123", record["user_id"])
		assert.Equal(t, "test.pdf", record["filename"])

		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`[{"id":"doc-uuid-456"}]`))
	}))
	defer server.Close()

	client := supabase.New(server.URL, "test-key")
	docID, err := client.InsertDocument(context.Background(), "user-123", "test.pdf", 0)

	require.NoError(t, err)
	assert.Equal(t, "doc-uuid-456", docID)
}

func TestInsertDocument_Duplicate409(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
	}))
	defer server.Close()

	client := supabase.New(server.URL, "test-key")
	_, err := client.InsertDocument(context.Background(), "user-123", "test.pdf", 0)

	assert.ErrorIs(t, err, supabase.ErrDuplicateDocument)
}

func TestInsertDocument_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"internal"}`))
	}))
	defer server.Close()

	client := supabase.New(server.URL, "test-key")
	_, err := client.InsertDocument(context.Background(), "user-123", "test.pdf", 0)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "status 500")
}

func TestUpdateDocumentReady_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPatch, r.Method)
		assert.Contains(t, r.URL.RawQuery, "id=eq.doc-123")

		body, _ := io.ReadAll(r.Body)
		var record map[string]any
		json.Unmarshal(body, &record)
		assert.Equal(t, float64(42), record["chunk_count"])
		assert.Equal(t, "ready", record["status"])

		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := supabase.New(server.URL, "test-key")
	err := client.UpdateDocumentReady(context.Background(), "doc-123", 42)

	assert.NoError(t, err)
}

func TestUpdateDocumentFailed_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var record map[string]any
		json.Unmarshal(body, &record)
		assert.Equal(t, "failed", record["status"])

		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := supabase.New(server.URL, "test-key")
	err := client.UpdateDocumentFailed(context.Background(), "doc-123")

	assert.NoError(t, err)
}

func TestPatchDocument_ErrorStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	client := supabase.New(server.URL, "test-key")
	err := client.UpdateDocumentReady(context.Background(), "doc-123", 10)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "status 400")
}
