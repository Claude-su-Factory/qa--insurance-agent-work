package middleware

import "github.com/gofiber/fiber/v2"

// InternalAuth는 X-Internal-Token 헤더를 검증하는 Fiber 미들웨어다.
// /health 경로는 검증에서 제외한다.
func InternalAuth(expectedToken string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if c.Path() == "/health" {
			return c.Next()
		}
		token := c.Get("X-Internal-Token")
		if token != expectedToken {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "invalid internal token",
			})
		}
		return c.Next()
	}
}
