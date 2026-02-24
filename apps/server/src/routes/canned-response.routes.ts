import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, or, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { cannedResponses } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';

const app = new Hono();

// GET / - list canned responses
app.get('/', async (c) => {
  try {
    const { orgId, sub: userId } = c.get('user');
    const category = c.req.query('category');
    const { page, pageSize } = parsePagination(c);
    const conditions = [
      eq(cannedResponses.orgId, orgId),
      or(eq(cannedResponses.isPublic, true), eq(cannedResponses.createdBy, userId))!,
    ];
    if (category) conditions.push(eq(cannedResponses.category, category));
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cannedResponses)
      .where(and(...conditions));
    const list = await db.select().from(cannedResponses)
      .where(and(...conditions))
      .orderBy(desc(cannedResponses.useCount))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// POST / - create
app.post('/', async (c) => {
  try {
    const { orgId, sub: userId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({
      title: z.string().min(1).max(100),
      content: z.string().min(1),
      shortcut: z.string().max(50).optional(),
      category: z.string().max(50).optional(),
      isPublic: z.boolean().optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [item] = await db.insert(cannedResponses).values({
      ...parsed.data,
      orgId,
      createdBy: userId,
    }).returning();
    return c.json({ success: true, data: item });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// PUT /:id - update
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({
      title: z.string().min(1).max(100).optional(),
      content: z.string().min(1).optional(),
      shortcut: z.string().max(50).optional(),
      category: z.string().max(50).optional(),
      isPublic: z.boolean().optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [updated] = await db.update(cannedResponses)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(cannedResponses.id, id), eq(cannedResponses.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// POST /:id/use - increment use count
app.post('/:id/use', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const { sql } = await import('drizzle-orm');
    await db.update(cannedResponses)
      .set({ useCount: sql`${cannedResponses.useCount} + 1` })
      .where(and(eq(cannedResponses.id, id), eq(cannedResponses.orgId, orgId)));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// DELETE /:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(cannedResponses)
      .where(and(eq(cannedResponses.id, id), eq(cannedResponses.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

export default app;
