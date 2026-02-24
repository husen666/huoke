import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, sql, desc, and, ilike } from 'drizzle-orm';
import { db } from '../db/connection';
import { organizations, users, platformAdmins, subscriptions, usageRecords, conversations, leads, knowledgeBases } from '../db/schema';
import { config } from '../config/env';
import { getPlanConfig, PLAN_CONFIGS, PLAN_ORDER } from '../config/plans';
import { clearPlanCache } from '../middleware/plan-guard';

const app = new Hono();

function adminAuthMiddleware() {
  return async (c: any, next: any) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    try {
      const decoded = jwt.verify(auth.slice(7), config.JWT_SECRET) as any;
      if (!decoded.isAdmin) {
        return c.json({ success: false, error: 'Not a platform admin' }, 403);
      }
      c.set('admin', decoded);
      await next();
    } catch {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }
  };
}

app.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '请输入有效的邮箱和密码' }, 400);
    const { email, password } = parsed.data;
    const [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.email, email)).limit(1);
    if (!admin) return c.json({ success: false, error: '账号或密码错误' }, 401);
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return c.json({ success: false, error: '账号或密码错误' }, 401);
    const token = jwt.sign({ sub: admin.id, email: admin.email, isAdmin: true }, config.JWT_SECRET, { expiresIn: '8h' });
    return c.json({ success: true, data: { token, admin: { id: admin.id, email: admin.email, name: admin.name } } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Login failed' }, 500);
  }
});

app.post('/init', async (c) => {
  try {
    const [existing] = await db.select({ id: platformAdmins.id }).from(platformAdmins).limit(1);
    if (existing) return c.json({ success: false, error: '平台管理员已存在' }, 400);
    const body = await c.req.json();
    const parsed = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
    const { email, password, name } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const [admin] = await db.insert(platformAdmins).values({ email, passwordHash, name }).returning();
    return c.json({ success: true, data: { id: admin.id, email: admin.email } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Init failed' }, 500);
  }
});

app.get('/plans', adminAuthMiddleware(), async (c) => {
  return c.json({ success: true, data: { plans: PLAN_CONFIGS, order: PLAN_ORDER } });
});

app.get('/stats', adminAuthMiddleware(), async (c) => {
  try {
    const [orgCount] = await db.select({ count: sql<number>`count(*)::int` }).from(organizations);
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [activeOrgs] = await db.select({ count: sql<number>`count(distinct ${conversations.orgId})::int` }).from(conversations)
      .where(sql`${conversations.createdAt} > now() - interval '30 days'`);

    const planDist = await db.select({
      plan: organizations.plan,
      count: sql<number>`count(*)::int`,
    }).from(organizations).groupBy(organizations.plan);

    const recentOrgs = await db.select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
      createdAt: organizations.createdAt,
    }).from(organizations).orderBy(desc(organizations.createdAt)).limit(10);

    return c.json({
      success: true,
      data: {
        totalOrgs: orgCount.count,
        totalUsers: userCount.count,
        activeOrgsLast30d: activeOrgs.count,
        planDistribution: planDist,
        recentOrgs,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed to load stats' }, 500);
  }
});

app.get('/orgs', adminAuthMiddleware(), async (c) => {
  try {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
    const search = c.req.query('search') ?? '';
    const planFilter = c.req.query('plan') ?? '';
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) conditions.push(ilike(organizations.name, `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`));
    if (planFilter) conditions.push(eq(organizations.plan, planFilter));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(organizations).where(where);

    const orgs = await db.select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
      planExpiresAt: organizations.planExpiresAt,
      trialEndsAt: organizations.trialEndsAt,
      maxSeats: organizations.maxSeats,
      industry: organizations.industry,
      createdAt: organizations.createdAt,
    }).from(organizations).where(where).orderBy(desc(organizations.createdAt)).limit(limit).offset(offset);

    const orgIds = orgs.map(o => o.id);
    const seatCounts = orgIds.length > 0
      ? await db.select({ orgId: users.orgId, count: sql<number>`count(*)::int` }).from(users)
        .where(sql`${users.orgId} = ANY(ARRAY[${sql.join(orgIds.map(id => sql`${id}::uuid`), sql`, `)}])`)
        .groupBy(users.orgId)
      : [];

    const seatMap = new Map(seatCounts.map(s => [s.orgId, s.count]));

    return c.json({
      success: true,
      data: {
        orgs: orgs.map(o => ({ ...o, seatUsage: seatMap.get(o.id) ?? 0 })),
        total: total.count,
        page,
        limit,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed to load orgs' }, 500);
  }
});

app.get('/orgs/:id', adminAuthMiddleware(), async (c) => {
  try {
    const orgId = c.req.param('id');
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return c.json({ success: false, error: '组织不存在' }, 404);

    const period = new Date().toISOString().slice(0, 7);
    const [seatCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.orgId, orgId));
    const [leadCount] = await db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId));
    const [kbCount] = await db.select({ count: sql<number>`count(*)::int` }).from(knowledgeBases).where(eq(knowledgeBases.orgId, orgId));
    const [convCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conversations)
      .where(and(eq(conversations.orgId, orgId), sql`to_char(${conversations.createdAt}, 'YYYY-MM') = ${period}`));

    const members = await db.select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      status: users.status, createdAt: users.createdAt,
    }).from(users).where(eq(users.orgId, orgId)).orderBy(users.createdAt);

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).orderBy(desc(subscriptions.createdAt)).limit(10);

    return c.json({
      success: true,
      data: {
        org,
        usage: {
          seats: seatCount.count,
          leads: leadCount.count,
          knowledgeBases: kbCount.count,
          conversationsThisMonth: convCount.count,
        },
        members,
        subscriptions: subs,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed to load org' }, 500);
  }
});

app.put('/orgs/:id/plan', adminAuthMiddleware(), async (c) => {
  try {
    const orgId = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({
      plan: z.enum(['starter', 'pro', 'enterprise']),
      expiresAt: z.string().optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid input' }, 400);

    const planCfg = getPlanConfig(parsed.data.plan);
    const [updated] = await db.update(organizations).set({
      plan: parsed.data.plan,
      planExpiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      maxSeats: planCfg.seats === -1 ? 9999 : planCfg.seats,
      maxConversationsPerMonth: planCfg.conversationsPerMonth === -1 ? 999999 : planCfg.conversationsPerMonth,
      maxLeads: planCfg.leads === -1 ? 999999 : planCfg.leads,
      maxKnowledgeBases: planCfg.knowledgeBases === -1 ? 999 : planCfg.knowledgeBases,
      maxStorageMb: planCfg.storageMb === -1 ? 999999 : planCfg.storageMb,
      features: planCfg.features,
      updatedAt: new Date(),
    }).where(eq(organizations.id, orgId)).returning();

    if (!updated) return c.json({ success: false, error: '组织不存在' }, 404);

    await db.insert(subscriptions).values({
      orgId,
      plan: parsed.data.plan,
      status: 'active',
      amount: planCfg.price * 100,
      startDate: new Date(),
      endDate: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });

    clearPlanCache(orgId);

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed to update plan' }, 500);
  }
});

app.delete('/orgs/:id', adminAuthMiddleware(), async (c) => {
  try {
    const orgId = c.req.param('id');
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return c.json({ success: false, error: '组织不存在' }, 404);

    await db.delete(users).where(eq(users.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));

    clearPlanCache(orgId);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed to delete org' }, 500);
  }
});

export default app;
