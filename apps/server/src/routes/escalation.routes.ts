import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { escalationRules } from '../db/schema';
import { getErrorMessage, formatZodError } from '../utils/helpers';

const app = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
  triggerType: z.enum(['first_response_sla', 'resolution_sla', 'no_response', 'priority_high']),
  thresholdMinutes: z.number().int().min(1),
  action: z.enum(['notify_manager', 'reassign', 'change_priority', 'notify_team']),
  actionConfig: z.record(z.unknown()).optional(),
});

const updateSchema = createSchema.partial();

// GET /escalation-rules
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db
      .select()
      .from(escalationRules)
      .where(eq(escalationRules.orgId, orgId))
      .orderBy(desc(escalationRules.createdAt));
    return c.json({ success: true, data: list });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List escalation rules failed') }, 500);
  }
});

// GET /escalation-rules/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [rule] = await db
      .select()
      .from(escalationRules)
      .where(and(eq(escalationRules.id, id), eq(escalationRules.orgId, orgId)))
      .limit(1);
    if (!rule) return c.json({ success: false, error: 'Rule not found' }, 404);
    return c.json({ success: true, data: rule });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Get rule failed') }, 500);
  }
});

// POST /escalation-rules
app.post('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [rule] = await db
      .insert(escalationRules)
      .values({ ...parsed.data, orgId })
      .returning();
    if (!rule) return c.json({ success: false, error: 'Create failed' }, 500);
    return c.json({ success: true, data: rule });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create rule failed') }, 500);
  }
});

// PUT /escalation-rules/:id
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [updated] = await db
      .update(escalationRules)
      .set(parsed.data)
      .where(and(eq(escalationRules.id, id), eq(escalationRules.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Rule not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update rule failed') }, 500);
  }
});

// DELETE /escalation-rules/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db
      .delete(escalationRules)
      .where(and(eq(escalationRules.id, id), eq(escalationRules.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Rule not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete rule failed') }, 500);
  }
});

export default app;
