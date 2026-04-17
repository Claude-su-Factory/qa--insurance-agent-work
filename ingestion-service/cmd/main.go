package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/handler"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/supabase"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using environment variables")
	}

	cfg, err := config.Load("config.toml")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	voyageAPIKey := os.Getenv("VOYAGE_API_KEY")
	if voyageAPIKey == "" {
		log.Fatal("VOYAGE_API_KEY is required")
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if supabaseURL == "" || supabaseKey == "" {
		log.Fatal("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
	}

	qdrantStore := store.New(cfg.Qdrant.BaseURL, cfg.Qdrant.Collection)
	if err := qdrantStore.EnsureCollection(context.Background(), 1024); err != nil {
		log.Fatalf("failed to ensure qdrant collection: %v", err)
	}

	jobStore := job.NewStore()
	supabaseClient := supabase.New(supabaseURL, supabaseKey)

	h := handler.New(
		parser.New(),
		chunker.New(),
		embedder.New(voyageAPIKey, cfg.Embedding.Model, cfg.Embedding.BaseURL),
		qdrantStore,
		supabaseClient,
		jobStore,
		cfg,
	)

	app := fiber.New()
	app.Post("/ingest", h.Handle)
	app.Get("/ingest/status/:jobId", func(c *fiber.Ctx) error {
		jobID := c.Params("jobId")
		status, ok := jobStore.Get(jobID)
		if !ok {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
		}
		return c.JSON(status)
	})
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Fatal(app.Listen(fmt.Sprintf(":%d", cfg.Server.Port)))
}
