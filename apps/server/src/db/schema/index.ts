import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  logoUrl: text('logo_url'),
  industry: varchar('industry', { length: 100 }),
  scale: varchar('scale', { length: 50 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  website: text('website'),
  address: text('address'),
  description: text('description'),
  plan: varchar('plan', { length: 50 }).default('starter'),
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  maxSeats: integer('max_seats').default(3),
  maxConversationsPerMonth: integer('max_conversations_per_month').default(100),
  maxLeads: integer('max_leads').default(200),
  maxKnowledgeBases: integer('max_knowledge_bases').default(1),
  maxStorageMb: integer('max_storage_mb').default(500),
  features: jsonb('features').$type<string[]>().default([]),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  widgetConfig: jsonb('widget_config').$type<{
    themeColor?: string
    position?: 'bottom-right' | 'bottom-left'
    greeting?: string
    offlineGreeting?: string
    logoUrl?: string
    companyName?: string
    preChatFormEnabled?: boolean
    preChatFormFields?: { field: string; label: string; required: boolean; type: string }[]
    postChatSurveyEnabled?: boolean
    showAgentAvatar?: boolean
    showAgentName?: boolean
    autoPopupDelay?: number
    conversationGradeRules?: { grade: string; minMessages: number }[]
  }>(),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Platform Users (super admins)
// ---------------------------------------------------------------------------
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Subscriptions (billing history)
// ---------------------------------------------------------------------------
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  plan: varchar('plan', { length: 50 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  amount: integer('amount').default(0),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  interval: varchar('interval', { length: 20 }).default('monthly'),
  externalId: varchar('external_id', { length: 255 }),
  startDate: timestamp('start_date', { withTimezone: true }).defaultNow().notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('subscriptions_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Usage Records (monthly tracking)
// ---------------------------------------------------------------------------
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 7 }).notNull(),
  seats: integer('seats').default(0),
  conversations: integer('conversations').default(0),
  messages: integer('messages').default(0),
  leads: integer('leads').default(0),
  storageMb: integer('storage_mb').default(0),
  apiCalls: integer('api_calls').default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('usage_org_period_idx').on(t.orgId, t.period),
]);

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  parentId: uuid('parent_id'),
  leaderId: uuid('leader_id'),
  sort: integer('sort').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('departments_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 50 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  role: varchar('role', { length: 50 }).default('agent').notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  onlineStatus: varchar('online_status', { length: 20 }).default('offline'),
  maxConcurrentChats: integer('max_concurrent_chats').default(10),
  lastOnlineAt: timestamp('last_online_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('users_org_status_idx').on(t.orgId, t.status),
]);

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }),
  role: varchar('role', { length: 50 }).default('agent').notNull(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedBy: uuid('accepted_by').references(() => users.id),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('invitations_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  leaderId: uuid('leader_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('teams_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Team Members (join table)
// ---------------------------------------------------------------------------
export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.teamId, t.userId] }),
]);

// ---------------------------------------------------------------------------
// Roles (custom roles per org)
// ---------------------------------------------------------------------------
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  level: integer('level').notNull().default(10),
  isSystem: boolean('is_system').default(false).notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('roles_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    status: varchar('status', { length: 50 }).default('active').notNull(),
    webhookUrl: text('webhook_url'),
    webhookSecret: varchar('webhook_secret', { length: 255 }),
    stats: jsonb('stats').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('channels_org_platform_name_uniq').on(t.orgId, t.platform, t.name),
  ]
);

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id),
    sourcePlatform: varchar('source_platform', { length: 50 }).notNull(),
    sourceDetail: text('source_detail'),
    campaignId: uuid('campaign_id'),
    utmSource: varchar('utm_source', { length: 255 }),
    utmMedium: varchar('utm_medium', { length: 255 }),
    utmCampaign: varchar('utm_campaign', { length: 255 }),
    utmContent: varchar('utm_content', { length: 255 }),
    utmTerm: varchar('utm_term', { length: 255 }),
    contactName: varchar('contact_name', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 50 }),
    contactWechat: varchar('contact_wechat', { length: 100 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactDingtalk: varchar('contact_dingtalk', { length: 100 }),
    companyName: varchar('company_name', { length: 255 }),
    companyIndustry: varchar('company_industry', { length: 100 }),
    companySize: varchar('company_size', { length: 50 }),
    regionProvince: varchar('region_province', { length: 100 }),
    regionCity: varchar('region_city', { length: 100 }),
    regionDistrict: varchar('region_district', { length: 100 }),
    score: integer('score').default(0).notNull(),
    scoreDetails: jsonb('score_details').$type<Record<string, unknown>>(),
    aiAnalysis: jsonb('ai_analysis').$type<Record<string, unknown>>(),
    status: varchar('status', { length: 50 }).default('new').notNull(),
    assignedTo: uuid('assigned_to').references(() => users.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    notes: text('notes'),
    rawData: jsonb('raw_data').$type<Record<string, unknown>>(),
    customerId: uuid('customer_id'),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('leads_org_status_idx').on(t.orgId, t.status),
    index('leads_org_source_idx').on(t.orgId, t.sourcePlatform),
    index('leads_org_assigned_idx').on(t.orgId, t.assignedTo),
    index('leads_org_created_idx').on(t.orgId, t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).default('individual').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    avatarUrl: text('avatar_url'),
    phone: varchar('phone', { length: 50 }),
    wechatId: varchar('wechat_id', { length: 100 }),
    dingtalkId: varchar('dingtalk_id', { length: 100 }),
    email: varchar('email', { length: 255 }),
    companyName: varchar('company_name', { length: 255 }),
    companyIndustry: varchar('company_industry', { length: 100 }),
    companySize: varchar('company_size', { length: 50 }),
    gender: varchar('gender', { length: 20 }),
    ageRange: varchar('age_range', { length: 50 }),
    regionProvince: varchar('region_province', { length: 100 }),
    regionCity: varchar('region_city', { length: 100 }),
    stage: varchar('stage', { length: 50 }).default('potential').notNull(),
    stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }),
    score: integer('score').default(0).notNull(),
    scoreDetails: jsonb('score_details').$type<Record<string, unknown>>(),
    ownerId: uuid('owner_id').references(() => users.id),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
    stats: jsonb('stats').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('customers_org_stage_idx').on(t.orgId, t.stage),
    index('customers_org_updated_idx').on(t.orgId, t.updatedAt),
  ]
);

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 20 }),
    category: varchar('category', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('tags_org_name').on(t.orgId, t.name)]
);

// ---------------------------------------------------------------------------
// Customer Tags (many-to-many)
// ---------------------------------------------------------------------------
export const customerTags = pgTable(
  'customer_tags',
  {
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.tagId] })]
);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id),
    channelType: varchar('channel_type', { length: 50 }).notNull(),
    externalChatId: varchar('external_chat_id', { length: 255 }),
    agentId: uuid('agent_id').references(() => users.id),
    status: varchar('status', { length: 50 }).default('pending').notNull(),
    priority: varchar('priority', { length: 50 }).default('medium').notNull(),
    aiEnabled: boolean('ai_enabled').default(true).notNull(),
    aiSummary: text('ai_summary'),
    aiSentiment: varchar('ai_sentiment', { length: 50 }),
    slaRespondBy: timestamp('sla_respond_by', { withTimezone: true }),
    slaResolveBy: timestamp('sla_resolve_by', { withTimezone: true }),
    slaFirstResponseAt: timestamp('sla_first_response_at', { withTimezone: true }),
    slaResolvedAt: timestamp('sla_resolved_at', { withTimezone: true }),
    tags: text('tags').array(),
    satisfactionScore: integer('satisfaction_score'),
    satisfactionComment: text('satisfaction_comment'),
    messageCount: integer('message_count').default(0).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    agentLastReadAt: timestamp('agent_last_read_at', { withTimezone: true }),
    summary: text('summary'),
    grade: varchar('grade', { length: 20 }),
    sourcePageUrl: text('source_page_url'),
    sourceKeyword: varchar('source_keyword', { length: 255 }),
    hasLead: boolean('has_lead').default(false),
    detectedContact: jsonb('detected_contact').$type<{ phone?: string; email?: string; wechat?: string }>(),
    isInvalid: boolean('is_invalid').default(false),
    queuePosition: integer('queue_position'),
    queueEnteredAt: timestamp('queue_entered_at', { withTimezone: true }),
    preChatForm: jsonb('pre_chat_form').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('conversations_org_status_idx').on(t.orgId, t.status),
    index('conversations_org_channel_idx').on(t.orgId, t.channelId),
    index('conversations_customer_idx').on(t.customerId),
    index('conversations_org_agent_idx').on(t.orgId, t.agentId),
    index('conversations_org_created_idx').on(t.orgId, t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderType: varchar('sender_type', { length: 50 }).notNull(),
    senderId: uuid('sender_id'),
    contentType: varchar('content_type', { length: 50 }).default('text').notNull(),
    content: text('content').notNull(),
    mediaUrl: text('media_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    aiGenerated: boolean('ai_generated').default(false),
    aiConfidence: real('ai_confidence'),
    aiSources: jsonb('ai_sources').$type<unknown[]>(),
    status: varchar('status', { length: 50 }).default('sent').notNull(),
    externalMessageId: varchar('external_message_id', { length: 255 }),
    readBy: jsonb('read_by').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt),
    index('messages_content_search_idx').on(t.conversationId, t.senderType),
  ]
);

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------
export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 10 }).default('CNY').notNull(),
    stage: varchar('stage', { length: 50 }).default('initial').notNull(),
    probability: integer('probability'),
    expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
    actualCloseDate: timestamp('actual_close_date', { withTimezone: true }),
    ownerId: uuid('owner_id').references(() => users.id),
    products: jsonb('products').$type<unknown[]>(),
    competitors: jsonb('competitors').$type<unknown[]>(),
    lossReason: text('loss_reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('deals_org_stage_idx').on(t.orgId, t.stage),
    index('deals_org_customer_idx').on(t.orgId, t.customerId),
  ]
);

// ---------------------------------------------------------------------------
// Knowledge Bases
// ---------------------------------------------------------------------------
export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  documentCount: integer('document_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('knowledge_bases_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  kbId: uuid('kb_id')
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content'),
  fileUrl: text('file_url'),
  fileType: varchar('file_type', { length: 50 }),
  fileSize: integer('file_size'),
  category: varchar('category', { length: 100 }),
  tags: text('tags').array(),
  processingStatus: varchar('processing_status', { length: 50 }).default('pending').notNull(),
  chunkCount: integer('chunk_count').default(0),
  errorMessage: text('error_message'),
  version: integer('version').default(1).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('documents_kb_idx').on(t.kbId),
]);

// ---------------------------------------------------------------------------
// Document Chunks
// ---------------------------------------------------------------------------
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  tokenCount: integer('token_count'),
  vectorId: varchar('vector_id', { length: 255 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('document_chunks_doc_idx').on(t.documentId),
]);

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------
export const faqs = pgTable('faqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kbId: uuid('kb_id')
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  category: varchar('category', { length: 100 }),
  useCount: integer('use_count').default(0).notNull(),
  helpfulCount: integer('helpful_count').default(0).notNull(),
  vectorId: varchar('vector_id', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('faqs_kb_active_idx').on(t.kbId, t.isActive),
]);

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  vectorId: varchar('vector_id', { length: 255 }),
  importance: real('importance').default(0.5).notNull(),
  decayFactor: real('decay_factor').default(1).notNull(),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: uuid('source_id'),
  category: varchar('category', { length: 100 }),
  tags: text('tags').array(),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('memories_customer_idx').on(t.customerId),
  index('memories_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 50 }).notNull(),
    targetSegment: jsonb('target_segment').$type<Record<string, unknown>>(),
    targetCount: integer('target_count'),
    contentTemplate: jsonb('content_template').$type<Record<string, unknown>>(),
    channelType: varchar('channel_type', { length: 50 }),
    abTestEnabled: boolean('ab_test_enabled').default(false),
    abVariants: jsonb('ab_variants').$type<unknown[]>(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: varchar('status', { length: 50 }).default('draft').notNull(),
    stats: jsonb('stats').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('campaigns_org_status_idx').on(t.orgId, t.status),
  ]
);

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(),
  triggerConfig: jsonb('trigger_config').$type<Record<string, unknown>>(),
  isActive: boolean('is_active').default(false).notNull(),
  executionCount: integer('execution_count').default(0).notNull(),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('workflows_org_active_trigger_idx').on(t.orgId, t.isActive, t.triggerType),
]);

// ---------------------------------------------------------------------------
// Workflow Runs
// ---------------------------------------------------------------------------
export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  triggerEvent: varchar('trigger_event', { length: 100 }).notNull(),
  triggerData: jsonb('trigger_data'),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  stepsExecuted: integer('steps_executed').default(0),
  stepsTotal: integer('steps_total').default(0),
  result: jsonb('result'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  duration: integer('duration_ms'),
}, (t) => [
  index('workflow_runs_workflow_idx').on(t.workflowId),
  index('workflow_runs_org_idx').on(t.orgId, t.startedAt),
]);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content'),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('notifications_user_read_idx').on(t.userId, t.isRead),
  ]
);

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: uuid('resource_id'),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_logs_org_created_idx').on(t.orgId, t.createdAt),
    index('audit_logs_org_action_idx').on(t.orgId, t.action),
    index('audit_logs_user_idx').on(t.userId),
  ]
);

// ---------------------------------------------------------------------------
// Canned Responses (Quick Replies)
// ---------------------------------------------------------------------------
export const cannedResponses = pgTable('canned_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  content: text('content').notNull(),
  shortcut: varchar('shortcut', { length: 50 }),
  category: varchar('category', { length: 50 }),
  isPublic: boolean('is_public').default(true).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  useCount: integer('use_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('canned_responses_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Offline Consultations (leave-a-message when agents are offline)
// ---------------------------------------------------------------------------
export const offlineConsultations = pgTable('offline_consultations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  content: text('content').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  handledBy: uuid('handled_by').references(() => users.id),
  handledAt: timestamp('handled_at', { withTimezone: true }),
  remark: text('remark'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('offline_consultations_org_status_idx').on(t.orgId, t.status),
]);

// ---------------------------------------------------------------------------
// Tickets (工单系统)
// ---------------------------------------------------------------------------
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 50 }).default('general').notNull(),
    source: varchar('source', { length: 50 }).default('manual').notNull(),
    status: varchar('status', { length: 50 }).default('open').notNull(),
    priority: varchar('priority', { length: 50 }).default('medium').notNull(),
    escalationLevel: integer('escalation_level').default(0).notNull(),
    slaFirstResponseDueAt: timestamp('sla_first_response_due_at', { withTimezone: true }),
    slaResolveDueAt: timestamp('sla_resolve_due_at', { withTimezone: true }),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    assigneeId: uuid('assignee_id').references(() => users.id),
    creatorId: uuid('creator_id').references(() => users.id),
    customerId: uuid('customer_id').references(() => customers.id),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    tags: text('tags').array(),
    attachments: jsonb('attachments').$type<{
      name: string;
      url: string;
      type?: string;
      size?: number;
    }[]>(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('tickets_org_status_idx').on(t.orgId, t.status),
    index('tickets_org_priority_idx').on(t.orgId, t.priority),
    index('tickets_org_assignee_idx').on(t.orgId, t.assigneeId),
    index('tickets_org_sla_resolve_idx').on(t.orgId, t.slaResolveDueAt),
  ]
);

// ---------------------------------------------------------------------------
// Ticket Comments
// ---------------------------------------------------------------------------
export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false).notNull(),
  attachments: jsonb('attachments').$type<unknown[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('ticket_comments_ticket_idx').on(t.ticketId),
]);

// ---------------------------------------------------------------------------
// Visitor Tracking
// ---------------------------------------------------------------------------
export const visitorSessions = pgTable(
  'visitor_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    visitorId: varchar('visitor_id', { length: 255 }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    deviceType: varchar('device_type', { length: 50 }),
    browser: varchar('browser', { length: 100 }),
    os: varchar('os', { length: 100 }),
    referrer: text('referrer'),
    landingPage: text('landing_page'),
    currentPage: text('current_page'),
    currentPageTitle: varchar('current_page_title', { length: 500 }),
    pageViews: integer('page_views').default(1).notNull(),
    duration: integer('duration').default(0),
    isOnline: boolean('is_online').default(true).notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('visitor_sessions_org_online_idx').on(t.orgId, t.isOnline),
    index('visitor_sessions_org_active_idx').on(t.orgId, t.lastActiveAt),
  ]
);

// ---------------------------------------------------------------------------
// Page Views (visitor page tracking)
// ---------------------------------------------------------------------------
export const pageViews = pgTable(
  'page_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id').notNull(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    pageTitle: varchar('page_title', { length: 500 }),
    referrer: text('referrer'),
    duration: integer('duration'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('page_views_session_created_idx').on(t.sessionId, t.createdAt),
    index('page_views_org_created_idx').on(t.orgId, t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Blacklist
// ---------------------------------------------------------------------------
export const blacklist = pgTable(
  'blacklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('blacklist_org_type_value_uniq').on(t.orgId, t.type, t.value),
  ]
);

// ---------------------------------------------------------------------------
// Escalation Rules
// ---------------------------------------------------------------------------
export const escalationRules = pgTable('escalation_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  isActive: boolean('is_active').default(true),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(),
  thresholdMinutes: integer('threshold_minutes').notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  actionConfig: jsonb('action_config').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('escalation_rules_org_active_idx').on(t.orgId, t.isActive),
]);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    url: text('url').notNull(),
    events: text('events').array().notNull(),
    secret: varchar('secret', { length: 255 }),
    isActive: boolean('is_active').default(true).notNull(),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    failCount: integer('fail_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('webhooks_org_active_idx').on(t.orgId, t.isActive),
  ]
);

// ---------------------------------------------------------------------------
// Auto Reply Rules
// ---------------------------------------------------------------------------
export const autoReplyRules = pgTable('auto_reply_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  isActive: boolean('is_active').default(true),
  priority: integer('priority').default(0),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(),
  triggerConfig: jsonb('trigger_config').notNull(),
  replyContent: text('reply_content').notNull(),
  replyType: varchar('reply_type', { length: 20 }).default('text'),
  menuOptions: jsonb('menu_options'),
  matchCount: integer('match_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Customer Segments
// ---------------------------------------------------------------------------
export const customerSegments = pgTable('customer_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  filters: jsonb('filters').notNull(),
  color: varchar('color', { length: 20 }),
  customerCount: integer('customer_count').default(0),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('customer_segments_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Routing Rules
// ---------------------------------------------------------------------------
export const routingRules = pgTable('routing_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  isActive: boolean('is_active').default(true),
  priority: integer('priority').default(0),
  conditions: jsonb('conditions').notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: uuid('target_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Proactive Chat Rules
// ---------------------------------------------------------------------------
export const proactiveChatRules = pgTable('proactive_chat_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  isActive: boolean('is_active').default(true),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(),
  triggerConfig: jsonb('trigger_config').notNull(),
  message: text('message').notNull(),
  displayDelay: integer('display_delay').default(0),
  maxShowCount: integer('max_show_count').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Conversation Inspections (质检记录)
// ---------------------------------------------------------------------------
export const conversationInspections = pgTable('conversation_inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  inspectorId: uuid('inspector_id').notNull().references(() => users.id),
  score: integer('score').notNull(), // 1-100
  grade: varchar('grade', { length: 20 }).notNull(), // A/B/C/D/E
  categories: jsonb('categories').$type<Record<string, number>>(),
  strengths: text('strengths'),
  weaknesses: text('weaknesses'),
  suggestions: text('suggestions'),
  status: varchar('status', { length: 50 }).default('completed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('inspections_org_idx').on(t.orgId, t.createdAt),
  index('inspections_conv_idx').on(t.conversationId),
]);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, { fields: [departments.orgId], references: [organizations.id] }),
  leader: one(users, { fields: [departments.leaderId], references: [users.id] }),
  parent: one(departments, { fields: [departments.parentId], references: [departments.id] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  departments: many(departments),
  teams: many(teams),
  channels: many(channels),
  leads: many(leads),
  customers: many(customers),
  tags: many(tags),
  conversations: many(conversations),
  knowledgeBases: many(knowledgeBases),
  campaigns: many(campaigns),
  workflows: many(workflows),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  teamsLed: many(teams),
  teamMemberships: many(teamMembers),
  leadsAssigned: many(leads),
  customersOwned: many(customers),
  conversations: many(conversations),
  deals: many(deals),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, { fields: [teams.orgId], references: [organizations.id] }),
  leader: one(users, { fields: [teams.leaderId], references: [users.id] }),
  members: many(teamMembers),
}));

export const rolesRelations = relations(roles, ({ one }) => ({
  organization: one(organizations),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  organization: one(organizations),
  leads: many(leads),
  conversations: many(conversations),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  organization: one(organizations),
  channel: one(channels),
  assignedToUser: one(users),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  organization: one(organizations),
  owner: one(users),
  customerTags: many(customerTags),
  conversations: many(conversations),
  deals: many(deals),
  memories: many(memories),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organizations),
  customerTags: many(customerTags),
}));

export const customerTagsRelations = relations(customerTags, ({ one }) => ({
  customer: one(customers),
  tag: one(tags),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  organization: one(organizations),
  customer: one(customers),
  channel: one(channels),
  agent: one(users),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  organization: one(organizations),
  customer: one(customers),
  owner: one(users),
}));

export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  organization: one(organizations),
  documents: many(documents),
  faqs: many(faqs),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases),
  createdByUser: one(users),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents),
}));

export const faqsRelations = relations(faqs, ({ one }) => ({
  knowledgeBase: one(knowledgeBases),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  organization: one(organizations),
  customer: one(customers),
}));

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  organization: one(organizations),
  createdByUser: one(users),
}));

export const workflowsRelations = relations(workflows, ({ one }) => ({
  organization: one(organizations),
  createdByUser: one(users),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations),
  user: one(users),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations),
  user: one(users),
}));

export const cannedResponsesRelations = relations(cannedResponses, ({ one }) => ({
  organization: one(organizations),
  createdByUser: one(users),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id] }),
  creator: one(users, { fields: [tickets.creatorId], references: [users.id] }),
  customer: one(customers),
  conversation: one(conversations),
  comments: many(ticketComments),
}));

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets),
  author: one(users),
}));

export const visitorSessionsRelations = relations(visitorSessions, ({ one }) => ({
  organization: one(organizations),
  customer: one(customers),
}));

export const pageViewsRelations = relations(pageViews, ({ one }) => ({
  organization: one(organizations),
}));

export const blacklistRelations = relations(blacklist, ({ one }) => ({
  organization: one(organizations),
  createdByUser: one(users),
}));

export const escalationRulesRelations = relations(escalationRules, ({ one }) => ({
  organization: one(organizations),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  organization: one(organizations),
}));

export const autoReplyRulesRelations = relations(autoReplyRules, ({ one }) => ({
  organization: one(organizations),
}));

export const customerSegmentsRelations = relations(customerSegments, ({ one }) => ({
  organization: one(organizations),
}));

export const routingRulesRelations = relations(routingRules, ({ one }) => ({
  organization: one(organizations),
}));

export const proactiveChatRulesRelations = relations(proactiveChatRules, ({ one }) => ({
  organization: one(organizations),
}));

export const conversationInspectionsRelations = relations(conversationInspections, ({ one }) => ({
  organization: one(organizations),
  conversation: one(conversations),
  inspector: one(users),
}));
