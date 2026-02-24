import { Hono } from 'hono';
import { eq, and, desc, sql, gte, ilike, or } from 'drizzle-orm';
import { db } from '../db/connection';
import { visitorSessions, pageViews } from '../db/schema';
import { parsePagination, getErrorMessage, escapeLike } from '../utils/helpers';

const app = new Hono();

// GET /visitors
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize } = parsePagination(c);
    const search = c.req.query('search');
    const isOnline = c.req.query('isOnline');
    const deviceType = c.req.query('deviceType');

    const conditions = [eq(visitorSessions.orgId, orgId)];
    if (search) {
      conditions.push(
        or(
          ilike(visitorSessions.ipAddress, `%${escapeLike(search)}%`),
          ilike(visitorSessions.city, `%${escapeLike(search)}%`)
        )!
      );
    }
    if (isOnline !== undefined && isOnline !== '') conditions.push(eq(visitorSessions.isOnline, isOnline === 'true'));
    if (deviceType) conditions.push(eq(visitorSessions.deviceType, deviceType));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(visitorSessions)
      .where(and(...conditions));

    const list = await db
      .select()
      .from(visitorSessions)
      .where(and(...conditions))
      .orderBy(desc(visitorSessions.isOnline), desc(visitorSessions.lastActiveAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return c.json({ success: true, data: list, total: count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'List failed') }, 500);
  }
});

// GET /visitors/stats
app.get('/stats', async (c) => {
  try {
    const { orgId } = c.get('user');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [[onlineRow], [todayRow], topPages] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(visitorSessions)
        .where(and(eq(visitorSessions.orgId, orgId), eq(visitorSessions.isOnline, true))),
      db.select({ count: sql<number>`count(*)::int` }).from(visitorSessions)
        .where(and(eq(visitorSessions.orgId, orgId), gte(visitorSessions.createdAt, todayStart))),
      db.select({ page: visitorSessions.currentPage, count: sql<number>`count(*)::int` })
        .from(visitorSessions)
        .where(and(eq(visitorSessions.orgId, orgId), eq(visitorSessions.isOnline, true)))
        .groupBy(visitorSessions.currentPage)
        .orderBy(sql`count(*) desc`)
        .limit(10),
    ]);

    return c.json({
      success: true,
      data: {
        onlineCount: onlineRow?.count ?? 0,
        todayCount: todayRow?.count ?? 0,
        topPages,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Stats failed') }, 500);
  }
});

// GET /visitors/stats/pages — enhanced page view stats
app.get('/stats/pages', async (c) => {
  try {
    const { orgId } = c.get('user');
    const days = parseInt(c.req.query('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [topPagesRes, avgPagesRes, avgDurationRes] = await Promise.all([
      db.select({
        pageUrl: pageViews.pageUrl,
        pageTitle: pageViews.pageTitle,
        count: sql<number>`count(*)::int`,
      }).from(pageViews)
        .where(and(eq(pageViews.orgId, orgId), gte(pageViews.createdAt, startDate)))
        .groupBy(pageViews.pageUrl, pageViews.pageTitle)
        .orderBy(sql`count(*) desc`)
        .limit(10),

      db.select({
        avg: sql<string>`coalesce(round(avg(page_count)::numeric, 1), 0)`,
      }).from(
        sql`(select session_id, count(*) as page_count from page_views where org_id = ${orgId} and created_at >= ${startDate.toISOString()}::timestamptz group by session_id) sub`
      ),

      db.select({
        avg: sql<string>`coalesce(round(avg(total_duration)::numeric, 0), 0)`,
      }).from(
        sql`(select session_id, sum(coalesce(duration, 0)) as total_duration from page_views where org_id = ${orgId} and created_at >= ${startDate.toISOString()}::timestamptz group by session_id) sub`
      ),
    ]);

    return c.json({
      success: true,
      data: {
        topPages: topPagesRes,
        avgPagesPerSession: parseFloat(avgPagesRes[0]?.avg ?? '0'),
        avgSessionDuration: parseFloat(avgDurationRes[0]?.avg ?? '0'),
      },
    });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Page stats failed') }, 500);
  }
});

// GET /visitors/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [visitor] = await db.select().from(visitorSessions)
      .where(and(eq(visitorSessions.id, id), eq(visitorSessions.orgId, orgId)))
      .limit(1);
    if (!visitor) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: visitor });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

// GET /visitors/:id/pages — page view history for a visitor session
app.get('/:id/pages', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [visitor] = await db.select({ id: visitorSessions.id }).from(visitorSessions)
      .where(and(eq(visitorSessions.id, id), eq(visitorSessions.orgId, orgId)))
      .limit(1);
    if (!visitor) return c.json({ success: false, error: 'Not found' }, 404);

    const pages = await db.select({
      id: pageViews.id,
      pageUrl: pageViews.pageUrl,
      pageTitle: pageViews.pageTitle,
      referrer: pageViews.referrer,
      duration: pageViews.duration,
      createdAt: pageViews.createdAt,
    }).from(pageViews)
      .where(and(eq(pageViews.sessionId, id), eq(pageViews.orgId, orgId)))
      .orderBy(pageViews.createdAt)
      .limit(200);

    return c.json({ success: true, data: pages });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Failed') }, 500);
  }
});

export default app;
