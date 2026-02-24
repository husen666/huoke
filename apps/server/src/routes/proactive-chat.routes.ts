import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { proactiveChatRules } from '../db/schema';

const app = new Hono();

const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
  triggerType: z.enum(['time_on_page', 'page_url', 'scroll_depth', 'exit_intent', 'returning_visitor']),
  triggerConfig: z.record(z.unknown()),
  message: z.string().min(1),
  displayDelay: z.number().int().min(0).optional(),
  maxShowCount: z.number().int().min(1).optional(),
});

app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const rules = await db.select().from(proactiveChatRules)
      .where(eq(proactiveChatRules.orgId, orgId))
      .orderBy(desc(proactiveChatRules.createdAt));
    return c.json({ success: true, data: rules });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'List failed' }, 500);
  }
});

app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [rule] = await db.select().from(proactiveChatRules)
      .where(and(eq(proactiveChatRules.id, id), eq(proactiveChatRules.orgId, orgId)))
      .limit(1);
    if (!rule) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: rule });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Get failed' }, 500);
  }
});

app.post('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = ruleSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);

    const [rule] = await db.insert(proactiveChatRules).values({
      orgId,
      ...parsed.data,
    }).returning();

    return c.json({ success: true, data: rule });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Create failed' }, 500);
  }
});

app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = ruleSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, 400);

    const [updated] = await db.update(proactiveChatRules)
      .set(parsed.data)
      .where(and(eq(proactiveChatRules.id, id), eq(proactiveChatRules.orgId, orgId)))
      .returning();

    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Update failed' }, 500);
  }
});

app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(proactiveChatRules)
      .where(and(eq(proactiveChatRules.id, id), eq(proactiveChatRules.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Delete failed' }, 500);
  }
});

export default app;
