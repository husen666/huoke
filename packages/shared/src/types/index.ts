/**
 * Shared types for the marketing system.
 * IDs are UUID strings; dates are ISO 8601 strings.
 */

import {
  LEAD_STATUSES,
  CUSTOMER_STAGES,
  CONVERSATION_STATUSES,
  MESSAGE_TYPES,
  PRIORITIES,
  USER_ROLES,
} from '../constants';

// Re-export const arrays from constants so types + arrays are available from one place.
export { LEAD_STATUSES, CUSTOMER_STAGES, CONVERSATION_STATUSES, MESSAGE_TYPES, PRIORITIES, USER_ROLES } from '../constants';

// ---------------------------------------------------------------------------
// Enum-like unions (types derived from const arrays)
// ---------------------------------------------------------------------------

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type CustomerStage = (typeof CUSTOMER_STAGES)[number];
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type MessageContentType = (typeof MESSAGE_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type UserRole = (typeof USER_ROLES)[number];

// ---------------------------------------------------------------------------
// User, Organization, Team
// ---------------------------------------------------------------------------

/**
 * User in the system. Roles: super_admin, admin, manager, team_lead, agent, sales, readonly.
 */
export interface User {
  id: string;
  orgId: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  role: UserRole;
  teamIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Organization (tenant) owning teams, leads, and customers.
 */
export interface Organization {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Team within an organization. Members have roles (super_admin/admin/manager/team_lead/agent/sales/readonly).
 */
export interface Team {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  leadId?: string;
  memberIds: string[];
  /** Member ID -> role */
  memberRoles: Record<string, UserRole>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

/**
 * Lead with full contact, company, region, scoring, and assignment fields.
 */
export interface Lead {
  id: string;
  orgId: string;
  channelId: string;
  sourcePlatform: string;
  sourceDetail?: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  /** Contact info */
  name: string;
  phone?: string;
  wechat?: string;
  email?: string;
  dingtalk?: string;
  /** Company info */
  companyName?: string;
  companyCreditCode?: string;
  companyIndustry?: string;
  companySize?: string;
  companyWebsite?: string;
  companyAddress?: string;
  /** Region */
  region?: string;
  province?: string;
  city?: string;
  district?: string;
  /** Scoring */
  score: number;
  scoreDetails?: Record<string, number>;
  aiAnalysis?: string;
  /** Lifecycle */
  status: LeadStatus;
  assignedTo?: string;
  rawData?: Record<string, unknown>;
  customerId?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

/** Customer type: individual or enterprise. */
export type CustomerType = 'individual' | 'enterprise';

export const CUSTOMER_TYPES = ['individual', 'enterprise'] as const;
export type CustomerTypeUnion = (typeof CUSTOMER_TYPES)[number];

/**
 * Customer (converted lead or direct). Has company fields, stage, score, owner, custom fields, stats, tags.
 */
export interface Customer {
  id: string;
  orgId: string;
  type: CustomerType;
  name: string;
  avatar?: string;
  phone?: string;
  wechatId?: string;
  dingtalkId?: string;
  email?: string;
  companyName?: string;
  companyCreditCode?: string;
  companyIndustry?: string;
  companySize?: string;
  companyWebsite?: string;
  companyAddress?: string;
  gender?: string;
  ageRange?: string;
  region?: string;
  stage: CustomerStage;
  score: number;
  scoreDetails?: Record<string, number>;
  ownerId?: string;
  customFields?: Record<string, unknown>;
  stats?: {
    orderCount?: number;
    totalAmount?: number;
    lastOrderAt?: string;
    [key: string]: unknown;
  };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

/**
 * Conversation with a customer on a channel. Tracks status, priority, AI, SLA, satisfaction.
 */
export interface Conversation {
  id: string;
  orgId: string;
  customerId: string;
  channelId: string;
  channelType: string;
  externalChatId?: string;
  agentId?: string;
  status: ConversationStatus;
  priority: Priority;
  aiEnabled: boolean;
  aiSummary?: string;
  aiSentiment?: string;
  slaRespondBy?: string;
  slaResolveBy?: string;
  slaFirstResponseAt?: string;
  slaResolvedAt?: string;
  tags: string[];
  satisfactionScore?: number;
  messageCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export const SENDER_TYPES = ['customer', 'agent', 'ai', 'system'] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export const MESSAGE_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * Single message in a conversation. Supports text, media, cards; optional AI metadata.
 */
export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId?: string;
  contentType: MessageContentType;
  content: string;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  aiGenerated?: boolean;
  aiConfidence?: number;
  aiSources?: string[];
  status: MessageStatus;
  externalMessageId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

/**
 * Knowledge base container for documents and FAQs.
 */
export interface KnowledgeBase {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Document stored in a knowledge base.
 */
export interface Document {
  id: string;
  knowledgeBaseId: string;
  title: string;
  content?: string;
  sourceUrl?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Chunk of a document for vector/search indexing.
 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  order: number;
  createdAt: string;
}

/**
 * FAQ entry (question/answer pair).
 */
export interface FAQ {
  id: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/**
 * Persistent memory item with importance and decay for AI/agent context.
 */
export interface Memory {
  id: string;
  orgId: string;
  entityType: 'customer' | 'lead' | 'conversation';
  entityId: string;
  key: string;
  value: string | Record<string, unknown>;
  importance: number;
  decayFactor: number;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

/**
 * Marketing campaign definition.
 */
export interface Campaign {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Single execution/run of a campaign.
 */
export interface CampaignExecution {
  id: string;
  campaignId: string;
  orgId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  stats?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Workflow definition (automation rules, steps).
 */
export interface Workflow {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  trigger: string;
  steps: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Single run of a workflow.
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  orgId: string;
  status: string;
  triggerPayload?: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Deal (pipeline)
// ---------------------------------------------------------------------------

export const DEAL_STAGES = [
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

/**
 * Deal in a pipeline with stage and value.
 */
export interface Deal {
  id: string;
  orgId: string;
  customerId: string;
  name: string;
  value: number;
  currency?: string;
  stage: DealStage;
  pipelineId?: string;
  ownerId?: string;
  expectedCloseAt?: string;
  closedAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

/**
 * Communication channel (WeChat, DingTalk, web chat, etc.).
 */
export interface Channel {
  id: string;
  orgId: string;
  type: string;
  name: string;
  config?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

/**
 * Tag with optional category for leads, customers, conversations.
 */
export interface Tag {
  id: string;
  orgId: string;
  name: string;
  category?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * In-app or push notification.
 */
export interface Notification {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/**
 * Audit log entry for compliance and debugging.
 */
export interface AuditLog {
  id: string;
  orgId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

/**
 * Generic API response wrapper. Use data when success, error/message when not.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Paginated list response. Extends ApiResponse with total, page, pageSize.
 */
export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}
