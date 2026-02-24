import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection';
import { invitations, users, organizations } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole, getRoleLevel } from '../middleware/rbac';
import { config } from '../config/env';
import { sendEmail, generateInvitationEmail } from '../services/email.service';
import { requireSeatLimit, checkSeatLimitInline } from '../middleware/plan-guard';

const app = new Hono();

function generateCode(): string {
  return randomBytes(24).toString('base64url');
}

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

const createSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['admin', 'agent', 'viewer']),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

// POST /invitations - Create invitation (admin+)
app.post('/', authMiddleware, requireMinRole('admin'), requireSeatLimit(), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: '参数错误', details: parsed.error.flatten() }, 400);
    }

    const { email, role, expiresInDays } = parsed.data;

    if (getRoleLevel(role) >= getRoleLevel(user.role) && user.role !== 'owner') {
      return c.json({ success: false, error: '不能创建与自己同级或更高权限的邀请' }, 403);
    }

    if (email) {
      const existingUser = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.email, email), eq(users.orgId, user.orgId))).limit(1);
      if (existingUser.length > 0) {
        return c.json({ success: false, error: '该邮箱用户已在组织中' }, 400);
      }

      const existingInv = await db.select({ id: invitations.id }).from(invitations)
        .where(and(
          eq(invitations.email, email),
          eq(invitations.orgId, user.orgId),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        )).limit(1);
      if (existingInv.length > 0) {
        return c.json({ success: false, error: '该邮箱已有待处理的邀请' }, 400);
      }
    }

    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const [inv] = await db.insert(invitations).values({
      orgId: user.orgId,
      invitedBy: user.sub,
      email: email ?? null,
      role,
      code,
      expiresAt,
    }).returning();

    if (email) {
      const inviterUser = await db.select({ name: users.name }).from(users).where(eq(users.id, user.sub)).limit(1);
      const org = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
      const inviterName = inviterUser[0]?.name || '团队成员';
      const orgName = org[0]?.name || '火客智能';
      sendEmail({
        to: email,
        subject: `${inviterName} 邀请您加入 ${orgName}`,
        html: generateInvitationEmail(inviterName, orgName, code),
      }).catch((err) => console.error('[invitation] Email send error:', err));
    }

    return c.json({ success: true, data: inv });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Create invitation failed' }, 500);
  }
});

// GET /invitations - List invitations (admin+)
app.get('/', authMiddleware, requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        code: invitations.code,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        acceptedAt: invitations.acceptedAt,
      })
      .from(invitations)
      .where(eq(invitations.orgId, orgId))
      .orderBy(invitations.createdAt);

    return c.json({ success: true, data: list });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'List invitations failed' }, 500);
  }
});

// DELETE /invitations/:id - Revoke invitation (admin+)
app.delete('/:id', authMiddleware, requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [updated] = await db.update(invitations)
      .set({ status: 'revoked' })
      .where(and(eq(invitations.id, id), eq(invitations.orgId, orgId), eq(invitations.status, 'pending')))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: '邀请不存在或已处理' }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Revoke failed' }, 500);
  }
});

// GET /invitations/verify/:code - Verify invitation (public)
app.get('/verify/:code', async (c) => {
  try {
    const code = c.req.param('code');
    const [inv] = await db.select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      orgId: invitations.orgId,
    }).from(invitations).where(eq(invitations.code, code)).limit(1);

    if (!inv) return c.json({ success: false, error: '邀请链接无效' }, 404);
    if (inv.status !== 'pending') return c.json({ success: false, error: '邀请已被使用或已撤销' }, 400);
    if (new Date(inv.expiresAt) < new Date()) return c.json({ success: false, error: '邀请链接已过期' }, 400);

    const [org] = await db.select({ name: organizations.name }).from(organizations)
      .where(eq(organizations.id, inv.orgId)).limit(1);

    return c.json({
      success: true,
      data: {
        email: inv.email,
        role: inv.role,
        orgName: org?.name ?? '未知组织',
        orgId: inv.orgId,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Verify failed' }, 500);
  }
});

// POST /invitations/accept/:code - Accept invitation (public, creates account)
const acceptSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

app.post('/accept/:code', async (c) => {
  try {
    const code = c.req.param('code');
    const body = await c.req.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: '参数错误', details: parsed.error.flatten() }, 400);
    }

    const { email, password, name } = parsed.data;

    const [inv] = await db.select().from(invitations).where(eq(invitations.code, code)).limit(1);
    if (!inv) return c.json({ success: false, error: '邀请链接无效' }, 404);
    if (inv.status !== 'pending') return c.json({ success: false, error: '邀请已被使用或已撤销' }, 400);
    if (new Date(inv.expiresAt) < new Date()) return c.json({ success: false, error: '邀请链接已过期' }, 400);

    if (inv.email && inv.email !== email) {
      return c.json({ success: false, error: '邮箱与邀请不匹配' }, 400);
    }

    const seatCheck = await checkSeatLimitInline(inv.orgId);
    if (!seatCheck.allowed) {
      return c.json({ success: false, error: seatCheck.error || '该组织席位已满', code: 'SEAT_LIMIT' }, 403);
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return c.json({ success: false, error: '该邮箱已注册' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({
      email,
      passwordHash,
      name,
      orgId: inv.orgId,
      role: inv.role,
    }).returning();

    if (!user) return c.json({ success: false, error: '创建用户失败' }, 500);

    await db.update(invitations).set({
      status: 'accepted',
      acceptedBy: user.id,
      acceptedAt: new Date(),
    }).where(eq(invitations.id, inv.id));

    const tokens = generateTokens(user.id, user.email, user.orgId, user.role);

    const [invOrg] = await db.select({
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
        ...tokens,
        user: { id: user.id, email: user.email, name: user.name, orgId: user.orgId, role: user.role },
        org: invOrg ?? undefined,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Accept failed' }, 500);
  }
});

export default app;
