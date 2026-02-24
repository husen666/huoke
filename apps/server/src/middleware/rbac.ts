import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { roles } from '../db/schema';

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  agent: 40,
  viewer: 10,
};

const permissionsCache = new Map<string, { permissions: string[]; expiresAt: number }>();
const MAX_PERMISSIONS_CACHE_SIZE = 5000;

function evictExpiredPermissions() {
  const now = Date.now();
  for (const [k, v] of permissionsCache) {
    if (now > v.expiresAt) permissionsCache.delete(k);
  }
  if (permissionsCache.size > MAX_PERMISSIONS_CACHE_SIZE) permissionsCache.clear();
}

export function requireRole(...allowedRoles: string[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    if (!allowedRoles.includes(user.role)) {
      return c.json({ success: false, error: '权限不足，需要以下角色之一：' + allowedRoles.join(', ') }, 403);
    }
    await next();
  });
}

export function requireMinRole(minRole: string) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < requiredLevel) {
      return c.json({ success: false, error: '权限不足' }, 403);
    }
    await next();
  });
}

export function requirePermission(...requiredPermissions: string[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    if (user.role === 'owner' || user.role === 'admin') {
      await next();
      return;
    }
    const cacheKey = `${user.orgId}:${user.role}`;
    let cached = permissionsCache.get(cacheKey);
    if (!cached || cached.expiresAt < Date.now()) {
      const [roleRow] = await db
        .select({ permissions: roles.permissions })
        .from(roles)
        .where(and(eq(roles.orgId, user.orgId), eq(roles.name, user.role)))
        .limit(1);
      const perms = (roleRow?.permissions as string[]) ?? [];
      cached = { permissions: perms, expiresAt: Date.now() + 60_000 };
      evictExpiredPermissions();
      permissionsCache.set(cacheKey, cached);
    }
    const hasAll = requiredPermissions.every(p => cached!.permissions.includes(p));
    if (!hasAll) {
      return c.json({ success: false, error: '权限不足' }, 403);
    }
    await next();
  });
}

export async function getUserPermissions(orgId: string, role: string): Promise<string[]> {
  if (role === 'owner' || role === 'admin') return ['*'];
  const cacheKey = `${orgId}:${role}`;
  const cached = permissionsCache.get(cacheKey);
  if (cached && cached.expiresAt >= Date.now()) return cached.permissions;
  const [roleRow] = await db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(and(eq(roles.orgId, orgId), eq(roles.name, role)))
    .limit(1);
  const perms = (roleRow?.permissions as string[]) ?? [];
  evictExpiredPermissions();
  permissionsCache.set(cacheKey, { permissions: perms, expiresAt: Date.now() + 60_000 });
  return perms;
}

export function clearPermissionsCache(orgId?: string) {
  if (orgId) {
    for (const key of permissionsCache.keys()) {
      if (key.startsWith(orgId)) permissionsCache.delete(key);
    }
  } else {
    permissionsCache.clear();
  }
}

export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}
