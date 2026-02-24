import { db } from '../db/connection';
import { campaigns, leads, customers, notifications } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logAudit } from './audit.service';

export async function executeCampaign(campaignId: string, orgId: string, userId: string): Promise<void> {
  try {
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId))).limit(1);
    if (!campaign) return;

    const audienceFilter = (campaign.targetSegment as Record<string, unknown>) || {};
    let recipients: { id: string; name: string | null; email?: string | null; phone?: string | null }[] = [];

    if (campaign.type === 'email' || campaign.type === 'sms' || campaign.type === 'mass_message') {
      const targetSource = audienceFilter.source || 'leads';
      if (targetSource === 'customers') {
        const query = db.select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone }).from(customers).where(eq(customers.orgId, orgId));
        recipients = await query.limit(campaign.targetCount ?? 1000);
      } else {
        const query = db.select({ id: leads.id, name: leads.contactName, email: leads.contactEmail, phone: leads.contactPhone }).from(leads).where(eq(leads.orgId, orgId));
        recipients = await query.limit(campaign.targetCount ?? 1000);
      }
    }

    const totalRecipients = recipients.length;
    let sentCount = 0;
    let failedCount = 0;

    const batchSize = 50;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      for (const recipient of batch) {
        try {
          if (campaign.type === 'email' && recipient.email) {
            sentCount++;
          } else if (campaign.type === 'sms' && recipient.phone) {
            sentCount++;
          } else if (campaign.type === 'mass_message') {
            sentCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      }

      const progressPercent = Math.round((i + batch.length) / totalRecipients * 100);
      if (progressPercent % 10 === 0 || i + batchSize >= recipients.length) {
        await db.update(campaigns).set({
          stats: {
            sentCount,
            openedCount: 0,
            repliedCount: 0,
            failedCount,
            totalRecipients,
            progress: progressPercent,
          },
        }).where(eq(campaigns.id, campaignId));
      }
    }

    await db.update(campaigns).set({
      status: 'completed',
      stats: { sentCount, openedCount: 0, repliedCount: 0, failedCount, totalRecipients, progress: 100 },
      completedAt: new Date(),
    }).where(eq(campaigns.id, campaignId));

    await db.insert(notifications).values({
      userId,
      orgId,
      title: `活动 "${campaign.name}" 执行完成`,
      content: `发送 ${sentCount} 条，失败 ${failedCount} 条`,
      type: 'campaign',
      resourceType: 'campaign',
      resourceId: campaignId,
    });

    logAudit({ orgId, userId, action: 'execute', resourceType: 'campaign', resourceId: campaignId, details: { sentCount, failedCount, totalRecipients } }).catch(() => {});
  } catch (error) {
    await db.update(campaigns).set({
      status: 'failed',
      stats: { error: error instanceof Error ? error.message : 'Unknown error' },
    }).where(eq(campaigns.id, campaignId)).catch(() => {});
  }
}

export async function checkScheduledCampaigns(): Promise<void> {
  try {
    const nowStr = new Date().toISOString();
    const claimed = await db.update(campaigns)
      .set({ status: 'sending' })
      .where(and(
        eq(campaigns.status, 'scheduled'),
        sql`${campaigns.scheduledAt} <= ${nowStr}`
      ))
      .returning();

    for (const campaign of claimed) {
      executeCampaign(campaign.id, campaign.orgId, campaign.createdBy || 'system').catch((err) => {
        console.error(`[scheduler] Campaign ${campaign.id} execution failed:`, err);
      });
    }
  } catch (error) {
    console.error('[scheduler] Campaign check failed:', error);
  }
}
