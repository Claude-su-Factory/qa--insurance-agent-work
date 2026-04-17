package middleware_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/middleware"
)

func TestInternalAuth_ValidToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("X-Internal-Token", "secret-token")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestInternalAuth_InvalidToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("X-Internal-Token", "wrong-token")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 403, resp.StatusCode)
}

func TestInternalAuth_MissingToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest("GET", "/protected", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 403, resp.StatusCode)
}

func TestInternalAuth_SkipsHealthCheck(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	// no token header

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}
