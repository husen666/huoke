import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { conversationInspections, conversations, users, customers } from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError } from '../utils/helpers';
import { requireFeature } from '../middleware/plan-guard';

const app = new Hono();

const createInspectionSchema = z.object({
  conversationId: z.string().uuid(),
  score: z.number().min(1).max(100),
  categories: z.record(z.number().min(0).max(100)).optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
  suggestions: z.string().optional(),
});

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

// GET /inspections - List inspections with pagination
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const { page, pageSize, offset } = parsePagination(c);

    const conditions = [eq(conversationInspections.orgId, orgId)];

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationInspections)
      .where(and(...conditions));

    const list = await db
      .select({
        id: conversationInspections.id,
        conversationId: conversationInspections.conversationId,
        inspectorId: conversationInspections.inspectorId,
        score: conversationInspections.score,
        grade: conversationInspections.grade,
        categories: conversationInspections.categories,
        strengths: conversationInspections.strengths,
        weaknesses: conversationInspections.weaknesses,
        suggestions: conversationInspections.suggestions,
        status: conversationInspections.status,
        createdAt: conversationInspections.createdAt,
      })
      .from(conversationInspections)
      .where(and(...conditions))
      .orderBy(desc(conversationInspections.createdAt))
      .offset(offset)
      .limit(pageSize);

    return c.json({ success: true, data: list, total: countResult.count, page, pageSize });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

// POST /inspections - Create inspection
app.post('/', requireFeature('quality_inspection'), async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const body = await c.req.json();
    const parsed = createInspectionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const { conversationId, score, categories, strengths, weaknesses, suggestions } = parsed.data;

    const [conv] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
    if (!conv) return c.json({ success: false, error: 'Conversation not found' }, 404);

    const [inspection] = await db.insert(conversationInspections).values({
      orgId,
      conversationId,
      inspectorId: sub,
      score,
      grade: scoreToGrade(score),
      categories,
      strengths,
      weaknesses,
      suggestions,
    }).returning();

    return c.json({ success: true, data: inspection }, 201);
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

// GET /inspections/stats - Get inspection statistics
app.get('/stats', async (c) => {
  try {
    const { orgId } = c.get('user');

    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      avgScore: sql<number>`round(avg(${conversationInspections.score}), 1)`,
      gradeA: sql<number>`count(*) filter (where ${conversationInspections.grade} = 'A')::int`,
      gradeB: sql<number>`count(*) filter (where ${conversationInspections.grade} = 'B')::int`,
      gradeC: sql<number>`count(*) filter (where ${conversationInspections.grade} = 'C')::int`,
      gradeD: sql<number>`count(*) filter (where ${conversationInspections.grade} = 'D')::int`,
      gradeE: sql<number>`count(*) filter (where ${conversationInspections.grade} = 'E')::int`,
    }).from(conversationInspections).where(eq(conversationInspections.orgId, orgId));

    return c.json({ success: true, data: stats });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

// DELETE /inspections/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    await db.delete(conversationInspections).where(and(eq(conversationInspections.id, id), eq(conversationInspections.orgId, orgId)));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});

export default app;
