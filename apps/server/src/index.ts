import { Hono } from 'hono';
import { createAdaptorServer } from '@hono/node-server';
import { cors } from 'hono/cors';
import { sql } from 'drizzle-orm';
import { errorHandlerMiddleware } from './middleware/error-handler';
import { authMiddleware } from './middleware/auth';
import { config } from './config/env';
import { db } from './db/connection';
import authRoutes from './routes/auth.routes';
import leadRoutes from './routes/lead.routes';
import customerRoutes from './routes/customer.routes';
import conversationRoutes from './routes/conversation.routes';
import knowledgeRoutes from './routes/knowledge.routes';
import analyticsRoutes from './routes/analytics.routes';
import campaignRoutes from './routes/campaign.routes';
import workflowRoutes from './routes/workflow.routes';
import tagRoutes from './routes/tag.routes';
import dealRoutes from './routes/deal.routes';
import channelRoutes from './routes/channel.routes';
import notificationRoutes from './routes/notification.routes';
import auditLogRoutes from './routes/auditlog.routes';
import cannedResponseRoutes from './routes/canned-response.routes';
import widgetRoutes from './routes/widget.routes';
import invitationRoutes from './routes/invitation.routes';
import orgRoutes from './routes/org.routes';
import ticketRoutes from './routes/ticket.routes';
import visitorRoutes from './routes/visitor.routes';
import webhookRoutes from './routes/webhook.routes';
import blacklistRoutes from './routes/blacklist.routes';
import autoReplyRoutes from './routes/auto-reply.routes';
import segmentRoutes from './routes/segment.routes';
import escalationRoutes from './routes/escalation.routes';
import routingRoutes from './routes/routing.routes';
import proactiveChatRoutes from './routes/proactive-chat.routes';
import inspectionRoutes from './routes/inspection.routes';
import adminRoutes from './routes/admin.routes';
import platformRoutes from './routes/platform.routes';
import { createSocketServer } from './websocket/socket';
import { checkScheduledCampaigns } from './services/campaign.service';
import { checkEscalations } from './services/escalation.service';

const app = new Hono();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(o => o.trim())
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return allowedOrigins[0]
    if (allowedOrigins.includes(origin)) return origin
    return allowedOrigins[0]
  },
  credentials: true,
}));

// Widget routes need open CORS since they're embedded on customer sites
app.use('/api/v1/widget/*', cors({ origin: '*', credentials: false }));

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
})

app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length')
  if (contentLength) {
    const size = parseInt(contentLength)
    const isUpload = c.req.path.includes('/upload')
    const limit = isUpload ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (size > limit) {
      return c.json({ success: false, error: 'Request too large' }, 413)
    }
  }
  await next()
})

app.use('*', errorHandlerMiddleware);

const apiRateLimits = new Map<string, { count: number; resetAt: number }>()
const apiRateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of apiRateLimits) {
    if (now > val.resetAt) apiRateLimits.delete(key);
  }
}, 300000);

function rateLimit(scope: string, limit: number, windowMs = 60000) {
  return async (c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>) => {
    const user = c.get('user' as never) as { sub?: string } | undefined
    const ip = c.req.header('x-real-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'anon'
    // Keep separate buckets by scope so widget traffic won't exhaust auth limits.
    const actor = user?.sub || `ip:${ip}`
    const key = `${scope}:${actor}`
    const now = Date.now()
    const record = apiRateLimits.get(key) || { count: 0, resetAt: now + windowMs }
    if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs }
    record.count++
    apiRateLimits.set(key, record)
    if (record.count > limit) {
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429)
    }
    await next()
  }
}

// Public routes (no auth) — stricter rate limit
app.use('/api/v1/widget/*', rateLimit('public-widget', 100));
app.use('/api/v1/auth/*', rateLimit('public-auth', 30));

app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/widget', widgetRoutes);
app.route('/api/v1/invitations', invitationRoutes);
app.route('/api/v1/admin', adminRoutes);
app.route('/api/v1/platform', platformRoutes);

// Protected API routes — rate limit AFTER auth so user.sub is available
const api = new Hono();
api.use('*', authMiddleware);
api.use('*', rateLimit('protected-api', 200) as any);
api.route('/leads', leadRoutes);
api.route('/customers', customerRoutes);
api.route('/conversations', conversationRoutes);
api.route('/knowledge-bases', knowledgeRoutes);
api.route('/analytics', analyticsRoutes);
api.route('/campaigns', campaignRoutes);
api.route('/workflows', workflowRoutes);
api.route('/tags', tagRoutes);
api.route('/deals', dealRoutes);
api.route('/channels', channelRoutes);
api.route('/notifications', notificationRoutes);
api.route('/audit-logs', auditLogRoutes);
api.route('/canned-responses', cannedResponseRoutes);
api.route('/org', orgRoutes);
api.route('/tickets', ticketRoutes);
api.route('/visitors', visitorRoutes);
api.route('/webhooks', webhookRoutes);
api.route('/blacklist', blacklistRoutes);
api.route('/auto-reply-rules', autoReplyRoutes);
api.route('/segments', segmentRoutes);
api.route('/escalation-rules', escalationRoutes);
api.route('/routing-rules', routingRoutes);
api.route('/proactive-chat-rules', proactiveChatRoutes);
api.route('/inspections', inspectionRoutes);

app.route('/api/v1', api);

// Static file serving for uploads
app.get('/uploads/*', async (c) => {
  const { readFile } = await import('fs/promises');
  const { resolve, normalize } = await import('path');
  const uploadsRoot = resolve(process.cwd(), 'uploads');
  const reqPath = decodeURIComponent(c.req.path.replace(/^\/uploads\//, ''));
  const filePath = resolve(uploadsRoot, normalize(reqPath));
  if (!filePath.startsWith(uploadsRoot)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  try {
    const data = await readFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
      pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
      ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip', rar: 'application/x-rar-compressed',
      csv: 'text/csv', txt: 'text/plain',
    };
    return new Response(data, {
      headers: { 'Content-Type': mimeMap[ext] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return c.json({ error: 'File not found' }, 404);
  }
});

// Health (process + database)
app.get('/health', async (c) => {
  const timestamp = new Date().toISOString();
  try {
    await db.execute(sql`select 1`);
    return c.json({
      ok: true,
      version: 'V5.0',
      timestamp,
      checks: {
        process: { ok: true },
        database: { ok: true },
      },
    });
  } catch (e) {
    const err = e as {
      message?: string;
      code?: string;
      errors?: Array<{ message?: string; code?: string }>;
    };
    const dbErrorMessage =
      err?.message ||
      err?.errors?.[0]?.message ||
      err?.code ||
      err?.errors?.[0]?.code ||
      'Database unavailable';
    return c.json({
      ok: false,
      version: 'V5.0',
      timestamp,
      checks: {
        process: { ok: true },
        database: {
          ok: false,
          error: dbErrorMessage,
        },
      },
    }, 503);
  }
});

const server = createAdaptorServer({ fetch: app.fetch });
const io = createSocketServer(server as import('http').Server);
(app as unknown as { io?: typeof io }).io = io;

const intervals: NodeJS.Timeout[] = [];

server.listen(config.PORT, () => {
  console.log(`HuoKeAgent server running at http://localhost:${config.PORT}`);
  console.log(`Socket.IO attached. Health: http://localhost:${config.PORT}/health`);
  intervals.push(setInterval(() => checkScheduledCampaigns(), 60000));
  console.log('Campaign scheduler started (60s interval)');
  intervals.push(setInterval(() => checkEscalations(), 120000));
  console.log('Escalation checker started (120s interval)');
});

function shutdown() {
  console.log('Graceful shutdown initiated...');
  intervals.forEach(h => clearInterval(h));
  clearInterval(apiRateLimitCleanup);
  io.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
