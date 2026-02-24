import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, ne, asc, sql, or, inArray, ilike } from 'drizzle-orm';
import { db } from '../db/connection';
import { organizations, customers, conversations, messages, users, offlineConsultations, blacklist, autoReplyRules, pageViews, visitorSessions, routingRules, proactiveChatRules, teamMembers, knowledgeBases, faqs, documentChunks, documents, tickets, ticketComments } from '../db/schema';
import { generateReply } from '../ai/deepseek';
import { getIO, emitMessageNew } from '../websocket/socket';
import { escapeLike } from '../utils/helpers';
import { checkConversationLimitInline } from '../middleware/plan-guard';

const app = new Hono();

function extractIntentKeywords(text: string): string[] {
  const raw = (text || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const stopWords = new Set([
    '请问', '你好', '您好', '这个', '那个', '一下', '我们', '你们', '如何', '怎么',
    '可以', '是否', '就是', '然后', '还是', '以及', '关于', 'and', 'the', 'to', 'for',
  ]);
  return raw.filter((w) => w.length >= 2 && !stopWords.has(w)).slice(0, 6);
}

function detectContactInMessage(content: string): { phone?: string; email?: string; wechat?: string } | null {
  const contacts: { phone?: string; email?: string; wechat?: string } = {};
  const phoneMatch = content.match(/(?:1[3-9]\d{9}|(?:\d{3,4}[-\s]?\d{7,8}))/);
  if (phoneMatch) contacts.phone = phoneMatch[0].replace(/[-\s]/g, '');
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) contacts.email = emailMatch[0];
  const wechatMatch = content.match(/(?:微信|wx|WeChat)[号:\s]*([a-zA-Z0-9_-]{5,20})/i);
  if (wechatMatch) contacts.wechat = wechatMatch[1];
  return Object.keys(contacts).length > 0 ? contacts : null;
}

const widgetRateLimits = new Map<string, { count: number; resetAt: number }>();
function checkWidgetRate(ip: string, limit: number = 60): boolean {
  const now = Date.now();
  const entry = widgetRateLimits.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
  entry.count++;
  widgetRateLimits.set(ip, entry);
  return entry.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of widgetRateLimits) {
    if (now > val.resetAt) widgetRateLimits.delete(key);
  }
}, 300000);

interface WorkingHourEntry {
  day: string;
  enabled: boolean;
  start: string;
  end: string;
}

function isWithinWorkingHours(settings: Record<string, unknown> | null): boolean {
  if (!settings) return true;
  const svc = settings.serviceSettings as Record<string, unknown> | undefined;
  const wh = svc?.workingHours as WorkingHourEntry[] | undefined;
  if (!Array.isArray(wh) || wh.length !== 7) return true;

  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7; // JS: 0=Sun → we need 0=Mon
  const entry = wh[dayIndex];
  if (!entry || !entry.enabled) return false;

  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hhmm >= entry.start && hhmm < entry.end;
}

function getOfflineMessage(settings: Record<string, unknown> | null): string {
  const svc = (settings?.serviceSettings ?? {}) as Record<string, unknown>;
  return (svc.offlineMessage as string) || '当前为非工作时间，请留下您的联系方式和咨询内容，我们将在工作时间内尽快与您联系。';
}

const initSchema = z.object({
  siteToken: z.string().min(1),
  visitorName: z.string().optional(),
  visitorEmail: z.string().email().optional().or(z.literal('')),
  visitorPhone: z.string().optional(),
  sessionId: z.string().optional(),
});

const sendSchema = z.object({
  content: z.string().min(1),
  contentType: z.string().optional(),
  mediaUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

const ratingSchema = z.object({
  siteToken: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

const publicTicketSchema = z.object({
  siteToken: z.string().min(1),
  title: z.string().min(2).max(200),
  description: z.string().min(2).max(6000),
  category: z.enum(['user_ticket', 'platform_error']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  pageUrl: z.string().max(1000).optional(),
  browserInfo: z.string().max(500).optional(),
  errorCode: z.string().max(120).optional(),
  errorDetail: z.string().max(2000).optional(),
  attachments: z.array(z.object({
    name: z.string().min(1).max(255),
    url: z.string().min(1).max(1000),
    type: z.string().max(120).optional(),
    size: z.number().int().nonnegative().optional(),
  })).max(5).optional(),
});

const publicTicketFeedbackSchema = z.object({
  siteToken: z.string().min(1),
  ticketNo: z.string().min(6).max(12),
  content: z.string().min(2).max(4000),
  attachments: z.array(z.object({
    name: z.string().min(1).max(255),
    url: z.string().min(1).max(1000),
    type: z.string().max(120).optional(),
    size: z.number().int().nonnegative().optional(),
  })).max(5).optional(),
});

async function isBlacklisted(orgId: string, ip: string, visitorId?: string): Promise<boolean> {
  const conditions = [eq(blacklist.orgId, orgId)];
  const orConds = [and(eq(blacklist.type, 'ip'), eq(blacklist.value, ip))];
  if (visitorId) {
    orConds.push(and(eq(blacklist.type, 'visitor'), eq(blacklist.value, visitorId)));
  }
  conditions.push(or(...orConds)!);
  const [hit] = await db
    .select({ id: blacklist.id })
    .from(blacklist)
    .where(and(...conditions))
    .limit(1);
  return !!hit;
}

const orgCache = new Map<string, { data: any; expiresAt: number }>();

async function resolveOrg(siteToken: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteToken)) return null;
  const cached = orgCache.get(siteToken);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, siteToken))
    .limit(1);
  const result = org ?? null;
  orgCache.set(siteToken, { data: result, expiresAt: Date.now() + 60_000 });
  if (orgCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of orgCache) { if (now > v.expiresAt) orgCache.delete(k); }
  }
  return result;
}

const rulesCache = new Map<string, { data: any[]; expiresAt: number }>();

async function checkAutoReplyRules(orgId: string, message: string): Promise<{ content: string; ruleId: string } | null> {
  let rules: any[];
  const cached = rulesCache.get(orgId);
  if (cached && Date.now() < cached.expiresAt) {
    rules = cached.data;
  } else {
    rules = await db.select().from(autoReplyRules)
      .where(and(eq(autoReplyRules.orgId, orgId), eq(autoReplyRules.isActive, true)))
      .orderBy(desc(autoReplyRules.priority));
    rulesCache.set(orgId, { data: rules, expiresAt: Date.now() + 30_000 });
    if (rulesCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of rulesCache) { if (now > v.expiresAt) rulesCache.delete(k); }
    }
  }

  for (const rule of rules) {
    const config = rule.triggerConfig as Record<string, unknown>;
    let matched = false;

    if (rule.triggerType === 'keyword') {
      const keywords = (config.keywords as string[]) || [];
      const matchMode = (config.matchMode as string) || 'contains';
      for (const kw of keywords) {
        if (matchMode === 'contains' && message.includes(kw)) { matched = true; break; }
        if (matchMode === 'exact' && message === kw) { matched = true; break; }
        if (matchMode === 'startsWith' && message.startsWith(kw)) { matched = true; break; }
      }
    } else if (rule.triggerType === 'regex') {
      try {
        if (new RegExp(config.pattern as string, 'i').test(message)) matched = true;
      } catch { /* invalid regex */ }
    } else if (rule.triggerType === 'first_message') {
      matched = true;
    }

    if (matched) {
      db.update(autoReplyRules)
        .set({ matchCount: sql`${autoReplyRules.matchCount} + 1` })
        .where(eq(autoReplyRules.id, rule.id))
        .execute()
        .catch(() => {});
      return { content: rule.replyContent, ruleId: rule.id };
    }
  }
  return null;
}

/**
 * Round-robin: pick the online agent with the fewest active conversations,
 * respecting each agent's maxConcurrentChats limit.
 * Returns null if all agents are at capacity (visitor enters queue).
 */
async function assignAgentRoundRobin(orgId: string): Promise<string | null> {
  const agents = await db
    .select({ id: users.id, name: users.name, onlineStatus: users.onlineStatus, maxConcurrentChats: users.maxConcurrentChats })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.status, 'active')));

  const onlineAgents = agents.filter(a => a.onlineStatus === 'online' || a.onlineStatus === 'busy');
  if (onlineAgents.length === 0) return null;

  const counts = await db
    .select({
      agentId: conversations.agentId,
      count: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .where(and(
      eq(conversations.orgId, orgId),
      ne(conversations.status, 'resolved'),
      ne(conversations.status, 'closed'),
    ))
    .groupBy(conversations.agentId);

  const countMap = new Map(counts.map((r) => [r.agentId, r.count]));

  const available = onlineAgents.filter(a => {
    const current = countMap.get(a.id) ?? 0;
    const limit = a.maxConcurrentChats ?? 10;
    return limit === 0 || current < limit;
  });

  if (available.length === 0) return null;

  available.sort((a, b) => (countMap.get(a.id) ?? 0) - (countMap.get(b.id) ?? 0));
  return available[0].id;
}

async function assignAgentFromTeam(orgId: string, teamId: string): Promise<string | null> {
  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.orgId, orgId), eq(users.status, 'active')));

  if (members.length === 0) return null;
  if (members.length === 1) return members[0].userId;

  const memberIds = members.map(m => m.userId);
  const counts = await db
    .select({ agentId: conversations.agentId, count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(
      eq(conversations.orgId, orgId),
      ne(conversations.status, 'resolved'),
      ne(conversations.status, 'closed'),
    ))
    .groupBy(conversations.agentId);

  const countMap = new Map(counts.map(r => [r.agentId, r.count]));
  memberIds.sort((a, b) => (countMap.get(a) ?? 0) - (countMap.get(b) ?? 0));
  return memberIds[0];
}

async function routeConversation(orgId: string, context: { channel?: string; pageUrl?: string }): Promise<string | null> {
  const rules = await db.select().from(routingRules)
    .where(and(eq(routingRules.orgId, orgId), eq(routingRules.isActive, true)))
    .orderBy(desc(routingRules.priority));

  for (const rule of rules) {
    const conds = rule.conditions as Record<string, unknown>;
    let match = true;
    if (conds.channel && conds.channel !== context.channel) match = false;
    if (conds.pageUrl && context.pageUrl && !context.pageUrl.includes(conds.pageUrl as string)) match = false;

    if (match) {
      if (rule.targetType === 'agent' && rule.targetId) return rule.targetId;
      if ((rule.targetType === 'team' || rule.targetType === 'round_robin_team') && rule.targetId) {
        const agentId = await assignAgentFromTeam(orgId, rule.targetId);
        if (agentId) return agentId;
      }
      if (rule.targetType === 'round_robin_team' && !rule.targetId) return assignAgentRoundRobin(orgId);
    }
  }

  return assignAgentRoundRobin(orgId);
}

// POST /widget/init — visitor opens the chat widget
app.post('/init', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkWidgetRate(clientIp, 30)) {
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
    }
    const body = await c.req.json();
    const parsed = initSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid params' }, 400);

    const org = await resolveOrg(parsed.data.siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid site token' }, 403);

    if (await isBlacklisted(org.id, clientIp, parsed.data.sessionId)) {
      return c.json({ success: false, error: 'blocked' }, 403);
    }

    const widgetCfg = (org as any).widgetConfig ?? (org.settings as Record<string, unknown>)?.widget ?? {};
    const greetingMsg = (widgetCfg as any)?.greeting ?? '您好！有什么可以帮您的吗？';
    const online = isWithinWorkingHours(org.settings);
    const offMsg = online ? undefined : getOfflineMessage(org.settings);
    const widgetAppearance = {
      themeColor: (widgetCfg as any)?.themeColor ?? '#7c3aed',
      position: (widgetCfg as any)?.position ?? 'bottom-right',
      logoUrl: (widgetCfg as any)?.logoUrl ?? org.logoUrl,
      companyName: (widgetCfg as any)?.companyName ?? org.name,
      preChatFormEnabled: (widgetCfg as any)?.preChatFormEnabled ?? false,
      preChatFormFields: (widgetCfg as any)?.preChatFormFields ?? [],
      showAgentAvatar: (widgetCfg as any)?.showAgentAvatar ?? true,
      showAgentName: (widgetCfg as any)?.showAgentName ?? true,
    };

    // If sessionId provided, try to resume only if NOT resolved/closed
    if (parsed.data.sessionId) {
      const [existing] = await db
        .select({ id: conversations.id, customerId: conversations.customerId, status: conversations.status })
        .from(conversations)
        .where(and(
          eq(conversations.id, parsed.data.sessionId),
          eq(conversations.orgId, org.id),
          eq(conversations.channelType, 'web_widget'),
        ))
        .limit(1);

      if (existing && existing.status !== 'resolved' && existing.status !== 'closed') {
        return c.json({
          success: true,
          data: { sessionId: existing.id, greeting: greetingMsg, isNew: false, isOnline: online, offlineMessage: offMsg, widget: widgetAppearance },
        });
      }

      // Resolved/closed → create new session, reuse the customer
      if (existing) {
        const convCheck = await checkConversationLimitInline(org.id);
        if (!convCheck.allowed) {
          return c.json({ success: false, code: 'CONVERSATION_LIMIT', error: '感谢您的关注，当前客服繁忙，请留下联系方式，我们会尽快联系您', offline: true }, 503);
        }
        const agentId = await routeConversation(org.id, { channel: 'web_widget' });
        const [conv] = await db
          .insert(conversations)
          .values({
            orgId: org.id,
            customerId: existing.customerId,
            channelType: 'web_widget',
            status: 'pending',
            aiEnabled: true,
            agentId,
          })
          .returning();

        return c.json({
          success: true,
          data: { sessionId: conv.id, greeting: greetingMsg, isNew: true, agentAssigned: !!agentId, isOnline: online, offlineMessage: offMsg, widget: widgetAppearance },
        });
      }
    }

    // Brand new visitor
    const convLimitCheck = await checkConversationLimitInline(org.id);
    if (!convLimitCheck.allowed) {
      return c.json({ success: false, code: 'CONVERSATION_LIMIT', error: '感谢您的关注，当前客服繁忙，请留下联系方式，我们会尽快联系您', offline: true }, 503);
    }
    const visitorName = parsed.data.visitorName || '网站访客';
    const [customer] = await db
      .insert(customers)
      .values({
        orgId: org.id,
        name: visitorName,
        email: parsed.data.visitorEmail ?? null,
        phone: parsed.data.visitorPhone ?? null,
        type: 'individual',
        stage: 'lead',
      })
      .returning();

    const agentId = await routeConversation(org.id, { channel: 'web_widget' });
    const [conv] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        customerId: customer.id,
        channelType: 'web_widget',
        status: 'pending',
        aiEnabled: true,
        agentId,
      })
      .returning();

    return c.json({
      success: true,
      data: { sessionId: conv.id, greeting: greetingMsg, isNew: true, agentAssigned: !!agentId, isOnline: online, offlineMessage: offMsg, inQueue: !agentId && online, widget: widgetAppearance },
    });
  } catch (e) {
    console.error('[widget/init]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// GET /widget/messages/:sessionId
app.get('/messages/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const siteToken = c.req.query('siteToken');
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const [conv] = await db
      .select({ id: conversations.id, status: conversations.status, satisfactionScore: conversations.satisfactionScore, agentId: conversations.agentId })
      .from(conversations)
      .where(and(eq(conversations.id, sessionId), eq(conversations.orgId, org.id)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Session not found' }, 404);

    let agentName: string | null = null;
    let agentAvatarUrl: string | null = null;
    let agentOnlineStatus: string | null = null;
    if (conv.agentId) {
      const [agent] = await db
        .select({ name: users.name, avatarUrl: users.avatarUrl, onlineStatus: users.onlineStatus })
        .from(users)
        .where(and(eq(users.id, conv.agentId), eq(users.orgId, org.id)))
        .limit(1);
      agentName = agent?.name ?? null;
      agentAvatarUrl = agent?.avatarUrl ?? null;
      agentOnlineStatus = agent?.onlineStatus ?? null;
    }

    const msgs = await db
      .select({
        id: messages.id,
        content: messages.content,
        contentType: messages.contentType,
        mediaUrl: messages.mediaUrl,
        senderType: messages.senderType,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, sessionId), ne(messages.contentType, 'note')))
      .orderBy(messages.createdAt)
      .limit(200);

    return c.json({
      success: true,
      data: msgs,
      meta: { status: conv.status, rated: conv.satisfactionScore !== null, agentId: conv.agentId ?? null, agentName, agentAvatarUrl, agentOnlineStatus },
    });
  } catch (e) {
    console.error('[widget/messages]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/messages/:sessionId — visitor sends a message
app.post('/messages/:sessionId', async (c) => {
  try {
    const msgClientIpRate = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkWidgetRate(msgClientIpRate, 60)) {
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
    }
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid params' }, 400);

    const siteToken = body.siteToken;
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const msgClientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (await isBlacklisted(org.id, msgClientIp, sessionId)) {
      return c.json({ success: false, error: 'blocked' }, 403);
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, sessionId), eq(conversations.orgId, org.id)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Session not found' }, 404);

    // If resolved/closed, tell widget to start a new session
    if (conv.status === 'resolved' || conv.status === 'closed') {
      return c.json({
        success: false,
        error: 'SESSION_RESOLVED',
        message: '会话已结束，请开始新会话',
      }, 410);
    }

    const msgMetadata: Record<string, unknown> = {};
    if (parsed.data.thumbnailUrl) msgMetadata.thumbnailUrl = parsed.data.thumbnailUrl;

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: sessionId,
        content: parsed.data.content,
        contentType: parsed.data.contentType ?? 'text',
        mediaUrl: parsed.data.mediaUrl ?? null,
        metadata: Object.keys(msgMetadata).length > 0 ? msgMetadata : null,
        senderType: 'customer',
      })
      .returning();

    const newCount = (conv.messageCount ?? 0) + 1;
    await db
      .update(conversations)
      .set({
        messageCount: newCount,
        lastMessageAt: new Date(),
        lastMessagePreview: parsed.data.content.length > 100 ? parsed.data.content.slice(0, 100) + '...' : parsed.data.content,
      })
      .where(eq(conversations.id, sessionId));

    // Lead detection — scan for phone/email/wechat in customer messages
    if (parsed.data.contentType === 'text' || !parsed.data.contentType) {
      const detected = detectContactInMessage(parsed.data.content);
      if (detected) {
        db.update(conversations)
          .set({ hasLead: true, detectedContact: detected })
          .where(eq(conversations.id, sessionId))
          .execute().catch(() => {});
      }
    }

    const io = getIO();
    if (io) {
      emitMessageNew(io, sessionId, { content: msg.content, senderType: 'customer', messageId: msg.id });
    }

    // If customer explicitly requests human agent
    const wantHuman = /转人工|转客服|人工客服|真人/.test(parsed.data.content);
    if (wantHuman) {
      const online = isWithinWorkingHours(org.settings);
      if (!online) {
        const offMsg = getOfflineMessage(org.settings);
        const [sysMsg] = await db.insert(messages).values({
          conversationId: sessionId,
          content: offMsg,
          contentType: 'text',
          senderType: 'system',
        }).returning();
        if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });
        return c.json({
          success: true,
          data: { message: msg, aiReply: { content: offMsg }, transferred: false, offline: true },
        });
      }
      if (!conv.agentId) {
        const agentId = await assignAgentRoundRobin(org.id);
        if (agentId) {
          await db.update(conversations).set({ agentId, aiEnabled: false }).where(eq(conversations.id, sessionId));
          const [sysMsg] = await db.insert(messages).values({
            conversationId: sessionId,
            content: '已为您转接人工客服，请稍候...',
            contentType: 'text',
            senderType: 'system',
          }).returning();
          if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });
          return c.json({ success: true, data: { message: msg, aiReply: { content: '已为您转接人工客服，请稍候...' }, transferred: true } });
        }

        const queueMsg = '当前人工客服繁忙，已为您加入排队，您也可以先描述问题，客服接入后会优先处理。';
        const [sysMsg] = await db.insert(messages).values({
          conversationId: sessionId,
          content: queueMsg,
          contentType: 'text',
          senderType: 'system',
        }).returning();
        if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });
        return c.json({ success: true, data: { message: msg, aiReply: { content: queueMsg }, transferred: false, queued: true } });
      }

      const alreadyAssignedMsg = '已为您转接人工客服，客服会尽快接入，请稍候。';
      const [sysMsg] = await db.insert(messages).values({
        conversationId: sessionId,
        content: alreadyAssignedMsg,
        contentType: 'text',
        senderType: 'system',
      }).returning();
      if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });
      return c.json({ success: true, data: { message: msg, aiReply: { content: alreadyAssignedMsg }, transferred: true, alreadyAssigned: true } });
    }

    // Preload KB ids once for FAQ / AI retrieval
    const orgKbs = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.orgId, org.id))
      .limit(5);
    const kbIds = orgKbs.map((k) => k.id);
    const primaryKbId = kbIds[0];

    // Check FAQ match first (exact/case-insensitive exact/fuzzy contains)
    const trimmedContent = parsed.data.content.trim();
    if (trimmedContent.length >= 2 && kbIds.length > 0) {
        const escaped = escapeLike(trimmedContent);
        const fuzzyPattern = `%${escaped}%`;
        const [faqMatch] = await db.select({ answer: faqs.answer, id: faqs.id })
          .from(faqs)
          .where(and(
            inArray(faqs.kbId, kbIds),
            eq(faqs.isActive, true),
            or(
              eq(faqs.question, trimmedContent),
              ilike(faqs.question, trimmedContent),
              ilike(faqs.question, fuzzyPattern)
            )
          ))
          .orderBy(
            sql`case when ${faqs.question} = ${trimmedContent} then 0 when ${faqs.question} ilike ${trimmedContent} then 1 else 2 end`,
            desc(faqs.useCount),
          )
          .limit(1);
        if (faqMatch) {
          db.update(faqs).set({ useCount: sql`${faqs.useCount} + 1` }).where(eq(faqs.id, faqMatch.id)).execute().catch(() => {});
          const [faqMsg] = await db.insert(messages).values({
            conversationId: sessionId,
            content: faqMatch.answer,
            contentType: 'text',
            senderType: 'agent',
            aiGenerated: true,
          }).returning();
          await db.update(conversations).set({
            messageCount: newCount + 1,
            lastMessageAt: new Date(),
            lastMessagePreview: faqMatch.answer.length > 100 ? faqMatch.answer.slice(0, 100) + '...' : faqMatch.answer,
          }).where(eq(conversations.id, sessionId));
          if (io) emitMessageNew(io, sessionId, { content: faqMsg.content, senderType: 'agent', messageId: faqMsg.id });
          return c.json({ success: true, data: { message: msg, aiReply: { content: faqMatch.answer } } });
        }
    }

    // Check auto-reply rules before AI
    const autoReply = await checkAutoReplyRules(org.id, parsed.data.content);
    if (autoReply) {
      const [autoMsg] = await db.insert(messages).values({
        conversationId: sessionId,
        content: autoReply.content,
        contentType: 'text',
        senderType: 'system',
      }).returning();

      await db.update(conversations).set({
        messageCount: newCount + 1,
        lastMessageAt: new Date(),
        lastMessagePreview: autoReply.content.length > 100 ? autoReply.content.slice(0, 100) + '...' : autoReply.content,
      }).where(eq(conversations.id, sessionId));

      if (io) emitMessageNew(io, sessionId, { content: autoMsg.content, senderType: 'system', messageId: autoMsg.id });
      return c.json({ success: true, data: { message: msg, aiReply: { content: autoReply.content }, autoReply: true } });
    }

    // Auto AI reply if enabled
    let aiReply: string | null = null;
    if (conv.aiEnabled && process.env.DEEPSEEK_API_KEY) {
      try {
        const historyMsgs = await db
          .select({ content: messages.content, senderType: messages.senderType, contentType: messages.contentType, mediaUrl: messages.mediaUrl, metadata: messages.metadata })
          .from(messages)
          .where(eq(messages.conversationId, sessionId))
          .orderBy(desc(messages.createdAt))
          .limit(10);

        const baseUrl = process.env.API_URL || 'http://localhost:4000';
        const resolveMediaUrl = (url: string) => url.startsWith('http') ? url : `${baseUrl}${url}`;

        const history = historyMsgs.reverse().map((m) => {
          const msg: { role: 'user' | 'assistant'; content: string; imageUrls?: string[] } = {
            role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
            content: m.content,
          };
          if (m.senderType === 'customer' && m.mediaUrl) {
            if (m.contentType === 'image') {
              msg.imageUrls = [resolveMediaUrl(m.mediaUrl)];
              if (!m.content || m.content === '[图片]') {
                msg.content = '请查看这张图片并描述你看到的内容。';
              }
            } else if (m.contentType === 'video') {
              const thumbUrl = (m.metadata as Record<string, unknown>)?.thumbnailUrl as string | undefined;
              if (thumbUrl) {
                msg.imageUrls = [resolveMediaUrl(thumbUrl)];
                msg.content = (m.content && m.content !== '[视频]') ? `用户发送了一个视频，这是视频截图。用户说：${m.content}` : '用户发送了一个视频，这是视频的截图，请描述你看到的内容并给出回复。';
              } else {
                msg.content = (m.content && m.content !== '[视频]') ? `用户发送了一个视频。用户说：${m.content}` : '用户发送了一个视频文件，请提示用户描述视频内容以便提供帮助。';
              }
            }
          }
          return msg;
        });

        let knowledgeContext: string | undefined;
        if (primaryKbId) {
          const keywords = parsed.data.content.replace(/[?？!！。，,.、\s]+/g, ' ').trim().split(/\s+/).filter((w: string) => w.length >= 2).slice(0, 3);
          if (keywords.length > 0) {
            const chunks = await db
              .select({ content: documentChunks.content })
              .from(documentChunks)
              .innerJoin(documents, eq(documents.id, documentChunks.documentId))
              .where(and(eq(documents.kbId, primaryKbId), or(...keywords.map((kw: string) => ilike(documentChunks.content, `%${escapeLike(kw)}%`)))))
              .limit(3);
            if (chunks.length > 0) knowledgeContext = chunks.map((c: { content: string }) => c.content).join('\n\n');
          }
        }

        const reply = await generateReply(history, knowledgeContext);
        if (reply) {
          const [aiMsg] = await db.insert(messages).values({
            conversationId: sessionId, content: reply, contentType: 'text', senderType: 'agent', aiGenerated: true,
          }).returning();

          await db.update(conversations).set({
            messageCount: newCount + 1, lastMessageAt: new Date(),
            lastMessagePreview: reply.length > 100 ? reply.slice(0, 100) + '...' : reply,
            firstResponseAt: conv.firstResponseAt ?? new Date(),
          }).where(eq(conversations.id, sessionId));

          if (io) emitMessageNew(io, sessionId, { content: reply, senderType: 'agent', messageId: aiMsg.id });
          aiReply = reply;
        }
      } catch (aiErr) {
        console.error('[widget/ai-reply]', aiErr);
      }
    }

    if (!aiReply && conv.aiEnabled && !conv.agentId) {
      const isMediaMessage = ['image', 'video', 'file'].includes(parsed.data.contentType ?? '');
      let fallbackReply = '已收到您的问题，当前自动回复繁忙，请稍后再试或点击“转人工客服”。';
      let transferred = false;
      let queued = false;
      let offline = false;

      if (isMediaMessage) {
        const online = isWithinWorkingHours(org.settings);
        if (!online) {
          offline = true;
          fallbackReply = '已收到您上传的文件，当前为非工作时间。请留下联系方式，我们将在工作时间优先处理。';
        } else {
          const agentId = await assignAgentRoundRobin(org.id);
          if (agentId) {
            transferred = true;
            fallbackReply = '已收到您上传的文件，已优先转给人工客服，请稍候...';
            await db.update(conversations).set({ agentId, aiEnabled: false }).where(eq(conversations.id, sessionId));
          } else {
            queued = true;
            fallbackReply = '已收到您上传的文件，当前人工客服繁忙，已进入优先队列，我们会尽快处理。';
          }
        }
      }

      const [fallbackMsg] = await db.insert(messages).values({
        conversationId: sessionId,
        content: fallbackReply,
        contentType: 'text',
        senderType: 'system',
        aiGenerated: true,
      }).returning();
      await db.update(conversations).set({
        messageCount: newCount + 1,
        lastMessageAt: new Date(),
        lastMessagePreview: fallbackReply,
      }).where(eq(conversations.id, sessionId));
      if (io) emitMessageNew(io, sessionId, { content: fallbackReply, senderType: 'system', messageId: fallbackMsg.id });
      return c.json({
        success: true,
        data: {
          message: msg,
          aiReply: { content: fallbackReply },
          transferred,
          queued,
          offline,
        },
      });
    }

    // Safety net: if AI is disabled and no agent is assigned,
    // still return a system acknowledgement to avoid "no reply" UX.
    if (!aiReply && !conv.agentId) {
      const ackReply = '已收到您的问题，我们会尽快安排客服处理。您也可以点击“转人工客服”获得更快响应。';
      const [ackMsg] = await db.insert(messages).values({
        conversationId: sessionId,
        content: ackReply,
        contentType: 'text',
        senderType: 'system',
      }).returning();
      await db.update(conversations).set({
        messageCount: newCount + 1,
        lastMessageAt: new Date(),
        lastMessagePreview: ackReply,
      }).where(eq(conversations.id, sessionId));
      if (io) emitMessageNew(io, sessionId, { content: ackReply, senderType: 'system', messageId: ackMsg.id });
      aiReply = ackReply;
    }

    return c.json({ success: true, data: { message: msg, aiReply: aiReply ? { content: aiReply } : null } });
  } catch (e) {
    console.error('[widget/send]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/rate/:sessionId — visitor rates the conversation
app.post('/rate/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();
    const parsed = ratingSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid params' }, 400);

    const org = await resolveOrg(parsed.data.siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const [conv] = await db
      .select({ id: conversations.id, satisfactionScore: conversations.satisfactionScore })
      .from(conversations)
      .where(and(eq(conversations.id, sessionId), eq(conversations.orgId, org.id)))
      .limit(1);
    if (!conv) return c.json({ success: false, error: 'Session not found' }, 404);
    if (conv.satisfactionScore !== null) return c.json({ success: false, error: 'Already rated' }, 409);

    await db.update(conversations).set({
      satisfactionScore: parsed.data.score,
      satisfactionComment: parsed.data.comment ?? null,
    }).where(eq(conversations.id, sessionId));

    return c.json({ success: true });
  } catch (e) {
    console.error('[widget/rate]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/request-human/:sessionId — visitor explicitly requests human agent
app.post('/request-human/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();
    const siteToken = body?.siteToken;
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, sessionId), eq(conversations.orgId, org.id))).limit(1);
    if (!conv) return c.json({ success: false, error: 'Session not found' }, 404);

    const online = isWithinWorkingHours(org.settings);
    if (!online) {
      const offMsg = getOfflineMessage(org.settings);
      const [sysMsg] = await db.insert(messages).values({
        conversationId: sessionId,
        content: offMsg,
        contentType: 'text',
        senderType: 'system',
      }).returning();
      const io = getIO();
      if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });
      return c.json({ success: true, data: { message: sysMsg, offline: true } });
    }

    const agentId = await assignAgentRoundRobin(org.id);
    if (!agentId) return c.json({ success: false, error: '暂无可用客服，请稍后再试' }, 503);

    await db.update(conversations).set({ agentId, aiEnabled: false }).where(eq(conversations.id, sessionId));

    const [sysMsg] = await db.insert(messages).values({
      conversationId: sessionId,
      content: '已为您转接人工客服，请稍候...',
      contentType: 'text',
      senderType: 'system',
    }).returning();

    const io = getIO();
    if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });

    return c.json({ success: true, data: { message: sysMsg } });
  } catch (e) {
    console.error('[widget/request-human]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/leave-message/:sessionId — visitor leaves consultation info when offline
app.post('/leave-message/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();
    const siteToken = body?.siteToken;
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);

    const parsed = z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      content: z.string().min(1, '请填写咨询内容'),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues[0]?.message ?? '参数无效' }, 400);

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, sessionId), eq(conversations.orgId, org.id))).limit(1);
    if (!conv) return c.json({ success: false, error: 'Session not found' }, 404);

    const [record] = await db.insert(offlineConsultations).values({
      orgId: org.id,
      conversationId: conv.id,
      name: parsed.data.name || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      content: parsed.data.content,
    }).returning();

    const [sysMsg] = await db.insert(messages).values({
      conversationId: sessionId,
      content: `📋 已收到您的咨询信息，我们将在工作时间内尽快与您联系。`,
      contentType: 'text',
      senderType: 'system',
    }).returning();

    const io = getIO();
    if (io) emitMessageNew(io, sessionId, { content: sysMsg.content, senderType: 'system', messageId: sysMsg.id });

    return c.json({ success: true, data: { record, message: sysMsg } });
  } catch (e) {
    console.error('[widget/leave-message]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/public-ticket — submit user ticket / platform error report (no auth)
app.post('/public-ticket', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkWidgetRate(clientIp, 20)) {
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
    }

    const body = await c.req.json();
    const parsed = publicTicketSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid params' }, 400);

    const org = await resolveOrg(parsed.data.siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const contactLines = [
      parsed.data.contactName ? `联系人：${parsed.data.contactName}` : '',
      parsed.data.contactPhone ? `联系电话：${parsed.data.contactPhone}` : '',
      parsed.data.contactEmail ? `联系邮箱：${parsed.data.contactEmail}` : '',
      parsed.data.pageUrl ? `页面：${parsed.data.pageUrl}` : '',
      parsed.data.browserInfo ? `浏览器：${parsed.data.browserInfo}` : '',
      parsed.data.errorCode ? `错误码：${parsed.data.errorCode}` : '',
    ].filter(Boolean);

    const reportType = parsed.data.category === 'platform_error' ? '平台错误上报' : '用户工单';
    const details = [
      parsed.data.description.trim(),
      parsed.data.errorDetail ? '\n\n错误详情：\n' + parsed.data.errorDetail.trim() : '',
      contactLines.length > 0 ? '\n\n----\n' + contactLines.join('\n') : '',
      `\n\n来源：官网工单中心（${reportType}）`,
    ].join('');

    const [ticket] = await db.insert(tickets).values({
      orgId: org.id,
      title: parsed.data.title.trim(),
      description: details,
      type: parsed.data.category === 'platform_error' ? 'platform_error' : 'user_ticket',
      status: 'open',
      priority: parsed.data.priority || (parsed.data.category === 'platform_error' ? 'high' : 'medium'),
      attachments: parsed.data.attachments ?? [],
    }).returning({ id: tickets.id });

    if (!ticket) return c.json({ success: false, error: 'Create ticket failed' }, 500);
    // Compatibility fallback: some environments may not include new jsonb field
    // in ORM-generated insert SQL during hot-reload windows. Force-sync once.
    if (parsed.data.attachments && parsed.data.attachments.length > 0) {
      await db.execute(
        sql`update tickets set attachments = ${JSON.stringify(parsed.data.attachments)}::jsonb where id = ${ticket.id}`
      ).catch(() => {});
    }
    const ticketNo = String(ticket.id).slice(0, 8).toUpperCase();

    return c.json({
      success: true,
      data: {
        ticketId: ticket.id,
        ticketNo,
      },
    });
  } catch (e) {
    console.error('[widget/public-ticket]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// GET /widget/public-ticket-status — query public ticket status by ticketNo (no auth)
app.get('/public-ticket-status', async (c) => {
  try {
    const siteToken = c.req.query('siteToken');
    const ticketNoRaw = c.req.query('ticketNo');
    if (!siteToken || !ticketNoRaw) {
      return c.json({ success: false, error: 'Missing params' }, 400);
    }

    const ticketNo = String(ticketNoRaw).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(ticketNo)) {
      return c.json({ success: false, error: 'Invalid ticketNo' }, 400);
    }

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const [ticket] = await db
      .select({
        id: tickets.id,
        status: tickets.status,
        priority: tickets.priority,
        type: tickets.type,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(and(
        eq(tickets.orgId, org.id),
        sql`upper(substr(${tickets.id}::text, 1, 8)) = ${ticketNo}`,
      ))
      .limit(1);

    if (!ticket) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const normalizedStatus =
      ticket.status === 'in_progress'
        ? 'processing'
        : ticket.status === 'pending'
          ? 'waiting_user'
          : ticket.status;

    return c.json({
      success: true,
      data: {
        ticketNo,
        status: normalizedStatus,
        priority: ticket.priority,
        type: ticket.type,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    });
  } catch (e) {
    console.error('[widget/public-ticket-status]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/public-ticket-feedback — append customer feedback for a public ticket
app.post('/public-ticket-feedback', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkWidgetRate(clientIp, 30)) {
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
    }

    const body = await c.req.json();
    const parsed = publicTicketFeedbackSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid params' }, 400);

    const org = await resolveOrg(parsed.data.siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const ticketNo = String(parsed.data.ticketNo).trim().toUpperCase();
    const [ticket] = await db
      .select({ id: tickets.id, status: tickets.status })
      .from(tickets)
      .where(and(
        eq(tickets.orgId, org.id),
        sql`upper(substr(${tickets.id}::text, 1, 8)) = ${ticketNo}`,
      ))
      .limit(1);
    if (!ticket) return c.json({ success: false, error: 'Ticket not found' }, 404);

    const attachmentLines = (parsed.data.attachments ?? []).map((a, idx) => `${idx + 1}. ${a.name} (${a.url})`);
    const feedbackText = [
      `【用户补充反馈】`,
      parsed.data.content.trim(),
      attachmentLines.length > 0 ? `\n附件：\n${attachmentLines.join('\n')}` : '',
    ].join('\n');

    await db.insert(ticketComments).values({
      ticketId: ticket.id,
      authorId: null,
      content: feedbackText,
      isInternal: false,
      attachments: parsed.data.attachments ?? [],
    });

    // If user sends new feedback after done/waiting state, move it back to processing.
    if (['resolved', 'closed', 'waiting_user', 'pending'].includes(ticket.status)) {
      await db.update(tickets).set({
        status: 'processing',
        resolvedAt: null,
        closedAt: null,
        updatedAt: new Date(),
      }).where(eq(tickets.id, ticket.id));
    } else {
      await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
    }

    return c.json({ success: true, data: { ticketNo } });
  } catch (e) {
    console.error('[widget/public-ticket-feedback]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/track-page — record a page view event for visitor session
app.post('/track-page', async (c) => {
  try {
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!checkWidgetRate(clientIp, 120)) {
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
    }
    const body = await c.req.json();
    const parsed = z.object({
      siteToken: z.string().min(1),
      sessionId: z.string().min(1),
      pageUrl: z.string().min(1),
      pageTitle: z.string().optional(),
      referrer: z.string().optional(),
      duration: z.number().int().min(0).optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid params' }, 400);

    const org = await resolveOrg(parsed.data.siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid site token' }, 403);

    await db.insert(pageViews).values({
      sessionId: parsed.data.sessionId,
      orgId: org.id,
      pageUrl: parsed.data.pageUrl,
      pageTitle: parsed.data.pageTitle ?? null,
      referrer: parsed.data.referrer ?? null,
      duration: parsed.data.duration ?? null,
    });

    await db.update(visitorSessions).set({
      currentPage: parsed.data.pageUrl,
      currentPageTitle: parsed.data.pageTitle ?? null,
      lastActiveAt: new Date(),
      pageViews: sql`${visitorSessions.pageViews} + 1`,
    }).where(and(
      eq(visitorSessions.id, parsed.data.sessionId),
      eq(visitorSessions.orgId, org.id),
    )).catch(() => {});

    return c.json({ success: true });
  } catch (e) {
    console.error('[widget/track-page]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// GET /widget/proactive-rules — fetch active proactive chat rules for a siteToken (public)
app.get('/proactive-rules', async (c) => {
  try {
    const siteToken = c.req.query('siteToken');
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const rules = await db.select().from(proactiveChatRules)
      .where(and(eq(proactiveChatRules.orgId, org.id), eq(proactiveChatRules.isActive, true)))
      .orderBy(proactiveChatRules.createdAt);

    return c.json({
      success: true,
      data: rules.map((r) => ({
        id: r.id,
        triggerType: r.triggerType,
        triggerConfig: r.triggerConfig,
        message: r.message,
        displayDelay: r.displayDelay,
        maxShowCount: r.maxShowCount,
      })),
    });
  } catch (e) {
    console.error('[widget/proactive-rules]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// GET /widget/faqs — public FAQ list for widget sidebar
app.get('/faqs', async (c) => {
  try {
    const siteToken = c.req.query('siteToken');
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);
    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const kbs = await db.select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.orgId, org.id))
      .limit(5);

    if (kbs.length === 0) return c.json({ success: true, data: [] });

    const kbIds = kbs.map(k => k.id);
    const faqList = await db.select({
      id: faqs.id,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
    })
      .from(faqs)
      .where(and(inArray(faqs.kbId, kbIds), eq(faqs.isActive, true)))
      .orderBy(desc(faqs.useCount))
      .limit(20);

    return c.json({ success: true, data: faqList });
  } catch (e) {
    console.error('[widget/faqs]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// GET /widget/smart-prompts — generate low-friction suggested questions
app.get('/smart-prompts', async (c) => {
  try {
    const siteToken = c.req.query('siteToken');
    const sessionId = c.req.query('sessionId');
    const pageUrl = c.req.query('pageUrl') || '';
    if (!siteToken) return c.json({ success: false, error: 'Missing siteToken' }, 400);

    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const suggestions: Array<{ text: string; source: 'page' | 'faq' | 'history' }> = [];
    const pushUnique = (text: string, source: 'page' | 'faq' | 'history') => {
      const normalized = text.trim();
      if (!normalized) return;
      if (suggestions.some((s) => s.text === normalized)) return;
      suggestions.push({ text: normalized, source });
    };

    const lowerUrl = pageUrl.toLowerCase();
    if (lowerUrl.includes('pricing') || lowerUrl.includes('price') || lowerUrl.includes('plan') || lowerUrl.includes('定价')) {
      pushUnique('你们套餐有什么区别，怎么选更划算？', 'page');
      pushUnique('我现在的团队规模，推荐哪个方案？', 'page');
    } else if (lowerUrl.includes('feature') || lowerUrl.includes('product') || lowerUrl.includes('功能')) {
      pushUnique('能否按我们的业务流程演示一次？', 'page');
      pushUnique('支持哪些自动化能力，能减少哪些人工步骤？', 'page');
    } else {
      pushUnique('我想快速上线客服组件，具体要怎么做？', 'page');
      pushUnique('如果我要转人工客服，支持哪些策略？', 'page');
    }

    const kbs = await db.select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.orgId, org.id))
      .limit(5);

    if (kbs.length > 0) {
      const kbIds = kbs.map((k) => k.id);
      const faqList = await db.select({
        question: faqs.question,
      })
        .from(faqs)
        .where(and(inArray(faqs.kbId, kbIds), eq(faqs.isActive, true)))
        .orderBy(desc(faqs.useCount), asc(faqs.createdAt))
        .limit(30);

      if (sessionId) {
        const [lastCustomerMsg] = await db
          .select({ content: messages.content })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(and(
            eq(messages.conversationId, sessionId),
            eq(messages.senderType, 'customer'),
            eq(conversations.orgId, org.id),
          ))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        if (lastCustomerMsg?.content) {
          const keywords = extractIntentKeywords(lastCustomerMsg.content);
          if (keywords.length > 0) {
            const matched = faqList
              .filter((f) => keywords.some((kw) => f.question.toLowerCase().includes(kw)))
              .slice(0, 3);
            for (const m of matched) pushUnique(m.question, 'history');
          }
        }
      }

      for (const faq of faqList.slice(0, 4)) {
        pushUnique(faq.question, 'faq');
      }
    }

    return c.json({ success: true, data: suggestions.slice(0, 6) });
  } catch (e) {
    console.error('[widget/smart-prompts]', e);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// POST /widget/upload — public file upload for widget visitors
app.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file provided' }, 400);
    }
    const f = file as File;
    const videoExts = new Set(['mp4', 'webm', 'mov']);
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const isVideo = videoExts.has(ext) || f.type.startsWith('video/');
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (f.size > maxSize) {
      return c.json({ success: false, error: isVideo ? 'Video too large (max 50MB)' : 'File too large (max 10MB)' }, 400);
    }
    const allowedExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'zip', 'mp4', 'webm', 'mov']);
    if (!allowedExts.has(ext)) {
      return c.json({ success: false, error: 'File type not allowed' }, 400);
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    const filename = `${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploadDir = './uploads/messages';
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(`${uploadDir}/${filename}`, buffer);
    return c.json({
      success: true,
      data: { url: `/uploads/messages/${filename}`, name: f.name },
    });
  } catch (e) {
    console.error('[widget/upload]', e);
    return c.json({ success: false, error: 'Upload failed' }, 500);
  }
});

// GET /widget/config — public widget appearance config
app.get('/config', async (c) => {
  try {
    const siteToken = c.req.query('token');
    if (!siteToken) return c.json({ success: false, error: 'Missing token' }, 400);
    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);
    const wc = (org as any).widgetConfig ?? {};
    return c.json({
      success: true,
      data: {
        themeColor: wc.themeColor ?? '#7c3aed',
        position: wc.position ?? 'bottom-right',
        greeting: wc.greeting ?? '您好！有什么可以帮您的吗？',
        offlineGreeting: wc.offlineGreeting ?? '当前非工作时间，请留言我们会尽快回复您',
        logoUrl: wc.logoUrl ?? org.logoUrl,
        companyName: wc.companyName ?? org.name,
        preChatFormEnabled: wc.preChatFormEnabled ?? false,
        preChatFormFields: wc.preChatFormFields ?? [
          { field: 'name', label: '姓名', required: true, type: 'text' },
          { field: 'phone', label: '手机号', required: false, type: 'tel' },
          { field: 'email', label: '邮箱', required: false, type: 'email' },
        ],
        postChatSurveyEnabled: wc.postChatSurveyEnabled ?? true,
        showAgentAvatar: wc.showAgentAvatar ?? true,
        showAgentName: wc.showAgentName ?? true,
        autoPopupDelay: wc.autoPopupDelay ?? 0,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// GET /widget/queue-position — check queue position for a conversation
app.get('/queue-position', async (c) => {
  try {
    const sessionId = c.req.query('sessionId');
    const siteToken = c.req.query('token');
    if (!sessionId || !siteToken) return c.json({ success: false, error: 'Missing params' }, 400);
    const org = await resolveOrg(siteToken);
    if (!org) return c.json({ success: false, error: 'Invalid token' }, 403);

    const [conv] = await db.select({
      id: conversations.id,
      agentId: conversations.agentId,
      status: conversations.status,
      queuePosition: conversations.queuePosition,
      queueEnteredAt: conversations.queueEnteredAt,
      createdAt: conversations.createdAt,
    }).from(conversations)
      .where(and(eq(conversations.id, sessionId), eq(conversations.orgId, org.id)))
      .limit(1);

    if (!conv) return c.json({ success: false, error: 'Session not found' }, 404);

    if (conv.agentId) {
      return c.json({ success: true, data: { inQueue: false, position: 0 } });
    }

    const pendingCount = await db.select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(
        eq(conversations.orgId, org.id),
        eq(conversations.status, 'pending'),
        sql`${conversations.agentId} IS NULL`,
        sql`${conversations.createdAt} < ${conv.queueEnteredAt ?? conv.createdAt}`,
      ));

    const position = (pendingCount[0]?.count ?? 0) + 1;
    return c.json({ success: true, data: { inQueue: true, position } });
  } catch (e) {
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

export default app;
