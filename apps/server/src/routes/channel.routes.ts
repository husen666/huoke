import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { channels, conversations, messages } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';

const app = new Hono();

const channelSchema = z.object({
  platform: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  webhookUrl: z.string().optional(),
});

app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const platform = c.req.query('platform');
    const { page, pageSize } = parsePagination(c);
    const conditions = [eq(channels.orgId, orgId)];
    if (platform) conditions.push(eq(channels.platform, platform));
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(channels)
      .where(and(...conditions));
    const list = await db
      .select()
      .from(channels)
      .where(and(...conditions))
      .orderBy(desc(channels.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

app.post('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = channelSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [channel] = await db
      .insert(channels)
      .values({ ...parsed.data, orgId })
      .returning();
    return c.json({ success: true, data: channel });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = channelSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [updated] = await db
      .update(channels)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(channels.id, id), eq(channels.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

app.get('/stats', async (c) => {
  try {
    const { orgId } = c.get('user');
    const byPlatform = await db
      .select({
        platform: channels.platform,
        conversations: sql<number>`(SELECT count(*)::int FROM conversations WHERE conversations.channel_type = ${channels.platform} AND conversations.org_id = ${orgId})`,
        messages: sql<number>`(SELECT count(*)::int FROM messages m JOIN conversations cv ON m.conversation_id = cv.id WHERE cv.channel_type = ${channels.platform} AND cv.org_id = ${orgId})`,
      })
      .from(channels)
      .where(eq(channels.orgId, orgId))
      .groupBy(channels.platform);
    return c.json({ success: true, data: { byPlatform } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Stats failed') }, 500);
  }
});

app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db
      .delete(channels)
      .where(and(eq(channels.id, id), eq(channels.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
