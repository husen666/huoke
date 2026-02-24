import { db } from '../db/connection';
import { workflows, workflowRuns, leads, customers, deals, tickets, notifications } from '../db/schema';
import { eq, and } from 'drizzle-orm';

interface WorkflowStep {
  type: string;
  config: Record<string, unknown>;
}

export async function triggerWorkflows(orgId: string, eventType: string, eventData: Record<string, unknown>): Promise<void> {
  try {
    const activeWorkflows = await db.select().from(workflows)
      .where(and(eq(workflows.orgId, orgId), eq(workflows.isActive, true), eq(workflows.triggerType, eventType)));

    for (const wf of activeWorkflows) {
      executeWorkflow(wf, eventType, eventData).catch(() => {});
    }
  } catch (error) {
    console.error('[workflow] Trigger error:', error);
  }
}

async function executeWorkflow(workflow: typeof workflows.$inferSelect, triggerEvent: string, triggerData: Record<string, unknown>): Promise<void> {
  const definition = workflow.definition as { steps?: WorkflowStep[] } | null;
  const steps = definition?.steps || [];

  const [run] = await db.insert(workflowRuns).values({
    workflowId: workflow.id,
    orgId: workflow.orgId,
    triggerEvent,
    triggerData,
    status: 'running',
    stepsTotal: steps.length,
    stepsExecuted: 0,
  }).returning();

  if (!run) return;
  const startTime = Date.now();

  try {
    let stepsExecuted = 0;

    for (const step of steps) {
      await executeStep(step, workflow.orgId, triggerData);
      stepsExecuted++;
    }

    const duration = Date.now() - startTime;
    await db.update(workflowRuns).set({
      status: 'completed',
      stepsExecuted,
      completedAt: new Date(),
      duration,
      result: { message: 'All steps executed successfully' },
    }).where(eq(workflowRuns.id, run.id));

    await db.update(workflows).set({
      executionCount: (workflow.executionCount || 0) + 1,
      lastExecutedAt: new Date(),
    }).where(eq(workflows.id, workflow.id));

  } catch (error) {
    const duration = Date.now() - startTime;
    await db.update(workflowRuns).set({
      status: 'failed',
      completedAt: new Date(),
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).where(eq(workflowRuns.id, run.id));
  }
}

async function executeStep(step: WorkflowStep, orgId: string, context: Record<string, unknown>): Promise<void> {
  switch (step.type) {
    case 'send_notification': {
      const { userId, title, content } = step.config as { userId?: string; title?: string; content?: string };
      if (userId) {
        await db.insert(notifications).values({
          userId: userId as string,
          orgId,
          title: title || '工作流通知',
          content: content || '工作流触发了一个通知',
          type: 'workflow',
          resourceType: 'workflow',
        });
      }
      break;
    }
    case 'update_field': {
      const { resourceType, resourceId, field, value } = step.config as { resourceType?: string; resourceId?: string; field?: string; value?: unknown };
      const targetId = resourceId || (context as Record<string, unknown>).id;
      const allowedFields: Record<string, Set<string>> = {
        lead: new Set(['status', 'assignedTo', 'score', 'notes', 'tags']),
        customer: new Set(['stage', 'score', 'notes', 'tags']),
        deal: new Set(['stage', 'amount', 'notes', 'probability']),
      };
      if (!resourceType || !field || !allowedFields[resourceType]?.has(field)) break;
      if (targetId && field) {
        if (resourceType === 'lead') {
          await db.update(leads).set({ [field]: value } as any).where(eq(leads.id, targetId as string));
        } else if (resourceType === 'customer') {
          await db.update(customers).set({ [field]: value } as any).where(eq(customers.id, targetId as string));
        } else if (resourceType === 'deal') {
          await db.update(deals).set({ [field]: value } as any).where(eq(deals.id, targetId as string));
        }
      }
      break;
    }
    case 'assign_agent': {
      const { agentId, resourceType } = step.config as { agentId?: string; resourceType?: string };
      const targetId = (context as Record<string, unknown>).id;
      if (agentId && targetId) {
        if (resourceType === 'lead') {
          await db.update(leads).set({ assignedTo: agentId }).where(eq(leads.id, targetId as string));
        } else if (resourceType === 'ticket') {
          await db.update(tickets).set({ assigneeId: agentId }).where(eq(tickets.id, targetId as string));
        }
      }
      break;
    }
    case 'wait': {
      const { seconds } = step.config as { seconds?: number };
      if (seconds && seconds > 0 && seconds <= 300) {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      }
      break;
    }
    default:
      break;
  }
}
