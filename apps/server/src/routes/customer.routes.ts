import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, asc, or, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  customers,
  customerTags,
  tags,
  conversations,
  deals,
  users,
  tickets,
  leads,
} from '../db/schema';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { logAudit, logAuditBatch } from '../services/audit.service';
import { getClientIp, parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';

const app = new Hono();

const createCustomerSchema = z.object({
  type: z.enum(['individual', 'enterprise']).optional(),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  wechatId: z.string().optional(),
  dingtalkId: z.string().optional(),
  email: z.string().optional(),
  companyName: z.string().optional(),
  companyIndustry: z.string().optional(),
  companySize: z.string().optional(),
  gender: z.string().optional(),
  ageRange: z.string().optional(),
  regionProvince: z.string().optional(),
  regionCity: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  customFields: z.record(z.unknown()).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial().extend({
  stage: z.enum(['potential', 'active', 'inactive', 'churned']).optional(),
});

// GET /customers
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize, offset } = parsePagination(c);
    const stage = c.req.query('stage');
    const type = c.req.query('type');
    const ownerId = c.req.query('ownerId');
    const tagIds = c.req.query('tagIds'); // comma-separated
    const search = c.req.query('search');
    const sortBy = c.req.query('sortBy');
    const sortOrder = c.req.query('sortOrder');

    const conditions = [eq(customers.orgId, orgId)];
    if (stage) conditions.push(eq(customers.stage, stage));
    if (type) conditions.push(eq(customers.type, type));
    if (ownerId) conditions.push(eq(customers.ownerId, ownerId));
    if (search) {
      conditions.push(
        or(
          ilike(customers.name, `%${escapeLike(search)}%`),
          ilike(customers.phone, `%${escapeLike(search)}%`),
          ilike(customers.companyName, `%${escapeLike(search)}%`),
          ilike(customers.email, `%${escapeLike(search)}%`)
        )!
      );
    }

    const sortColumn = { name: customers.name, score: customers.score, createdAt: customers.createdAt, updatedAt: customers.updatedAt }[sortBy as string] ?? customers.updatedAt;
    const order = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    let customerIdFilter: Set<string> | null = null;
    if (tagIds) {
      const ids = tagIds.split(',').filter(Boolean);
      if (ids.length > 0) {
        const withTags = await db
          .select({ customerId: customerTags.customerId })
          .from(customerTags)
          .where(inArray(customerTags.tagId, ids))
          .groupBy(customerTags.customerId);
        customerIdFilter = new Set(withTags.map((r) => r.customerId));
        if (customerIdFilter.size > 0) {
          conditions.push(inArray(customers.id, [...customerIdFilter]));
        } else {
          return c.json({ success: true, data: [], total: 0, page, pageSize });
        }
      }
    }

    const [countRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(...conditions));
    const total = countRes?.count ?? 0;

    const list = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(order)
      .limit(pageSize)
      .offset(offset);

    return c.json({
      success: true,
      data: list,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List customers failed') },
      500
    );
  }
});

// GET /customers/duplicates
app.get('/duplicates', async (c) => {
  try {
    const { orgId } = c.get('user');
    const allCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        companyName: customers.companyName,
      })
      .from(customers)
      .where(eq(customers.orgId, orgId))
      .orderBy(customers.name);

    const groups: { key: string; reason: string; customers: typeof allCustomers }[] = [];
    const usedIds = new Set<string>();

    const phoneMap = new Map<string, typeof allCustomers>();
    const emailMap = new Map<string, typeof allCustomers>();
    const nameCompanyMap = new Map<string, typeof allCustomers>();

    for (const cust of allCustomers) {
      if (cust.phone) {
        const key = cust.phone.trim();
        if (!phoneMap.has(key)) phoneMap.set(key, []);
        phoneMap.get(key)!.push(cust);
      }
      if (cust.email) {
        const key = cust.email.trim().toLowerCase();
        if (!emailMap.has(key)) emailMap.set(key, []);
        emailMap.get(key)!.push(cust);
      }
      if (cust.name && cust.companyName) {
        const key = `${cust.name.trim().toLowerCase()}:${cust.companyName.trim().toLowerCase()}`;
        if (!nameCompanyMap.has(key)) nameCompanyMap.set(key, []);
        nameCompanyMap.get(key)!.push(cust);
      }
    }

    for (const [phone, custs] of phoneMap) {
      if (custs.length > 1) {
        const ids = custs.map(c => c.id).sort().join(',');
        if (!usedIds.has(ids)) {
          usedIds.add(ids);
          groups.push({ key: `phone:${phone}`, reason: `相同手机号: ${phone}`, customers: custs });
        }
      }
    }
    for (const [email, custs] of emailMap) {
      if (custs.length > 1) {
        const ids = custs.map(c => c.id).sort().join(',');
        if (!usedIds.has(ids)) {
          usedIds.add(ids);
          groups.push({ key: `email:${email}`, reason: `相同邮箱: ${email}`, customers: custs });
        }
      }
    }
    for (const [nc, custs] of nameCompanyMap) {
      if (custs.length > 1) {
        const ids = custs.map(c => c.id).sort().join(',');
        if (!usedIds.has(ids)) {
          usedIds.add(ids);
          groups.push({ key: `nameCompany:${nc}`, reason: `相同姓名+公司`, customers: custs });
        }
      }
    }

    return c.json({ success: true, data: groups });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Find duplicates failed') }, 500);
  }
});

// POST /customers/merge
app.post('/merge', async (c) => {
  try {
    const user = c.get('user');
    const orgId = user.orgId;
    const body = await c.req.json();
    const parsed = z.object({
      primaryId: z.string().uuid(),
      mergeIds: z.array(z.string().uuid()).min(1),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const { primaryId, mergeIds } = parsed.data;
    const allIds = [primaryId, ...mergeIds];

    const allCustomersList = await db
      .select()
      .from(customers)
      .where(and(inArray(customers.id, allIds), eq(customers.orgId, orgId)));

    if (allCustomersList.length !== allIds.length) {
      return c.json({ success: false, error: 'Some customer IDs not found in this organization' }, 400);
    }

    const primary = allCustomersList.find(cu => cu.id === primaryId)!;

    const result = await db.transaction(async (tx) => {
      await tx.update(conversations).set({ customerId: primaryId })
        .where(and(inArray(conversations.customerId, mergeIds), eq(conversations.orgId, orgId)));
      await tx.update(deals).set({ customerId: primaryId })
        .where(and(inArray(deals.customerId, mergeIds), eq(deals.orgId, orgId)));
      await tx.update(tickets).set({ customerId: primaryId })
        .where(and(inArray(tickets.customerId, mergeIds), eq(tickets.orgId, orgId)));

      const mergeTags = await tx.select({ tagId: customerTags.tagId }).from(customerTags)
        .where(inArray(customerTags.customerId, mergeIds));
      if (mergeTags.length > 0) {
        await tx.insert(customerTags).values(mergeTags.map(t => ({ customerId: primaryId, tagId: t.tagId })))
          .onConflictDoNothing({ target: [customerTags.customerId, customerTags.tagId] });
      }

      const mergedFields: Record<string, unknown> = {};
      for (const cust of allCustomersList) {
        if (cust.id !== primaryId && cust.customFields) Object.assign(mergedFields, cust.customFields as Record<string, unknown>);
      }
      if (primary.customFields) Object.assign(mergedFields, primary.customFields as Record<string, unknown>);
      if (Object.keys(mergedFields).length > 0) {
        await tx.update(customers).set({ customFields: mergedFields }).where(eq(customers.id, primaryId));
      }

      await tx.update(leads).set({ customerId: primaryId })
        .where(and(inArray(leads.customerId, mergeIds), eq(leads.orgId, orgId)));
      await tx.delete(customerTags).where(inArray(customerTags.customerId, mergeIds));
      await tx.delete(customers).where(inArray(customers.id, mergeIds));

      return { mergedCount: mergeIds.length };
    });

    const clientIp = getClientIp(c);
    logAudit({
      orgId, userId: user.sub, action: 'merge', resourceType: 'customer',
      resourceId: primaryId, ipAddress: clientIp,
      details: { mergedIds: mergeIds, mergedCount: result.mergedCount },
    }).catch(() => {});

    return c.json({ success: true, data: { primaryId, mergedCount: result.mergedCount } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Merge customers failed') }, 500);
  }
});

// GET /customers/export/csv
app.get('/export/csv', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db
      .select()
      .from(customers)
      .where(eq(customers.orgId, orgId))
      .orderBy(desc(customers.createdAt))
      .limit(10000);
    const header =
      'name,phone,wechatId,email,companyName,companyIndustry,type,stage,score,createdAt\n';
    const rows = list
      .map((r) =>
        [
          r.name ?? '',
          r.phone ?? '',
          r.wechatId ?? '',
          r.email ?? '',
          r.companyName ?? '',
          r.companyIndustry ?? '',
          r.type ?? '',
          r.stage ?? '',
          r.score ?? '',
          r.createdAt?.toISOString() ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header(
      'Content-Disposition',
      `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return c.body(header + rows);
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Export failed') },
      500
    );
  }
});

// PUT /customers/batch
app.put('/batch', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({
      ids: z.array(z.string().uuid()).min(1),
      stage: z.string().optional(),
      ownerId: z.string().uuid().optional().nullable(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const { ids, ...updateData } = parsed.data;
    const setData: Record<string, unknown> = {};
    if (updateData.stage !== undefined) setData.stage = updateData.stage;
    if (updateData.ownerId !== undefined) setData.ownerId = updateData.ownerId;
    if (Object.keys(setData).length === 0) return c.json({ success: false, error: 'No update fields provided' }, 400);

    const updated = await db
      .update(customers)
      .set(setData)
      .where(and(inArray(customers.id, ids), eq(customers.orgId, orgId)))
      .returning();

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAuditBatch(updated.map(item => ({ orgId, userId: user.sub, action: 'update', resourceType: 'customer', resourceId: item.id, ipAddress: clientIp, details: { batch: true, fields: Object.keys(setData) } }))).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Batch update failed') }, 500);
  }
});

// DELETE /customers/batch
app.delete('/batch', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const deleted = await db.transaction(async (tx) => {
      await tx
        .delete(customerTags)
        .where(inArray(customerTags.customerId, parsed.data.ids));

      const removed = await tx
        .delete(customers)
        .where(and(inArray(customers.id, parsed.data.ids), eq(customers.orgId, orgId)))
        .returning();

      return removed;
    });

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAuditBatch(deleted.map(item => ({ orgId, userId: user.sub, action: 'delete', resourceType: 'customer', resourceId: item.id, ipAddress: clientIp, details: { batch: true } }))).catch(() => {});

    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Batch delete failed') }, 500);
  }
});

// POST /customers
app.post('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    if (parsed.data.ownerId) {
      const [owner] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, parsed.data.ownerId), eq(users.orgId, orgId))).limit(1);
      if (!owner) return c.json({ success: false, error: 'Owner not found in organization' }, 400);
    }
    const [customer] = await db
      .insert(customers)
      .values({ ...parsed.data, orgId })
      .returning();
    if (!customer) return c.json({ success: false, error: 'Create failed' }, 500);

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'create', resourceType: 'customer', resourceId: customer.id, ipAddress: clientIp, details: { name: customer.name } }).catch(() => {});
    dispatchWebhookEvent(orgId, 'customer.created', { customer }).catch(() => {});

    return c.json({ success: true, data: customer });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create customer failed') },
      500
    );
  }
});

// GET /customers/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.orgId, orgId)))
      .limit(1);
    if (!customer) return c.json({ success: false, error: 'Customer not found' }, 404);

    const customerTagRows = await db
      .select({ tag: tags })
      .from(customerTags)
      .innerJoin(tags, eq(tags.id, customerTags.tagId))
      .where(eq(customerTags.customerId, id));
    const customerTagsList = customerTagRows.map((r) => r.tag);

    return c.json({
      success: true,
      data: { ...customer, tags: customerTagsList },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Get customer failed') },
      500
    );
  }
});

// PUT /customers/:id
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [updated] = await db
      .update(customers)
      .set(parsed.data)
      .where(and(eq(customers.id, id), eq(customers.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Customer not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'customer', resourceId: id, ipAddress: clientIp, details: { fields: Object.keys(parsed.data) } }).catch(() => {});
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Update customer failed') },
      500
    );
  }
});

// GET /customers/:id/timeline
app.get('/:id/timeline', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.orgId, orgId)))
      .limit(1);
    if (!customer) return c.json({ success: false, error: 'Customer not found' }, 404);

    const [convList, dealList] = await Promise.all([
      db.select().from(conversations)
        .where(and(eq(conversations.customerId, id), eq(conversations.orgId, orgId)))
        .orderBy(desc(conversations.updatedAt))
        .limit(20),
      db.select().from(deals)
        .where(and(eq(deals.customerId, id), eq(deals.orgId, orgId)))
        .orderBy(desc(deals.updatedAt))
        .limit(20),
    ]);

    const timeline = [
      ...convList.map((x) => ({ type: 'conversation' as const, ...x })),
      ...dealList.map((x) => ({ type: 'deal' as const, ...x })),
    ].sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime()
    );

    return c.json({ success: true, data: timeline.slice(0, 50) });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Timeline failed') },
      500
    );
  }
});

// DELETE /customers/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.transaction(async (tx) => {
      await tx.delete(customerTags).where(eq(customerTags.customerId, id));
      return tx.delete(customers).where(and(eq(customers.id, id), eq(customers.orgId, orgId))).returning();
    });
    if (!deleted) return c.json({ success: false, error: 'Customer not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'delete', resourceType: 'customer', resourceId: id, ipAddress: clientIp }).catch(() => {});
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

// POST /customers/:id/tags
app.post('/:id/tags', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const { addTagIds, removeTagIds } = z
      .object({
        addTagIds: z.array(z.string().uuid()).optional(),
        removeTagIds: z.array(z.string().uuid()).optional(),
      })
      .parse(body);

    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.orgId, orgId)))
      .limit(1);
    if (!customer) return c.json({ success: false, error: 'Customer not found' }, 404);

    if (addTagIds?.length) {
      const validTags = await db.select({ id: tags.id }).from(tags)
        .where(and(inArray(tags.id, addTagIds), eq(tags.orgId, orgId)));
      const validTagIds = new Set(validTags.map(t => t.id));
      const tagEntries = addTagIds
        .filter(tagId => validTagIds.has(tagId))
        .map(tagId => ({ customerId: id, tagId }));
      if (tagEntries.length > 0) {
        await db.insert(customerTags).values(tagEntries)
          .onConflictDoNothing({ target: [customerTags.customerId, customerTags.tagId] });
      }
    }
    if (removeTagIds?.length) {
      await db
        .delete(customerTags)
        .where(
          and(
            eq(customerTags.customerId, id),
            inArray(customerTags.tagId, removeTagIds)
          )
        );
    }

    const customerTagRows = await db
      .select({ tag: tags })
      .from(customerTags)
      .innerJoin(tags, eq(tags.id, customerTags.tagId))
      .where(eq(customerTags.customerId, id));

    return c.json({
      success: true,
      data: customerTagRows.map((r) => r.tag),
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Update tags failed') },
      500
    );
  }
});

export default app;
