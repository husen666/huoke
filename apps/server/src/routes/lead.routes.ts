import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, sql, desc, asc, or, ilike, inArray } from 'drizzle-orm';
import { db } from '../db/connection';
import { leads, customers, users } from '../db/schema';
import { createNotification } from '../services/notification.service';
import { logAudit, logAuditBatch } from '../services/audit.service';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { triggerWorkflows } from '../services/workflow.service';
import { getClientIp, parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';
import { requireLeadLimit } from '../middleware/plan-guard';

const app = new Hono();

const createLeadSchema = z.object({
  channelId: z.string().uuid().optional(),
  sourcePlatform: z.string().min(1),
  sourceDetail: z.string().optional(),
  campaignId: z.string().uuid().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactWechat: z.string().optional(),
  contactEmail: z.string().optional(),
  contactDingtalk: z.string().optional(),
  companyName: z.string().optional(),
  companyIndustry: z.string().optional(),
  companySize: z.string().optional(),
  regionProvince: z.string().optional(),
  regionCity: z.string().optional(),
  regionDistrict: z.string().optional(),
  rawData: z.record(z.unknown()).optional(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.string().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

// GET /leads - list with pagination and filters
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize, offset } = parsePagination(c);
    const status = c.req.query('status');
    const source = c.req.query('sourcePlatform');
    const scoreMin = c.req.query('scoreMin');
    const scoreMax = c.req.query('scoreMax');
    const assignedTo = c.req.query('assignedTo');
    const search = c.req.query('search');

    const conditions = [eq(leads.orgId, orgId)];
    if (status) conditions.push(eq(leads.status, status));
    if (source) conditions.push(eq(leads.sourcePlatform, source));
    if (assignedTo) conditions.push(eq(leads.assignedTo, assignedTo));
    if (scoreMin && scoreMin.trim() !== '') {
      const v = parseInt(scoreMin, 10);
      if (!isNaN(v)) conditions.push(sql`${leads.score} >= ${v}`);
    }
    if (scoreMax && scoreMax.trim() !== '') {
      const v = parseInt(scoreMax, 10);
      if (!isNaN(v)) conditions.push(sql`${leads.score} <= ${v}`);
    }
    if (search) {
      conditions.push(
        or(
          ilike(leads.contactName, `%${escapeLike(search)}%`),
          ilike(leads.contactPhone, `%${escapeLike(search)}%`),
          ilike(leads.companyName, `%${escapeLike(search)}%`)
        )!
      );
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...conditions));

    const sortBy = c.req.query('sortBy') ?? 'createdAt';
    const sortOrder = c.req.query('sortOrder') === 'asc' ? 'asc' : 'desc';
    const sortCol = sortBy === 'score' ? leads.score
      : sortBy === 'updatedAt' ? leads.updatedAt
      : sortBy === 'contactName' ? leads.contactName
      : leads.createdAt;
    const orderFn = sortOrder === 'asc' ? asc(sortCol) : desc(sortCol);

    const list = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(orderFn)
      .limit(pageSize)
      .offset(offset);

    const total = countResult?.count ?? 0;

    return c.json({
      success: true,
      data: list,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List leads failed') },
      500
    );
  }
});

// GET /leads/stats
app.get('/stats', async (c) => {
  try {
    const { orgId } = c.get('user');
    const [byStatus, bySource] = await Promise.all([
      db.select({ status: leads.status, count: sql<number>`count(*)::int` })
        .from(leads).where(eq(leads.orgId, orgId)).groupBy(leads.status),
      db.select({ sourcePlatform: leads.sourcePlatform, count: sql<number>`count(*)::int` })
        .from(leads).where(eq(leads.orgId, orgId)).groupBy(leads.sourcePlatform),
    ]);
    return c.json({
      success: true,
      data: { byStatus, bySource },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Stats failed') },
      500
    );
  }
});

// GET /leads/export/csv
app.get('/export/csv', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(desc(leads.createdAt)).limit(10000);
    const header = 'contactName,contactPhone,contactEmail,contactWechat,companyName,companyIndustry,sourcePlatform,status,score,createdAt\n';
    const rows = list.map((l) =>
      [l.contactName ?? '', l.contactPhone ?? '', l.contactEmail ?? '', l.contactWechat ?? '', l.companyName ?? '', l.companyIndustry ?? '', l.sourcePlatform, l.status, l.score, l.createdAt?.toISOString() ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(header + rows);
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Export failed') }, 500);
  }
});

// POST /leads/import/csv
app.post('/import/csv', requireLeadLimit(), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || typeof file === 'string') return c.json({ success: false, error: 'No file provided' }, 400);
    const text = await (file as File).text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return c.json({ success: false, error: 'CSV must have header and at least one row' }, 400);

    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map((h) => h.replace(/"/g, '').trim());
    const fieldMap: Record<string, string> = {
      contactname: 'contactName', contactphone: 'contactPhone', contactemail: 'contactEmail',
      contactwechat: 'contactWechat', companyname: 'companyName', companyindustry: 'companyIndustry',
      sourceplatform: 'sourcePlatform', status: 'status',
    };

    const allRows: (typeof leads.$inferInsert)[] = [];
    const allowedStatuses = ['new', 'contacted', 'qualified', 'converted', 'disqualified'];
    const allowedPlatforms = ['wecom', 'douyin', 'xiaohongshu', 'baidu', 'kuaishou', 'bilibili', 'zhihu', 'weibo', 'manual'];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].match(/("([^"]*("")?)*"|[^,]*)/g)?.map((v) => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? [];
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const field = fieldMap[h.replace(/[_\s]/g, '').toLowerCase()];
        if (field && vals[idx]) row[field] = vals[idx];
      });
      if (!row.sourcePlatform) row.sourcePlatform = 'manual';
      if (row.status && !allowedStatuses.includes(row.status)) row.status = 'new';
      if (!row.status) row.status = 'new';
      if (!allowedPlatforms.includes(row.sourcePlatform)) row.sourcePlatform = 'manual';
      allRows.push({ ...row, orgId } as typeof leads.$inferInsert);
    }
    if (allRows.length > 10000) {
      return c.json({ success: false, error: '单次导入不能超过 10000 条' }, 400);
    }
    if (allRows.length > 0) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < allRows.length; i += 100) {
          await tx.insert(leads).values(allRows.slice(i, i + 100));
        }
      });
    }
    const imported = allRows.length;
    return c.json({ success: true, data: { imported } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Import failed') }, 500);
  }
});

// GET /leads/check-duplicate
app.get('/check-duplicate', async (c) => {
  try {
    const { orgId } = c.get('user');
    const phone = c.req.query('phone');
    const email = c.req.query('email');
    if (!phone && !email) return c.json({ success: true, data: { duplicates: [] } });

    const conditions = [eq(leads.orgId, orgId)];
    const orConds = [];
    if (phone) orConds.push(eq(leads.contactPhone, phone));
    if (email) orConds.push(eq(leads.contactEmail, email));
    if (orConds.length > 0) conditions.push(or(...orConds)!);

    const duplicates = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .limit(5);

    return c.json({ success: true, data: { duplicates } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Check duplicate failed') }, 500);
  }
});

// PUT /leads/batch
app.put('/batch', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({
      ids: z.array(z.string().uuid()).min(1),
      status: z.string().optional(),
      assignedTo: z.string().uuid().optional().nullable(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const { ids, ...updateData } = parsed.data;
    const setData: Record<string, unknown> = {};
    if (updateData.status !== undefined) setData.status = updateData.status;
    if (updateData.assignedTo !== undefined) {
      setData.assignedTo = updateData.assignedTo;
      setData.assignedAt = new Date();
    }
    if (Object.keys(setData).length === 0) return c.json({ success: false, error: 'No update fields provided' }, 400);

    const updated = await db
      .update(leads)
      .set(setData)
      .where(and(inArray(leads.id, ids), eq(leads.orgId, orgId)))
      .returning();

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAuditBatch(updated.map(item => ({ orgId, userId: user.sub, action: 'update', resourceType: 'lead', resourceId: item.id, ipAddress: clientIp, details: { batch: true, fields: Object.keys(setData) } }))).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Batch update failed') }, 500);
  }
});

// DELETE /leads/batch
app.delete('/batch', async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const deleted = await db
      .delete(leads)
      .where(and(inArray(leads.id, parsed.data.ids), eq(leads.orgId, orgId)))
      .returning();

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAuditBatch(deleted.map(item => ({ orgId, userId: user.sub, action: 'delete', resourceType: 'lead', resourceId: item.id, ipAddress: clientIp, details: { batch: true } }))).catch(() => {});

    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Batch delete failed') }, 500);
  }
});

// POST /leads - create
app.post('/', requireLeadLimit(), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [lead] = await db
      .insert(leads)
      .values({ ...parsed.data, orgId })
      .returning();
    if (!lead) return c.json({ success: false, error: 'Create failed' }, 500);

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'create', resourceType: 'lead', resourceId: lead.id, ipAddress: clientIp, details: { sourcePlatform: lead.sourcePlatform } }).catch(() => {});
    dispatchWebhookEvent(orgId, 'lead.created', { lead }).catch(() => {});
    triggerWorkflows(orgId, 'lead_created', { leadId: lead.id, name: lead.contactName, status: lead.status }).catch(() => {});

    if (lead.assignedTo) {
      createNotification({
        orgId, userId: lead.assignedTo, type: 'lead_assign',
        title: '新线索分配',
        content: `${lead.contactName ?? '未知'} - ${lead.companyName ?? '个人'}，评分 ${lead.score}`,
        resourceType: 'lead', resourceId: lead.id,
      }).catch(() => {});
    }

    if (process.env.DEEPSEEK_API_KEY) {
      (async () => {
        try {
          const { scoreLeadWithAI } = await import('../ai/deepseek');
          const result = await scoreLeadWithAI(lead);
          if (result) {
            await db
              .update(leads)
              .set({ score: result.score, scoreDetails: { aiAnalysis: result.analysis } })
              .where(eq(leads.id, lead.id));
          }
        } catch (err) { console.error('[ai-score]', err); }
      })();
    }

    return c.json({ success: true, data: lead });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create lead failed') },
      500
    );
  }
});

// GET /leads/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.orgId, orgId)))
      .limit(1);
    if (!lead) return c.json({ success: false, error: 'Lead not found' }, 404);
    return c.json({ success: true, data: lead });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Get lead failed') },
      500
    );
  }
});

// PUT /leads/:id
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [updated] = await db
      .update(leads)
      .set(parsed.data)
      .where(and(eq(leads.id, id), eq(leads.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Lead not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'lead', resourceId: id, ipAddress: clientIp, details: { fields: Object.keys(parsed.data) } }).catch(() => {});
    if (parsed.data.status) {
      triggerWorkflows(orgId, 'lead_status_changed', { id: updated.id, status: updated.status }).catch(() => {});
    }
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Update lead failed') },
      500
    );
  }
});

// POST /leads/:id/assign
app.post('/:id/assign', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ assignedTo: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '请选择要分配的成员' }, 400);

    const [member] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, parsed.data.assignedTo), eq(users.orgId, orgId))).limit(1);
    if (!member) return c.json({ success: false, error: 'Member not found in organization' }, 400);

    const [updated] = await db
      .update(leads)
      .set({ assignedTo: parsed.data.assignedTo, assignedAt: new Date() })
      .where(and(eq(leads.id, id), eq(leads.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Lead not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'assign', resourceType: 'lead', resourceId: id, ipAddress: clientIp, details: { assignedTo: parsed.data.assignedTo } }).catch(() => {});
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Assign failed') },
      500
    );
  }
});

// POST /leads/:id/convert
app.post('/:id/convert', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const result = await db.transaction(async (tx) => {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.orgId, orgId)))
        .limit(1);
      if (!lead) return { error: 'Lead not found', status: 404 } as const;
      if (lead.status === 'converted' || lead.customerId) {
        return { error: '该线索已经转化', status: 400 } as const;
      }

      const [newCustomer] = await tx
        .insert(customers)
        .values({
          orgId,
          type: 'individual',
          name: lead.contactName ?? 'Unknown',
          phone: lead.contactPhone,
          wechatId: lead.contactWechat,
          email: lead.contactEmail,
          dingtalkId: lead.contactDingtalk,
          companyName: lead.companyName,
          companyIndustry: lead.companyIndustry,
          companySize: lead.companySize,
          regionProvince: lead.regionProvince,
          regionCity: lead.regionCity,
        })
        .returning();

      if (!newCustomer) throw new Error('Create customer failed');

      await tx
        .update(leads)
        .set({
          status: 'converted',
          customerId: newCustomer.id,
          convertedAt: new Date(),
        })
        .where(eq(leads.id, id));

      return { customer: newCustomer, lead };
    });

    if ('error' in result) {
      return c.json({ success: false, error: result.error }, result.status);
    }

    const { customer } = result;
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'convert', resourceType: 'lead', resourceId: id, ipAddress: clientIp, details: { customerId: customer.id } }).catch(() => {});
    dispatchWebhookEvent(orgId, 'lead.converted', { leadId: id, customer }).catch(() => {});

    return c.json({ success: true, data: { leadId: id, customer } });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Convert failed') },
      500
    );
  }
});

// POST /leads/:id/rescore
app.post('/:id/rescore', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId))).limit(1);
    if (!lead) return c.json({ success: false, error: 'Lead not found' }, 404);
    if (!process.env.DEEPSEEK_API_KEY) return c.json({ success: false, error: 'AI not configured' }, 400);
    const { scoreLeadWithAI } = await import('../ai/deepseek');
    const result = await scoreLeadWithAI(lead);
    if (!result) return c.json({ success: false, error: 'AI scoring failed' }, 500);
    await db
      .update(leads)
      .set({ score: result.score, scoreDetails: { aiAnalysis: result.analysis } })
      .where(eq(leads.id, lead.id));
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'rescore', resourceType: 'lead', resourceId: id, ipAddress: clientIp, details: { newScore: result.score } }).catch(() => {});
    return c.json({ success: true, data: { score: result.score, analysis: result.analysis } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Rescore failed') }, 500);
  }
});

// DELETE /leads/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId))).returning();
    if (!deleted) return c.json({ success: false, error: 'Lead not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'delete', resourceType: 'lead', resourceId: id, ipAddress: clientIp }).catch(() => {});
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

export default app;
