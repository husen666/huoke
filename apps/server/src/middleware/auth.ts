import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    c.set('user', decoded);
    await next();
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
});
