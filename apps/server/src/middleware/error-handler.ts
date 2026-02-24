import { createMiddleware } from 'hono/factory';

export const errorHandlerMiddleware = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ success: false, error: message }, 500);
  }
});
