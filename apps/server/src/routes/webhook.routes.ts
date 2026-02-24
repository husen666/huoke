import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { webhooks } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';
import { requireFeature } from '../middleware/plan-guard';

const app = new Hono();

const createWebhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateWebhookSchema = createWebhookSchema.partial();

// GET /webhooks
app.get('/', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const { page, pageSize } = parsePagination(c);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(webhooks)
      .where(eq(webhooks.orgId, orgId));

    const list = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.orgId, orgId))
      .orderBy(desc(webhooks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return c.json({ success: true, data: list, total: count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

// POST /webhooks
app.post('/', requireFeature('webhooks'), async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const body = await c.req.json();
    const parsed = createWebhookSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [webhook] = await db
      .insert(webhooks)
      .values({ ...parsed.data, orgId })
      .returning();
    if (!webhook) return c.json({ success: false, error: 'Create failed' }, 500);
    return c.json({ success: true, data: webhook });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

// PUT /webhooks/:id
app.put('/:id', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateWebhookSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const data = { ...parsed.data } as Record<string, unknown>;
    data.updatedAt = new Date();

    const [updated] = await db
      .update(webhooks)
      .set(data)
      .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Webhook not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

// DELETE /webhooks/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const [deleted] = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Webhook not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

// POST /webhooks/:id/test
app.post('/:id/test', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
      .limit(1);
    if (!webhook) return c.json({ success: false, error: 'Webhook not found' }, 404);

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery from HuoKeAgent' },
    };

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (webhook.secret) headers['X-Webhook-Secret'] = webhook.secret;

      const resp = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      await db
        .update(webhooks)
        .set({ lastTriggeredAt: new Date(), updatedAt: new Date() })
        .where(eq(webhooks.id, id));

      return c.json({
        success: true,
        data: { statusCode: resp.status, statusText: resp.statusText },
      });
    } catch (fetchErr) {
      await db
        .update(webhooks)
        .set({ failCount: sql`${webhooks.failCount} + 1`, updatedAt: new Date() })
        .where(eq(webhooks.id, id));

      return c.json({
        success: false,
        error: getErrorMessage(fetchErr, 'Request failed'),
      }, 502);
    }
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Test failed') }, 500);
  }
});

export default app;
