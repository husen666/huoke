import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/connection';
import { notifications } from '../db/schema';
import { parsePagination, getErrorMessage } from '../utils/helpers';

const app = new Hono();

app.get('/unread-count', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.sub;
    const { orgId } = user;
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), eq(notifications.isRead, false))
      );
    return c.json({ success: true, data: { count: result?.count ?? 0 } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Count failed') }, 500);
  }
});

app.put('/read-all', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.sub;
    const { orgId } = user;
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), eq(notifications.isRead, false))
      );
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

app.get('/', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.sub;
    const { orgId } = user;
    const { page, pageSize, offset } = parsePagination(c);
    const onlyUnread = c.req.query('unread') === 'true';

    const conditions = [eq(notifications.orgId, orgId), eq(notifications.userId, userId)];
    if (onlyUnread) conditions.push(eq(notifications.isRead, false));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(...conditions));

    const list = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);

    return c.json({ success: true, data: list, total: countResult?.count ?? 0, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

app.put('/:id/read', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.sub;
    const { orgId } = user;
    const id = c.req.param('id');
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.orgId, orgId), eq(notifications.userId, userId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

app.delete('/clear-read', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.sub;
    const { orgId } = user;
    const result = await db.delete(notifications)
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), eq(notifications.isRead, true)))
      .returning({ id: notifications.id });
    return c.json({ success: true, deleted: result.length });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

app.delete('/batch', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const ids = body.ids as string[];
    if (!ids?.length) return c.json({ success: false, error: 'No IDs provided' }, 400);

    await db.delete(notifications)
      .where(and(inArray(notifications.id, ids), eq(notifications.userId, user.sub)));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

app.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.sub)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
