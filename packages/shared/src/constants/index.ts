/**
 * Platform keys mapped to Chinese display labels for the marketing system.
 */
export const PLATFORMS: Record<string, string> = {
  wechat: '微信',
  dingtalk: '钉钉',
  web: '网站',
  app: 'APP',
  offline: '线下',
  other: '其他',
} as const;

/** Lead lifecycle statuses. */
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;

/** Customer pipeline stages. */
export const CUSTOMER_STAGES = [
  'potential',
  'interested',
  'opportunity',
  'closed',
  'repeat',
  'lost',
] as const;

/** Conversation statuses. */
export const CONVERSATION_STATUSES = ['pending', 'active', 'resolved', 'closed'] as const;

/** Message content types. */
export const MESSAGE_TYPES = [
  'text',
  'image',
  'voice',
  'video',
  'file',
  'card',
  'system',
] as const;

/** Priority levels. */
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

/** User/team role codes. */
export const USER_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'team_lead',
  'agent',
  'sales',
  'readonly',
] as const;

/**
 * Score thresholds for lead/customer temperature.
 * hot >= 90, warm >= 70, nurturing >= 50, cold >= 30, below 30 is unqualified.
 */
export const SCORE_THRESHOLDS = {
  hot: 90,
  warm: 70,
  nurturing: 50,
  cold: 30,
} as const;

/** Default page size for paginated API responses. */
export const DEFAULT_PAGE_SIZE = 20;
