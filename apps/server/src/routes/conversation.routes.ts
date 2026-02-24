import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../db/connection';
import { conversations, messages, customers, users, knowledgeBases, documentChunks, documents, memories, organizations } from '../db/schema';
import { generateReply, summarizeConversation, extractMemory } from '../ai/deepseek';
import { getIO, emitMessageNew } from '../websocket/socket';
import { createNotification } from '../services/notification.service';
import { triggerWorkflows } from '../services/workflow.service';
import { parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';
import { requireConversationLimit } from '../middleware/plan-guard';

const app = new Hono();

const createConversationSchema = z.object({
  customerId: z.string().uuid(),
  channelId: z.string().uuid().optional(),
  channelType: z.string().min(1),
  externalChatId: z.string().optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1),
  contentType: z.string().optional(),
  mediaUrl: z.string().optional(),
  senderType: z.string().optional(),
  generateAiReply: z.boolean().optional(),
});

// GET /conversations
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize, offset } = parsePagination(c, { maxPageSize: 500 });
    const status = c.req.query('status');
    const customerId = c.req.query('customerId');
    const agentId = c.req.query('agentId');

    const search = c.req.query('search');

    const conditions = [eq(conversations.orgId, orgId)];
    if (status) conditions.push(eq(conversations.status, status));
    if (customerId) conditions.push(eq(conversations.customerId, customerId));
    if (agentId) conditions.push(eq(conversations.agentId, agentId));
    if (search) {
      conditions.push(
        or(
          ilike(conversations.lastMessagePreview, `%${escapeLike(search)}%`),
          ilike(conversations.aiSummary, `%${escapeLike(search)}%`)
        )!
      );
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(...conditions));

    const list = await db
      .select({
        id: conversations.id,
        orgId: conversations.orgId,
        customerId: conversations.customerId,
        customerName: customers.name,
        channelType: conversations.channelType,
        agentId: conversations.agentId,
        status: conversations.status,
        priority: conversations.priority,
        aiSummary: conversations.aiSummary,
        tags: conversations.tags,
        slaRespondBy: conversations.slaRespondBy,
        slaResolveBy: conversations.slaResolveBy,
        slaFirstResponseAt: conversations.slaFirstResponseAt,
        slaResolvedAt: conversations.slaResolvedAt,
        messageCount: conversations.messageCount,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        satisfactionScore: conversations.satisfactionScore,
        satisfactionComment: conversations.satisfactionComment,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .leftJoin(customers, eq(conversations.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(pageSize)
      .offset(offset);

    return c.json({
      success: true,
      data: list,
      total: countResult?.count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List conversations failed') },
      500
    );
  }
});

// POST /conversations
app.post('/', requireConversationLimit(), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createConversationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [conv] = await db
      .insert(conversations)
      .values({
        ...parsed.data,
        orgId,
      })
      .returning();
    if (!conv) return c.json({ success: false, error: 'Create failed' }, 500);
    return c.json({ success: true, data: conv });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create conversation failed') },
      500
    );
  }
});

// POST /conversations/upload — file upload for chat attachments
app.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file provided' }, 400);
    }
    const f = file as File;
    const allowedExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'zip', 'mp4', 'webm', 'mov']);
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExts.has(ext)) {
      return c.json({ success: false, error: 'File type not allowed' }, 400);
    }
    const videoExts = new Set(['mp4', 'webm', 'mov']);
    const isVideo = videoExts.has(ext) || f.type.startsWith('video/');
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (f.size > maxSize) {
      return c.json({ success: false, error: isVideo ? 'Video too large (max 50MB)' : 'File too large (max 10MB)' }, 400);
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    const filename = `${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploadDir = './uploads/messages';
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(`${uploadDir}/${filename}`, buffer);
    return c.json({
      success: true,
      data: {
        url: `/uploads/messages/${filename}`,
        name: f.name,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Upload failed') }, 500);
  }
});

// GET /conversations/export — export conversations as CSV
app.get('/export', async (c) => {
  try {
    const { orgId } = c.get('user');

    const list = await db
      .select({
        id: conversations.id,
        customerName: customers.name,
        channelType: conversations.channelType,
        status: conversations.status,
        agentId: conversations.agentId,
        messageCount: conversations.messageCount,
        satisfactionScore: conversations.satisfactionScore,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .leftJoin(customers, eq(conversations.customerId, customers.id))
      .where(eq(conversations.orgId, orgId))
      .orderBy(desc(conversations.createdAt))
      .limit(1000);

    const agentIds = [...new Set(list.map((r) => r.agentId).filter(Boolean))] as string[];
    let agentMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const agents = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, agentIds));
      agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    }

    const header = 'ID,Customer,Channel,Status,Agent,MessageCount,SatisfactionScore,CreatedAt,LastMessageAt\n';
    const rows = list
      .map((r) =>
        [
          r.id,
          r.customerName ?? '',
          r.channelType ?? '',
          r.status ?? '',
          r.agentId ? (agentMap[r.agentId] ?? r.agentId) : '',
          r.messageCount ?? 0,
          r.satisfactionScore ?? '',
          r.createdAt?.toISOString() ?? '',
          r.lastMessageAt?.toISOString() ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header(
      'Content-Disposition',
      `attachment; filename="conversations-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return c.body(header + rows);
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Export failed') },
      500
    );
  }
});

// GET /conversations/search-messages - Full-text search across messages
app.get('/search-messages', async (c) => {
  try {
    const { orgId } = c.get('user');
    const keyword = c.req.query('keyword');
    if (!keyword || keyword.trim().length < 2) return c.json({ success: false, error: 'Keyword must be at least 2 characters' }, 400);

    const { page, pageSize, offset } = parsePagination(c);

    const results = await db
      .select({
        messageId: messages.id,
        content: messages.content,
        senderType: messages.senderType,
        createdAt: messages.createdAt,
        conversationId: messages.conversationId,
        customerName: customers.name,
        agentId: conversations.agentId,
        conversationStatus: conversations.status,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(customers, eq(conversations.customerId, customers.id))
      .where(and(
        eq(conversations.orgId, orgId),
        ilike(messages.content, `%${escapeLike(keyword)}%`)
      ))
      .orderBy(desc(messages.createdAt))
      .offset(offset)
      .limit(pageSize);

    return c.json({ success: true, data: results, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

// GET /conversations/missed - Get missed/unanswered conversations
app.get('/missed', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize, offset } = parsePagination(c);

    const missedConditions = and(
      eq(conversations.orgId, orgId),
      eq(conversations.status, 'pending'),
      sql`${conversations.firstResponseAt} IS NULL`
    );

    const [list, [countResult]] = await Promise.all([
      db.select({
        id: conversations.id,
        customerId: conversations.customerId,
        customerName: customers.name,
        channelType: conversations.channelType,
        status: conversations.status,
        priority: conversations.priority,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        agentId: conversations.agentId,
        firstResponseAt: conversations.firstResponseAt,
        waitMinutes: sql<number>`extract(epoch from (now() - ${conversations.createdAt})) / 60`,
      })
        .from(conversations)
        .innerJoin(customers, eq(conversations.customerId, customers.id))
        .where(missedConditions)
        .orderBy(conversations.createdAt)
        .offset(offset)
        .limit(pageSize),
      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(missedConditions),
    ]);

    return c.json({ success: true, data: list, total: countResult.count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

// GET /conversations/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const rows = await db
      .select({
        conv: conversations,
        customerName: customers.name,
      })
      .from(conversations)
      .leftJoin(customers, eq(conversations.customerId, customers.id))
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .limit(1);
    if (!rows.length) return c.json({ success: false, error: 'Conversation not found' }, 404);
    const conv = { ...rows[0].conv, customerName: rows[0].customerName };

    const msgList = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderType: messages.senderType,
        senderId: messages.senderId,
        contentType: messages.contentType,
        content: messages.content,
        mediaUrl: messages.mediaUrl,
        metadata: messages.metadata,
        aiGenerated: messages.aiGenerated,
        aiConfidence: messages.aiConfidence,
        status: messages.status,
        readBy: messages.readBy,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt)
      .limit(200);

    return c.json({
      success: true,
      data: { ...conv, messages: msgList },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Get conversation failed') },
      500
    );
  }
});

// PUT /conversations/:id
const updateConversationSchema = z.object({
  status: z.enum(['pending', 'active', 'resolved', 'closed']).optional(),
  tags: z.array(z.string()).optional(),
  channelType: z.string().max(50).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
}).strict();

app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateConversationSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    const [updated] = await db.update(conversations).set(updateData).where(and(eq(conversations.id, id), eq(conversations.orgId, orgId))).returning();
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);

    if (parsed.data.status === 'resolved') {
      await db.insert(messages).values({
        conversationId: id,
        senderType: 'system',
        content: '感谢您的咨询！请对本次服务进行评价：',
        contentType: 'satisfaction_survey',
      });
      const io = getIO();
      io?.to(`conversation:${id}`).emit('message:new', { conversationId: id, contentType: 'satisfaction_survey' });
    }

    return c.json({ success: true, data: updated });
  } catch (e) { return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500); }
});

// POST /conversations/:id/messages
app.post('/:id/messages', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Conversation not found' }, 404);

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: id,
        content: parsed.data.content,
        contentType: parsed.data.contentType ?? 'text',
        mediaUrl: parsed.data.mediaUrl ?? null,
        senderType: parsed.data.senderType ?? 'agent',
      })
      .returning();

    if (!msg) return c.json({ success: false, error: 'Send message failed' }, 500);

    const newCount = (conv.messageCount ?? 0) + 1;
    const updateSet: Record<string, unknown> = {
      messageCount: newCount,
      lastMessageAt: new Date(),
      lastMessagePreview:
        parsed.data.content.length > 100
          ? parsed.data.content.slice(0, 100) + '...'
          : parsed.data.content,
      firstResponseAt: conv.firstResponseAt ?? new Date(),
    };
    if (conv.status === 'resolved' || conv.status === 'closed') {
      updateSet.status = 'active';
    }
    await db
      .update(conversations)
      .set(updateSet)
      .where(eq(conversations.id, id));

    const io = getIO();
    if (io) {
      emitMessageNew(io, id, { content: msg.content, senderType: msg.senderType ?? 'agent', messageId: msg.id });
    }

    if (parsed.data.generateAiReply && process.env.DEEPSEEK_API_KEY) {
      try {
        let knowledgeContext: string | undefined;
        try {
          const kbs = await db.select({ id: knowledgeBases.id }).from(knowledgeBases).where(eq(knowledgeBases.orgId, orgId)).limit(1);
          if (kbs.length > 0) {
            const keywords = parsed.data.content.replace(/[?？!！。，,.、\s]+/g, ' ').trim().split(/\s+/).filter((w: string) => w.length >= 2).slice(0, 3);
            if (keywords.length > 0) {
              const chunks = await db
                .select({ content: documentChunks.content })
                .from(documentChunks)
                .innerJoin(documents, eq(documents.id, documentChunks.documentId))
                .where(and(eq(documents.kbId, kbs[0].id), or(...keywords.map((kw: string) => ilike(documentChunks.content, `%${escapeLike(kw)}%`)))))
                .limit(3);
              if (chunks.length > 0) knowledgeContext = chunks.map((c: { content: string }) => c.content).join('\n\n');
            }
          }
          if (conv.customerId) {
            const mems = await db
              .select({ content: memories.content, summary: memories.summary })
              .from(memories)
              .where(eq(memories.customerId, conv.customerId))
              .limit(5);
            if (mems.length > 0) {
              const memCtx = mems.map((m: { summary: string | null; content: string }) => m.summary || m.content).join('; ');
              knowledgeContext = (knowledgeContext ? knowledgeContext + '\n\n---\nCustomer memories:\n' : 'Customer memories:\n') + memCtx;
            }
          }
        } catch { /* ignore context lookup failure */ }

        const reply = await generateReply(
          { customerId: conv.customerId },
          parsed.data.content,
          knowledgeContext
        );
        if (reply) {
          const [aiMsg] = await db
            .insert(messages)
            .values({
              conversationId: id,
              content: reply,
              contentType: 'text',
              senderType: 'ai',
              aiGenerated: true,
            })
            .returning();
          await db
            .update(conversations)
            .set({
              messageCount: newCount + 1,
              lastMessageAt: new Date(),
              lastMessagePreview: reply.slice(0, 100),
            })
            .where(eq(conversations.id, id));
          if (io && aiMsg) {
            emitMessageNew(io, id, { content: aiMsg.content, senderType: 'ai', messageId: aiMsg.id });
          }
          return c.json({
            success: true,
            data: { message: msg, aiReply: aiMsg ?? null },
          });
        }
      } catch {
        // ignore AI failure
      }
    }

    return c.json({ success: true, data: { message: msg } });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Send message failed') },
      500
    );
  }
});

// POST /conversations/:id/assign
app.post('/:id/assign', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ agentId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [updated] = await db
      .update(conversations)
      .set({ agentId: parsed.data.agentId })
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Conversation not found' }, 404);

    createNotification({
      orgId, userId: parsed.data.agentId, type: 'conversation_assign',
      title: '新会话分配给你',
      content: `客户 ${updated.lastMessagePreview?.slice(0, 40) ?? ''}`,
      resourceType: 'conversation', resourceId: id,
    }).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Assign failed') },
      500
    );
  }
});

// PUT /conversations/:id/priority
app.put('/:id/priority', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ priority: z.enum(['low', 'medium', 'normal', 'high', 'urgent']) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [updated] = await db
      .update(conversations)
      .set({ priority: parsed.data.priority })
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Conversation not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Update priority failed') }, 500);
  }
});

// POST /conversations/:id/resolve
app.post('/:id/resolve', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [conv] = await db.select({ messageCount: conversations.messageCount, orgId: conversations.orgId })
      .from(conversations).where(and(eq(conversations.id, id), eq(conversations.orgId, orgId))).limit(1);
    if (!conv) return c.json({ success: false, error: 'Conversation not found' }, 404);

    // Compute conversation grade based on message count
    const [orgRow] = await db.select({ widgetConfig: organizations.widgetConfig })
      .from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const gradeRules = (orgRow?.widgetConfig as any)?.conversationGradeRules ?? [
      { grade: '无效', minMessages: 0 },
      { grade: '简单', minMessages: 1 },
      { grade: '普通', minMessages: 5 },
      { grade: '深度', minMessages: 15 },
      { grade: '重要', minMessages: 30 },
    ];
    const sortedRules = [...gradeRules].sort((a: any, b: any) => b.minMessages - a.minMessages);
    const grade = sortedRules.find((r: any) => (conv.messageCount ?? 0) >= r.minMessages)?.grade ?? '简单';

    // Check if any customer messages exist (invalid = no customer messages)
    const [custMsgCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(messages).where(and(eq(messages.conversationId, id), eq(messages.senderType, 'customer')));
    const isInvalid = (custMsgCount?.count ?? 0) === 0;

    const [updated] = await db
      .update(conversations)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        slaResolvedAt: new Date(),
        grade,
        isInvalid,
      })
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Conversation not found' }, 404);

    triggerWorkflows(orgId, 'conversation_resolved', { conversationId: id, status: updated.status, grade }).catch(() => {});

    // Auto-send satisfaction survey
    await db.insert(messages).values({
      conversationId: id,
      senderType: 'system',
      content: '感谢您的咨询！请对本次服务进行评价：',
      contentType: 'satisfaction_survey',
    });
    const io = getIO();
    io?.to(`conversation:${id}`).emit('message:new', { conversationId: id, contentType: 'satisfaction_survey' });

    if (process.env.DEEPSEEK_API_KEY) {
      (async () => {
        try {
          const msgList = await db
            .select({ content: messages.content, senderType: messages.senderType })
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(messages.createdAt)
            .limit(50);
          if (msgList.length > 0) {
            const summary = await summarizeConversation(msgList);
            if (summary) {
              await db.update(conversations).set({ aiSummary: summary }).where(eq(conversations.id, id));
            }
            if (updated.customerId) {
              const mems = await extractMemory(msgList);
              if (mems && mems.length > 0) {
                await db.insert(memories).values(
                  mems.map(mem => ({
                    orgId,
                    customerId: updated.customerId,
                    type: 'conversation',
                    content: mem.content,
                    summary: mem.summary,
                    importance: mem.importance,
                    sourceType: 'conversation',
                    sourceId: id,
                  }))
                );
              }
            }
          }
        } catch { /* non-blocking AI enrichment */ }
      })();
    }

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Resolve failed') },
      500
    );
  }
});

// POST /conversations/:id/transfer — transfer to another agent with system message
app.post('/:id/transfer', async (c) => {
  try {
    const user = c.get('user');
    const orgId = user.orgId;
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({
      targetAgentId: z.string().uuid(),
      reason: z.string().optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const { targetAgentId, reason } = parsed.data;

    const [targetAgent] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.id, targetAgentId), eq(users.orgId, orgId)))
      .limit(1);
    if (!targetAgent) return c.json({ success: false, error: 'Target agent not found' }, 404);

    const [updated] = await db
      .update(conversations)
      .set({ agentId: targetAgentId, aiEnabled: false })
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Conversation not found' }, 404);

    const transferMsg = reason
      ? `会话已转接给 ${targetAgent.name}（原因：${reason}）`
      : `会话已转接给 ${targetAgent.name}`;

    const [sysMsg] = await db.insert(messages).values({
      conversationId: id,
      content: transferMsg,
      contentType: 'text',
      senderType: 'system',
    }).returning();

    const io = getIO();
    if (io) {
      emitMessageNew(io, id, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });
    }

    createNotification({
      orgId, userId: targetAgentId, type: 'conversation_transfer',
      title: '有会话转接给你',
      content: reason ? `转接原因：${reason}` : `来自同事的转接`,
      resourceType: 'conversation', resourceId: id,
    }).catch(() => {});

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Transfer failed') }, 500);
  }
});

// POST /conversations/:id/notes — add internal note
app.post('/:id/notes', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ content: z.string().min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '请输入备注内容' }, 400);
    const { content } = parsed.data;
    const [conv] = await db.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.orgId, user.orgId)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Not found' }, 404);
    const [note] = await db.insert(messages).values({
      conversationId: id,
      content,
      contentType: 'note',
      senderType: 'agent',
      senderId: user.sub,
    }).returning();
    return c.json({ success: true, data: note });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// GET /conversations/:id/rating — get satisfaction rating
app.get('/:id/rating', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [conv] = await db
      .select({ satisfactionScore: conversations.satisfactionScore, satisfactionComment: conversations.satisfactionComment })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: conv });
  } catch (e) {
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /conversations/:id/read — mark messages as read
app.post('/:id/read', async (c) => {
  try {
    const user = c.get('user');
    const orgId = user.orgId;
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ lastReadMessageId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user.sub)) return c.json({ success: false, error: 'Invalid user ID' }, 400);

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Conversation not found' }, 404);

    const [targetMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, parsed.data.lastReadMessageId), eq(messages.conversationId, id)))
      .limit(1);
    if (!targetMsg) return c.json({ success: false, error: 'Message not found' }, 404);

    const now = new Date().toISOString();
    await db.execute(sql`
      UPDATE messages
      SET read_by = jsonb_set(COALESCE(read_by, '{}'), ${sql.raw(`'{${user.sub}}'`)}, ${`"${now}"`}::jsonb)
      WHERE conversation_id = ${id}
        AND created_at <= ${targetMsg.createdAt.toISOString()}::timestamptz
        AND NOT (COALESCE(read_by, '{}') ? ${user.sub})
    `);

    await db
      .update(conversations)
      .set({ agentLastReadAt: new Date() })
      .where(eq(conversations.id, id));

    const io = getIO();
    if (io) {
      io.to(`conversation:${id}`).emit('message:read', {
        userId: user.sub,
        conversationId: id,
        lastReadMessageId: parsed.data.lastReadMessageId,
        readAt: now,
      });
    }

    return c.json({ success: true, data: { marked: true } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Mark read failed') }, 500);
  }
});

// POST /conversations/:id/ai-suggest - AI suggests reply for agent
app.post('/:id/ai-suggest', async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const id = c.req.param('id');

    const [conv] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)));
    if (!conv) return c.json({ success: false, error: 'Not found' }, 404);

    const recentMsgs = await db.select({
      senderType: messages.senderType,
      content: messages.content,
      contentType: messages.contentType,
      mediaUrl: messages.mediaUrl,
      metadata: messages.metadata,
      createdAt: messages.createdAt,
    }).from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.createdAt)).limit(20);

    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const resolveUrl = (url: string) => url.startsWith('http') ? url : `${baseUrl}${url}`;

    const history = recentMsgs.reverse().map(m => {
      const msg: { role: 'user' | 'assistant'; content: string; imageUrls?: string[] } = {
        role: m.senderType === 'agent' ? 'assistant' as const : 'user' as const,
        content: m.content,
      };
      if (m.senderType === 'customer' && m.mediaUrl) {
        if (m.contentType === 'image') {
          msg.imageUrls = [resolveUrl(m.mediaUrl)];
          if (!m.content || m.content === '[图片]') msg.content = '请查看这张图片并描述你看到的内容。';
        } else if (m.contentType === 'video') {
          const thumbUrl = (m.metadata as Record<string, unknown>)?.thumbnailUrl as string | undefined;
          if (thumbUrl) {
            msg.imageUrls = [resolveUrl(thumbUrl)];
            msg.content = (m.content && m.content !== '[视频]') ? `用户发送了一个视频，这是视频截图。用户说：${m.content}` : '用户发送了一个视频，这是视频的截图，请描述你看到的内容并给出回复建议。';
          } else {
            msg.content = (m.content && m.content !== '[视频]') ? `用户发送了一个视频。用户说：${m.content}` : '用户发送了一个视频文件，请提示用户描述视频内容以便提供帮助。';
          }
        }
      }
      return msg;
    });

    let kbContext = '';
    const lastCustomerMsg = recentMsgs.filter(m => m.senderType === 'customer').pop();
    if (lastCustomerMsg) {
      const orgKbs = await db.select({ id: knowledgeBases.id }).from(knowledgeBases).where(eq(knowledgeBases.orgId, orgId)).limit(1);
      if (orgKbs.length > 0) {
        const keywords = lastCustomerMsg.content.replace(/[?？!！。，,.、\s]+/g, ' ').trim().split(/\s+/).filter((w: string) => w.length >= 2).slice(0, 3);
        const chunkConditions = [eq(documents.kbId, orgKbs[0].id)];
        if (keywords.length > 0) {
          chunkConditions.push(or(...keywords.map((kw: string) => ilike(documentChunks.content, `%${escapeLike(kw)}%`)))!);
        }
        const chunks = await db.select({ content: documentChunks.content })
          .from(documentChunks)
          .innerJoin(documents, eq(documentChunks.documentId, documents.id))
          .where(and(...chunkConditions))
          .limit(3);
        if (chunks.length > 0) kbContext = chunks.map(ch => ch.content).join('\n\n');
      }
    }

    const suggestion = await generateReply(history, kbContext || undefined);
    return c.json({ success: true, data: { suggestion } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

// POST /conversations/:id/summary — agent writes conversation summary
app.post('/:id/summary', async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ summary: z.string().min(1).max(2000) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const [updated] = await db.update(conversations)
      .set({ summary: parsed.data.summary, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Summary failed') }, 500);
  }
});

// POST /conversations/:id/invite-rating — agent invites customer to rate
app.post('/:id/invite-rating', async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const id = c.req.param('id');
    const [conv] = await db.select({ id: conversations.id, customerId: conversations.customerId })
      .from(conversations).where(and(eq(conversations.id, id), eq(conversations.orgId, orgId))).limit(1);
    if (!conv) return c.json({ success: false, error: 'Not found' }, 404);

    const [msg] = await db.insert(messages).values({
      conversationId: id,
      senderType: 'system',
      senderId: sub,
      contentType: 'rating_invite',
      content: '客服邀请您对本次服务进行评价',
    }).returning();

    const io = getIO();
    if (io) {
      emitMessageNew(io, id, { content: msg.content, senderType: 'system', messageId: msg.id });
    }

    return c.json({ success: true, data: msg });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Invite rating failed') }, 500);
  }
});

// GET /conversations/colleagues — view colleague conversations
app.get('/colleagues', async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const { page, pageSize } = parsePagination(c);
    const agentId = c.req.query('agentId');

    const conditions = [
      eq(conversations.orgId, orgId),
      eq(conversations.status, 'active'),
      sql`${conversations.agentId} IS NOT NULL`,
      sql`${conversations.agentId} != ${sub}`,
    ];
    if (agentId) conditions.push(eq(conversations.agentId, agentId));

    const list = await db
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        customerName: customers.name,
        channelType: conversations.channelType,
        agentId: conversations.agentId,
        agentName: users.name,
        status: conversations.status,
        priority: conversations.priority,
        messageCount: conversations.messageCount,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .leftJoin(customers, eq(conversations.customerId, customers.id))
      .leftJoin(users, eq(conversations.agentId, users.id))
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return c.json({ success: true, data: list });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

export default app;
