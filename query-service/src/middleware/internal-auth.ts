import type { MiddlewareHandler } from "hono";

export function internalAuth(expectedToken: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === "/health") {
      await next();
      return;
    }
    const token = c.req.header("x-internal-token");
    if (token !== expectedToken) {
      return c.json({ error: "invalid internal token" }, 403);
    }
    await next();
  };
}
