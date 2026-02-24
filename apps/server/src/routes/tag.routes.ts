import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { tags } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';

const app = new Hono();

const tagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  category: z.string().optional(),
});

app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const category = c.req.query('category');
    const { page, pageSize } = parsePagination(c);
    const conditions = [eq(tags.orgId, orgId)];
    if (category) conditions.push(eq(tags.category, category));
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tags)
      .where(and(...conditions));
    const list = await db
      .select()
      .from(tags)
      .where(and(...conditions))
      .orderBy(desc(tags.createdAt))
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
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [tag] = await db.insert(tags).values({ ...parsed.data, orgId }).returning();
    if (!tag) return c.json({ success: false, error: 'Create failed' }, 500);
    return c.json({ success: true, data: tag });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = tagSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [updated] = await db
      .update(tags)
      .set(parsed.data)
      .where(and(eq(tags.id, id), eq(tags.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Tag not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(tags).where(and(eq(tags.id, id), eq(tags.orgId, orgId))).returning();
    if (!deleted) return c.json({ success: false, error: 'Tag not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
