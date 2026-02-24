import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { users, organizations, platformAdmins } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole, getRoleLevel } from '../middleware/rbac';
import { config } from '../config/env';
import { sendEmail, generatePasswordResetEmail } from '../services/email.service';
import { getPlanConfig } from '../config/plans';
import { checkSeatLimitInline } from '../middleware/plan-guard';

const app = new Hono();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 300000);
function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  if (rateLimitMap.size > 10000) rateLimitMap.clear();
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) return false;
  entry.count++;
  return true;
}

const passwordSchema = z.string()
  .min(8, '密码至少8个字符')
  .regex(/[A-Z]/, '密码需包含大写字母')
  .regex(/[a-z]/, '密码需包含小写字母')
  .regex(/[0-9]/, '密码需包含数字');

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1),
  orgId: z.string().uuid().optional(),
  orgName: z.string().min(1).max(100).optional(),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional(),
  industry: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: passwordSchema,
});

function generateTokens(userId: string, email: string, orgId: string, role: string) {
  const accessToken = jwt.sign(
    { sub: userId, email, orgId, role },
    config.JWT_SECRET,
    { expiresIn: '2h' }
  );
  const refreshToken = jwt.sign(
    { sub: userId, email, orgId, role },
    config.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

// POST /auth/register
app.post('/register', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(`register:${clientIp}`, 5, 60 * 1000)) {
      return c.json({ success: false, error: '请求过于频繁，请稍后再试' }, 429);
    }
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    }
    const { email, password, name } = parsed.data;

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return c.json({ success: false, error: 'Email already registered' }, 400);
    }

    let orgId = parsed.data.orgId;
    let isNewOrg = false;
    if (orgId) {
      const [orgCheck] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!orgCheck) return c.json({ success: false, error: 'Organization not found' }, 400);
      const seatCheck = await checkSeatLimitInline(orgId);
      if (!seatCheck.allowed) {
        return c.json({ success: false, error: seatCheck.error, code: 'SEAT_LIMIT' }, 403);
      }
    } else {
      const allowedSelfService = ['starter', 'pro'];
      const selectedPlan = allowedSelfService.includes(parsed.data.plan ?? '') ? parsed.data.plan! : 'starter';
      const planCfg = getPlanConfig(selectedPlan);
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const [org] = await db.insert(organizations).values({
        name: parsed.data.orgName || `${name}的组织`,
        plan: selectedPlan,
        industry: parsed.data.industry,
        trialEndsAt,
        maxSeats: planCfg.seats === -1 ? 9999 : planCfg.seats,
        maxConversationsPerMonth: planCfg.conversationsPerMonth === -1 ? 999999 : planCfg.conversationsPerMonth,
        maxLeads: planCfg.leads === -1 ? 999999 : planCfg.leads,
        maxKnowledgeBases: planCfg.knowledgeBases === -1 ? 999 : planCfg.knowledgeBases,
        maxStorageMb: planCfg.storageMb === -1 ? 999999 : planCfg.storageMb,
        features: planCfg.features,
      }).returning();
      if (org) { orgId = org.id; isNewOrg = true; }
    }
    if (!orgId) {
      return c.json({ success: false, error: 'No organization available' }, 500);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name, orgId, role: isNewOrg ? 'owner' : 'agent' })
      .returning();

    if (!user) {
      return c.json({ success: false, error: 'Failed to create user' }, 500);
    }

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.orgId,
      user.role ?? 'agent'
    );

    const [regOrg] = await db.select({
      name: organizations.name,
      plan: organizations.plan,
      planExpiresAt: organizations.planExpiresAt,
      trialEndsAt: organizations.trialEndsAt,
      onboardingCompleted: organizations.onboardingCompleted,
      features: organizations.features,
    }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);

    return c.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
          role: user.role,
        },
        org: regOrg ? {
          name: regOrg.name,
          plan: regOrg.plan,
          planExpiresAt: regOrg.planExpiresAt,
          trialEndsAt: regOrg.trialEndsAt,
          onboardingCompleted: regOrg.onboardingCompleted,
          features: regOrg.features,
        } : undefined,
        isNewOrg,
      },
    });
  } catch (e) {
    return c.json(
      { success: false, error: e instanceof Error ? e.message : 'Registration failed' },
      500
    );
  }
});

// POST /auth/login
app.post('/login', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(`login:${clientIp}`, 10, 60 * 1000)) {
      return c.json({ success: false, error: '登录尝试过于频繁，请1分钟后再试' }, 429);
    }
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.orgId,
      user.role ?? 'agent'
    );

    const [org] = await db.select({
      name: organizations.name,
      plan: organizations.plan,
      planExpiresAt: organizations.planExpiresAt,
      trialEndsAt: organizations.trialEndsAt,
      onboardingCompleted: organizations.onboardingCompleted,
      features: organizations.features,
    }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);

    return c.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
        org: org ? {
          name: org.name,
          plan: org.plan,
          planExpiresAt: org.planExpiresAt,
          trialEndsAt: org.trialEndsAt,
          onboardingCompleted: org.onboardingCompleted,
          features: org.features,
        } : undefined,
      },
    });
  } catch (e) {
    return c.json(
      { success: false, error: e instanceof Error ? e.message : 'Login failed' },
      500
    );
  }
});

// POST /auth/forgot-password
app.post('/forgot-password', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(`forgot:${clientIp}`, 3, 5 * 60 * 1000)) {
      return c.json({ success: false, error: '请求过于频繁，请5分钟后再试' }, 429);
    }
    const body = await c.req.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    }
    const { email } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      const resetCode = String(Math.floor(100000 + Math.random() * 900000));
      const resetCodeExpiry = Date.now() + 15 * 60 * 1000;
      const merged = { ...(user.settings ?? {}), resetCode, resetCodeExpiry };
      await db.update(users).set({ settings: merged }).where(eq(users.id, user.id));
      sendEmail({
        to: email,
        subject: '火客智能 - 密码重置验证码',
        html: generatePasswordResetEmail(resetCode),
        text: `您的密码重置验证码是: ${resetCode}，15分钟内有效。`,
      }).catch((err) => console.error('[forgot-password] Email send error:', err));
    }
    return c.json({ success: true, data: { message: 'If the email exists, a reset code was sent.' } });
  } catch (e) {
    return c.json(
      { success: false, error: e instanceof Error ? e.message : 'Request failed' },
      500
    );
  }
});

// POST /auth/reset-password
app.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    }
    const { email, code, newPassword } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return c.json({ success: false, error: '验证码错误或已过期' }, 400);
    }
    const settings = (user.settings ?? {}) as { resetCode?: string; resetCodeExpiry?: number };
    const expiry = settings.resetCodeExpiry;
    if (settings.resetCode !== code || typeof expiry !== 'number' || expiry < Date.now()) {
      return c.json({ success: false, error: '验证码错误或已过期' }, 400);
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { resetCode, resetCodeExpiry, ...rest } = settings;
    await db.update(users).set({ passwordHash, settings: rest }).where(eq(users.id, user.id));
    return c.json({ success: true, data: { message: '密码已重置' } });
  } catch (e) {
    return c.json(
      { success: false, error: e instanceof Error ? e.message : 'Reset failed' },
      500
    );
  }
});

// POST /auth/refresh
app.post('/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Refresh token required' }, 400);
    }

    const decoded = jwt.verify(parsed.data.refreshToken, config.JWT_REFRESH_SECRET) as {
      sub: string;
      email: string;
      orgId: string;
      role: string;
    };

    const [currentUser] = await db
      .select({ id: users.id, email: users.email, orgId: users.orgId, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, decoded.sub))
      .limit(1);
    if (!currentUser || currentUser.status === 'inactive') {
      return c.json({ success: false, error: 'Account disabled or not found' }, 401);
    }

    const { accessToken, refreshToken } = generateTokens(
      currentUser.id,
      currentUser.email,
      currentUser.orgId,
      currentUser.role,
    );

    return c.json({
      success: true,
      data: { accessToken, refreshToken },
    });
  } catch {
    return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401);
  }
});

// POST /auth/me (requires auth)
app.post('/me', authMiddleware, async (c) => {
  try {
    const { sub } = c.get('user');
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }
    const [org] = await db.select({
      plan: organizations.plan,
      planExpiresAt: organizations.planExpiresAt,
      trialEndsAt: organizations.trialEndsAt,
      onboardingCompleted: organizations.onboardingCompleted,
      features: organizations.features,
      orgName: organizations.name,
    }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgId: user.orgId,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        bio: user.bio,
        onlineStatus: user.onlineStatus,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        org: org ? {
          plan: org.plan,
          planExpiresAt: org.planExpiresAt,
          trialEndsAt: org.trialEndsAt,
          onboardingCompleted: org.onboardingCompleted,
          features: org.features,
          name: org.orgName,
        } : undefined,
      },
    });
  } catch (e) {
    return c.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed to get user' },
      500
    );
  }
});

// PUT /profile - Update current user's profile
app.put('/profile', authMiddleware, async (c) => {
  try {
    const { sub } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({
      name: z.string().min(1).max(50).optional(),
      phone: z.string().max(30).optional(),
      bio: z.string().max(200).optional(),
      avatarUrl: z.string().optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    const updateData = { ...parsed.data, updatedAt: new Date() };
    const [updated] = await db.update(users).set(updateData).where(eq(users.id, sub)).returning();
    if (!updated) return c.json({ success: false, error: 'User not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id, email: updated.email, name: updated.name,
        orgId: updated.orgId, role: updated.role, phone: updated.phone,
        avatarUrl: updated.avatarUrl, bio: updated.bio,
        onlineStatus: updated.onlineStatus, lastLoginAt: updated.lastLoginAt,
        createdAt: updated.createdAt,
      },
    });
  } catch (e) { return c.json({ success: false, error: e instanceof Error ? e.message : 'Update failed' }, 500); }
});

// POST /avatar - Upload user avatar
app.post('/avatar', authMiddleware, async (c) => {
  try {
    const { sub } = c.get('user');
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: '请选择图片文件' }, 400);
    }
    const allowedExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
    const ext = (file as File).name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExts.has(ext)) {
      return c.json({ success: false, error: '仅支持 JPG/PNG/GIF/WEBP 格式' }, 400);
    }
    const maxSize = 2 * 1024 * 1024;
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > maxSize) {
      return c.json({ success: false, error: '图片大小不能超过 2MB' }, 400);
    }
    const filename = `avatar-${sub}-${Date.now()}.${ext}`;
    const uploadDir = './uploads/avatars';
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(`${uploadDir}/${filename}`, buffer);
    const avatarUrl = `/uploads/avatars/${filename}`;
    const [updated] = await db.update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, sub))
      .returning();
    if (!updated) return c.json({ success: false, error: 'User not found' }, 404);
    return c.json({ success: true, data: { avatarUrl } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Upload failed' }, 500);
  }
});

// PUT /password - Change password
app.put('/password', authMiddleware, async (c) => {
  try {
    const { sub } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return c.json({ success: false, error: '当前密码错误' }, 400);
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, sub));
    return c.json({ success: true, data: { message: '密码修改成功' } });
  } catch (e) { return c.json({ success: false, error: e instanceof Error ? e.message : 'Change password failed' }, 500); }
});

// PUT /status - Update agent online status
app.put('/status', authMiddleware, async (c) => {
  try {
    const { sub, orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({ status: z.enum(['online', 'away', 'busy', 'offline']) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid status' }, 400);

    await db.update(users)
      .set({ onlineStatus: parsed.data.status, lastOnlineAt: new Date() })
      .where(eq(users.id, sub));

    const { getIO } = await import('../websocket/socket');
    const io = getIO();
    if (io) {
      io.to(`org:${orgId}`).emit('agent:status', { agentId: sub, status: parsed.data.status });
    }

    return c.json({ success: true, data: { status: parsed.data.status } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Update status failed' }, 500);
  }
});

// GET /online - Get all online users in org
app.get('/online', authMiddleware, async (c) => {
  try {
    const { orgId } = c.get('user');
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: users.role,
        onlineStatus: users.onlineStatus,
        lastOnlineAt: users.lastOnlineAt,
      })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.status, 'active')))
      .orderBy(users.name);
    return c.json({ success: true, data: members });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Get online users failed' }, 500);
  }
});

// GET /settings - Get user notification settings
app.get('/settings', authMiddleware, async (c) => {
  try {
    const { sub } = c.get('user');
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);
    return c.json({ success: true, data: user.settings ?? {} });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Get settings failed' }, 500);
  }
});

// PUT /settings - Save user settings (notification prefs etc.)
const ALLOWED_SETTINGS_KEYS = ['notifications', 'theme', 'language', 'timezone', 'widget', 'workingHours', 'autoReply', 'assignRules', 'sla', 'serviceSettings'];
app.put('/settings', authMiddleware, async (c) => {
  try {
    const { sub, orgId } = c.get('user');
    const body = await c.req.json();
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);
    const sanitized: Record<string, unknown> = {};
    for (const key of ALLOWED_SETTINGS_KEYS) {
      if (key in body) sanitized[key] = body[key];
    }
    const merged = { ...(user.settings ?? {}), ...sanitized };
    await db.update(users).set({ settings: merged }).where(eq(users.id, sub));

    if (body.serviceSettings) {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      const orgSettings = (org?.settings ?? {}) as Record<string, unknown>;
      await db.update(organizations).set({
        settings: { ...orgSettings, serviceSettings: body.serviceSettings },
      }).where(eq(organizations.id, orgId));
    }

    return c.json({ success: true, data: merged });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Save settings failed' }, 500);
  }
});

// GET /members - List org members
app.get('/members', authMiddleware, async (c) => {
  try {
    const { orgId } = c.get('user');
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.orgId, orgId))
      .orderBy(users.createdAt);
    return c.json({ success: true, data: members });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'List members failed' }, 500);
  }
});

// PUT /members/:id/role - Update member role (admin+)
const updateRoleSchema = z.object({
  role: z.enum(['admin', 'agent', 'viewer']),
});

app.put('/members/:id/role', authMiddleware, requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const targetId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: '无效的角色' }, 400);
    }

    if (targetId === user.sub) {
      return c.json({ success: false, error: '不能修改自己的角色' }, 400);
    }

    const [target] = await db.select({ id: users.id, role: users.role, orgId: users.orgId })
      .from(users).where(eq(users.id, targetId)).limit(1);

    if (!target || target.orgId !== user.orgId) {
      return c.json({ success: false, error: '成员不存在' }, 404);
    }

    if (target.role === 'owner') {
      return c.json({ success: false, error: '不能修改组织所有者的角色' }, 403);
    }

    if (getRoleLevel(target.role) >= getRoleLevel(user.role) && user.role !== 'owner') {
      return c.json({ success: false, error: '不能修改同级或更高权限成员的角色' }, 403);
    }

    if (getRoleLevel(parsed.data.role) >= getRoleLevel(user.role) && user.role !== 'owner') {
      return c.json({ success: false, error: '不能授予与自己同级或更高的权限' }, 403);
    }

    const [updated] = await db.update(users)
      .set({ role: parsed.data.role, updatedAt: new Date() })
      .where(and(eq(users.id, targetId), eq(users.orgId, user.orgId)))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Update role failed' }, 500);
  }
});

// DELETE /members/:id - Remove member (admin+)
app.delete('/members/:id', authMiddleware, requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const targetId = c.req.param('id');

    if (targetId === user.sub) {
      return c.json({ success: false, error: '不能移除自己' }, 400);
    }

    const [target] = await db.select({ id: users.id, role: users.role, orgId: users.orgId })
      .from(users).where(eq(users.id, targetId)).limit(1);

    if (!target || target.orgId !== user.orgId) {
      return c.json({ success: false, error: '成员不存在' }, 404);
    }

    if (target.role === 'owner') {
      return c.json({ success: false, error: '不能移除组织所有者' }, 403);
    }

    if (getRoleLevel(target.role) >= getRoleLevel(user.role) && user.role !== 'owner') {
      return c.json({ success: false, error: '不能移除同级或更高权限的成员' }, 403);
    }

    await db.update(users)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(and(eq(users.id, targetId), eq(users.orgId, user.orgId)));

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Remove member failed' }, 500);
  }
});

export default app;
