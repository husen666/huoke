import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql, gte, lte, inArray, ilike } from 'drizzle-orm';
import { db } from '../db/connection';
import { customerSegments, customers, customerTags } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';

const app = new Hono();

const segmentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  filters: z.record(z.unknown()),
  color: z.string().max(20).optional(),
});

interface SegmentFilters {
  stage?: string;
  tags?: string[];
  industry?: string;
  scoreMin?: number;
  scoreMax?: number;
  ownerIds?: string[];
  dateRange?: { start?: string; end?: string };
  search?: string;
}

function buildCustomerConditions(orgId: string, filters: SegmentFilters) {
  const conditions = [eq(customers.orgId, orgId)];

  if (filters.stage) {
    conditions.push(eq(customers.stage, filters.stage));
  }
  if (filters.industry) {
    conditions.push(ilike(customers.companyIndustry, `%${filters.industry}%`));
  }
  if (filters.scoreMin !== undefined) {
    conditions.push(gte(customers.score, filters.scoreMin));
  }
  if (filters.scoreMax !== undefined) {
    conditions.push(lte(customers.score, filters.scoreMax));
  }
  if (filters.ownerIds && filters.ownerIds.length > 0) {
    conditions.push(inArray(customers.ownerId, filters.ownerIds));
  }
  if (filters.dateRange?.start) {
    conditions.push(gte(customers.createdAt, new Date(filters.dateRange.start)));
  }
  if (filters.dateRange?.end) {
    conditions.push(lte(customers.createdAt, new Date(filters.dateRange.end)));
  }
  if (filters.search) {
    conditions.push(ilike(customers.name, `%${filters.search}%`));
  }

  return conditions;
}

async function countMatchingCustomers(orgId: string, filters: SegmentFilters): Promise<number> {
  const conditions = buildCustomerConditions(orgId, filters);

  if (filters.tags && filters.tags.length > 0) {
    const rows = await db
      .selectDistinct({ id: customers.id })
      .from(customers)
      .innerJoin(customerTags, eq(customerTags.customerId, customers.id))
      .where(and(...conditions, inArray(customerTags.tagId, filters.tags)));
    return rows.length;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(and(...conditions));
  return count;
}

// GET / — list segments
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db.select().from(customerSegments)
      .where(eq(customerSegments.orgId, orgId))
      .orderBy(desc(customerSegments.createdAt));
    return c.json({ success: true, data: list });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

// POST / — create segment
app.post('/', async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const body = await c.req.json();
    const parsed = segmentSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const filters = parsed.data.filters as SegmentFilters;
    const count = await countMatchingCustomers(orgId, filters);

    const [segment] = await db.insert(customerSegments).values({
      orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      filters: parsed.data.filters,
      color: parsed.data.color ?? null,
      customerCount: count,
      createdBy: sub,
    }).returning();

    return c.json({ success: true, data: segment });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

// PUT /:id — update segment
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = segmentSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };

    if (parsed.data.filters) {
      const count = await countMatchingCustomers(orgId, parsed.data.filters as SegmentFilters);
      updateData.customerCount = count;
    }

    const [updated] = await db.update(customerSegments)
      .set(updateData)
      .where(and(eq(customerSegments.id, id), eq(customerSegments.orgId, orgId)))
      .returning();

    if (!updated) return c.json({ success: false, error: 'Segment not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

// DELETE /:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(customerSegments)
      .where(and(eq(customerSegments.id, id), eq(customerSegments.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Segment not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

// GET /:id/customers — get customers matching this segment
app.get('/:id/customers', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const { page, pageSize, offset } = parsePagination(c);

    const [segment] = await db.select().from(customerSegments)
      .where(and(eq(customerSegments.id, id), eq(customerSegments.orgId, orgId)))
      .limit(1);
    if (!segment) return c.json({ success: false, error: 'Segment not found' }, 404);

    const filters = segment.filters as SegmentFilters;
    const conditions = buildCustomerConditions(orgId, filters);

    if (filters.tags && filters.tags.length > 0) {
      const matchingIds = await db
        .selectDistinct({ id: customers.id })
        .from(customers)
        .innerJoin(customerTags, eq(customerTags.customerId, customers.id))
        .where(and(...conditions, inArray(customerTags.tagId, filters.tags)));

      const ids = matchingIds.map((r) => r.id);
      const total = ids.length;

      if (ids.length === 0) {
        return c.json({ success: true, data: [], total: 0, page, pageSize });
      }

      const list = await db.select().from(customers)
        .where(inArray(customers.id, ids))
        .orderBy(desc(customers.updatedAt))
        .limit(pageSize)
        .offset(offset);

      return c.json({ success: true, data: list, total, page, pageSize });
    }

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(...conditions));

    const list = await db.select().from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.updatedAt))
      .limit(pageSize)
      .offset(offset);

    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Fetch customers failed') }, 500);
  }
});

// POST /:id/refresh-count — recount matching customers
app.post('/:id/refresh-count', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [segment] = await db.select().from(customerSegments)
      .where(and(eq(customerSegments.id, id), eq(customerSegments.orgId, orgId)))
      .limit(1);
    if (!segment) return c.json({ success: false, error: 'Segment not found' }, 404);

    const count = await countMatchingCustomers(orgId, segment.filters as SegmentFilters);

    const [updated] = await db.update(customerSegments)
      .set({ customerCount: count, updatedAt: new Date() })
      .where(eq(customerSegments.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Refresh failed') }, 500);
  }
});

export default app;
