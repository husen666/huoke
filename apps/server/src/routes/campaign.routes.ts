import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, count as countFn, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { campaigns } from '../db/schema';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { logAudit } from '../services/audit.service';
import { executeCampaign } from '../services/campaign.service';
import { getClientIp, parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';
import { requireFeature } from '../middleware/plan-guard';

const app = new Hono();

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  targetSegment: z.record(z.unknown()).optional(),
  targetCount: z.number().optional(),
  content: z.string().optional(),
  contentTemplate: z.record(z.unknown()).optional(),
  channelType: z.string().optional(),
  abTestEnabled: z.boolean().optional(),
  abVariants: z.array(z.unknown()).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

// GET /campaigns
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const status = c.req.query('status');
    const search = c.req.query('search');
    const type = c.req.query('type');
    const sortBy = c.req.query('sortBy');
    const sortOrder = c.req.query('sortOrder');
    const { page, pageSize } = parsePagination(c, { pageSize: 50 });
    const conditions = [eq(campaigns.orgId, orgId)];
    if (status) conditions.push(eq(campaigns.status, status));
    if (search) conditions.push(ilike(campaigns.name, `%${escapeLike(search)}%`));
    if (type) conditions.push(eq(campaigns.type, type));
    const where = and(...conditions);
    const sortColumn = { name: campaigns.name, createdAt: campaigns.createdAt, sentCount: sql`(${campaigns.stats}->>'sentCount')::int` }[sortBy as string] ?? campaigns.createdAt;
    const order = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const [totalRow] = await db.select({ count: countFn() }).from(campaigns).where(where);
    const total = totalRow?.count ?? 0;
    const list = await db
      .select()
      .from(campaigns)
      .where(where)
      .orderBy(order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List failed') },
      500
    );
  }
});

// POST /campaigns
app.post('/', requireFeature('campaigns'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const data = { ...parsed.data } as Record<string, unknown>;
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt as string);
    if (data.content && !data.contentTemplate) {
      data.contentTemplate = { body: data.content };
    }
    delete data.content;
    const [campaign] = await db
      .insert(campaigns)
      .values({ ...data, orgId } as typeof campaigns.$inferInsert)
      .returning();
    if (!campaign) return c.json({ success: false, error: 'Create failed' }, 500);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'create', resourceType: 'campaign', resourceId: campaign.id, ipAddress: clientIp, details: { name: campaign.name, type: campaign.type } }).catch(() => {});
    return c.json({ success: true, data: campaign });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create failed') },
      500
    );
  }
});

// GET /campaigns/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);
    return c.json({ success: true, data: campaign });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Get failed') },
      500
    );
  }
});

// PUT /campaigns/:id
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const data = { ...parsed.data } as Record<string, unknown>;
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt as string);
    if (data.content && !data.contentTemplate) {
      data.contentTemplate = { body: data.content };
    }
    delete data.content;
    const [updated] = await db
      .update(campaigns)
      .set(data)
      .where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Campaign not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'campaign', resourceId: id, ipAddress: clientIp, details: { fields: Object.keys(parsed.data) } }).catch(() => {});
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Update failed') },
      500
    );
  }
});

// POST /campaigns/:id/execute
app.post('/:id/execute', requireFeature('campaigns'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [updated] = await db
      .update(campaigns)
      .set({
        status: 'sending',
        startedAt: new Date(),
      })
      .where(and(
        eq(campaigns.id, id),
        eq(campaigns.orgId, orgId),
        eq(campaigns.status, 'draft'),
      ))
      .returning();
    if (!updated) {
      const [campaign] = await db.select({ status: campaigns.status }).from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId))).limit(1);
      if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);
      return c.json({ success: false, error: campaign.status === 'sending' ? '活动正在执行中' : '只有草稿状态的活动可以执行' }, 400);
    }

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'execute', resourceType: 'campaign', resourceId: id, ipAddress: clientIp, details: { name: updated.name } }).catch(() => {});
    dispatchWebhookEvent(orgId, 'campaign.executed', { campaign: updated }).catch(() => {});

    executeCampaign(id, orgId, user.sub).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Execute failed') },
      500
    );
  }
});

// DELETE /campaigns/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const [deleted] = await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId))).returning();
    if (!deleted) return c.json({ success: false, error: 'Campaign not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'delete', resourceType: 'campaign', resourceId: id, ipAddress: clientIp, details: { name: deleted.name } }).catch(() => {});
    return c.json({ success: true, data: deleted });
  } catch (e) { return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500); }
});

export default app;
