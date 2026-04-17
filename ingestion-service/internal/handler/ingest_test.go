package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/handler"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/supabase"
)

type mockParser struct {
	text string
	err  error
}

func (m *mockParser) Extract(_ string) (string, error) { return m.text, m.err }

type mockChunker struct{ chunks []string }

func (m *mockChunker) Chunk(_ string, _, _ int) []string { return m.chunks }

type mockEmbedder struct {
	vecs [][]float32
	err  error
}

func (m *mockEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	if m.err != nil {
		return nil, m.err
	}
	result := make([][]float32, len(texts))
	for i := range texts {
		result[i] = m.vecs[i%len(m.vecs)]
	}
	return result, nil
}

type mockStore struct{ err error }

func (m *mockStore) Upsert(_ context.Context, _ []string, _ [][]float32, _ string, _ string, _ string) error {
	return m.err
}
func (m *mockStore) EnsureCollection(_ context.Context, _ uint64) error { return m.err }
func (m *mockStore) EnsurePayloadIndex(_ context.Context, _ string, _ string) error {
	return m.err
}

type mockSupabase struct {
	docID string
	err   error
}

func (m *mockSupabase) InsertDocument(_ context.Context, _ string, _ string, _ int) (string, error) {
	return m.docID, m.err
}

func (m *mockSupabase) UpdateDocumentReady(_ context.Context, _ string, _ int) error {
	return nil
}

func (m *mockSupabase) UpdateDocumentFailed(_ context.Context, _ string) error {
	return nil
}

func newTestApp(p *mockParser, c *mockChunker, e *mockEmbedder, s *mockStore, sb *mockSupabase, js *job.Store) *fiber.App {
	cfg := &config.Config{}
	cfg.Chunking.ChunkSize = 512
	cfg.Chunking.Overlap = 50
	h := handler.New(p, c, e, s, sb, js, cfg)
	app := fiber.New()
	app.Post("/ingest", h.Handle)
	return app
}

func multipartPDF(filename string) (*bytes.Buffer, string) {
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, _ := w.CreateFormFile("file", filename)
	io.WriteString(part, "%PDF-1.4 fake pdf content")
	w.Close()
	return body, w.FormDataContentType()
}

func TestHandle_Success(t *testing.T) {
	app := newTestApp(
		&mockParser{text: "보험 약관 제1조"},
		&mockChunker{chunks: []string{"chunk1", "chunk2"}},
		&mockEmbedder{vecs: [][]float32{{0.1, 0.2}}},
		&mockStore{},
		&mockSupabase{docID: "doc-uuid-123"},
		job.NewStore(),
	)

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["jobId"])
	assert.Equal(t, "samsung", result["document"])
	assert.Equal(t, "doc-uuid-123", result["documentId"])
}

func TestHandle_DuplicateDocument(t *testing.T) {
	app := newTestApp(
		&mockParser{},
		&mockChunker{},
		&mockEmbedder{},
		&mockStore{},
		&mockSupabase{err: supabase.ErrDuplicateDocument},
		job.NewStore(),
	)

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 409, resp.StatusCode)
}

func TestHandle_MissingUserID(t *testing.T) {
	app := newTestApp(&mockParser{}, &mockChunker{}, &mockEmbedder{}, &mockStore{}, &mockSupabase{docID: "x"}, job.NewStore())

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 401, resp.StatusCode)
}

func TestHandle_NonPDFRejected(t *testing.T) {
	app := newTestApp(&mockParser{}, &mockChunker{}, &mockEmbedder{}, &mockStore{}, &mockSupabase{docID: "x"}, job.NewStore())

	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, _ := w.CreateFormFile("file", "document.txt")
	io.WriteString(part, "not a pdf")
	w.Close()

	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestHandle_MissingFile(t *testing.T) {
	app := newTestApp(&mockParser{}, &mockChunker{}, &mockEmbedder{}, &mockStore{}, &mockSupabase{docID: "x"}, job.NewStore())

	req := httptest.NewRequest("POST", "/ingest", nil)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=xxx")
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}
