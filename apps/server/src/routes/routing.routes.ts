import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { routingRules } from '../db/schema';

const app = new Hono();

const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  conditions: z.record(z.unknown()),
  targetType: z.enum(['agent', 'team', 'round_robin_team']),
  targetId: z.string().uuid().optional().nullable(),
});

app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const rules = await db.select().from(routingRules)
      .where(eq(routingRules.orgId, orgId))
      .orderBy(desc(routingRules.priority));
    return c.json({ success: true, data: rules });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'List failed' }, 500);
  }
});

app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [rule] = await db.select().from(routingRules)
      .where(and(eq(routingRules.id, id), eq(routingRules.orgId, orgId)))
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

    const [rule] = await db.insert(routingRules).values({
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

    const [updated] = await db.update(routingRules)
      .set(parsed.data)
      .where(and(eq(routingRules.id, id), eq(routingRules.orgId, orgId)))
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
    const [deleted] = await db.delete(routingRules)
      .where(and(eq(routingRules.id, id), eq(routingRules.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Delete failed' }, 500);
  }
});

export default app;
