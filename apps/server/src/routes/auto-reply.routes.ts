import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { autoReplyRules } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';
import { requireFeature } from '../middleware/plan-guard';

const app = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  triggerType: z.enum(['keyword', 'regex', 'time_range', 'first_message', 'no_agent_online']),
  triggerConfig: z.record(z.unknown()),
  replyContent: z.string().min(1),
  replyType: z.enum(['text', 'rich', 'menu']).optional(),
  menuOptions: z.array(z.object({ label: z.string(), reply: z.string() })).optional(),
});

const updateSchema = createSchema.partial();

// GET / — list with pagination
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize, offset } = parsePagination(c);

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(autoReplyRules)
      .where(eq(autoReplyRules.orgId, orgId));

    const list = await db
      .select()
      .from(autoReplyRules)
      .where(eq(autoReplyRules.orgId, orgId))
      .orderBy(desc(autoReplyRules.priority), desc(autoReplyRules.createdAt))
      .limit(pageSize)
      .offset(offset);

    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

// POST / — create
app.post('/', requireFeature('auto_reply'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [rule] = await db.insert(autoReplyRules).values({
      orgId,
      name: parsed.data.name,
      isActive: parsed.data.isActive ?? true,
      priority: parsed.data.priority ?? 0,
      triggerType: parsed.data.triggerType,
      triggerConfig: parsed.data.triggerConfig,
      replyContent: parsed.data.replyContent,
      replyType: parsed.data.replyType ?? 'text',
      menuOptions: parsed.data.menuOptions ?? null,
    }).returning();

    return c.json({ success: true, data: rule });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

// GET /test — test a message against rules
app.get('/test', async (c) => {
  try {
    const { orgId } = c.get('user');
    const message = c.req.query('message');
    if (!message) return c.json({ success: false, error: 'message parameter required' }, 400);

    const rules = await db.select().from(autoReplyRules)
      .where(and(eq(autoReplyRules.orgId, orgId), eq(autoReplyRules.isActive, true)))
      .orderBy(desc(autoReplyRules.priority));

    for (const rule of rules) {
      const config = rule.triggerConfig as Record<string, unknown>;
      if (rule.triggerType === 'keyword') {
        const keywords = (config.keywords as string[]) || [];
        const matchMode = (config.matchMode as string) || 'contains';
        for (const kw of keywords) {
          if (matchMode === 'contains' && message.includes(kw)) return c.json({ success: true, data: { matched: true, rule } });
          if (matchMode === 'exact' && message === kw) return c.json({ success: true, data: { matched: true, rule } });
          if (matchMode === 'startsWith' && message.startsWith(kw)) return c.json({ success: true, data: { matched: true, rule } });
        }
      } else if (rule.triggerType === 'regex') {
        try {
          if (new RegExp(config.pattern as string, 'i').test(message)) return c.json({ success: true, data: { matched: true, rule } });
        } catch { /* invalid regex */ }
      } else if (rule.triggerType === 'first_message') {
        return c.json({ success: true, data: { matched: true, rule } });
      }
    }

    return c.json({ success: true, data: { matched: false, rule: null } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Test failed') }, 500);
  }
});

// GET /:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [rule] = await db.select().from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.orgId, orgId)))
      .limit(1);
    if (!rule) return c.json({ success: false, error: 'Rule not found' }, 404);
    return c.json({ success: true, data: rule });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Fetch failed') }, 500);
  }
});

// PUT /:id — update
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [updated] = await db.update(autoReplyRules)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.orgId, orgId)))
      .returning();

    if (!updated) return c.json({ success: false, error: 'Rule not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

// PUT /:id/toggle — activate/deactivate
app.put('/:id/toggle', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [existing] = await db.select({ isActive: autoReplyRules.isActive })
      .from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.orgId, orgId)))
      .limit(1);
    if (!existing) return c.json({ success: false, error: 'Rule not found' }, 404);

    const [updated] = await db.update(autoReplyRules)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.orgId, orgId)))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Toggle failed') }, 500);
  }
});

// DELETE /:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Rule not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
