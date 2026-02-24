import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  knowledgeBases,
  documents,
  faqs,
  documentChunks,
} from '../db/schema';
import { parsePagination, getErrorMessage, formatZodError, escapeLike } from '../utils/helpers';
import { requireKnowledgeBaseLimit } from '../middleware/plan-guard';

const app = new Hono();

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

async function verifyKbOwnership(orgId: string, kbId: string) {
  const [kb] = await db
    .select({ id: knowledgeBases.id, orgId: knowledgeBases.orgId, name: knowledgeBases.name, documentCount: knowledgeBases.documentCount })
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.id, kbId), eq(knowledgeBases.orgId, orgId)))
    .limit(1);
  return kb ?? null;
}

function splitTextIntoChunks(text: string): string[] {
  if (!text || text.length <= CHUNK_SIZE) return text ? [text] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('。', end);
      const lastDot = text.lastIndexOf('.', end);
      const lastQuestion = text.lastIndexOf('？', end);
      const lastExclaim = text.lastIndexOf('！', end);
      const lastSemicolon = text.lastIndexOf('；', end);
      const breakPoint = Math.max(lastNewline, lastPeriod, lastDot, lastQuestion, lastExclaim, lastSemicolon);
      if (breakPoint > start + CHUNK_SIZE * 0.3) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
    if (end >= text.length) break;
  }
  return chunks.filter(Boolean);
}

async function processDocumentChunks(docId: string, content: string) {
  const chunks = splitTextIntoChunks(content);
  if (chunks.length === 0) {
    await db.update(documents).set({ processingStatus: 'completed', chunkCount: 0 }).where(eq(documents.id, docId));
    return;
  }
  const values = chunks.map((chunk, idx) => ({
    documentId: docId,
    content: chunk,
    chunkIndex: idx,
    tokenCount: Math.ceil(chunk.length / 2),
  }));
  await db.insert(documentChunks).values(values);
  await db.update(documents).set({ processingStatus: 'completed', chunkCount: chunks.length }).where(eq(documents.id, docId));
}

const createKbSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

const createDocumentSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  fileUrl: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const querySchema = z.object({
  query: z.string().min(1),
  topK: z.number().optional(),
});

const createFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
});

// GET /knowledge-bases
app.get('/', async (c) => {
  try {
    const { orgId } = c.get('user');
    const search = c.req.query('search');
    const { page, pageSize } = parsePagination(c);

    const conditions = [eq(knowledgeBases.orgId, orgId)];
    if (search) conditions.push(ilike(knowledgeBases.name, `%${escapeLike(search)}%`));

    const where = and(...conditions);

    const docCountSq = db
      .select({ kbId: documents.kbId, count: sql<number>`count(*)::int`.as('doc_count') })
      .from(documents)
      .groupBy(documents.kbId)
      .as('doc_counts');

    const [[{ count: total }], list] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(knowledgeBases).where(where),
      db
        .select({
          id: knowledgeBases.id,
          orgId: knowledgeBases.orgId,
          name: knowledgeBases.name,
          description: knowledgeBases.description,
          documentCount: sql<number>`coalesce(${docCountSq.count}, ${knowledgeBases.documentCount})::int`,
          settings: knowledgeBases.settings,
          createdAt: knowledgeBases.createdAt,
          updatedAt: knowledgeBases.updatedAt,
        })
        .from(knowledgeBases)
        .leftJoin(docCountSq, eq(docCountSq.kbId, knowledgeBases.id))
        .where(where)
        .orderBy(desc(knowledgeBases.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List failed') },
      500
    );
  }
});

// POST /knowledge-bases
app.post('/', requireKnowledgeBaseLimit(), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = createKbSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }
    const [kb] = await db
      .insert(knowledgeBases)
      .values({ ...parsed.data, orgId })
      .returning();
    if (!kb) return c.json({ success: false, error: 'Create failed' }, 500);
    return c.json({ success: true, data: kb });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create failed') },
      500
    );
  }
});

// GET /knowledge-bases/:id
app.get('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const { page, pageSize } = parsePagination(c);
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const [[{ count: docTotal }], docList] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(documents).where(eq(documents.kbId, id)),
      db.select().from(documents).where(eq(documents.kbId, id)).orderBy(desc(documents.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);

    return c.json({ success: true, data: { ...kb, documents: docList, documentTotal: docTotal, page, pageSize } });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Get failed') },
      500
    );
  }
});

// PUT /knowledge-bases/:id
const updateKbSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  settings: z.record(z.unknown()).optional(),
}).strict();

app.put('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateKbSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Not found' }, 404);
    const [updated] = await db.update(knowledgeBases).set({ ...parsed.data, updatedAt: new Date() }).where(eq(knowledgeBases.id, id)).returning();
    if (!updated) return c.json({ success: false, error: 'Update failed' }, 500);
    return c.json({ success: true, data: updated });
  } catch (e) { return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500); }
});

// POST /knowledge-bases/:id/documents/upload - file upload
app.post('/:id/documents/upload', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const body = await c.req.parseBody();
    const file = body['file'];
    const title = typeof body['title'] === 'string' ? body['title'] : '';
    if (!file || typeof file === 'string') return c.json({ success: false, error: 'No file provided' }, 400);

    const f = file as File;
    if (f.size > MAX_UPLOAD_SIZE) {
      return c.json({ success: false, error: `文件大小超过限制（最大 ${MAX_UPLOAD_SIZE / 1024 / 1024}MB）` }, 400);
    }

    const text = await f.text();
    const fileName = f.name ?? 'uploaded';
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const fileType = ext || (f.type || 'text/plain');
    const fileSize = f.size;

    const [doc] = await db.insert(documents).values({
      kbId: id,
      title: title || fileName,
      content: text,
      fileUrl: fileName,
      fileType,
      fileSize,
      processingStatus: 'processing',
    }).returning();

    if (!doc) return c.json({ success: false, error: 'Create document failed' }, 500);

    await db.update(knowledgeBases).set({ documentCount: (kb.documentCount ?? 0) + 1 }).where(eq(knowledgeBases.id, id));

    processDocumentChunks(doc.id, text).catch(() => {
      db.update(documents).set({ processingStatus: 'failed', errorMessage: 'Chunking failed' }).where(eq(documents.id, doc.id)).catch(() => {});
    });

    return c.json({ success: true, data: doc });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Upload failed') }, 500);
  }
});

// POST /knowledge-bases/:id/documents
app.post('/:id/documents', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = createDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }

    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const [doc] = await db
      .insert(documents)
      .values({
        kbId: id,
        ...parsed.data,
        processingStatus: 'processing',
      })
      .returning();

    if (!doc) return c.json({ success: false, error: 'Create document failed' }, 500);

    await db
      .update(knowledgeBases)
      .set({ documentCount: (kb.documentCount ?? 0) + 1 })
      .where(eq(knowledgeBases.id, id));

    if (parsed.data.content) {
      processDocumentChunks(doc.id, parsed.data.content).catch(() => {
        db.update(documents)
          .set({ processingStatus: 'failed', errorMessage: 'Chunking failed' })
          .where(eq(documents.id, doc.id))
          .catch(() => {});
      });
    } else {
      await db.update(documents).set({ processingStatus: 'completed', chunkCount: 0 }).where(eq(documents.id, doc.id));
    }

    return c.json({ success: true, data: doc });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Upload document failed') },
      500
    );
  }
});

// PUT /knowledge-bases/:id/documents/:docId
const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
}).strict();

app.put('/:id/documents/:docId', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const docId = c.req.param('docId');
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'KB not found' }, 404);
    const body = await c.req.json();
    const parsed = updateDocumentSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);

    const now = new Date();
    const [updated] = await db.update(documents).set({ ...parsed.data, updatedAt: now }).where(and(eq(documents.id, docId), eq(documents.kbId, id))).returning();
    if (!updated) return c.json({ success: false, error: 'Document not found' }, 404);

    if (parsed.data.content) {
      await db.delete(documentChunks).where(eq(documentChunks.documentId, docId));
      processDocumentChunks(docId, parsed.data.content).catch(() => {
        db.update(documents).set({ processingStatus: 'failed', errorMessage: 'Re-chunking failed' }).where(eq(documents.id, docId)).catch(() => {});
      });
    }

    return c.json({ success: true, data: updated });
  } catch (e) { return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500); }
});

// DELETE /knowledge-bases/:id/documents/:docId
app.delete('/:id/documents/:docId', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const docId = c.req.param('docId');

    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const [deleted] = await db.delete(documents).where(and(eq(documents.id, docId), eq(documents.kbId, id))).returning();
    if (!deleted) return c.json({ success: false, error: 'Document not found' }, 404);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(documents).where(eq(documents.kbId, id));
    await db.update(knowledgeBases).set({ documentCount: count }).where(eq(knowledgeBases.id, id));

    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

// DELETE /knowledge-bases/:id
app.delete('/:id', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const [deleted] = await db.delete(knowledgeBases).where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.orgId, orgId))).returning();
    if (!deleted) return c.json({ success: false, error: 'Knowledge base not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete failed') }, 500);
  }
});

// POST /knowledge-bases/:id/query
app.post('/:id/query', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = querySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }

    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const topK = parsed.data.topK ?? 5;
    const queryText = parsed.data.query;

    const STOP_WORDS = new Set(['什么', '怎么', '如何', '为什么', '是不是', '哪些', '可以', '能不能', '的', '了', '吗', '呢', '吧', '啊']);
    const keywords = queryText
      .replace(/[?？!！。，,.、；;：:""''""''【】\[\]{}（）()\s]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
      .slice(0, 8);

    const [chunkResults, faqResults] = await Promise.all([
      (async () => {
        let list: { content: string }[] = [];
        if (keywords.length > 0) {
          const searchConditions = keywords.map(
            (kw) => ilike(documentChunks.content, `%${escapeLike(kw)}%`)
          );
          list = await db
            .select({ content: documentChunks.content })
            .from(documentChunks)
            .innerJoin(documents, eq(documents.id, documentChunks.documentId))
            .where(and(eq(documents.kbId, id), or(...searchConditions)))
            .limit(topK);
        }
        if (list.length === 0) {
          list = await db
            .select({ content: documentChunks.content })
            .from(documentChunks)
            .innerJoin(documents, eq(documents.id, documentChunks.documentId))
            .where(eq(documents.kbId, id))
            .orderBy(desc(documentChunks.createdAt))
            .limit(topK);
        }
        return list;
      })(),
      (async () => {
        const allFaqs = await db
          .select({ question: faqs.question, answer: faqs.answer })
          .from(faqs)
          .where(and(eq(faqs.kbId, id), eq(faqs.isActive, true)));
        if (keywords.length > 0) {
          const matched = allFaqs.filter((f) =>
            keywords.some((kw) => f.question.includes(kw) || f.answer.includes(kw))
          );
          if (matched.length > 0) return matched;
        }
        return allFaqs;
      })(),
    ]);

    const contextParts: string[] = [];
    if (chunkResults.length > 0) contextParts.push(chunkResults.map((r) => r.content).join('\n\n'));
    if (faqResults.length > 0) contextParts.push(faqResults.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n'));

    let answer = '';
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        const { chatCompletion } = await import('../ai/deepseek');
        const context = contextParts.join('\n\n---\n\n') || '暂无相关参考内容。';
        const res = await chatCompletion([
          {
            role: 'system',
            content: `你是一个智能知识库助手，请基于以下参考内容用中文回答用户问题。如果参考内容不包含答案，请如实说明。回答要简洁、准确、有条理。\n\n参考内容:\n${context}`,
          },
          { role: 'user', content: queryText },
        ]);
        answer = res ?? '暂无法生成回答。';
      } catch {
        answer = 'AI 查询暂时不可用，请稍后重试。';
      }
    } else {
      answer = contextParts.length > 0 ? contextParts.join('\n\n') : '该知识库暂无相关内容。';
    }

    return c.json({
      success: true,
      data: { query: queryText, answer, sources: chunkResults.length + faqResults.length },
    });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Query failed') },
      500
    );
  }
});

// GET /knowledge-bases/:id/faqs
app.get('/:id/faqs', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const { page, pageSize } = parsePagination(c);
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const [[{ count: total }], list] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(faqs).where(eq(faqs.kbId, id)),
      db.select().from(faqs).where(eq(faqs.kbId, id)).orderBy(desc(faqs.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);

    return c.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'List FAQs failed') },
      500
    );
  }
});

// POST /knowledge-bases/:id/faqs
app.post('/:id/faqs', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = createFaqSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    }

    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);

    const [faq] = await db
      .insert(faqs)
      .values({ kbId: id, ...parsed.data })
      .returning();

    if (!faq) return c.json({ success: false, error: 'Create FAQ failed' }, 500);
    return c.json({ success: true, data: faq });
  } catch (e) {
    return c.json(
      { success: false, error: getErrorMessage(e, 'Create FAQ failed') },
      500
    );
  }
});

// PUT /knowledge-bases/:id/faqs/:faqId
const updateFaqSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
  answer: z.string().min(1).max(5000).optional(),
  category: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
}).strict();

app.put('/:id/faqs/:faqId', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const faqId = c.req.param('faqId');
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'KB not found' }, 404);
    const body = await c.req.json();
    const parsed = updateFaqSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: formatZodError(parsed.error) }, 400);
    const [updated] = await db.update(faqs).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(faqs.id, faqId), eq(faqs.kbId, id))).returning();
    if (!updated) return c.json({ success: false, error: 'FAQ not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) { return c.json({ success: false, error: getErrorMessage(e, 'Update failed') }, 500); }
});

// DELETE /knowledge-bases/:id/faqs/:faqId
app.delete('/:id/faqs/:faqId', async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const faqId = c.req.param('faqId');
    const kb = await verifyKbOwnership(orgId, id);
    if (!kb) return c.json({ success: false, error: 'Knowledge base not found' }, 404);
    const [deleted] = await db.delete(faqs).where(and(eq(faqs.id, faqId), eq(faqs.kbId, id))).returning();
    if (!deleted) return c.json({ success: false, error: 'FAQ not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (e) {
    return c.json({ success: false, error: getErrorMessage(e, 'Delete FAQ failed') }, 500);
  }
});

export default app;
