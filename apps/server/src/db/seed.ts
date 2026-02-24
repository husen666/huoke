import bcrypt from 'bcryptjs';
import { db } from './connection';
import {
  organizations,
  users,
  channels,
  leads,
  customers,
} from './schema';

async function seed() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: '火客默认组织',
      plan: 'pro',
      settings: {},
    })
    .returning();

  if (!org) {
    console.error('Failed to create organization');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash('admin123', 10);
  const [admin] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: 'admin@huoke.com',
      passwordHash,
      name: '管理员',
      role: 'admin',
      status: 'active',
    })
    .returning();

  if (!admin) {
    console.error('Failed to create admin user');
    process.exit(1);
  }

  const [chWechat, chWeb] = await db
    .insert(channels)
    .values([
      {
        orgId: org.id,
        platform: 'wechat',
        name: '微信公众号',
        status: 'active',
        config: {},
      },
      {
        orgId: org.id,
        platform: 'web',
        name: '官网留资',
        status: 'active',
        config: {},
      },
    ])
    .returning();

  await db.insert(leads).values([
    {
      orgId: org.id,
      channelId: chWechat?.id,
      sourcePlatform: 'wechat',
      contactName: '张先生',
      contactPhone: '13800138001',
      companyName: '示例科技',
      companyIndustry: '互联网',
      score: 75,
      status: 'new',
    },
    {
      orgId: org.id,
      channelId: chWeb?.id,
      sourcePlatform: 'web',
      contactName: '李女士',
      contactEmail: 'li@example.com',
      companyName: '测试企业',
      score: 60,
      status: 'contacted',
    },
  ]);

  await db.insert(customers).values([
    {
      orgId: org.id,
      type: 'individual',
      name: '王客户',
      phone: '13900139000',
      stage: 'interested',
      ownerId: admin.id,
    },
    {
      orgId: org.id,
      type: 'enterprise',
      name: 'ABC公司',
      companyName: 'ABC有限公司',
      companyIndustry: '制造业',
      stage: 'opportunity',
      ownerId: admin.id,
    },
  ]);

  console.log('Seed completed successfully.');
  console.log('  Organization:', org.name, org.id);
  console.log('  Admin user: admin@huoke.com / admin123');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
