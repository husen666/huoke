import { db } from './connection';
import { notifications, users, organizations } from './schema';
import { eq } from 'drizzle-orm';

async function seedNotifications() {
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    console.error('No organization found. Run seed first.');
    process.exit(1);
  }

  const orgUsers = await db.select().from(users).where(eq(users.orgId, org.id));
  if (orgUsers.length === 0) {
    console.error('No users found. Run seed first.');
    process.exit(1);
  }

  const admin = orgUsers.find(u => u.role === 'admin') ?? orgUsers[0];
  const now = Date.now();
  const min = 60_000;
  const hour = 3_600_000;

  const testNotifications = [
    {
      orgId: org.id,
      userId: admin.id,
      type: 'conversation_new',
      title: '新客户咨询',
      content: '来自网页端的新访客发起了咨询，请及时响应。',
      resourceType: 'conversation',
      createdAt: new Date(now - 5 * min),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'conversation_assign',
      title: '新会话分配给你',
      content: '客户「王客户」的咨询会话已分配给你处理。',
      resourceType: 'conversation',
      createdAt: new Date(now - 15 * min),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'sla_warning',
      title: 'SLA 即将超时',
      content: '会话 #a1b2c3 的首次响应 SLA 还有 10 分钟到期，请尽快回复客户。',
      resourceType: 'conversation',
      createdAt: new Date(now - 30 * min),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'lead_new',
      title: '新线索进入',
      content: '张先生（示例科技）通过微信公众号提交了留资表单，AI 评分 75 分。',
      resourceType: 'lead',
      createdAt: new Date(now - 1 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'conversation_transfer',
      title: '有会话转接给你',
      content: '来自同事的转接，客户咨询技术集成问题。',
      resourceType: 'conversation',
      createdAt: new Date(now - 2 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'sla_breach',
      title: 'SLA 已超时',
      content: '会话的解决时限已超过 SLA 标准，请尽快处理。',
      resourceType: 'conversation',
      createdAt: new Date(now - 3 * hour),
      isRead: true,
      readAt: new Date(now - 2.5 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'member_join',
      title: '新成员加入团队',
      content: '李客服 通过邀请链接加入了组织，角色：客服。',
      createdAt: new Date(now - 5 * hour),
      isRead: true,
      readAt: new Date(now - 4 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'campaign_complete',
      title: '营销活动已完成',
      content: '「春节促销推广」活动已执行完毕，触达 1,234 名客户，打开率 23.5%。',
      resourceType: 'campaign',
      createdAt: new Date(now - 8 * hour),
      isRead: true,
      readAt: new Date(now - 7 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'conversation_resolved',
      title: '会话已解决',
      content: '客户「ABC公司」的咨询会话已标记为解决，满意度评分 5/5。',
      resourceType: 'conversation',
      createdAt: new Date(now - 12 * hour),
      isRead: true,
      readAt: new Date(now - 11 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'system',
      title: '系统维护通知',
      content: '系统将于今晚 02:00-04:00 进行例行维护升级，届时服务可能短暂中断。',
      createdAt: new Date(now - 24 * hour),
      isRead: true,
      readAt: new Date(now - 23 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'role_change',
      title: '角色已变更',
      content: '你的角色已从「客服」变更为「管理员」。',
      createdAt: new Date(now - 48 * hour),
      isRead: true,
      readAt: new Date(now - 47 * hour),
    },
    {
      orgId: org.id,
      userId: admin.id,
      type: 'lead_assign',
      title: '新线索分配',
      content: '线索「李女士 - 测试企业」已分配给你跟进，评分 60 分。',
      resourceType: 'lead',
      createdAt: new Date(now - 72 * hour),
      isRead: true,
      readAt: new Date(now - 71 * hour),
    },
  ];

  await db.insert(notifications).values(testNotifications);

  const unreadCount = testNotifications.filter(n => !n.isRead).length;
  console.log(`Seeded ${testNotifications.length} notifications (${unreadCount} unread) for user: ${admin.name} (${admin.email})`);
  process.exit(0);
}

seedNotifications().catch((err) => {
  console.error('Seed notifications failed:', err);
  process.exit(1);
});
