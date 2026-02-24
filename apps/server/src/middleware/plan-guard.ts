import type { Context, Next } from 'hono';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { organizations, users, leads, conversations, knowledgeBases } from '../db/schema';
import { getPlanConfig, isUnlimited } from '../config/plans';

interface OrgPlanEntry {
  plan: string;
  expiresAt: number | null;
  trialEndsAt: number | null;
  limits: Record<string, number>;
  features: string[];
  ts: number;
}

const orgPlanCache = new Map<string, OrgPlanEntry>();
const CACHE_TTL = 60_000;

export async function getOrgPlan(orgId: string): Promise<OrgPlanEntry | null> {
  const cached = orgPlanCache.get(orgId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

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

  if (!org) return null;

  const planCfg = getPlanConfig(org.plan ?? 'starter');
  const entry: OrgPlanEntry = {
    plan: org.plan ?? 'starter',
    expiresAt: org.planExpiresAt ? new Date(org.planExpiresAt).getTime() : null,
    trialEndsAt: org.trialEndsAt ? new Date(org.trialEndsAt).getTime() : null,
    limits: {
      seats: org.maxSeats ?? planCfg.seats,
      conversationsPerMonth: org.maxConversationsPerMonth ?? planCfg.conversationsPerMonth,
      leads: org.maxLeads ?? planCfg.leads,
      knowledgeBases: org.maxKnowledgeBases ?? planCfg.knowledgeBases,
      storageMb: org.maxStorageMb ?? planCfg.storageMb,
    },
    features: (org.features as string[] | null) ?? planCfg.features,
    ts: Date.now(),
  };
  orgPlanCache.set(orgId, entry);
  if (orgPlanCache.size > 5000) {
    const oldest = [...orgPlanCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 1000; i++) orgPlanCache.delete(oldest[i][0]);
  }
  return entry;
}

export function clearPlanCache(orgId?: string) {
  if (orgId) orgPlanCache.delete(orgId);
  else orgPlanCache.clear();
}

function isTrialExpired(entry: OrgPlanEntry): boolean {
  if (!entry.trialEndsAt) return false;
  return Date.now() > entry.trialEndsAt;
}

export function requireFeature(...features: string[]) {
  return async (c: Context, next: Next) => {
    const { orgId } = c.get('user');
    const orgPlan = await getOrgPlan(orgId);
    if (!orgPlan) return c.json({ success: false, error: '组织不存在' }, 404);

    if (isTrialExpired(orgPlan)) {
      return c.json({
        success: false,
        error: '试用期已结束，请升级套餐以继续使用',
        code: 'TRIAL_EXPIRED',
      }, 403);
    }

    for (const f of features) {
      if (!orgPlan.features.includes(f)) {
        return c.json({
          success: false,
          error: '当前套餐不支持此功能，请升级到更高版本',
          code: 'PLAN_LIMIT',
          feature: f,
        }, 403);
      }
    }
    await next();
  };
}

export function requireSeatLimit() {
  return async (c: Context, next: Next) => {
    const { orgId } = c.get('user');
    const orgPlan = await getOrgPlan(orgId);
    if (!orgPlan) return c.json({ success: false, error: '组织不存在' }, 404);

    if (!isUnlimited(orgPlan.limits.seats)) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(users).where(and(eq(users.orgId, orgId), eq(users.status, 'active')));
      if (count >= orgPlan.limits.seats) {
        return c.json({
          success: false,
          error: `当前套餐最多支持 ${orgPlan.limits.seats} 个成员席位，请升级`,
          code: 'SEAT_LIMIT',
          current: count,
          limit: orgPlan.limits.seats,
        }, 403);
      }
    }
    await next();
  };
}

export function requireLeadLimit() {
  return async (c: Context, next: Next) => {
    const { orgId } = c.get('user');
    const orgPlan = await getOrgPlan(orgId);
    if (!orgPlan) return c.json({ success: false, error: '组织不存在' }, 404);

    if (!isUnlimited(orgPlan.limits.leads)) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(leads).where(eq(leads.orgId, orgId));
      if (count >= orgPlan.limits.leads) {
        return c.json({
          success: false,
          error: `线索数量已达套餐上限 (${orgPlan.limits.leads})，请升级`,
          code: 'LEAD_LIMIT',
          current: count,
          limit: orgPlan.limits.leads,
        }, 403);
      }
    }
    await next();
  };
}

export function requireConversationLimit() {
  return async (c: Context, next: Next) => {
    const { orgId } = c.get('user');
    const orgPlan = await getOrgPlan(orgId);
    if (!orgPlan) return c.json({ success: false, error: '组织不存在' }, 404);

    if (!isUnlimited(orgPlan.limits.conversationsPerMonth)) {
      const period = new Date().toISOString().slice(0, 7);
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(eq(conversations.orgId, orgId), sql`to_char(${conversations.createdAt}, 'YYYY-MM') = ${period}`));
      if (count >= orgPlan.limits.conversationsPerMonth) {
        return c.json({
          success: false,
          error: `本月会话数已达套餐上限 (${orgPlan.limits.conversationsPerMonth})，请升级`,
          code: 'CONVERSATION_LIMIT',
          current: count,
          limit: orgPlan.limits.conversationsPerMonth,
        }, 403);
      }
    }
    await next();
  };
}

export function requireKnowledgeBaseLimit() {
  return async (c: Context, next: Next) => {
    const { orgId } = c.get('user');
    const orgPlan = await getOrgPlan(orgId);
    if (!orgPlan) return c.json({ success: false, error: '组织不存在' }, 404);

    if (!isUnlimited(orgPlan.limits.knowledgeBases)) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(knowledgeBases).where(eq(knowledgeBases.orgId, orgId));
      if (count >= orgPlan.limits.knowledgeBases) {
        return c.json({
          success: false,
          error: `知识库数量已达套餐上限 (${orgPlan.limits.knowledgeBases})，请升级`,
          code: 'KB_LIMIT',
          current: count,
          limit: orgPlan.limits.knowledgeBases,
        }, 403);
      }
    }
    await next();
  };
}

export async function checkSeatLimitInline(orgId: string): Promise<{ allowed: boolean; error?: string }> {
  const orgPlan = await getOrgPlan(orgId);
  if (!orgPlan) return { allowed: false, error: '组织不存在' };
  if (isUnlimited(orgPlan.limits.seats)) return { allowed: true };
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(users).where(and(eq(users.orgId, orgId), eq(users.status, 'active')));
  if (count >= orgPlan.limits.seats) {
    return { allowed: false, error: `该组织席位已满 (${count}/${orgPlan.limits.seats})，请联系管理员升级` };
  }
  return { allowed: true };
}

export async function checkConversationLimitInline(orgId: string): Promise<{ allowed: boolean; error?: string }> {
  const orgPlan = await getOrgPlan(orgId);
  if (!orgPlan) return { allowed: false, error: '组织不存在' };
  if (isUnlimited(orgPlan.limits.conversationsPerMonth)) return { allowed: true };
  const period = new Date().toISOString().slice(0, 7);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(eq(conversations.orgId, orgId), sql`to_char(${conversations.createdAt}, 'YYYY-MM') = ${period}`));
  if (count >= orgPlan.limits.conversationsPerMonth) {
    return { allowed: false, error: '本月会话数已达上限' };
  }
  return { allowed: true };
}

export async function getOrgUsageSummary(orgId: string) {
  const orgPlan = await getOrgPlan(orgId);
  if (!orgPlan) return null;

  const period = new Date().toISOString().slice(0, 7);
  const [seatCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.orgId, orgId));
  const [leadCount] = await db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId));
  const [kbCount] = await db.select({ count: sql<number>`count(*)::int` }).from(knowledgeBases).where(eq(knowledgeBases.orgId, orgId));
  const [convCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conversations)
    .where(and(eq(conversations.orgId, orgId), sql`to_char(${conversations.createdAt}, 'YYYY-MM') = ${period}`));

  return {
    plan: orgPlan.plan,
    limits: orgPlan.limits,
    usage: {
      seats: seatCount.count,
      leads: leadCount.count,
      knowledgeBases: kbCount.count,
      conversationsThisMonth: convCount.count,
    },
  };
}
