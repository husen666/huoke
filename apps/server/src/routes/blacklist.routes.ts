import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { blacklist } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';

const app = new Hono();

const createBlacklistSchema = z.object({
  type: z.enum(['ip', 'visitor', 'keyword']),
  value: z.string().min(1),
  reason: z.string().optional(),
});

// GET /blacklist
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const type = c.req.query('type');
    const { page, pageSize } = parsePagination(c);

    const conditions = [eq(blacklist.orgId, orgId)];
    if (type) conditions.push(eq(blacklist.type, type));

    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blacklist)
      .where(where);

    const list = await db
      .select()
      .from(blacklist)
      .where(where)
      .orderBy(desc(blacklist.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return c.json({ success: true, data: list, total: count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

// POST /blacklist
app.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = createBlacklistSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [entry] = await db
      .insert(blacklist)
      .values({ ...parsed.data, orgId: user.orgId, createdBy: user.sub })
      .returning();
    if (!entry) return c.json({ success: false, error: 'Create failed' }, 500);
    return c.json({ success: true, data: entry });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

// DELETE /blacklist/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db
      .delete(blacklist)
      .where(and(eq(blacklist.id, id), eq(blacklist.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Entry not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
