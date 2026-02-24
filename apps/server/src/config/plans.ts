export interface PlanConfig {
  name: string
  label: string
  price: number
  interval: 'monthly' | 'yearly'
  seats: number
  conversationsPerMonth: number
  leads: number
  knowledgeBases: number
  storageMb: number
  features: string[]
}

const ALL_FEATURES = [
  'basic_crm', 'web_widget', 'basic_analytics',
  'teams', 'departments', 'canned_responses', 'auto_reply',
  'sla', 'export', 'ai_insights', 'ai_assistant',
  'workflows', 'campaigns', 'quality_inspection',
  'custom_roles', 'webhooks', 'api_access',
]

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  starter: {
    name: 'starter',
    label: '创业版',
    price: 0,
    interval: 'monthly',
    seats: 10,
    conversationsPerMonth: 5000,
    leads: 10000,
    knowledgeBases: 5,
    storageMb: 10000,
    features: [...ALL_FEATURES],
  },
  pro: {
    name: 'pro',
    label: '专业版',
    price: 799,
    interval: 'monthly',
    seats: 50,
    conversationsPerMonth: 25000,
    leads: 50000,
    knowledgeBases: 25,
    storageMb: 102400,
    features: [...ALL_FEATURES],
  },
  enterprise: {
    name: 'enterprise',
    label: '企业版',
    price: 0,
    interval: 'monthly',
    seats: -1,
    conversationsPerMonth: -1,
    leads: -1,
    knowledgeBases: -1,
    storageMb: -1,
    features: [...ALL_FEATURES, 'white_label', 'priority_support', 'custom_integration', 'dedicated_instance'],
  },
}

export const PLAN_ORDER = ['starter', 'pro', 'enterprise']

export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_CONFIGS[plan] ?? PLAN_CONFIGS.starter
}

export function isUnlimited(limit: number): boolean {
  return limit === -1
}
