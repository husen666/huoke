import { db } from '../db/connection';
import { auditLogs } from '../db/schema';

interface AuditParams {
  orgId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: params.orgId,
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    changes: params.details,
    ipAddress: params.ipAddress,
  });
}

export async function logAuditBatch(items: AuditParams[]): Promise<void> {
  if (items.length === 0) return;
  await db.insert(auditLogs).values(
    items.map(p => ({
      orgId: p.orgId,
      userId: p.userId,
      action: p.action,
      resourceType: p.resourceType,
      resourceId: p.resourceId,
      changes: p.details,
      ipAddress: p.ipAddress,
    }))
  );
}
