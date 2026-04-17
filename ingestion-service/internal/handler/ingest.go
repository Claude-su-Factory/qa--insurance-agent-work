package handler

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/supabase"
)

type SupabaseInserter interface {
	InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) (string, error)
	UpdateDocumentReady(ctx context.Context, documentID string, chunkCount int) error
	UpdateDocumentFailed(ctx context.Context, documentID string) error
}

type IngestHandler struct {
	parser   parser.Parser
	chunker  chunker.Chunker
	embedder embedder.Embedder
	store    store.Store
	supabase SupabaseInserter
	jobStore *job.Store
	cfg      *config.Config
}

func New(p parser.Parser, c chunker.Chunker, e embedder.Embedder, s store.Store, sb SupabaseInserter, js *job.Store, cfg *config.Config) *IngestHandler {
	return &IngestHandler{parser: p, chunker: c, embedder: e, store: s, supabase: sb, jobStore: js, cfg: cfg}
}

func (h *IngestHandler) Handle(c *fiber.Ctx) error {
	userID := c.Get("X-User-ID")
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "X-User-ID header is required"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file field is required"})
	}
	if !strings.HasSuffix(strings.ToLower(file.Filename), ".pdf") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only PDF files are accepted"})
	}

	// Supabase INSERT 먼저 — document_id 획득, 중복 시 409
	docID, err := h.supabase.InsertDocument(context.Background(), userID, file.Filename, 0)
	if err != nil {
		if errors.Is(err, supabase.ErrDuplicateDocument) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "이미 관리 중인 약관입니다"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "문서 등록 실패"})
	}

	tmpFile, err := os.CreateTemp("", "ingest-*.pdf")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create temp file"})
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()

	if err := c.SaveFile(file, tmpPath); err != nil {
		os.Remove(tmpPath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}

	jobID := uuid.New().String()
	docName := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	h.jobStore.Create(jobID, file.Filename)

	go h.processAsync(jobID, tmpPath, docName, userID, docID)

	return c.JSON(fiber.Map{"jobId": jobID, "document": docName, "documentId": docID})
}

func (h *IngestHandler) processAsync(jobID, tmpPath, docName, userID, docID string) {
	defer os.Remove(tmpPath)

	fail := func(msg string) {
		h.jobStore.Update(jobID, func(s *job.Status) {
			s.Step = job.StepFailed
			s.Error = msg
		})
		_ = h.supabase.UpdateDocumentFailed(context.Background(), docID)
	}

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepParsing; s.Progress = 5 })
	text, err := h.parser.Extract(tmpPath)
	if err != nil {
		fail("PDF 파싱 실패: " + err.Error())
		return
	}
	h.jobStore.Update(jobID, func(s *job.Status) { s.Progress = 10 })

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepChunking; s.Progress = 15 })
	chunks := h.chunker.Chunk(text, h.cfg.Chunking.ChunkSize, h.cfg.Chunking.Overlap)
	if len(chunks) == 0 {
		fail("PDF에서 텍스트를 추출할 수 없습니다")
		return
	}
	h.jobStore.Update(jobID, func(s *job.Status) {
		s.Progress = 30
		s.TotalChunks = len(chunks)
	})

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepEmbedding })
	const batchSize = 10
	allVectors := make([][]float32, 0, len(chunks))
	for i := 0; i < len(chunks); i += batchSize {
		end := i + batchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		vecs, err := h.embedder.Embed(context.Background(), chunks[i:end])
		if err != nil {
			fail("임베딩 실패: " + err.Error())
			return
		}
		allVectors = append(allVectors, vecs...)
		processed := end
		h.jobStore.Update(jobID, func(s *job.Status) {
			s.CurrentChunk = processed
			s.Progress = 30 + int(float64(processed)/float64(len(chunks))*40)
		})
	}

	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepStoring; s.Progress = 75 })
	if err := h.store.Upsert(context.Background(), chunks, allVectors, docName, userID, docID); err != nil {
		fail("Qdrant 저장 실패: " + err.Error())
		return
	}

	_ = h.supabase.UpdateDocumentReady(context.Background(), docID, len(chunks))

	h.jobStore.Update(jobID, func(s *job.Status) {
		s.Step = job.StepDone
		s.Progress = 100
	})
	h.jobStore.DeleteAfter(jobID, 30*time.Second)
}
