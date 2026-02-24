import { db } from '../db/connection';
import { notifications } from '../db/schema';
import { getIO, emitNotificationNew } from '../websocket/socket';

interface CreateNotificationParams {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  content?: string;
  resourceType?: string;
  resourceId?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  const [row] = await db
    .insert(notifications)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      content: params.content ?? null,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
    })
    .returning();

  const io = getIO();
  if (io && row) {
    emitNotificationNew(io, params.userId, {
      type: params.type,
      title: params.title,
      content: params.content,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    });
  }

  return row;
}

export async function createNotificationForOrg(
  orgId: string,
  userIds: string[],
  data: Omit<CreateNotificationParams, 'orgId' | 'userId'>
) {
  if (userIds.length === 0) return [];
  const values = userIds.map((userId) => ({
    orgId,
    userId,
    type: data.type,
    title: data.title,
    content: data.content ?? null,
    resourceType: data.resourceType ?? null,
    resourceId: data.resourceId ?? null,
  }));
  const rows = await db.insert(notifications).values(values).returning();

  const io = getIO();
  if (io) {
    for (const userId of userIds) {
      emitNotificationNew(io, userId, {
        type: data.type,
        title: data.title,
        content: data.content,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
      });
    }
  }

  return rows;
}
