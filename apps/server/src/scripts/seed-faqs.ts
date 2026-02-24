import { db, closeDb } from '../db/connection';
import { organizations, knowledgeBases, faqs } from '../db/schema';
import { eq } from 'drizzle-orm';

const SITE_TOKEN = '06a12e23-acda-45eb-92d3-071a4eaacb3b';

const FAQ_DATA = [
  { category: '产品功能', question: '火客系统支持哪些客服渠道？', answer: '火客系统支持网页在线客服、微信公众号、企业微信、邮件、API 等多种渠道接入。所有渠道的消息统一汇聚到客服工作台，让客服人员高效处理。' },
  { category: '产品功能', question: 'AI 智能客服是怎么工作的？', answer: '火客的 AI 智能客服基于 DeepSeek 大模型，结合您的知识库内容自动回复客户问题。当 AI 无法解答时，会自动转接人工客服。您还可以训练 AI 提升回复质量。' },
  { category: '产品功能', question: '支持多少个客服坐席同时在线？', answer: '根据您的套餐不同，支持的坐席数量也不同。创业版支持 10 个坐席，专业版支持 50 个坐席，企业版支持无限坐席。可随时升级套餐。' },
  { category: '产品功能', question: '可以自定义客服组件的样式吗？', answer: '可以。您可以在后台设置客服组件的主题颜色、位置、欢迎语、Logo 等。组件会自动适配您网站的风格，支持 PC 和移动端。' },
  { category: '产品功能', question: '系统支持发送图片和视频吗？', answer: '支持。客服和客户都可以在聊天中发送图片、视频、文档等多种类型的文件。图片最大 10MB，视频最大 50MB。AI 还能自动识别图片内容。' },
  { category: '使用指南', question: '如何在我的网站嵌入客服组件？', answer: '只需一行代码即可嵌入。登录后台 → 设置 → 客服组件，复制嵌入代码粘贴到您网站的 HTML 中即可。支持 WordPress、Shopify 等主流建站平台。' },
  { category: '使用指南', question: '如何创建和管理知识库？', answer: '进入后台「知识库」模块，创建知识库后可以上传文档（PDF、Word、TXT）或手动添加 FAQ。AI 会自动学习知识库内容，回复客户时引用相关知识。' },
  { category: '使用指南', question: '如何设置自动回复规则？', answer: '在后台「设置 → 自动回复」中，您可以设置关键词触发的自动回复、非工作时间回复、以及 AI 自动回复。支持精确匹配和模糊匹配。' },
  { category: '使用指南', question: '如何导入客户和线索数据？', answer: '在「线索管理」或「客户管理」页面，点击「导入」按钮，上传 CSV 文件即可批量导入。系统会自动匹配字段，支持去重和数据校验。单次最多导入 10000 条。' },
  { category: '使用指南', question: '如何查看数据分析报表？', answer: '进入后台「数据分析」模块，可以查看会话量、响应时间、客户满意度、坐席绩效等多维度报表。支持按时间筛选和导出 CSV。还有 AI 智能洞察功能。' },
  { category: '账号与计费', question: '如何注册企业账号？', answer: '访问火客官网，点击「免费注册」，填写企业信息即可完成注册。注册后自动获得创业版套餐（限时免费），可直接开始使用全部功能。' },
  { category: '账号与计费', question: '套餐到期后数据会丢失吗？', answer: '不会。套餐到期后数据会完整保留 90 天，期间您可以随时续费恢复使用。超过 90 天未续费，数据将被安全清除。建议及时续费以免影响业务。' },
  { category: '账号与计费', question: '可以随时升级或降级套餐吗？', answer: '可以随时升级套餐，差价会按剩余天数折算。降级需在当前套餐到期后生效。升级即时生效，新功能和配额立即可用。' },
  { category: '账号与计费', question: '如何添加团队成员？', answer: '管理员登录后台 → 设置 → 团队管理 → 邀请成员。输入邮箱发送邀请，被邀请人点击链接即可加入。支持设置不同角色（管理员、客服、主管等）。' },
  { category: '技术支持', question: '客服组件会影响网站加载速度吗？', answer: '不会。客服组件采用异步加载方式，脚本体积仅约 30KB（gzip 后），不会阻塞页面渲染。组件在页面加载完成后才会初始化。' },
  { category: '技术支持', question: '系统支持 API 对接吗？', answer: '支持。火客提供完整的 RESTful API 和 Webhook 回调，可以与您的 CRM、ERP、工单系统等无缝对接。API 文档详细，提供多语言 SDK 示例。' },
  { category: '技术支持', question: '数据安全性如何保障？', answer: '火客采用多租户隔离架构，每个企业数据完全独立。传输层使用 HTTPS 加密，数据库定期备份。支持数据导出和删除，完全符合数据保护规范。' },
  { category: '技术支持', question: '遇到技术问题如何获得帮助？', answer: '您可以通过以下方式获得帮助：1) 在线客服（工作日 9:00-18:00）；2) 提交工单；3) 查阅帮助文档和 API 文档；4) 企业版客户享有专属技术经理支持。' },
  { category: '常见问题', question: '访客聊天记录可以导出吗？', answer: '可以。在「历史会话」中可以导出所有聊天记录为 CSV 格式。支持按时间、客服、渠道等条件筛选后导出，方便质检和数据分析。' },
  { category: '常见问题', question: '支持离线留言功能吗？', answer: '支持。当所有客服不在线时，系统会自动切换为留言模式。客户可以填写姓名、联系方式和咨询内容。客服上线后会在工作台收到提醒，及时跟进。' },
];

async function main() {
  console.log('Seeding FAQs...');

  const [org] = await db.select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, SITE_TOKEN))
    .limit(1);

  if (!org) {
    console.error('Organization not found for site token:', SITE_TOKEN);
    process.exit(1);
  }
  console.log('Found org:', org.id);

  let [kb] = await db.select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.orgId, org.id))
    .limit(1);

  if (!kb) {
    console.log('No knowledge base found, creating one...');
    const [newKb] = await db.insert(knowledgeBases).values({
      orgId: org.id,
      name: '默认知识库',
      description: '系统默认知识库，包含常见问题',
    }).returning({ id: knowledgeBases.id });
    kb = newKb;
  }
  console.log('Using KB:', kb.id);

  await db.delete(faqs).where(eq(faqs.kbId, kb.id));
  console.log('Cleared existing FAQs');

  const rows = FAQ_DATA.map(f => ({
    kbId: kb.id,
    question: f.question,
    answer: f.answer,
    category: f.category,
    useCount: Math.floor(Math.random() * 50),
  }));

  await db.insert(faqs).values(rows);
  console.log(`Inserted ${rows.length} FAQs successfully!`);
  await closeDb();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
