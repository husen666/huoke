import { Hono } from 'hono';
import { eq, sql, and, gte, lte, isNotNull, or, lt } from 'drizzle-orm';
import { db } from '../db/connection';
import { leads, customers, conversations, deals, channels, campaigns, messages, users, visitorSessions, tickets, conversationInspections } from '../db/schema';
import { config } from '../config/env';
import { getErrorMessage } from '../utils/helpers';

const app = new Hono();

// GET /analytics/overview
app.get('/overview', async (c) => {
  try {
    const { orgId } = c.get('user');

    const [leadRes, customerRes, conversationRes, dealAmountRes, channelRes, dealCountRes, campaignRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.orgId, orgId)),
      db.select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` }).from(deals).where(eq(deals.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(channels).where(eq(channels.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(deals).where(eq(deals.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(eq(campaigns.orgId, orgId)),
    ]);

    return c.json({
      success: true,
      data: {
        leadCount: leadRes[0]?.count ?? 0,
        customerCount: customerRes[0]?.count ?? 0,
        conversationCount: conversationRes[0]?.count ?? 0,
        dealAmountTotal: dealAmountRes[0]?.total ?? '0',
        dealCount: dealCountRes[0]?.count ?? 0,
        campaignCount: campaignRes[0]?.count ?? 0,
        channelCount: channelRes[0]?.count ?? 0,
      },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Overview failed') },
      500
    );
  }
});

// GET /analytics/leads
app.get('/leads', async (c) => {
  try {
    const { orgId } = c.get('user');
    const fromDate = c.req.query('from');
    const toDate = c.req.query('to');

    const conditions = [eq(leads.orgId, orgId)];
    if (fromDate) conditions.push(gte(leads.createdAt, new Date(fromDate)));
    if (toDate) conditions.push(lte(leads.createdAt, new Date(toDate)));

    const [byStatus, bySource] = await Promise.all([
      db.select({ status: leads.status, count: sql<number>`count(*)::int` })
        .from(leads)
        .where(and(...conditions))
        .groupBy(leads.status),
      db.select({ sourcePlatform: leads.sourcePlatform, count: sql<number>`count(*)::int` })
        .from(leads)
        .where(and(...conditions))
        .groupBy(leads.sourcePlatform),
    ]);

    return c.json({
      success: true,
      data: { byStatus, bySource },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Lead analytics failed') },
      500
    );
  }
});

// POST /analytics/ai-insights - generate AI insights from current data
app.post('/ai-insights', async (c) => {
  let leadCount = 0;
  let customerCount = 0;
  let conversationCount = 0;

  try {
    const user = c.get('user') as { orgId?: string } | undefined;
    const orgId = user?.orgId;
    if (!orgId) {
      return c.json({ success: true, data: { insights: ['· 请重新登录后再试。'], source: 'fallback' } });
    }

    let byStatus: { status: string | null; count: number }[] = [];
    let bySource: { sourcePlatform: string | null; count: number }[] = [];

    try {
      const [leadRes, customerRes, conversationRes, statusRes, sourceRes] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId)),
        db.select({ count: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, orgId)),
        db.select({ count: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.orgId, orgId)),
        db.select({ status: leads.status, count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId)).groupBy(leads.status),
        db.select({ sourcePlatform: leads.sourcePlatform, count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId)).groupBy(leads.sourcePlatform),
      ]);
      leadCount = leadRes[0]?.count ?? 0;
      customerCount = customerRes[0]?.count ?? 0;
      conversationCount = conversationRes[0]?.count ?? 0;
      byStatus = statusRes;
      bySource = sourceRes;
    } catch {
      // DB query failed — continue with zero counts and return fallback insights
    }

    const dataContext = JSON.stringify({
      leadCount,
      customerCount,
      conversationCount,
      leadsByStatus: byStatus,
      leadsBySource: bySource,
    });

    let insights: string[] = [];
    let source: 'ai' | 'fallback' = 'fallback';
    if (config.DEEPSEEK_API_KEY) {
      try {
        const { chatCompletion } = await import('../ai/deepseek');
        const aiPromise = chatCompletion([
          {
            role: 'system',
            content: '你是一个营销数据分析专家。基于以下业务数据，给出3-5条简洁实用的中文洞察建议。每条一行，以"·"开头。不要有多余格式。',
          },
          { role: 'user', content: dataContext },
        ]);
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
        const res = await Promise.race([aiPromise, timeout]);
        if (res) {
          insights = res.split('\n').map((l) => l.trim()).filter(Boolean);
          if (insights.length > 0) source = 'ai';
        }
      } catch { /* fallback below */ }
    }
    if (insights.length === 0) {
      insights = [
        `· 当前共有 ${leadCount} 条线索，${customerCount} 个客户，${conversationCount} 条会话。`,
        byStatus.length > 0 ? `· 线索状态分布: ${byStatus.map(s => `${s.status ?? '未知'} ${s.count}`).join('、')}。` : '',
        bySource.length > 0 ? `· 线索来源分布: ${bySource.map(s => `${s.sourcePlatform ?? '未知'} ${s.count}`).join('、')}。` : '',
        '· 建议持续优化高转化渠道，对低活跃线索进行自动化培育。',
        '· 关注客户会话响应速度，提升客户满意度。',
      ].filter(Boolean);
    }

    return c.json({ success: true, data: { insights, source } });
  } catch (e) {
    console.error('[ai-insights] error:', e);
    return c.json({
      success: true,
      data: {
        insights: [
          `· 当前共有 ${leadCount} 条线索。`,
          '· 建议持续优化高转化渠道，对低活跃线索进行自动化培育。',
          '· 关注客户会话响应速度，提升客户满意度。',
        ],
        source: 'fallback',
      },
    });
  }
});

// GET /analytics/channels
app.get('/channels', async (c) => {
  try {
    const { orgId } = c.get('user');

    const list = await db
      .select({
        id: channels.id,
        name: channels.name,
        platform: channels.platform,
        status: channels.status,
        stats: channels.stats,
      })
      .from(channels)
      .where(eq(channels.orgId, orgId));

    return c.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Channel analytics failed') },
      500
    );
  }
});

// GET /analytics/service — customer service statistics
app.get('/service', async (c) => {
  try {
    const { orgId } = c.get('user');
    const from = c.req.query('from');
    const to = c.req.query('to');

    const conditions = [eq(conversations.orgId, orgId)];
    if (from) conditions.push(gte(conversations.createdAt, new Date(from)));
    if (to) conditions.push(lte(conversations.createdAt, new Date(to)));

    const [
      [totalConvs],
      byStatus,
      [avgSatisfaction],
      [avgMessages],
      [totalMessages],
      byChannel,
      byPriority,
      agentStats,
      dailyTrend,
      satisfactionDist,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(conversations).where(and(...conditions)),
      db.select({ status: conversations.status, count: sql<number>`count(*)::int` }).from(conversations).where(and(...conditions)).groupBy(conversations.status),
      db.select({ avg: sql<string>`coalesce(round(avg(satisfaction_score)::numeric, 2), 0)` }).from(conversations).where(and(...conditions, sql`satisfaction_score is not null`)),
      db.select({ avg: sql<string>`coalesce(round(avg(message_count)::numeric, 1), 0)` }).from(conversations).where(and(...conditions)),
      db.select({ count: sql<number>`count(*)::int` }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(and(...conditions)),
      db.select({ channelType: conversations.channelType, count: sql<number>`count(*)::int` }).from(conversations).where(and(...conditions)).groupBy(conversations.channelType),
      db.select({ priority: conversations.priority, count: sql<number>`count(*)::int` }).from(conversations).where(and(...conditions)).groupBy(conversations.priority),
      db.select({
        agentId: conversations.agentId,
        agentName: users.name,
        total: sql<number>`count(*)::int`,
        resolved: sql<number>`count(*) filter (where ${conversations.status} = 'resolved')::int`,
        avgSatisfaction: sql<string>`coalesce(round(avg(${conversations.satisfactionScore})::numeric, 2), 0)`,
      }).from(conversations).leftJoin(users, eq(conversations.agentId, users.id)).where(and(...conditions, sql`${conversations.agentId} is not null`)).groupBy(conversations.agentId, users.name),
      db.select({
        date: sql<string>`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
        resolved: sql<number>`count(*) filter (where ${conversations.status} = 'resolved')::int`,
      }).from(conversations).where(and(eq(conversations.orgId, orgId), gte(conversations.createdAt, sql`now() - interval '30 days'`))).groupBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`).orderBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`),
      db.select({ score: conversations.satisfactionScore, count: sql<number>`count(*)::int` }).from(conversations).where(and(...conditions, sql`satisfaction_score is not null`)).groupBy(conversations.satisfactionScore).orderBy(conversations.satisfactionScore),
    ]);

    return c.json({
      success: true,
      data: {
        totalConversations: totalConvs?.count ?? 0,
        byStatus,
        avgSatisfaction: parseFloat(avgSatisfaction?.avg ?? '0'),
        avgMessagesPerConv: parseFloat(avgMessages?.avg ?? '0'),
        totalMessages: totalMessages?.count ?? 0,
        byChannel,
        byPriority,
        agentStats,
        dailyTrend,
        satisfactionDistribution: satisfactionDist,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Service analytics failed') }, 500);
  }
});

// GET /analytics/sla — ticket SLA dashboard metrics
app.get('/sla', async (c) => {
  try {
    const { orgId } = c.get('user');
    const now = new Date();
    const nearDeadline = new Date(now.getTime() + 4 * 60 * 60 * 1000); // next 4h
    const activeStatusCond = or(
      eq(tickets.status, 'open'),
      eq(tickets.status, 'processing'),
      eq(tickets.status, 'waiting_user'),
      eq(tickets.status, 'in_progress'),
      eq(tickets.status, 'pending')
    )!;

    const [
      [totalActive],
      [overdue],
      [nearDue],
      [resolvedCount],
      [closedCount],
      byPriority,
      byAssignee,
      dailyTrend,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), activeStatusCond)),

      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), activeStatusCond, lt(tickets.slaResolveDueAt, now))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), activeStatusCond, gte(tickets.slaResolveDueAt, now), lte(tickets.slaResolveDueAt, nearDeadline))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.status, 'resolved'))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.status, 'closed'))),

      db.select({
        priority: tickets.priority,
        count: sql<number>`count(*)::int`,
      })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), activeStatusCond))
        .groupBy(tickets.priority),

      db.select({
        assigneeId: tickets.assigneeId,
        assigneeName: users.name,
        total: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${tickets.slaResolveDueAt} < now())::int`,
      })
        .from(tickets)
        .leftJoin(users, eq(tickets.assigneeId, users.id))
        .where(and(eq(tickets.orgId, orgId), activeStatusCond))
        .groupBy(tickets.assigneeId, users.name),

      db.select({
        date: sql<string>`to_char(${tickets.createdAt}, 'YYYY-MM-DD')`,
        created: sql<number>`count(*)::int`,
        resolved: sql<number>`count(*) filter (where ${tickets.status} in ('resolved','closed'))::int`,
      })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), gte(tickets.createdAt, sql`now() - interval '14 days'`)))
        .groupBy(sql`to_char(${tickets.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${tickets.createdAt}, 'YYYY-MM-DD')`),
    ]);

    return c.json({
      success: true,
      data: {
        totalActive: totalActive?.count ?? 0,
        overdue: overdue?.count ?? 0,
        nearDue: nearDue?.count ?? 0,
        resolvedCount: resolvedCount?.count ?? 0,
        closedCount: closedCount?.count ?? 0,
        byPriority,
        byAssignee: byAssignee.map((a) => ({
          assigneeId: a.assigneeId,
          assigneeName: a.assigneeName ?? '未指派',
          total: a.total,
          overdue: a.overdue,
        })),
        dailyTrend,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'SLA analytics failed') }, 500);
  }
});

// GET /analytics/quality — inspection quality dashboard metrics
app.get('/quality', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = Math.min(180, Math.max(7, parseInt(c.req.query('days') || '30')));
    const start = new Date();
    start.setDate(start.getDate() - days);

    const [
      [total],
      [avgScore],
      byGrade,
      byInspector,
      dailyTrend,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(conversationInspections)
        .where(and(eq(conversationInspections.orgId, orgId), gte(conversationInspections.createdAt, start))),

      db.select({ avg: sql<string>`coalesce(round(avg(${conversationInspections.score})::numeric, 2), 0)` })
        .from(conversationInspections)
        .where(and(eq(conversationInspections.orgId, orgId), gte(conversationInspections.createdAt, start))),

      db.select({
        grade: conversationInspections.grade,
        count: sql<number>`count(*)::int`,
      })
        .from(conversationInspections)
        .where(and(eq(conversationInspections.orgId, orgId), gte(conversationInspections.createdAt, start)))
        .groupBy(conversationInspections.grade),

      db.select({
        inspectorId: conversationInspections.inspectorId,
        inspectorName: users.name,
        total: sql<number>`count(*)::int`,
        avgScore: sql<string>`coalesce(round(avg(${conversationInspections.score})::numeric, 2), 0)`,
      })
        .from(conversationInspections)
        .leftJoin(users, eq(conversationInspections.inspectorId, users.id))
        .where(and(eq(conversationInspections.orgId, orgId), gte(conversationInspections.createdAt, start)))
        .groupBy(conversationInspections.inspectorId, users.name),

      db.select({
        date: sql<string>`to_char(${conversationInspections.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
        avgScore: sql<string>`coalesce(round(avg(${conversationInspections.score})::numeric, 2), 0)`,
      })
        .from(conversationInspections)
        .where(and(eq(conversationInspections.orgId, orgId), gte(conversationInspections.createdAt, start)))
        .groupBy(sql`to_char(${conversationInspections.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${conversationInspections.createdAt}, 'YYYY-MM-DD')`),
    ]);

    return c.json({
      success: true,
      data: {
        total: total?.count ?? 0,
        avgScore: parseFloat(avgScore?.avg ?? '0'),
        byGrade,
        byInspector: byInspector.map((r) => ({
          inspectorId: r.inspectorId,
          inspectorName: r.inspectorName ?? '未知质检员',
          total: r.total,
          avgScore: parseFloat(r.avgScore),
        })),
        dailyTrend: dailyTrend.map((d) => ({
          date: d.date,
          count: d.count,
          avgScore: parseFloat(d.avgScore),
        })),
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Quality analytics failed') }, 500);
  }
});

// GET /analytics/daily-trend
app.get('/daily-trend', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = parseInt(c.req.query('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    const [leadTrend, customerTrend, convTrend] = await Promise.all([
      db.select({
        date: sql<string>`DATE(${leads.createdAt})`,
        count: sql<number>`count(*)::int`,
      }).from(leads).where(and(eq(leads.orgId, orgId), gte(leads.createdAt, new Date(startDateStr))))
        .groupBy(sql`DATE(${leads.createdAt})`).orderBy(sql`DATE(${leads.createdAt})`),
      db.select({
        date: sql<string>`DATE(${customers.createdAt})`,
        count: sql<number>`count(*)::int`,
      }).from(customers).where(and(eq(customers.orgId, orgId), gte(customers.createdAt, new Date(startDateStr))))
        .groupBy(sql`DATE(${customers.createdAt})`).orderBy(sql`DATE(${customers.createdAt})`),
      db.select({
        date: sql<string>`DATE(${conversations.createdAt})`,
        count: sql<number>`count(*)::int`,
      }).from(conversations).where(and(eq(conversations.orgId, orgId), gte(conversations.createdAt, new Date(startDateStr))))
        .groupBy(sql`DATE(${conversations.createdAt})`).orderBy(sql`DATE(${conversations.createdAt})`),
    ]);

    return c.json({ success: true, data: { leads: leadTrend, customers: customerTrend, conversations: convTrend } });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// GET /analytics/conversion-funnel
app.get('/conversion-funnel', async (c) => {
  try {
    const { orgId } = c.get('user');
    const [visitors, leadRes, customerRes, dealRes, wonRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(visitorSessions).where(eq(visitorSessions.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(deals).where(eq(deals.orgId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(deals).where(and(eq(deals.orgId, orgId), eq(deals.stage, 'won'))),
    ]);

    return c.json({ success: true, data: {
      visitors: visitors[0]?.count ?? 0,
      leads: leadRes[0]?.count ?? 0,
      customers: customerRes[0]?.count ?? 0,
      deals: dealRes[0]?.count ?? 0,
      won: wonRes[0]?.count ?? 0,
    }});
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// GET /analytics/response-time — response time analytics with distribution buckets
app.get('/response-time', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') || '30')));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    const baseConditions = [
      eq(conversations.orgId, orgId),
      gte(conversations.createdAt, new Date(startDateStr)),
    ];

    const [
      [avgFirstResponse],
      [avgResolution],
      distribution,
      dailyTrend,
      agentStats,
    ] = await Promise.all([
      db.select({
        avgSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt}))), 0)::int`
      }).from(conversations)
        .where(and(
          ...baseConditions,
          isNotNull(conversations.firstResponseAt),
        )),

      db.select({
        avgSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(${conversations.resolvedAt}, ${conversations.closedAt}) - ${conversations.createdAt}))), 0)::int`
      }).from(conversations)
        .where(and(
          ...baseConditions,
          sql`(${conversations.resolvedAt} IS NOT NULL OR ${conversations.closedAt} IS NOT NULL)`,
        )),

      db.select({
        bucket: sql<string>`CASE 
          WHEN EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt})) < 30 THEN 'under_30s'
          WHEN EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt})) < 60 THEN '30s_1min'
          WHEN EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt})) < 300 THEN '1_5min'
          WHEN EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt})) < 900 THEN '5_15min'
          WHEN EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt})) < 1800 THEN '15_30min'
          ELSE 'over_30min'
        END`,
        count: sql<number>`count(*)::int`
      }).from(conversations)
        .where(and(
          ...baseConditions,
          isNotNull(conversations.firstResponseAt),
        ))
        .groupBy(sql`1`),

      db.select({
        date: sql<string>`TO_CHAR(${conversations.createdAt}, 'YYYY-MM-DD')`,
        avgFirstResponseSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt}))), 0)::int`,
        avgResolutionSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(${conversations.resolvedAt}, ${conversations.closedAt}) - ${conversations.createdAt}))), 0)::int`,
        count: sql<number>`count(*)::int`
      }).from(conversations)
        .where(and(
          ...baseConditions,
          isNotNull(conversations.firstResponseAt),
        ))
        .groupBy(sql`1`)
        .orderBy(sql`1`),

      db.select({
        agentId: conversations.agentId,
        agentName: users.name,
        avgFirstResponseSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${conversations.firstResponseAt} - ${conversations.createdAt}))), 0)::int`,
        avgResolutionSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(${conversations.resolvedAt}, ${conversations.closedAt}) - ${conversations.createdAt}))), 0)::int`,
        totalConversations: sql<number>`count(*)::int`,
        resolvedCount: sql<number>`count(${conversations.resolvedAt})::int`
      }).from(conversations)
        .leftJoin(users, eq(conversations.agentId, users.id))
        .where(and(
          ...baseConditions,
          sql`${conversations.agentId} IS NOT NULL`,
        ))
        .groupBy(conversations.agentId, users.name),
    ]);

    return c.json({
      success: true,
      data: {
        avgFirstResponseSeconds: avgFirstResponse?.avgSeconds ?? 0,
        avgResolutionSeconds: avgResolution?.avgSeconds ?? 0,
        distribution,
        dailyTrend,
        agentStats,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// GET /analytics/response-times
app.get('/response-times', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = parseInt(c.req.query('days') || '30');
    const slaThreshold = parseInt(c.req.query('slaThreshold') || '300'); // default 5 min
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const conditions = [eq(conversations.orgId, orgId), gte(conversations.createdAt, startDate)];

    const [
      avgFirstResponseRes,
      avgResolutionRes,
      slaRes,
      responseByHour,
      responseByAgent,
      dailyTrend,
      avgResponseRes,
    ] = await Promise.all([
      // 1. Average first response time (seconds)
      db.select({
        avg: sql<string>`coalesce(round(avg(extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt})))::numeric, 1), 0)`,
      }).from(conversations).where(and(...conditions, sql`${conversations.firstResponseAt} is not null`)),

      // 3. Average resolution time (seconds)
      db.select({
        avg: sql<string>`coalesce(round(avg(extract(epoch from (coalesce(${conversations.resolvedAt}, ${conversations.closedAt}) - ${conversations.createdAt})))::numeric, 1), 0)`,
      }).from(conversations).where(and(...conditions, sql`(${conversations.resolvedAt} is not null or ${conversations.closedAt} is not null)`)),

      // 6. SLA compliance rate
      db.select({
        total: sql<number>`count(*)::int`,
        compliant: sql<number>`count(*) filter (where extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt})) <= ${slaThreshold})::int`,
      }).from(conversations).where(and(...conditions, sql`${conversations.firstResponseAt} is not null`)),

      // 4. Response time by hour (using first response)
      db.select({
        hour: sql<number>`extract(hour from ${conversations.createdAt})::int`,
        avgSeconds: sql<string>`coalesce(round(avg(extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt})))::numeric, 1), 0)`,
        count: sql<number>`count(*)::int`,
      }).from(conversations).where(and(...conditions, sql`${conversations.firstResponseAt} is not null`))
        .groupBy(sql`extract(hour from ${conversations.createdAt})`)
        .orderBy(sql`extract(hour from ${conversations.createdAt})`),

      // 5. Response time by agent
      db.select({
        agentId: conversations.agentId,
        agentName: users.name,
        avgFirstResponse: sql<string>`coalesce(round(avg(extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt})))::numeric, 1), 0)`,
        totalConversations: sql<number>`count(*)::int`,
        resolvedCount: sql<number>`count(*) filter (where ${conversations.status} = 'resolved')::int`,
      }).from(conversations)
        .leftJoin(users, eq(conversations.agentId, users.id))
        .where(and(...conditions, sql`${conversations.agentId} is not null`))
        .groupBy(conversations.agentId, users.name),

      // 7. Daily response time trend
      db.select({
        date: sql<string>`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`,
        avgFirstResponse: sql<string>`coalesce(round(avg(extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt})))::numeric, 1), 0)`,
        count: sql<number>`count(*)::int`,
      }).from(conversations).where(and(...conditions, sql`${conversations.firstResponseAt} is not null`))
        .groupBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`),

      // 2. Average response time from message pairs (customer msg → next agent msg)
      db.execute(sql`
        SELECT coalesce(round(avg(sub.resp_time)::numeric, 1), 0) as avg
        FROM (
          SELECT extract(epoch from (
            (SELECT min(m2.created_at) FROM messages m2
             WHERE m2.conversation_id = m1.conversation_id
               AND m2.sender_type = 'agent'
               AND m2.created_at > m1.created_at)
            - m1.created_at
          )) as resp_time
          FROM messages m1
          INNER JOIN conversations cv ON cv.id = m1.conversation_id
          WHERE m1.sender_type = 'customer'
            AND cv.org_id = ${orgId}
            AND m1.created_at >= ${startDate.toISOString()}::timestamptz
            AND EXISTS (
              SELECT 1 FROM messages m2
              WHERE m2.conversation_id = m1.conversation_id
                AND m2.sender_type = 'agent'
                AND m2.created_at > m1.created_at
            )
        ) sub
      `),
    ]);

    const slaTotal = slaRes[0]?.total ?? 0;
    const slaCompliant = slaRes[0]?.compliant ?? 0;
    const slaRate = slaTotal > 0 ? Math.round((slaCompliant / slaTotal) * 1000) / 10 : 100;

    // Fill missing hours (0-23)
    const hourMap = new Map(responseByHour.map(h => [h.hour, h]));
    const responseByHourFull = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      avgSeconds: parseFloat((hourMap.get(i)?.avgSeconds as string) ?? '0'),
      count: hourMap.get(i)?.count ?? 0,
    }));

    // Compute per-agent avgResponse from message pairs
    const agentResponseTimesRaw = await db.execute(sql`
      SELECT sub.agent_id as "agentId", coalesce(round(avg(sub.resp_time)::numeric, 1), 0) as "avgResponse"
      FROM (
        SELECT cv.agent_id,
          extract(epoch from (
            (SELECT min(m2.created_at) FROM messages m2
             WHERE m2.conversation_id = m1.conversation_id
               AND m2.sender_type = 'agent'
               AND m2.created_at > m1.created_at)
            - m1.created_at
          )) as resp_time
        FROM messages m1
        INNER JOIN conversations cv ON cv.id = m1.conversation_id
        WHERE m1.sender_type = 'customer'
          AND cv.org_id = ${orgId}
          AND cv.agent_id IS NOT NULL
          AND m1.created_at >= ${startDate.toISOString()}::timestamptz
          AND EXISTS (
            SELECT 1 FROM messages m2
            WHERE m2.conversation_id = m1.conversation_id
              AND m2.sender_type = 'agent'
              AND m2.created_at > m1.created_at
          )
      ) sub
      GROUP BY sub.agent_id
    `);
    const agentResponseTimes = agentResponseTimesRaw as unknown as { agentId: string; avgResponse: string }[];

    const agentResponseMap = new Map(agentResponseTimes.map(a => [a.agentId, a.avgResponse]));

    return c.json({
      success: true,
      data: {
        avgFirstResponseSeconds: parseFloat(avgFirstResponseRes[0]?.avg ?? '0'),
        avgResponseSeconds: parseFloat((avgResponseRes as unknown as any[])?.[0]?.avg ?? '0'),
        avgResolutionSeconds: parseFloat(avgResolutionRes[0]?.avg ?? '0'),
        slaComplianceRate: slaRate,
        slaThreshold,
        responseByHour: responseByHourFull,
        responseByAgent: responseByAgent.map(a => ({
          agentId: a.agentId,
          agentName: a.agentName,
          avgFirstResponse: parseFloat(a.avgFirstResponse),
          avgResponse: parseFloat(agentResponseMap.get(a.agentId!) ?? '0'),
          totalConversations: a.totalConversations,
          resolvedCount: a.resolvedCount,
        })),
        dailyTrend: dailyTrend.map(d => ({
          date: d.date,
          avgFirstResponse: parseFloat(d.avgFirstResponse),
          count: d.count,
        })),
      },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Response time analytics failed') },
      500
    );
  }
});

// GET /analytics/satisfaction — dedicated satisfaction analytics
app.get('/satisfaction', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') || '30')));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const baseConditions = [eq(conversations.orgId, orgId), gte(conversations.createdAt, startDate)];
    const ratedConditions = [...baseConditions, isNotNull(conversations.satisfactionScore)];

    const [
      [avgRes],
      distribution,
      dailyTrend,
      agentBreakdown,
      [resolvedCount],
      [ratedCount],
    ] = await Promise.all([
      db.select({
        avg: sql<string>`coalesce(round(avg(${conversations.satisfactionScore})::numeric, 2), 0)`,
      }).from(conversations).where(and(...ratedConditions)),

      db.select({
        score: conversations.satisfactionScore,
        count: sql<number>`count(*)::int`,
      }).from(conversations).where(and(...ratedConditions))
        .groupBy(conversations.satisfactionScore)
        .orderBy(conversations.satisfactionScore),

      db.select({
        date: sql<string>`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`,
        avgScore: sql<string>`coalesce(round(avg(${conversations.satisfactionScore})::numeric, 2), 0)`,
        count: sql<number>`count(*)::int`,
      }).from(conversations).where(and(...ratedConditions))
        .groupBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`),

      db.select({
        agentId: conversations.agentId,
        agentName: users.name,
        avgScore: sql<string>`coalesce(round(avg(${conversations.satisfactionScore})::numeric, 2), 0)`,
        count: sql<number>`count(*)::int`,
      }).from(conversations)
        .leftJoin(users, eq(conversations.agentId, users.id))
        .where(and(...ratedConditions, sql`${conversations.agentId} is not null`))
        .groupBy(conversations.agentId, users.name),

      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(...baseConditions, sql`${conversations.status} = 'resolved'`)),

      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(...ratedConditions)),
    ]);

    const totalResolved = resolvedCount?.count ?? 0;
    const totalRated = ratedCount?.count ?? 0;
    const responseRate = totalResolved > 0 ? Math.round((totalRated / totalResolved) * 1000) / 10 : 0;
    const goodCount = distribution
      .filter(d => d.score !== null && d.score >= 4)
      .reduce((sum, d) => sum + d.count, 0);
    const goodRate = totalRated > 0 ? Math.round((goodCount / totalRated) * 1000) / 10 : 0;

    return c.json({
      success: true,
      data: {
        avgScore: parseFloat(avgRes?.avg ?? '0'),
        totalRated,
        totalResolved,
        responseRate,
        goodRate,
        distribution: distribution.map(d => ({ score: d.score, count: d.count })),
        dailyTrend: dailyTrend.map(d => ({
          date: d.date,
          avgScore: parseFloat(d.avgScore),
          count: d.count,
        })),
        agentBreakdown: agentBreakdown
          .map(a => ({
            agentId: a.agentId,
            agentName: a.agentName,
            avgScore: parseFloat(a.avgScore),
            count: a.count,
          }))
          .sort((a, b) => b.avgScore - a.avgScore),
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Satisfaction analytics failed') }, 500);
  }
});

// GET /analytics/realtime — live monitoring metrics
app.get('/realtime', async (c) => {
  try {
    const { orgId } = c.get('user');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      onlineAgents,
      [pendingCount],
      [activeCount],
      [todayNewCount],
      [todayResolvedCount],
      [todayAvgFirst],
      [todayAvgSat],
      oldestPending,
      hourlyData,
    ] = await Promise.all([
      db.select({
        id: users.id,
        name: users.name,
        onlineStatus: users.onlineStatus,
      }).from(users).where(and(
        eq(users.orgId, orgId),
        sql`${users.onlineStatus} in ('online', 'away', 'busy')`,
      )),

      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(eq(conversations.orgId, orgId), eq(conversations.status, 'pending'))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(eq(conversations.orgId, orgId), eq(conversations.status, 'active'))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(eq(conversations.orgId, orgId), gte(conversations.createdAt, todayStart))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(
          eq(conversations.orgId, orgId),
          eq(conversations.status, 'resolved'),
          gte(conversations.resolvedAt, todayStart),
        )),

      db.select({
        avg: sql<number>`coalesce(avg(extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt}))), 0)::int`,
      }).from(conversations).where(and(
        eq(conversations.orgId, orgId),
        gte(conversations.createdAt, todayStart),
        isNotNull(conversations.firstResponseAt),
      )),

      db.select({
        avg: sql<string>`coalesce(round(avg(${conversations.satisfactionScore})::numeric, 2), 0)`,
      }).from(conversations).where(and(
        eq(conversations.orgId, orgId),
        gte(conversations.createdAt, todayStart),
        isNotNull(conversations.satisfactionScore),
      )),

      db.select({
        createdAt: conversations.createdAt,
      }).from(conversations).where(and(
        eq(conversations.orgId, orgId),
        eq(conversations.status, 'pending'),
      )).orderBy(conversations.createdAt).limit(1),

      db.select({
        hour: sql<number>`extract(hour from ${conversations.createdAt})::int`,
        count: sql<number>`count(*)::int`,
      }).from(conversations).where(and(
        eq(conversations.orgId, orgId),
        gte(conversations.createdAt, sql`now() - interval '12 hours'`),
      )).groupBy(sql`extract(hour from ${conversations.createdAt})`)
        .orderBy(sql`extract(hour from ${conversations.createdAt})`),
    ]);

    // Compute per-agent active conversation count
    const agentConvCounts = await db.select({
      agentId: conversations.agentId,
      count: sql<number>`count(*)::int`,
    }).from(conversations).where(and(
      eq(conversations.orgId, orgId),
      eq(conversations.status, 'active'),
      sql`${conversations.agentId} is not null`,
    )).groupBy(conversations.agentId);
    const agentConvMap = new Map(agentConvCounts.map(a => [a.agentId, a.count]));

    const longestWaitSeconds = oldestPending.length > 0 && oldestPending[0].createdAt
      ? Math.round((Date.now() - new Date(oldestPending[0].createdAt).getTime()) / 1000)
      : 0;

    return c.json({
      success: true,
      data: {
        onlineAgents: onlineAgents.map(a => ({
          id: a.id,
          name: a.name,
          status: a.onlineStatus,
          activeConversations: agentConvMap.get(a.id) ?? 0,
        })),
        pendingCount: pendingCount?.count ?? 0,
        activeCount: activeCount?.count ?? 0,
        todayNew: todayNewCount?.count ?? 0,
        todayResolved: todayResolvedCount?.count ?? 0,
        todayAvgFirstResponseSeconds: todayAvgFirst?.avg ?? 0,
        todayAvgSatisfaction: parseFloat(todayAvgSat?.avg ?? '0'),
        longestWaitSeconds,
        hourlyTrend: hourlyData,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Realtime analytics failed') }, 500);
  }
});

// GET /analytics/agent-performance - Per-agent KPI dashboard
app.get('/agent-performance', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = parseInt(c.req.query('days') || '30');
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const agentStats = await db
      .select({
        agentId: conversations.agentId,
        agentName: users.name,
        agentAvatar: users.avatarUrl,
        totalConversations: sql<number>`count(*)::int`,
        resolvedCount: sql<number>`count(*) filter (where ${conversations.status} = 'resolved')::int`,
        avgSatisfaction: sql<number>`round(avg(${conversations.satisfactionScore}), 1)`,
        avgFirstResponse: sql<number>`round(avg(extract(epoch from (${conversations.firstResponseAt} - ${conversations.createdAt})) / 60), 1)`,
        avgResolution: sql<number>`round(avg(extract(epoch from (${conversations.resolvedAt} - ${conversations.createdAt})) / 60), 1)`,
        messageCount: sql<number>`sum(${conversations.messageCount})::int`,
      })
      .from(conversations)
      .innerJoin(users, eq(conversations.agentId, users.id))
      .where(and(
        eq(conversations.orgId, orgId),
        sql`${conversations.agentId} IS NOT NULL`,
        sql`${conversations.createdAt} >= ${since}`
      ))
      .groupBy(conversations.agentId, users.name, users.avatarUrl);

    return c.json({ success: true, data: agentStats });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

export default app;
