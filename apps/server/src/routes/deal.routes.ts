import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { deals, customers, users } from '../db/schema';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { logAudit } from '../services/audit.service';
import { triggerWorkflows } from '../services/workflow.service';
import { getClientIp, parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';

const app = new Hono();

const createDealSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1),
  amount: z.string().or(z.number()).transform(String),
  currency: z.string().default('CNY'),
  stage: z.string().default('initial'),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  ownerId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const updateDealSchema = createDealSchema.partial();

app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const stage = c.req.query('stage');
    const customerId = c.req.query('customerId');
    const search = c.req.query('search');
    const ownerId = c.req.query('ownerId');
    const sortBy = c.req.query('sortBy');
    const sortOrder = c.req.query('sortOrder');
    const { page, pageSize, offset } = parsePagination(c);

    const conditions = [eq(deals.orgId, orgId)];
    if (stage) conditions.push(eq(deals.stage, stage));
    if (customerId) conditions.push(eq(deals.customerId, customerId));
    if (search) conditions.push(ilike(deals.title, `%${escapeLike(search)}%`));
    if (ownerId) conditions.push(eq(deals.ownerId, ownerId));

    const sortColumn = { title: deals.title, amount: deals.amount, createdAt: deals.createdAt, expectedCloseDate: deals.expectedCloseDate }[sortBy as string] ?? deals.updatedAt;
    const order = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(and(...conditions));

    const list = await db
      .select()
      .from(deals)
      .where(and(...conditions))
      .orderBy(order)
      .limit(pageSize)
      .offset(offset);

    return c.json({ success: true, data: list, total: count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

app.post('/', async (c) => {
  try {
    const user = c.get('user');
    const orgId = user.orgId;
    const body = await c.req.json();
    const parsed = createDealSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    if (parsed.data.customerId) {
      const [cust] = await db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, parsed.data.customerId), eq(customers.orgId, orgId))).limit(1);
      if (!cust) return c.json({ success: false, error: 'Customer not found in your organization' }, 400);
    }
    if (parsed.data.ownerId) {
      const [owner] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, parsed.data.ownerId), eq(users.orgId, orgId))).limit(1);
      if (!owner) return c.json({ success: false, error: 'Owner not found in your organization' }, 400);
    }

    const data = { ...parsed.data } as Record<string, unknown>;
    if (data.expectedCloseDate) data.expectedCloseDate = new Date(data.expectedCloseDate as string);
    const [deal] = await db.insert(deals).values({ ...data, orgId } as typeof deals.$inferInsert).returning();
    if (!deal) return c.json({ success: false, error: 'Create failed' }, 500);

    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'create', resourceType: 'deal', resourceId: deal.id, ipAddress: clientIp, details: { title: deal.title, amount: deal.amount } }).catch(() => {});
    dispatchWebhookEvent(orgId, 'deal.created', { deal }).catch(() => {});

    return c.json({ success: true, data: deal });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

app.get('/pipeline/summary', async (c) => {
  try {
    const { orgId } = c.get('user');
    const pipeline = await db
      .select({
        stage: deals.stage,
        count: sql<number>`count(*)::int`,
        totalAmount: sql<string>`sum(${deals.amount})`,
      })
      .from(deals)
      .where(eq(deals.orgId, orgId))
      .groupBy(deals.stage);
    return c.json({ success: true, data: pipeline });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Pipeline failed') }, 500);
  }
});

// GET /deals/export/csv
app.get('/export/csv', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db
      .select()
      .from(deals)
      .where(eq(deals.orgId, orgId))
      .orderBy(desc(deals.createdAt))
      .limit(10000);
    const header =
      'customerId,title,amount,currency,stage,probability,expectedCloseDate,actualCloseDate,notes,createdAt\n';
    const rows = list
      .map((r) =>
        [
          r.customerId ?? '',
          r.title ?? '',
          r.amount ?? '',
          r.currency ?? '',
          r.stage ?? '',
          r.probability ?? '',
          r.expectedCloseDate?.toISOString() ?? '',
          r.actualCloseDate?.toISOString() ?? '',
          r.notes ?? '',
          r.createdAt?.toISOString() ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header(
      'Content-Disposition',
      `attachment; filename="deals-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return c.body(header + rows);
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Export failed') },
      500
    );
  }
});

app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [row] = await db
      .select()
      .from(deals)
      .leftJoin(customers, eq(deals.customerId, customers.id))
      .leftJoin(users, eq(deals.ownerId, users.id))
      .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
      .limit(1);
    if (!row) return c.json({ success: false, error: 'Deal not found' }, 404);
    const deal = {
      ...row.deals,
      customerName: row.customers?.name ?? null,
      ownerName: row.users?.name ?? null,
    };
    return c.json({ success: true, data: deal });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Get failed') }, 500);
  }
});

app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateDealSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const previousStage = parsed.data.stage
      ? (await db.select({ stage: deals.stage }).from(deals).where(and(eq(deals.id, id), eq(deals.orgId, orgId))).limit(1))[0]?.stage
      : undefined;

    const data = { ...parsed.data } as Record<string, unknown>;
    if (data.expectedCloseDate) data.expectedCloseDate = new Date(data.expectedCloseDate as string);
    data.updatedAt = new Date();
    const [updated] = await db
      .update(deals)
      .set(data)
      .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Deal not found' }, 404);

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'deal', resourceId: id, ipAddress: clientIp, details: { fields: Object.keys(parsed.data) } }).catch(() => {});

    if (previousStage !== undefined && previousStage !== updated.stage) {
      dispatchWebhookEvent(orgId, 'deal.stage_changed', {
        deal: updated,
        previousStage,
        newStage: updated.stage,
      }).catch(() => {});
      triggerWorkflows(orgId, 'deal_stage_changed', { id: updated.id, stage: updated.stage, previousStage }).catch(() => {});
    }

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

app.delete('/:id', async (c) => {
  try {
    const { orgId, role } = c.get('user');
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return c.json({ success: false, error: 'Permission denied' }, 403);
    }
    const id = c.req.param('id');
    const [deleted] = await db.delete(deals).where(and(eq(deals.id, id), eq(deals.orgId, orgId))).returning();
    if (!deleted) return c.json({ success: false, error: 'Deal not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'delete', resourceType: 'deal', resourceId: id, ipAddress: clientIp, details: { title: deleted.title } }).catch(() => {});
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
