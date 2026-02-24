import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, asc, sql, ilike, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/connection';
import { tickets, ticketComments, users, customers, knowledgeBases, documents } from '../db/schema';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { logAudit } from '../services/audit.service';
import { triggerWorkflows } from '../services/workflow.service';
import { getClientIp, parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';

const app = new Hono();

const PRIORITY_WEIGHT: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const PRIORITY_LEVELS = ['low', 'medium', 'high', 'urgent'] as const;
const SLA_RULES: Record<string, { firstResponseMin: number; resolveHour: number }> = {
  low: { firstResponseMin: 120, resolveHour: 72 },
  medium: { firstResponseMin: 60, resolveHour: 48 },
  high: { firstResponseMin: 30, resolveHour: 24 },
  urgent: { firstResponseMin: 10, resolveHour: 8 },
};
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['processing', 'waiting_user', 'resolved', 'closed'],
  processing: ['waiting_user', 'resolved', 'closed'],
  waiting_user: ['processing', 'resolved', 'closed'],
  resolved: ['processing', 'closed'],
  closed: ['processing'],
  // compatibility with existing values
  in_progress: ['waiting_user', 'resolved', 'closed'],
  pending: ['processing', 'resolved', 'closed'],
};

function normalizeTicketStatus(status: string) {
  if (status === 'in_progress') return 'processing';
  if (status === 'pending') return 'waiting_user';
  return status;
}

function buildSla(priorityRaw: string, now = new Date()) {
  const priority = PRIORITY_LEVELS.includes(priorityRaw as typeof PRIORITY_LEVELS[number]) ? priorityRaw : 'medium';
  const rule = SLA_RULES[priority];
  return {
    slaFirstResponseDueAt: new Date(now.getTime() + rule.firstResponseMin * 60 * 1000),
    slaResolveDueAt: new Date(now.getTime() + rule.resolveHour * 60 * 60 * 1000),
  };
}

const createTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().default('general'),
  priority: z.string().default('medium'),
  assigneeId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

const updateTicketSchema = createTicketSchema.partial().extend({
  status: z.string().optional(),
});
const transitionSchema = z.object({ toStatus: z.enum(['open', 'processing', 'waiting_user', 'resolved', 'closed']) });
const escalateSchema = z.object({ reason: z.string().max(500).optional() });
const reviewActionSchema = z.object({
  action: z.enum(['create_improvement_note', 'create_kb_draft']),
  kbId: z.string().uuid().optional(),
});

const createCommentSchema = z.object({
  content: z.string().min(1),
  isInternal: z.boolean().default(false),
  attachments: z.array(z.unknown()).optional(),
});

// GET /tickets
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize } = parsePagination(c);
    const status = c.req.query('status');
    const priority = c.req.query('priority');
    const assigneeId = c.req.query('assigneeId');
    const customerId = c.req.query('customerId');
    const overdue = c.req.query('overdue');
    const search = c.req.query('search');
    const sortBy = c.req.query('sortBy');
    const sortOrder = c.req.query('sortOrder');

    const conditions = [eq(tickets.orgId, orgId)];
    if (status) conditions.push(eq(tickets.status, status));
    if (priority) conditions.push(eq(tickets.priority, priority));
    if (assigneeId) conditions.push(eq(tickets.assigneeId, assigneeId));
    if (customerId) conditions.push(eq(tickets.customerId, customerId));
    if (search) conditions.push(ilike(tickets.title, `%${escapeLike(search)}%`));
    if (overdue === '1' || overdue === 'true') {
      conditions.push(
        and(
          lt(tickets.slaResolveDueAt, new Date()),
          or(
            eq(tickets.status, 'open'),
            eq(tickets.status, 'processing'),
            eq(tickets.status, 'waiting_user'),
            eq(tickets.status, 'in_progress'),
            eq(tickets.status, 'pending')
          )!
        )!
      );
    }

    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(where);

    const sortColumn = {
      title: tickets.title,
      priority: tickets.priority,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      slaResolveDueAt: tickets.slaResolveDueAt,
    }[sortBy as string] ?? tickets.updatedAt;
    const order = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const assignees = alias(users, 'assignees');
    const creators = alias(users, 'creators');

    const rows = await db
      .select({
        ticket: tickets,
        assigneeName: assignees.name,
        creatorName: creators.name,
        customerName: customers.name,
      })
      .from(tickets)
      .leftJoin(assignees, eq(tickets.assigneeId, assignees.id))
      .leftJoin(creators, eq(tickets.creatorId, creators.id))
      .leftJoin(customers, eq(tickets.customerId, customers.id))
      .where(where)
      .orderBy(order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const list = rows.map((r) => ({
      ...r.ticket,
      status: normalizeTicketStatus(r.ticket.status),
      overdue: !!(r.ticket.slaResolveDueAt && new Date(r.ticket.slaResolveDueAt).getTime() < Date.now() && !['resolved', 'closed'].includes(normalizeTicketStatus(r.ticket.status))),
      assigneeName: r.assigneeName ?? null,
      creatorName: r.creatorName ?? null,
      customerName: r.customerName ?? null,
    }));

    return c.json({ success: true, data: list, total: count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

// POST /tickets
app.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = createTicketSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const data = { ...parsed.data } as Record<string, unknown>;
    if (data.dueDate) data.dueDate = new Date(data.dueDate as string);
    data.status = normalizeTicketStatus(String(data.status || 'open'));
    const { slaFirstResponseDueAt, slaResolveDueAt } = buildSla(String(data.priority || 'medium'));
    data.slaFirstResponseDueAt = slaFirstResponseDueAt;
    data.slaResolveDueAt = slaResolveDueAt;
    data.escalationLevel = 0;
    data.source = String(data.type || 'manual');

    const [ticket] = await db
      .insert(tickets)
      .values({ ...data, orgId: user.orgId, creatorId: user.sub } as typeof tickets.$inferInsert)
      .returning();
    if (!ticket) return c.json({ success: false, error: 'Create failed' }, 500);

    const clientIp = getClientIp(c);
    logAudit({ orgId: user.orgId, userId: user.sub, action: 'create', resourceType: 'ticket', resourceId: ticket.id, ipAddress: clientIp, details: { title: ticket.title } }).catch(() => {});
    dispatchWebhookEvent(user.orgId, 'ticket.created', { ticket }).catch(() => {});
    triggerWorkflows(user.orgId, 'ticket_created', { ticketId: ticket.id, title: ticket.title, priority: ticket.priority }).catch(() => {});

    return c.json({ success: true, data: ticket });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Create failed') }, 500);
  }
});

// GET /tickets/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const assignee = alias(users, 'assignee');
    const creator = alias(users, 'creator');

    const [ticketResult] = await db
      .select()
      .from(tickets)
      .leftJoin(assignee, eq(tickets.assigneeId, assignee.id))
      .leftJoin(creator, eq(tickets.creatorId, creator.id))
      .leftJoin(customers, eq(tickets.customerId, customers.id))
      .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId)))
      .limit(1);
    if (!ticketResult) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const ticket = {
      ...ticketResult.tickets,
      status: normalizeTicketStatus(ticketResult.tickets.status),
      overdue: !!(ticketResult.tickets.slaResolveDueAt && new Date(ticketResult.tickets.slaResolveDueAt).getTime() < Date.now() && !['resolved', 'closed'].includes(normalizeTicketStatus(ticketResult.tickets.status))),
      assigneeName: ticketResult.assignee?.name ?? null,
      creatorName: ticketResult.creator?.name ?? null,
      customerName: ticketResult.customers?.name ?? null,
    };

    const commentAuthor = alias(users, 'comment_author');
    const commentRows = await db
      .select()
      .from(ticketComments)
      .leftJoin(commentAuthor, eq(ticketComments.authorId, commentAuthor.id))
      .where(eq(ticketComments.ticketId, id))
      .orderBy(desc(ticketComments.createdAt));

    const comments = commentRows.map((r) => ({
      ...r.ticket_comments,
      authorName: r.comment_author?.name ?? null,
    }));

    return c.json({ success: true, data: { ticket, comments } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Get failed') }, 500);
  }
});

// GET /tickets/:id/review
app.get('/:id/review', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [ticket] = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        source: tickets.source,
        escalationLevel: tickets.escalationLevel,
        createdAt: tickets.createdAt,
        firstResponseAt: tickets.firstResponseAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
        slaFirstResponseDueAt: tickets.slaFirstResponseDueAt,
        slaResolveDueAt: tickets.slaResolveDueAt,
      })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId)))
      .limit(1);
    if (!ticket) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const commentRows = await db
      .select({
        id: ticketComments.id,
        content: ticketComments.content,
        isInternal: ticketComments.isInternal,
        createdAt: ticketComments.createdAt,
        authorName: users.name,
      })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(eq(ticketComments.ticketId, id))
      .orderBy(asc(ticketComments.createdAt));

    const firstCommentAt = commentRows[0]?.createdAt ?? null;
    const firstResponseAt = ticket.firstResponseAt ?? firstCommentAt ?? null;
    const doneAt = ticket.resolvedAt ?? ticket.closedAt ?? null;
    const now = Date.now();
    const status = normalizeTicketStatus(ticket.status);
    const isActive = ['open', 'processing', 'waiting_user'].includes(status);

    const diffMinutes = (start?: Date | null, end?: Date | null) => {
      if (!start || !end) return null;
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
    };

    const firstResponseMinutes = diffMinutes(ticket.createdAt, firstResponseAt ? new Date(firstResponseAt) : null);
    const resolveMinutes = diffMinutes(ticket.createdAt, doneAt ? new Date(doneAt) : null);
    const firstResponseBreach = !!(ticket.slaFirstResponseDueAt && (
      firstResponseAt
        ? new Date(firstResponseAt).getTime() > new Date(ticket.slaFirstResponseDueAt).getTime()
        : now > new Date(ticket.slaFirstResponseDueAt).getTime()
    ));
    const resolveBreach = !!(ticket.slaResolveDueAt && (
      doneAt
        ? new Date(doneAt).getTime() > new Date(ticket.slaResolveDueAt).getTime()
        : isActive && now > new Date(ticket.slaResolveDueAt).getTime()
    ));

    const internalCommentCount = commentRows.filter((cmt) => cmt.isInternal).length;
    const timeline = [
      { type: 'created', at: ticket.createdAt, text: `工单创建：${ticket.title}` },
      ...(firstResponseAt ? [{ type: 'first_response', at: new Date(firstResponseAt), text: '首次响应' }] : []),
      ...commentRows.map((cmt) => ({
        type: cmt.isInternal ? 'internal_comment' : 'comment',
        at: cmt.createdAt,
        text: `${cmt.authorName || '系统'}：${(cmt.content || '').slice(0, 80)}`,
      })),
      ...(ticket.resolvedAt ? [{ type: 'resolved', at: ticket.resolvedAt, text: '工单已解决' }] : []),
      ...(ticket.closedAt ? [{ type: 'closed', at: ticket.closedAt, text: '工单已关闭' }] : []),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const insights: string[] = [];
    if (!firstResponseAt && isActive) insights.push('尚未产生首次响应，建议优先跟进避免首响超时。');
    if (firstResponseBreach) insights.push('首响已超时，建议优化分配与提醒策略。');
    if (resolveBreach) insights.push('解决 SLA 存在违约风险，建议升级优先级或增加协同处理。');
    if ((ticket.escalationLevel || 0) >= 1) insights.push(`该工单已升级 ${ticket.escalationLevel} 次，建议复盘根因与流转效率。`);
    if (commentRows.length === 0) insights.push('当前无处理记录，建议补充处理过程，便于追踪与复盘。');
    if (insights.length === 0) insights.push('工单整体处理节奏正常，可沉淀为标准处理样板。');

    return c.json({
      success: true,
      data: {
        ticket: {
          ...ticket,
          status,
          firstResponseAt,
          doneAt,
        },
        metrics: {
          firstResponseMinutes,
          resolveMinutes,
          firstResponseBreach,
          resolveBreach,
          commentCount: commentRows.length,
          internalCommentCount,
          internalCommentRate: commentRows.length > 0 ? Math.round((internalCommentCount / commentRows.length) * 1000) / 10 : 0,
        },
        timeline,
        insights,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Review failed') }, 500);
  }
});

// POST /tickets/:id/review/actions
app.post('/:id/review/actions', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parsed = reviewActionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [ticket] = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        escalationLevel: tickets.escalationLevel,
        createdAt: tickets.createdAt,
        firstResponseAt: tickets.firstResponseAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
        slaFirstResponseDueAt: tickets.slaFirstResponseDueAt,
        slaResolveDueAt: tickets.slaResolveDueAt,
      })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, user.orgId)))
      .limit(1);
    if (!ticket) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const commentRows = await db
      .select({
        isInternal: ticketComments.isInternal,
        createdAt: ticketComments.createdAt,
      })
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, id))
      .orderBy(asc(ticketComments.createdAt));
    const firstCommentAt = commentRows[0]?.createdAt ?? null;
    const firstResponseAt = ticket.firstResponseAt ?? firstCommentAt ?? null;
    const doneAt = ticket.resolvedAt ?? ticket.closedAt ?? null;
    const now = Date.now();
    const status = normalizeTicketStatus(ticket.status);
    const isActive = ['open', 'processing', 'waiting_user'].includes(status);
    const firstResponseBreach = !!(ticket.slaFirstResponseDueAt && (
      firstResponseAt
        ? new Date(firstResponseAt).getTime() > new Date(ticket.slaFirstResponseDueAt).getTime()
        : now > new Date(ticket.slaFirstResponseDueAt).getTime()
    ));
    const resolveBreach = !!(ticket.slaResolveDueAt && (
      doneAt
        ? new Date(doneAt).getTime() > new Date(ticket.slaResolveDueAt).getTime()
        : isActive && now > new Date(ticket.slaResolveDueAt).getTime()
    ));

    const insights: string[] = [];
    if (!firstResponseAt && isActive) insights.push('尚未产生首次响应，建议优先跟进避免首响超时。');
    if (firstResponseBreach) insights.push('首响已超时，建议优化分配与提醒策略。');
    if (resolveBreach) insights.push('解决 SLA 存在违约风险，建议升级优先级或增加协同处理。');
    if ((ticket.escalationLevel || 0) >= 1) insights.push(`该工单已升级 ${ticket.escalationLevel} 次，建议复盘根因与流转效率。`);
    if (commentRows.length === 0) insights.push('当前无处理记录，建议补充处理过程，便于追踪与复盘。');
    if (insights.length === 0) insights.push('工单整体处理节奏正常，可沉淀为标准处理样板。');

    if (parsed.data.action === 'create_improvement_note') {
      const content = [
        '【自动生成-工单复盘改进项】',
        `工单：${ticket.title}`,
        `状态：${status}`,
        `优先级：${ticket.priority}`,
        '',
        ...insights.map((x, idx) => `${idx + 1}. ${x}`),
      ].join('\n');
      const [comment] = await db.insert(ticketComments).values({
        ticketId: id,
        authorId: user.sub,
        isInternal: true,
        content,
      }).returning();
      await db
        .update(tickets)
        .set({ updatedAt: new Date(), firstResponseAt: sql`coalesce(${tickets.firstResponseAt}, now())` })
        .where(eq(tickets.id, id));

      return c.json({ success: true, data: { action: parsed.data.action, commentId: comment?.id ?? null, message: '改进项已写入内部备注' } });
    }

    const [kb] = parsed.data.kbId
      ? await db
          .select({ id: knowledgeBases.id, name: knowledgeBases.name })
          .from(knowledgeBases)
          .where(and(eq(knowledgeBases.id, parsed.data.kbId), eq(knowledgeBases.orgId, user.orgId)))
          .limit(1)
      : await db
          .select({ id: knowledgeBases.id, name: knowledgeBases.name })
          .from(knowledgeBases)
          .where(eq(knowledgeBases.orgId, user.orgId))
          .orderBy(desc(knowledgeBases.updatedAt))
          .limit(1);
    if (!kb) return c.json({ success: false, error: '请先创建知识库后再生成草稿' }, 400);

    const docTitle = `复盘草稿 - ${ticket.title}`;
    const docContent = [
      `# ${docTitle}`,
      '',
      `- 工单ID: ${ticket.id}`,
      `- 状态: ${status}`,
      `- 优先级: ${ticket.priority}`,
      '',
      '## 复盘建议',
      ...insights.map((x, idx) => `${idx + 1}. ${x}`),
    ].join('\n');
    const [doc] = await db.insert(documents).values({
      kbId: kb.id,
      title: docTitle,
      content: docContent,
      processingStatus: 'completed',
      chunkCount: 0,
      createdBy: user.sub,
    }).returning();
    if (!doc) return c.json({ success: false, error: '创建知识库草稿失败' }, 500);
    await db
      .update(knowledgeBases)
      .set({ documentCount: sql`${knowledgeBases.documentCount} + 1` })
      .where(eq(knowledgeBases.id, kb.id));

    return c.json({
      success: true,
      data: {
        action: parsed.data.action,
        kbId: kb.id,
        kbName: kb.name,
        documentId: doc.id,
        message: `已生成知识库草稿（${kb.name}）`,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Review action failed') }, 500);
  }
});

// PUT /tickets/:id
app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateTicketSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const data = { ...parsed.data } as Record<string, unknown>;
    if (data.dueDate) data.dueDate = new Date(data.dueDate as string);
    if (data.status) data.status = normalizeTicketStatus(String(data.status));
    data.updatedAt = new Date();

    if (data.status === 'resolved') data.resolvedAt = new Date();
    if (data.status === 'closed') data.closedAt = new Date();

    const [updated] = await db
      .update(tickets)
      .set(data)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'update', resourceType: 'ticket', resourceId: id, ipAddress: clientIp, details: { fields: Object.keys(parsed.data) } }).catch(() => {});
    dispatchWebhookEvent(orgId, 'ticket.updated', { ticket: updated }).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500);
  }
});

// DELETE /tickets/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db
      .delete(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId)))
      .returning();
    if (!deleted) return c.json({ success: false, error: 'Ticket not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'delete', resourceType: 'ticket', resourceId: id, ipAddress: clientIp }).catch(() => {});
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

// POST /tickets/:id/comments
app.post('/:id/comments', async (c) => {
  try {
    const user = c.get('user');
    const ticketId = c.req.param('id');

    const [ticket] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, user.orgId)))
      .limit(1);
    if (!ticket) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const body = await c.req.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [comment] = await db
      .insert(ticketComments)
      .values({ ...parsed.data, ticketId, authorId: user.sub })
      .returning();

    await db
      .update(tickets)
      .set({ updatedAt: new Date(), firstResponseAt: sql`coalesce(${tickets.firstResponseAt}, now())` })
      .where(eq(tickets.id, ticketId));

    const clientIp = getClientIp(c);
    logAudit({ orgId: user.orgId, userId: user.sub, action: 'create', resourceType: 'ticket', resourceId: ticketId, ipAddress: clientIp, details: { commentId: comment.id, isInternal: comment.isInternal } }).catch(() => {});

    return c.json({ success: true, data: comment });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Comment failed') }, 500);
  }
});

// PUT /tickets/:id/assign
const assignSchema = z.object({ assigneeId: z.string().uuid().nullable() });

app.put('/:id/assign', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [updated] = await db
      .update(tickets)
      .set({ assigneeId: parsed.data.assigneeId ?? null, updatedAt: new Date(), firstResponseAt: sql`coalesce(${tickets.firstResponseAt}, now())` })
      .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Ticket not found' }, 404);
    const user = c.get('user');
    const clientIp = getClientIp(c);
    logAudit({ orgId, userId: user.sub, action: 'assign', resourceType: 'ticket', resourceId: id, ipAddress: clientIp, details: { assigneeId: parsed.data.assigneeId ?? null } }).catch(() => {});
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Assign failed') }, 500);
  }
});

// POST /tickets/:id/transition
app.post('/:id/transition', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [current] = await db
      .select({ status: tickets.status })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, user.orgId)))
      .limit(1);
    if (!current) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const fromStatus = normalizeTicketStatus(current.status);
    const toStatus = parsed.data.toStatus;
    const allowed = STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      return c.json({ success: false, error: `Illegal transition: ${fromStatus} -> ${toStatus}` }, 400);
    }

    const patch: Record<string, unknown> = { status: toStatus, updatedAt: new Date() };
    if (toStatus === 'resolved') patch.resolvedAt = new Date();
    if (toStatus === 'closed') patch.closedAt = new Date();

    const [updated] = await db
      .update(tickets)
      .set(patch)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, user.orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Transition failed' }, 500);

    const clientIp = getClientIp(c);
    logAudit({
      orgId: user.orgId,
      userId: user.sub,
      action: 'transition',
      resourceType: 'ticket',
      resourceId: id,
      ipAddress: clientIp,
      details: { fromStatus, toStatus },
    }).catch(() => {});
    return c.json({ success: true, data: { ...updated, status: normalizeTicketStatus(updated.status) } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Transition failed') }, 500);
  }
});

// POST /tickets/:id/escalate
app.post('/:id/escalate', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parsed = escalateSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [current] = await db
      .select({ priority: tickets.priority, escalationLevel: tickets.escalationLevel })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.orgId, user.orgId)))
      .limit(1);
    if (!current) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const currentWeight = PRIORITY_WEIGHT[current.priority] ?? PRIORITY_WEIGHT.medium;
    const nextPriority = PRIORITY_LEVELS[Math.min(currentWeight + 1, PRIORITY_LEVELS.length - 1)];
    const [updated] = await db
      .update(tickets)
      .set({
        priority: nextPriority,
        escalationLevel: (current.escalationLevel || 0) + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.id, id), eq(tickets.orgId, user.orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Escalate failed' }, 500);

    const clientIp = getClientIp(c);
    logAudit({
      orgId: user.orgId,
      userId: user.sub,
      action: 'escalate',
      resourceType: 'ticket',
      resourceId: id,
      ipAddress: clientIp,
      details: { from: current.priority, to: nextPriority, reason: parsed.data.reason || '' },
    }).catch(() => {});
    return c.json({ success: true, data: { ...updated, status: normalizeTicketStatus(updated.status) } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Escalate failed') }, 500);
  }
});

export default app;
