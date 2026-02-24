import { db } from '../db/connection';
import { escalationRules, conversations, messages, users, organizations } from '../db/schema';
import { eq, and, isNull, lt, ne, sql, desc, inArray } from 'drizzle-orm';
import { createNotificationForOrg } from './notification.service';

const processedEscalations = new Map<string, number>();
const MAX_PROCESSED_ESCALATIONS = 10000;

function escalationKey(ruleId: string, conversationId: string): string {
  return `${ruleId}:${conversationId}`;
}

export async function checkEscalations(): Promise<void> {
  try {
    const orgsWithRules = await db
      .selectDistinct({ orgId: escalationRules.orgId })
      .from(escalationRules)
      .where(eq(escalationRules.isActive, true));

    for (const { orgId } of orgsWithRules) {
      const rules = await db
        .select()
        .from(escalationRules)
        .where(and(eq(escalationRules.orgId, orgId), eq(escalationRules.isActive, true)));

      if (rules.length === 0) continue;

      for (const rule of rules) {
        const thresholdTime = new Date(Date.now() - rule.thresholdMinutes * 60 * 1000);

        let matchingConvs: { id: string; customerId: string; agentId: string | null; priority: string }[] = [];

        if (rule.triggerType === 'first_response_sla') {
          matchingConvs = await db
            .select({ id: conversations.id, customerId: conversations.customerId, agentId: conversations.agentId, priority: conversations.priority })
            .from(conversations)
            .where(and(
              eq(conversations.orgId, orgId),
              isNull(conversations.firstResponseAt),
              ne(conversations.status, 'resolved'),
              ne(conversations.status, 'closed'),
              lt(conversations.createdAt, thresholdTime),
            ));
        } else if (rule.triggerType === 'resolution_sla') {
          matchingConvs = await db
            .select({ id: conversations.id, customerId: conversations.customerId, agentId: conversations.agentId, priority: conversations.priority })
            .from(conversations)
            .where(and(
              eq(conversations.orgId, orgId),
              ne(conversations.status, 'resolved'),
              ne(conversations.status, 'closed'),
              lt(conversations.createdAt, thresholdTime),
            ));
        } else if (rule.triggerType === 'no_response') {
          matchingConvs = await db.execute(sql`
            SELECT c.id, c.customer_id as "customerId", c.agent_id as "agentId", c.priority
            FROM conversations c
            WHERE c.org_id = ${orgId}
              AND c.status NOT IN ('resolved', 'closed')
              AND EXISTS (
                SELECT 1 FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_type = 'customer'
                  AND m.created_at = (
                    SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id
                  )
                  AND m.created_at < ${thresholdTime.toISOString()}::timestamptz
              )
          `).then(r => (r as unknown as any[]));
        } else if (rule.triggerType === 'priority_high') {
          matchingConvs = await db
            .select({ id: conversations.id, customerId: conversations.customerId, agentId: conversations.agentId, priority: conversations.priority })
            .from(conversations)
            .where(and(
              eq(conversations.orgId, orgId),
              ne(conversations.status, 'resolved'),
              ne(conversations.status, 'closed'),
              lt(conversations.createdAt, thresholdTime),
              inArray(conversations.priority, ['high', 'urgent']),
            ));
        }

        for (const conv of matchingConvs) {
          const key = escalationKey(rule.id, conv.id);
          if (processedEscalations.has(key)) continue;
          if (processedEscalations.size > MAX_PROCESSED_ESCALATIONS) processedEscalations.clear();
          processedEscalations.set(key, Date.now());

          await executeAction(orgId, rule, conv);
        }
      }
    }

    const oneHourAgo = Date.now() - 3_600_000;
    for (const [k, ts] of processedEscalations) {
      if (ts < oneHourAgo) processedEscalations.delete(k);
    }
  } catch (err) {
    console.error('[Escalation] check failed:', err);
  }
}

async function executeAction(
  orgId: string,
  rule: typeof escalationRules.$inferSelect,
  conv: { id: string; agentId: string | null; priority: string },
) {
  const config = (rule.actionConfig ?? {}) as Record<string, unknown>;

  if (rule.action === 'notify_manager') {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, orgId), inArray(users.role, ['admin', 'manager'])));

    await createNotificationForOrg(orgId, admins.map(a => a.id), {
      type: 'escalation',
      title: `升级提醒: ${rule.name}`,
      content: `会话 #${conv.id.slice(0, 8)} 触发了升级规则「${rule.name}」`,
      resourceType: 'conversation',
      resourceId: conv.id,
    });
  } else if (rule.action === 'reassign') {
    const targetUserId = config.targetUserId as string | undefined;
    if (targetUserId) {
      await db
        .update(conversations)
        .set({ agentId: targetUserId, updatedAt: new Date() })
        .where(eq(conversations.id, conv.id));
    }
  } else if (rule.action === 'change_priority') {
    const priority = (config.priority as string) ?? 'urgent';
    await db
      .update(conversations)
      .set({ priority, updatedAt: new Date() })
      .where(eq(conversations.id, conv.id));
  } else if (rule.action === 'notify_team') {
    const agents = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.status, 'active')));

    await createNotificationForOrg(orgId, agents.map(a => a.id), {
      type: 'escalation',
      title: `升级提醒: ${rule.name}`,
      content: `会话 #${conv.id.slice(0, 8)} 触发了升级规则「${rule.name}」`,
      resourceType: 'conversation',
      resourceId: conv.id,
    });
  }
}
