import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { organizations, users, subscriptions, leads, conversations, knowledgeBases, documents } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { PLAN_CONFIGS, PLAN_ORDER, getPlanConfig } from '../config/plans';
import { clearPlanCache } from '../middleware/plan-guard';

const app = new Hono();

app.get('/plans', async (c) => {
  const publicPlans = PLAN_ORDER.map(key => {
    const p = PLAN_CONFIGS[key];
    return {
      name: p.name,
      label: p.label,
      price: p.price,
      interval: p.interval,
      seats: p.seats,
      conversationsPerMonth: p.conversationsPerMonth,
      leads: p.leads,
      knowledgeBases: p.knowledgeBases,
      storageMb: p.storageMb,
      features: p.features,
    };
  });
  return c.json({ success: true, data: publicPlans });
});

app.get('/usage', authMiddleware, async (c) => {
  const { orgId } = c.get('user');
  const [org] = await db.select({
    plan: organizations.plan,
    planExpiresAt: organizations.planExpiresAt,
    trialEndsAt: organizations.trialEndsAt,
    maxSeats: organizations.maxSeats,
    maxConversationsPerMonth: organizations.maxConversationsPerMonth,
    maxLeads: organizations.maxLeads,
    maxKnowledgeBases: organizations.maxKnowledgeBases,
    maxStorageMb: organizations.maxStorageMb,
    features: organizations.features,
  }).from(organizations).where(eq(organizations.id, orgId)).limit(1);

  if (!org) return c.json({ success: false, error: '组织不存在' }, 404);

  const period = new Date().toISOString().slice(0, 7);
  const [[seatCount], [leadCount], [kbCount], [convCount], [storageSum]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.orgId, orgId)),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId)),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeBases).where(eq(knowledgeBases.orgId, orgId)),
    db.select({ count: sql<number>`count(*)::int` }).from(conversations)
      .where(and(eq(conversations.orgId, orgId), sql`to_char(${conversations.createdAt}, 'YYYY-MM') = ${period}`)),
    db.select({ total: sql<number>`coalesce(sum(${documents.fileSize}), 0)::bigint` })
      .from(documents)
      .innerJoin(knowledgeBases, eq(documents.kbId, knowledgeBases.id))
      .where(eq(knowledgeBases.orgId, orgId)),
  ]);

  const planCfg = getPlanConfig(org.plan ?? 'starter');

  return c.json({
    success: true,
    data: {
      plan: org.plan,
      planLabel: planCfg.label,
      planExpiresAt: org.planExpiresAt,
      trialEndsAt: org.trialEndsAt,
      features: org.features,
      limits: {
        seats: org.maxSeats,
        conversationsPerMonth: org.maxConversationsPerMonth,
        leads: org.maxLeads,
        knowledgeBases: org.maxKnowledgeBases,
        storageMb: org.maxStorageMb,
      },
      usage: {
        seats: seatCount.count,
        leads: leadCount.count,
        knowledgeBases: kbCount.count,
        conversationsThisMonth: convCount.count,
        storageMb: Math.round(Number(storageSum.total) / 1024 / 1024 * 100) / 100,
      },
    },
  });
});

app.get('/subscriptions', authMiddleware, async (c) => {
  const { orgId } = c.get('user');
  const subs = await db.select().from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(20);
  return c.json({ success: true, data: subs });
});

app.post('/onboarding', authMiddleware, async (c) => {
  const { orgId } = c.get('user');
  const body = await c.req.json();
  const parsed = z.object({
    orgName: z.string().min(1).max(100).optional(),
    industry: z.string().max(100).optional(),
    scale: z.string().max(50).optional(),
    phone: z.string().max(50).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Invalid input' }, 400);

  const updateData: Record<string, unknown> = { onboardingCompleted: true, updatedAt: new Date() };
  if (parsed.data.orgName) updateData.name = parsed.data.orgName;
  if (parsed.data.industry) updateData.industry = parsed.data.industry;
  if (parsed.data.scale) updateData.scale = parsed.data.scale;
  if (parsed.data.phone) updateData.phone = parsed.data.phone;

  await db.update(organizations).set(updateData).where(eq(organizations.id, orgId));
  clearPlanCache(orgId);

  return c.json({ success: true });
});

app.post('/upgrade-request', authMiddleware, async (c) => {
  const { orgId } = c.get('user');
  const body = await c.req.json();
  const { plan, contact } = z.object({
    plan: z.enum(['starter', 'pro', 'enterprise']),
    contact: z.string().optional(),
  }).parse(body);

  return c.json({
    success: true,
    data: { message: '升级请求已提交，我们的销售团队将在1个工作日内与您联系' },
  });
});

export default app;
