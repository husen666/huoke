import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { webhooks } from '../db/schema';

export async function dispatchWebhookEvent(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const activeWebhooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.orgId, orgId), eq(webhooks.isActive, true)));

    const matching = activeWebhooks.filter((wh) =>
      wh.events.includes(eventType),
    );

    for (const wh of matching) {
      deliverWebhook(wh, eventType, payload).catch(() => {});
    }
  } catch {
    // never crash the caller
  }
}

async function deliverWebhook(
  wh: typeof webhooks.$inferSelect,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (wh.secret) {
      headers['X-Webhook-Secret'] = wh.secret;
    }

    const res = await fetch(wh.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: eventType,
        data: payload,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    await db
      .update(webhooks)
      .set({ lastTriggeredAt: new Date(), failCount: 0 })
      .where(eq(webhooks.id, wh.id));
  } catch {
    const newFailCount = (wh.failCount ?? 0) + 1;
    await db
      .update(webhooks)
      .set({
        failCount: newFailCount,
        ...(newFailCount >= 10 ? { isActive: false } : {}),
      })
      .where(eq(webhooks.id, wh.id));
  } finally {
    clearTimeout(timeout);
  }
}
