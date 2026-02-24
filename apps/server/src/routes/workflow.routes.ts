import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { workflows, workflowRuns } from '../db/schema';
import { logAudit } from '../services/audit.service';
import { getClientIp, parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';
import { requireFeature } from '../middleware/plan-guard';

const app = new Hono();

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  definition: z.record(z.unknown()),
  triggerType: z.string().min(1),
  triggerConfig: z.record(z.unknown()).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  definition: z.record(z.unknown()).optional(),
  triggerType: z.string().min(1).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
});

// GET /workflows
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const search = c.req.query('search');
    const triggerType = c.req.query('triggerType');
    const isActive = c.req.query('isActive');
    const { page, pageSize } = parsePagination(c);

    const conditions = [eq(workflows.orgId, orgId)];
    if (search) conditions.push(ilike(workflows.name, `%${escapeLike(search)}%`));
    if (triggerType) conditions.push(eq(workflows.triggerType, triggerType));
    if (isActive !== undefined && isActive !== '') conditions.push(eq(workflows.isActive, isActive === 'true'));

    const where = and(...conditions);
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflows)
      .where(where);
    const list = await db
      .select()
      .from(workflows)
      .where(where)
      .orderBy(desc(workflows.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List failed') },
      500
    );
  }
});

// POST /workflows
app.post('/', requireFeature('workflows'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [workflow] = await db
      .insert(workflows)
      .values({ ...parsed.data, orgId })
      .returning();
    if (!workflow) return c.json({ success: false, error: 'Create failed' }, 500);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'create', resourceType: 'workflow', resourceId: workflow.id, ipAddress: clientIp, details: { name: workflow.name, triggerType: workflow.triggerType } }).catch(() => {});
    return c.json({ success: true, data: workflow });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create failed') },
      500
    );
  }
});

// GET /workflows/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId)))
      .limit(1);
    if (!workflow) return c.json({ success: false, error: 'Workflow not found' }, 404);
    return c.json({ success: true, data: workflow });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Get failed') },
      500
    );
  }
});

// PUT /workflows/:id
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [updated] = await db
      .update(workflows)
      .set(parsed.data)
      .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Workflow not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'workflow', resourceId: id, ipAddress: clientIp, details: { fields: Object.keys(parsed.data) } }).catch(() => {});
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Update failed') },
      500
    );
  }
});

// PUT /workflows/:id/toggle
app.put('/:id/toggle', requireFeature('workflows'), async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const enable = z.object({ enable: z.boolean().optional() }).parse(body).enable;

    const [current] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId)))
      .limit(1);
    if (!current) return c.json({ success: false, error: 'Workflow not found' }, 404);

    const isActive = enable ?? !current.isActive;
    const [updated] = await db
      .update(workflows)
      .set({ isActive })
      .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Workflow not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'workflow', resourceId: id, ipAddress: clientIp, details: { toggled: true, isActive } }).catch(() => {});
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Toggle failed') },
      500
    );
  }
});

// GET /workflows/:id/runs
app.get('/:id/runs', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const { page, pageSize } = parsePagination(c);

    const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` }).from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, id), eq(workflowRuns.orgId, orgId)));

    const runs = await db.select().from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, id), eq(workflowRuns.orgId, orgId)))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(pageSize).offset((page - 1) * pageSize);

    return c.json({ success: true, data: runs, total, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// POST /workflows/:id/execute
app.post('/:id/execute', requireFeature('workflows'), async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const [wf] = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.orgId, orgId))).limit(1);
    if (!wf) return c.json({ success: false, error: 'Not found' }, 404);

    const { triggerWorkflows } = await import('../services/workflow.service');
    triggerWorkflows(orgId, wf.triggerType, { workflowId: wf.id, manual: true }).catch(() => {});

    return c.json({ success: true, message: 'Workflow execution started' });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// DELETE /workflows/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const [deleted] = await db.delete(workflows).where(and(eq(workflows.id, id), eq(workflows.orgId, orgId))).returning();
    if (!deleted) return c.json({ success: false, error: 'Workflow not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'delete', resourceType: 'workflow', resourceId: id, ipAddress: clientIp, details: { name: deleted.name } }).catch(() => {});
    return c.json({ success: true, data: deleted });
  } catch (e) { return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500); }
});

export default app;
