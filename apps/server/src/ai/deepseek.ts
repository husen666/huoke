import OpenAI from 'openai';
import { config } from '../config/env';

const client = new OpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: config.DEEPSEEK_BASE_URL,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageUrls?: string[];
}

/**
 * Basic chat completion using DeepSeek (OpenAI-compatible API).
 * Supports vision: if a message has imageUrls, they are sent as image_url content parts.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; maxTokens?: number }
): Promise<string | null> {
  if (!config.DEEPSEEK_API_KEY) return null;
  try {
    const formatted = messages.map((m) => {
      if (m.imageUrls && m.imageUrls.length > 0 && m.role === 'user') {
        const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
        if (m.content) parts.push({ type: 'text', text: m.content });
        for (const url of m.imageUrls) {
          parts.push({ type: 'image_url', image_url: { url } });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    const res = await client.chat.completions.create({
      model: options?.model ?? 'deepseek-chat',
      messages: formatted as any,
      max_tokens: options?.maxTokens ?? 2048,
    });
    return res.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error('[deepseek/chatCompletion]', err);
    return null;
  }
}

/**
 * Score a lead 0-100 and return analysis using AI.
 */
export async function scoreLeadWithAI(leadData: {
  contactName?: string | null;
  companyName?: string | null;
  companyIndustry?: string | null;
  sourcePlatform?: string | null;
  [key: string]: unknown;
}): Promise<{ score: number; analysis: string } | null> {
  if (!config.DEEPSEEK_API_KEY) return null;
  const text = JSON.stringify(leadData, null, 2);
  const res = await chatCompletion([
    {
      role: 'system',
      content: `You are a lead scoring expert. Given lead data as JSON, respond with a JSON object only: { "score": number (0-100), "analysis": "brief Chinese explanation" }. No other text.`,
    },
    { role: 'user', content: text },
  ]);
  if (!res) return null;
  try {
    const parsed = JSON.parse(res.trim()) as { score?: number; analysis?: string };
    const score = Math.min(100, Math.max(0, Number(parsed.score) ?? 50));
    return { score, analysis: parsed.analysis ?? '' };
  } catch {
    return { score: 50, analysis: res.slice(0, 200) };
  }
}

/**
 * Generate AI reply for customer service.
 * Supports both single-message and multi-turn conversation history.
 * When messages include imageUrls, vision capabilities are used automatically.
 */
export async function generateReply(
  historyOrCtx: ChatMessage[] | { customerId?: string; [key: string]: unknown },
  messageOrKnowledge?: string,
  knowledgeContext?: string
): Promise<string | null> {
  if (!config.DEEPSEEK_API_KEY) return null;

  let chatMessages: ChatMessage[];
  const hasImages = Array.isArray(historyOrCtx) && historyOrCtx.some(m => m.imageUrls && m.imageUrls.length > 0);
  const hasVideo = Array.isArray(historyOrCtx) && historyOrCtx.some(m => m.content?.includes('视频'));

  if (Array.isArray(historyOrCtx)) {
    const systemContent = [
      '你是一个专业的客服助手。请用中文简洁、专业地回复客户问题。根据对话上下文和知识库内容给出有帮助的回答。',
      hasImages ? '当用户发送图片或视频截图时，请仔细查看图片内容并给出有针对性的回复。' : '',
      hasVideo ? '当用户发送视频时，如果有视频截图请分析截图内容，否则请友好地请用户描述视频内容。' : '',
      messageOrKnowledge ? `\n相关知识库内容：\n${messageOrKnowledge}` : '',
    ].filter(Boolean).join('');
    chatMessages = [
      { role: 'system', content: systemContent },
      ...historyOrCtx,
    ];
  } else {
    const systemContent = [
      '你是一个专业的客服助手。请用中文简洁、专业地回复客户问题。',
      knowledgeContext ? `\n相关知识库内容：\n${knowledgeContext}` : '',
    ].join('');
    chatMessages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: messageOrKnowledge ?? '' },
    ];
  }

  return await chatCompletion(chatMessages) ?? null;
}

/**
 * Summarize a conversation (list of messages with content and senderType).
 */
export async function summarizeConversation(
  messages: { content: string; senderType?: string }[]
): Promise<string | null> {
  if (!config.DEEPSEEK_API_KEY) return null;
  const transcript = messages
    .map((m) => `[${m.senderType ?? 'unknown'}]: ${m.content}`)
    .join('\n');
  return chatCompletion([
    {
      role: 'system',
      content: 'Summarize this customer conversation in Chinese in 2-4 sentences. Focus on main topic and outcome.',
    },
    { role: 'user', content: transcript },
  ]);
}

/**
 * Extract key memories/facts from conversation for persistent storage.
 */
export async function extractMemory(
  conversationMessages: { content: string; senderType?: string }[]
): Promise<{ content: string; summary: string; importance: number }[] | null> {
  if (!config.DEEPSEEK_API_KEY) return null;
  const transcript = conversationMessages
    .map((m) => `[${m.senderType ?? 'unknown'}]: ${m.content}`)
    .join('\n');
  const res = await chatCompletion([
    {
      role: 'system',
      content: `From this conversation, extract 0-3 key facts or preferences about the customer. Respond with a JSON array only: [ { "content": "raw fact", "summary": "short label", "importance": 0.0-1.0 } ]. No other text.`,
    },
    { role: 'user', content: transcript },
  ]);
  if (!res) return null;
  try {
    const parsed = JSON.parse(res.trim()) as Array<{
      content?: string;
      summary?: string;
      importance?: number;
    }>;
    return (Array.isArray(parsed) ? parsed : []).map((item) => ({
      content: item.content ?? '',
      summary: item.summary ?? '',
      importance: Math.min(1, Math.max(0, Number(item.importance) ?? 0.5)),
    }));
  } catch {
    return null;
  }
}
