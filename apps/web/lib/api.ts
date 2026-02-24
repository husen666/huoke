const BASE_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

const TOKEN_KEY = 'huoke_token'
const REFRESH_TOKEN_KEY = 'huoke_refresh_token'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token)
}

export function setRefreshToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const rt = getRefreshToken()
      if (!rt) return false
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (!res.ok) return false
      const json = await res.json()
      if (json.success && json.data?.accessToken) {
        setToken(json.data.accessToken)
        if (json.data.refreshToken) setRefreshToken(json.data.refreshToken)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export interface ApiRes<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  code?: string
  total?: number
  page?: number
  pageSize?: number
}

export class PlanLimitError extends Error {
  code: string
  feature?: string
  current?: number
  limit?: number
  constructor(message: string, code: string, feature?: string, current?: number, limit?: number) {
    super(message)
    this.name = 'PlanLimitError'
    this.code = code
    this.feature = feature
    this.current = current
    this.limit = limit
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiRes<T>> {
  const token = getToken()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers })

  if (res.status === 401) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${getToken()}` }
      const retry = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers: retryHeaders })
      if (retry.ok) {
        const retryJson = (await retry.json()) as ApiRes<T>
        if (retryJson.success) return retryJson
      }
    }
    clearToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('登录已过期，请重新登录')
  }

  let json: ApiRes<T>
  try {
    json = (await res.json()) as ApiRes<T>
  } catch {
    throw new Error(`服务器返回了无效的响应 (HTTP ${res.status})`)
  }

  if (!json.success) {
    const planCodes = ['PLAN_LIMIT', 'SEAT_LIMIT', 'LEAD_LIMIT', 'CONVERSATION_LIMIT', 'KB_LIMIT', 'TRIAL_EXPIRED']
    if (res.status === 403 && json.code && planCodes.includes(json.code)) {
      throw new PlanLimitError(json.error || '当前套餐不支持此操作', json.code, (json as any).feature, (json as any).current, (json as any).limit)
    }
    throw new Error(json.error || json.message || `请求失败: ${res.status}`)
  }

  return json
}

// ==================== Auth ====================

export interface OrgPlanInfo {
  plan?: string | null
  planExpiresAt?: string | null
  trialEndsAt?: string | null
  onboardingCompleted?: boolean | null
  features?: string[] | null
  name?: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  phone?: string | null
  orgId: string
  role: string
  avatarUrl?: string | null
  bio?: string | null
  onlineStatus?: string | null
  lastLoginAt?: string | null
  createdAt?: string | null
  org?: OrgPlanInfo | null
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  org?: OrgPlanInfo
  isNewOrg?: boolean
}

export async function login(email: string, password: string) {
  return fetchApi<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(data: {
  email: string; password: string; name: string;
  orgName?: string; plan?: string; industry?: string;
}) {
  return fetchApi<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getMe() {
  return fetchApi<AuthUser>('/auth/me', { method: 'POST' })
}

// ==================== Platform / SaaS ====================

export interface PlanInfo {
  name: string
  label: string
  price: number
  interval: string
  seats: number
  conversationsPerMonth: number
  leads: number
  knowledgeBases: number
  storageMb: number
  features: string[]
}

export interface UsageInfo {
  plan: string
  planLabel: string
  planExpiresAt?: string | null
  trialEndsAt?: string | null
  features: string[] | null
  limits: { seats: number; conversationsPerMonth: number; leads: number; knowledgeBases: number; storageMb: number }
  usage: { seats: number; leads: number; knowledgeBases: number; conversationsThisMonth: number; storageMb: number }
}

export async function getPlans() {
  return fetchApi<PlanInfo[]>('/platform/plans')
}

export async function getUsage() {
  return fetchApi<UsageInfo>('/platform/usage')
}

export async function completeOnboarding(data: { orgName?: string; industry?: string; scale?: string; phone?: string }) {
  return fetchApi('/platform/onboarding', { method: 'POST', body: JSON.stringify(data) })
}

export async function requestUpgrade(plan: string, contact?: string) {
  return fetchApi('/platform/upgrade-request', { method: 'POST', body: JSON.stringify({ plan, contact }) })
}

// ==================== Admin (super admin) ====================

export async function adminLogin(email: string, password: string) {
  const BASE = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  const res = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return res.json()
}

export async function adminGetStats(token: string) {
  const BASE = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  const res = await fetch(`${BASE}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

export async function adminGetOrgs(token: string, params?: Record<string, string>) {
  const BASE = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${BASE}/admin/orgs${q}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

export async function adminGetOrg(token: string, orgId: string) {
  const BASE = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  const res = await fetch(`${BASE}/admin/orgs/${orgId}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

export async function adminUpdatePlan(token: string, orgId: string, plan: string, expiresAt?: string) {
  const BASE = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  const res = await fetch(`${BASE}/admin/orgs/${orgId}/plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan, expiresAt }),
  })
  return res.json()
}

export async function forgotPassword(email: string) {
  return fetchApi('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  return fetchApi('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  })
}

// ==================== Leads ====================

export interface Lead {
  id: string
  sourcePlatform: string
  sourceDetail?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  contactWechat?: string | null
  contactDingtalk?: string | null
  companyName?: string | null
  companyIndustry?: string | null
  companySize?: string | null
  regionProvince?: string | null
  regionCity?: string | null
  regionDistrict?: string | null
  score: number
  scoreDetails?: { aiAnalysis?: string } | null
  aiAnalysis?: string | null
  status: string
  notes?: string | null
  assignedTo?: string | null
  assignedAt?: string | null
  customerId?: string | null
  channelId?: string | null
  campaignId?: string | null
  convertedAt?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  rawData?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export async function getLeads(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Lead[]>(`/leads${q ? `?${q}` : ''}`)
}

export async function getLead(id: string) {
  return fetchApi<Lead>(`/leads/${id}`)
}

export async function createLead(data: Record<string, unknown>) {
  return fetchApi<Lead>('/leads', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateLead(id: string, data: Record<string, unknown>) {
  return fetchApi<Lead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function getLeadStats() {
  return fetchApi<{
    byStatus: { status: string; count: number }[]
    bySource: { sourcePlatform: string; count: number }[]
  }>('/leads/stats')
}

// ==================== Customers ====================

export interface Customer {
  id: string
  type: string
  name: string
  phone?: string | null
  wechatId?: string | null
  email?: string | null
  companyName?: string | null
  companyIndustry?: string | null
  stage: string
  score: number
  ownerId?: string | null
  createdAt: string
  updatedAt: string
  tags?: { id: string; name: string; color?: string | null; category?: string | null }[]
}

export async function getCustomers(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Customer[]>(`/customers${q ? `?${q}` : ''}`)
}

export async function getCustomer(id: string) {
  return fetchApi<Customer>(`/customers/${id}`)
}

export async function createCustomer(data: Record<string, unknown>) {
  return fetchApi<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateCustomer(id: string, data: Record<string, unknown>) {
  return fetchApi<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

// ==================== Conversations ====================

export interface Conversation {
  id: string
  customerId: string
  customerName?: string | null
  channelType: string
  channelId?: string | null
  agentId?: string | null
  status: string
  priority: string
  aiEnabled?: boolean | null
  aiSummary?: string | null
  aiSentiment?: string | null
  tags?: string[] | null
  slaRespondBy?: string | null
  slaResolveBy?: string | null
  slaFirstResponseAt?: string | null
  slaResolvedAt?: string | null
  firstResponseAt?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  messageCount: number
  lastMessageAt?: string | null
  lastMessagePreview?: string | null
  agentLastReadAt?: string | null
  satisfactionScore?: number | null
  satisfactionComment?: string | null
  externalChatId?: string | null
  summary?: string | null
  grade?: string | null
  sourcePageUrl?: string | null
  sourceKeyword?: string | null
  hasLead?: boolean
  detectedContact?: { phone?: string; email?: string; wechat?: string } | null
  isInvalid?: boolean
  preChatForm?: Record<string, string> | null
  unreadCount?: number
  createdAt: string
  updatedAt?: string | null
}

export interface Message {
  id: string
  conversationId: string
  senderType: string
  senderId?: string | null
  content: string
  contentType: string
  mediaUrl?: string | null
  metadata?: Record<string, unknown> | null
  aiGenerated?: boolean | null
  aiConfidence?: number | null
  status?: string | null
  readBy?: Record<string, string>
  createdAt: string
}

export async function getConversations(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Conversation[]>(`/conversations${q ? `?${q}` : ''}`)
}

export async function getConversation(id: string) {
  return fetchApi<Conversation & { messages: Message[] }>(`/conversations/${id}`)
}

export async function sendMessage(
  conversationId: string,
  content: string,
  generateAiReply = false,
  options?: { contentType?: string; mediaUrl?: string }
) {
  return fetchApi<{ message: Message; aiReply?: Message | null }>(
    `/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ content, senderType: 'agent', generateAiReply, ...options }) }
  )
}

export async function uploadMessageFile(file: File): Promise<{ url: string; name: string }> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE_URL}/conversations/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error ?? '文件上传失败')
  }
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? '文件上传失败')
  return json.data
}

// ==================== Knowledge ====================

export interface KnowledgeBase {
  id: string
  name: string
  description?: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface KBDocument {
  id: string
  kbId: string
  title: string
  content?: string | null
  fileUrl?: string | null
  fileType?: string | null
  processingStatus: string
  chunkCount?: number | null
  createdAt: string
}

export async function getKnowledgeBases() {
  return fetchApi<KnowledgeBase[]>('/knowledge-bases')
}

export async function getKnowledgeBase(id: string) {
  return fetchApi<KnowledgeBase & { documents: KBDocument[] }>(`/knowledge-bases/${id}`)
}

export async function createKnowledgeBase(data: { name: string; description?: string }) {
  return fetchApi<KnowledgeBase>('/knowledge-bases', { method: 'POST', body: JSON.stringify(data) })
}

export async function createDocument(kbId: string, data: { title: string; content?: string }) {
  return fetchApi<KBDocument>(`/knowledge-bases/${kbId}/documents`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function queryKnowledge(kbId: string, query: string) {
  return fetchApi<{ query: string; answer: string; sources: number }>(
    `/knowledge-bases/${kbId}/query`,
    { method: 'POST', body: JSON.stringify({ query }) }
  )
}

export async function getFaqs(kbId: string) {
  return fetchApi<{ id: string; question: string; answer: string; category?: string }[]>(
    `/knowledge-bases/${kbId}/faqs`
  )
}

export async function createFaq(kbId: string, data: { question: string; answer: string; category?: string }) {
  return fetchApi<unknown>(`/knowledge-bases/${kbId}/faqs`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateFaq(kbId: string, faqId: string, data: Record<string, unknown>) {
  return fetchApi<unknown>(`/knowledge-bases/${kbId}/faqs/${faqId}`, { method: 'PUT', body: JSON.stringify(data) })
}

// ==================== Analytics ====================

export interface AnalyticsOverview {
  leadCount: number
  customerCount: number
  conversationCount: number
  dealAmountTotal: string
  dealCount: number
  campaignCount: number
  channelCount: number
}

export async function getAnalyticsOverview() {
  return fetchApi<AnalyticsOverview>('/analytics/overview')
}

export async function getAnalyticsLeads(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<{
    byStatus: { status: string; count: number }[]
    bySource: { sourcePlatform: string; count: number }[]
  }>(`/analytics/leads${q ? `?${q}` : ''}`)
}

export interface ServiceAnalytics {
  totalConversations: number
  byStatus: { status: string; count: number }[]
  avgSatisfaction: number
  avgMessagesPerConv: number
  avgFirstResponse?: number
  avgResolutionTime?: number
  totalMessages: number
  byChannel: { channelType: string; count: number }[]
  byPriority: { priority: string; count: number }[]
  agentStats: { agentId: string; agentName: string | null; total: number; resolved: number; avgSatisfaction: string }[]
  dailyTrend: { date: string; count: number; resolved: number }[]
  satisfactionDistribution: { score: number | null; count: number }[]
}

export async function getServiceAnalytics(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<ServiceAnalytics>(`/analytics/service${q ? `?${q}` : ''}`)
}

// ==================== Profile ====================

export async function updateProfile(data: { name?: string; phone?: string; bio?: string; avatarUrl?: string }) {
  return fetchApi<AuthUser>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) })
}

export async function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return fetchApi<{ avatarUrl: string }>('/auth/avatar', { method: 'POST', body: formData })
}

export async function changePassword(data: { currentPassword: string; newPassword: string }) {
  return fetchApi<{ message: string }>('/auth/password', { method: 'PUT', body: JSON.stringify(data) })
}

// ==================== Campaigns ====================

export interface Campaign {
  id: string
  name: string
  description?: string | null
  type: string
  status: string
  channelType?: string | null
  targetCount?: number | null
  contentTemplate?: Record<string, unknown> | null
  stats?: { sentCount?: number; openedCount?: number; repliedCount?: number; failedCount?: number } | null
  scheduledAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export async function getCampaigns(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Campaign[]>(`/campaigns${q ? `?${q}` : ''}`)
}

export async function getCampaign(id: string) {
  return fetchApi<Campaign>(`/campaigns/${id}`)
}

export async function createCampaign(data: Record<string, unknown>) {
  return fetchApi<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateCampaign(id: string, data: Record<string, unknown>) {
  return fetchApi<Campaign>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteCampaign(id: string) {
  return fetchApi<Campaign>(`/campaigns/${id}`, { method: 'DELETE' })
}

export async function executeCampaign(id: string) {
  return fetchApi<Campaign>(`/campaigns/${id}/execute`, { method: 'POST' })
}

// ==================== Workflows ====================

export interface Workflow {
  id: string
  name: string
  description?: string | null
  triggerType: string
  triggerConfig?: Record<string, unknown> | null
  definition?: Record<string, unknown> | null
  isActive: boolean
  executionCount?: number | null
  lastExecutedAt?: string | null
  createdAt: string
  updatedAt: string
}

export async function getWorkflows(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<Workflow[]>(`/workflows${qs}`)
}

export async function getWorkflow(id: string) {
  return fetchApi<Workflow>(`/workflows/${id}`)
}

export async function createWorkflow(data: Record<string, unknown>) {
  return fetchApi<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateWorkflow(id: string, data: Record<string, unknown>) {
  return fetchApi<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function toggleWorkflow(id: string, enable?: boolean) {
  return fetchApi<Workflow>(`/workflows/${id}/toggle`, { method: 'PUT', body: JSON.stringify({ enable }) })
}

export async function deleteWorkflow(id: string) {
  return fetchApi<Workflow>(`/workflows/${id}`, { method: 'DELETE' })
}

export async function getWorkflowRuns(workflowId: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<any[]>(`/workflows/${workflowId}/runs${qs}`)
}

export async function executeWorkflow(workflowId: string) {
  return fetchApi<{ message: string }>(`/workflows/${workflowId}/execute`, { method: 'POST' })
}

// ==================== Conversations (extra) ====================

export async function createConversation(data: { customerId: string; channelType: string }) {
  return fetchApi<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(data) })
}

export async function resolveConversation(id: string) {
  return fetchApi<Conversation>(`/conversations/${id}/resolve`, { method: 'POST' })
}

export async function assignConversation(id: string, agentId: string) {
  return fetchApi<Conversation>(`/conversations/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) })
}

export async function updateConversationPriority(id: string, priority: string) {
  return fetchApi<Conversation>(`/conversations/${id}/priority`, { method: 'PUT', body: JSON.stringify({ priority }) })
}

export async function updateConversationTags(id: string, tags: string[]) {
  return fetchApi<Conversation>(`/conversations/${id}`, { method: 'PUT', body: JSON.stringify({ tags }) })
}

export async function reopenConversation(id: string) {
  return fetchApi<Conversation>(`/conversations/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'active' }) })
}

export async function transferConversation(id: string, targetAgentId: string, reason?: string) {
  return fetchApi<Conversation>(`/conversations/${id}/transfer`, { method: 'POST', body: JSON.stringify({ targetAgentId, reason }) })
}

export async function getConversationRating(id: string) {
  return fetchApi<{ satisfactionScore: number | null; satisfactionComment: string | null }>(`/conversations/${id}/rating`)
}

// ==================== Customers (extra) ====================

export async function getCustomerTimeline(id: string) {
  return fetchApi<unknown[]>(`/customers/${id}/timeline`)
}

export async function updateCustomerTags(id: string, data: { addTagIds?: string[]; removeTagIds?: string[] }) {
  return fetchApi<unknown[]>(`/customers/${id}/tags`, { method: 'POST', body: JSON.stringify(data) })
}

export async function batchUpdateCustomers(ids: string[], data: Record<string, unknown>) {
  return fetchApi<unknown>('/customers/batch', { method: 'PUT', body: JSON.stringify({ ids, ...data }) })
}

export async function batchDeleteCustomers(ids: string[]) {
  return fetchApi<unknown>('/customers/batch', { method: 'DELETE', body: JSON.stringify({ ids }) })
}

// ==================== Leads (extra) ====================

export async function convertLead(id: string) {
  return fetchApi<{ leadId: string; customer: Customer }>(`/leads/${id}/convert`, { method: 'POST' })
}

export async function assignLead(id: string, assignedTo: string) {
  return fetchApi<Lead>(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ assignedTo }) })
}

export async function batchUpdateLeads(ids: string[], data: Record<string, unknown>) {
  return fetchApi<unknown>('/leads/batch', { method: 'PUT', body: JSON.stringify({ ids, ...data }) })
}

export async function batchDeleteLeads(ids: string[]) {
  return fetchApi<unknown>('/leads/batch', { method: 'DELETE', body: JSON.stringify({ ids }) })
}

export async function checkLeadDuplicate(params: { phone?: string; email?: string }) {
  const q = new URLSearchParams(params as Record<string, string>).toString()
  return fetchApi<{ duplicates: Lead[] }>(`/leads/check-duplicate?${q}`)
}

// ==================== Analytics (extra) ====================

export async function getAiInsights() {
  return fetchApi<{ insights: string[] }>('/analytics/ai-insights', { method: 'POST' })
}

export async function getConversionFunnel() {
  return fetchApi<{ visitors: number; leads: number; customers: number; deals: number; won: number }>('/analytics/conversion-funnel')
}

export async function getDailyTrend(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<{ leads: any[]; customers: any[]; conversations: any[] }>(`/analytics/daily-trend${q ? `?${q}` : ''}`)
}

// ==================== Knowledge Base (extra) ====================

export async function deleteKnowledgeBase(id: string) {
  return fetchApi<KnowledgeBase>(`/knowledge-bases/${id}`, { method: 'DELETE' })
}

export async function deleteDocument(kbId: string, docId: string) {
  return fetchApi<KBDocument>(`/knowledge-bases/${kbId}/documents/${docId}`, { method: 'DELETE' })
}

// ==================== User Settings ====================

export async function getUserSettings() {
  return fetchApi<Record<string, unknown>>('/auth/settings')
}

export async function saveUserSettings(data: Record<string, unknown>) {
  return fetchApi<Record<string, unknown>>('/auth/settings', { method: 'PUT', body: JSON.stringify(data) })
}

// ==================== Lead Delete ====================

export async function deleteLead(id: string) {
  return fetchApi<Lead>(`/leads/${id}`, { method: 'DELETE' })
}

// ==================== Customer Delete ====================

export async function deleteCustomer(id: string) {
  return fetchApi<Customer>(`/customers/${id}`, { method: 'DELETE' })
}

// ==================== Tags ====================

export interface Tag {
  id: string
  name: string
  color?: string | null
  category?: string | null
  createdAt: string
}

export async function getTags(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Tag[]>(`/tags${q ? `?${q}` : ''}`)
}

export async function createTag(data: { name: string; color?: string; category?: string }) {
  return fetchApi<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTag(id: string, data: { name?: string; color?: string; category?: string }) {
  return fetchApi<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteTag(id: string) {
  return fetchApi<Tag>(`/tags/${id}`, { method: 'DELETE' })
}

// ==================== Deals ====================

export interface Deal {
  id: string
  customerId: string
  customerName?: string | null
  title: string
  amount: string
  currency: string
  stage: string
  probability?: number | null
  expectedCloseDate?: string | null
  actualCloseDate?: string | null
  ownerId?: string | null
  ownerName?: string | null
  notes?: string | null
  products?: unknown[] | null
  competitors?: string | null
  lossReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface PipelineSummary {
  stage: string
  count: number
  totalAmount: string | null
}

export async function getDeals(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Deal[]>(`/deals${q ? `?${q}` : ''}`)
}

export async function getDeal(id: string) {
  return fetchApi<Deal>(`/deals/${id}`)
}

export async function createDeal(data: Record<string, unknown>) {
  return fetchApi<Deal>('/deals', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateDeal(id: string, data: Record<string, unknown>) {
  return fetchApi<Deal>(`/deals/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteDeal(id: string) {
  return fetchApi<Deal>(`/deals/${id}`, { method: 'DELETE' })
}

export async function getPipelineSummary() {
  return fetchApi<PipelineSummary[]>('/deals/pipeline/summary')
}

// ==================== FAQ Delete ====================

export async function uploadDocument(kbId: string, file: File, title?: string) {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  if (title) formData.append('title', title)
  const res = await fetch(`${BASE_URL}/knowledge-bases/${kbId}/documents/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error ?? '文件上传失败')
  }
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? '文件上传失败')
  return json
}

export async function deleteFaq(kbId: string, faqId: string) {
  return fetchApi<unknown>(`/knowledge-bases/${kbId}/faqs/${faqId}`, { method: 'DELETE' })
}

// ==================== Channels ====================

export interface Channel {
  id: string
  orgId: string
  platform: string
  name: string
  config?: Record<string, unknown> | null
  status: string
  webhookUrl?: string | null
  createdAt: string
  updatedAt: string
}

export async function getChannels(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Channel[]>(`/channels${q ? `?${q}` : ''}`)
}

export async function createChannel(data: { platform: string; name: string; config?: Record<string, unknown>; status?: string }) {
  return fetchApi<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateChannel(id: string, data: Record<string, unknown>) {
  return fetchApi<Channel>(`/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteChannel(id: string) {
  return fetchApi<Channel>(`/channels/${id}`, { method: 'DELETE' })
}

export async function getChannelStats() {
  return fetchApi<{
    byPlatform: { platform: string; conversations: number; messages: number }[]
  }>('/channels/stats')
}

// ==================== Lead Re-score ====================

export async function rescoreLead(id: string) {
  return fetchApi<{ score: number; analysis: string }>(`/leads/${id}/rescore`, { method: 'POST' })
}

// ==================== Team / Members ====================

export interface OrgMember {
  id: string
  name: string
  email: string
  role: string
  avatarUrl?: string | null
  createdAt: string
}

export async function getOrgMembers() {
  return fetchApi<OrgMember[]>('/auth/members')
}

export async function updateMemberRole(id: string, role: string) {
  return fetchApi<OrgMember>(`/auth/members/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })
}

export async function removeMember(id: string) {
  return fetchApi<unknown>(`/auth/members/${id}`, { method: 'DELETE' })
}

// ==================== Invitations ====================

export interface Invitation {
  id: string
  email?: string | null
  role: string
  code: string
  status: string
  expiresAt: string
  createdAt: string
  acceptedAt?: string | null
}

export async function getInvitations() {
  return fetchApi<Invitation[]>('/invitations')
}

export async function createInvitation(data: { email?: string; role: string; expiresInDays?: number }) {
  return fetchApi<Invitation>('/invitations', { method: 'POST', body: JSON.stringify(data) })
}

export async function revokeInvitation(id: string) {
  return fetchApi<Invitation>(`/invitations/${id}`, { method: 'DELETE' })
}

export async function verifyInvitation(code: string) {
  return fetchApi<{ email?: string | null; role: string; orgName: string; orgId: string }>(`/invitations/verify/${code}`)
}

export async function acceptInvitation(code: string, data: { email: string; password: string; name: string }) {
  return fetchApi<{ accessToken: string; refreshToken: string; user: { id: string; email: string; name: string; orgId: string; role: string }; org?: OrgPlanInfo }>(
    `/invitations/accept/${code}`,
    { method: 'POST', body: JSON.stringify(data) }
  )
}

// ==================== Lead CSV Import/Export ====================

export async function exportLeadsCsv(): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/leads/export/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('导出失败')
  return res.blob()
}

export async function importLeadsCsv(file: File) {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE_URL}/leads/import/csv`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error ?? '导入失败')
  }
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? '导入失败')
  return json
}

export async function exportCustomersCsv(): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/customers/export/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('导出失败')
  return res.blob()
}

export async function exportDealsCsv(): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/deals/export/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('导出失败')
  return res.blob()
}

// ==================== Notifications ====================

export interface Notification {
  id: string
  type: string
  title: string
  content?: string | null
  resourceType?: string | null
  resourceId?: string | null
  isRead: boolean
  readAt?: string | null
  createdAt: string
}

export async function getNotifications(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<Notification[]>(`/notifications${qs}`)
}

export async function getUnreadNotificationCount() {
  return fetchApi<{ count: number }>('/notifications/unread-count')
}

export async function markNotificationRead(id: string) {
  return fetchApi(`/notifications/${id}/read`, { method: 'PUT' })
}

export async function markAllNotificationsRead() {
  return fetchApi('/notifications/read-all', { method: 'PUT' })
}

export async function deleteNotification(id: string) {
  return fetchApi(`/notifications/${id}`, { method: 'DELETE' })
}

export async function deleteAllReadNotifications() {
  return fetchApi('/notifications/clear-read', { method: 'DELETE' })
}

// ==================== Audit Logs ====================

export interface AuditLog {
  id: string
  action: string
  resourceType: string
  resourceId?: string | null
  changes?: Record<string, unknown> | null
  ipAddress?: string | null
  createdAt: string
  userName?: string | null
  userEmail?: string | null
}

export async function getAuditLogs(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<AuditLog[]>(`/audit-logs${qs}`)
}

// ==================== Canned Responses (Quick Replies) ====================

export interface CannedResponse {
  id: string
  title: string
  content: string
  shortcut?: string | null
  category?: string | null
  isPublic: boolean
  useCount: number
  createdAt: string
  updatedAt: string
}

export async function getCannedResponses(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<CannedResponse[]>(`/canned-responses${qs}`)
}

export async function createCannedResponse(data: { title: string; content: string; shortcut?: string; category?: string; isPublic?: boolean }) {
  return fetchApi<CannedResponse>('/canned-responses', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateCannedResponse(id: string, data: Partial<{ title: string; content: string; shortcut: string; category: string; isPublic: boolean }>) {
  return fetchApi<CannedResponse>(`/canned-responses/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function useCannedResponse(id: string) {
  return fetchApi(`/canned-responses/${id}/use`, { method: 'POST' })
}

export async function deleteCannedResponse(id: string) {
  return fetchApi(`/canned-responses/${id}`, { method: 'DELETE' })
}

// ==================== Internal Notes ====================

export async function addConversationNote(conversationId: string, content: string) {
  return fetchApi<Message>(`/conversations/${conversationId}/notes`, { method: 'POST', body: JSON.stringify({ content }) })
}

// ==================== Organization Management ====================

export interface OrgInfo {
  id: string
  name: string
  logoUrl?: string | null
  industry?: string | null
  scale?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  description?: string | null
  plan?: string | null
  createdAt: string
  updatedAt: string
}

export interface Role {
  id: string
  orgId: string
  name: string
  description?: string | null
  level: number
  isSystem: boolean
  permissions: string[]
  createdAt: string
  updatedAt: string
}

export interface Permission {
  key: string
  module: string
  label: string
}

export interface OrgMemberDetail {
  id: string
  name: string
  email: string
  phone?: string | null
  role: string
  status: string
  onlineStatus?: string | null
  avatarUrl?: string | null
  departmentId?: string | null
  departmentName?: string | null
  teams?: { id: string; name: string }[]
  lastLoginAt?: string | null
  createdAt: string
}

export async function getOrgInfo() {
  return fetchApi<OrgInfo>('/org/info')
}

export async function updateOrgInfo(data: Partial<{ name: string; logoUrl: string; industry: string; scale: string; phone: string; email: string; website: string; address: string; description: string }>) {
  return fetchApi<OrgInfo>('/org/info', { method: 'PUT', body: JSON.stringify(data) })
}

export async function getOrgRoles() {
  return fetchApi<Role[]>('/org/roles')
}

export async function createOrgRole(data: { name: string; description?: string; level?: number; permissions: string[] }) {
  return fetchApi<Role>('/org/roles', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateOrgRole(id: string, data: Partial<{ name: string; description: string; level: number; permissions: string[] }>) {
  return fetchApi<Role>(`/org/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteOrgRole(id: string) {
  return fetchApi<unknown>(`/org/roles/${id}`, { method: 'DELETE' })
}

export async function getOrgMembersDetail(status?: string) {
  const qs = status ? `?status=${status}` : ''
  return fetchApi<OrgMemberDetail[]>(`/org/members${qs}`)
}

export async function updateOrgMember(id: string, data: Partial<{ name: string; phone: string; role: string; status: string; departmentId: string | null }>) {
  return fetchApi<OrgMemberDetail>(`/org/members/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function resetMemberPassword(id: string, newPassword: string) {
  return fetchApi<unknown>(`/org/members/reset-password/${id}`, { method: 'POST', body: JSON.stringify({ newPassword }) })
}

export async function getAllPermissions() {
  return fetchApi<Permission[]>('/org/permissions')
}

export async function seedOrgRoles() {
  return fetchApi<unknown>('/org/seed-roles', { method: 'POST' })
}

export async function getMyTeams() {
  return fetchApi<{ teams: { id: string; name: string }[]; teammateIds: string[] }>('/org/my-teams')
}

// ==================== Teams (Agent Groups) ====================

export interface Team {
  id: string
  name: string
  description?: string | null
  leaderId?: string | null
  memberCount?: number
  createdAt: string
  updatedAt: string
}

export async function getTeams() {
  return fetchApi<Team[]>('/org/teams')
}

export async function createTeam(data: { name: string; description?: string }) {
  return fetchApi<Team>('/org/teams', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteTeam(id: string) {
  return fetchApi<unknown>(`/org/teams/${id}`, { method: 'DELETE' })
}

// ==================== Departments ====================

export interface Department {
  id: string
  orgId: string
  name: string
  description: string | null
  parentId: string | null
  leaderId: string | null
  sort: number
  memberCount: number
  createdAt: string
  updatedAt: string
}

export async function getDepartments() {
  return fetchApi<Department[]>('/org/departments')
}

export async function createDepartment(data: { name: string; description?: string; parentId?: string | null; leaderId?: string | null; sort?: number }) {
  return fetchApi<Department>('/org/departments', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateDepartment(id: string, data: Partial<{ name: string; description: string; parentId: string | null; leaderId: string | null; sort: number }>) {
  return fetchApi<Department>(`/org/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteDepartment(id: string) {
  return fetchApi(`/org/departments/${id}`, { method: 'DELETE' })
}

// ==================== Team Members ====================

export interface TeamMember {
  userId: string
  joinedAt: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
}

export async function getTeamMembers(teamId: string) {
  return fetchApi<TeamMember[]>(`/org/teams/${teamId}/members`)
}

export async function addTeamMembers(teamId: string, userIds: string[]) {
  return fetchApi(`/org/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ userIds }) })
}

export async function removeTeamMember(teamId: string, userId: string) {
  return fetchApi(`/org/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
}

export async function updateTeam(id: string, data: Partial<{ name: string; description: string; leaderId: string | null }>) {
  return fetchApi(`/org/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

// ==================== Permissions ====================

export async function getMyPermissions() {
  return fetchApi<{ role: string; permissions: string[] }>('/org/my-permissions')
}

// ==================== Offline Consultations ====================

export interface OfflineConsultation {
  id: string
  name?: string | null
  phone?: string | null
  email?: string | null
  content: string
  status: string
  handledBy?: string | null
  handledAt?: string | null
  remark?: string | null
  conversationId?: string | null
  createdAt: string
}

export async function getOfflineConsultations(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<{ items: OfflineConsultation[]; total: number; page: number; pageSize: number }>(`/org/consultations${qs}`)
}

export async function updateOfflineConsultation(id: string, data: { status?: string; remark?: string }) {
  return fetchApi<OfflineConsultation>(`/org/consultations/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

// ==================== Tickets (工单) ====================

export interface Ticket {
  id: string
  title: string
  description?: string | null
  type: string
  source?: string
  status: string
  priority: string
  escalationLevel?: number
  slaFirstResponseDueAt?: string | null
  slaResolveDueAt?: string | null
  firstResponseAt?: string | null
  assigneeId?: string | null
  creatorId?: string | null
  customerId?: string | null
  conversationId?: string | null
  tags?: string[] | null
  attachments?: { name: string; url: string; type?: string; size?: number }[] | null
  dueDate?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  createdAt: string
  updatedAt: string
  assigneeName?: string | null
  creatorName?: string | null
  customerName?: string | null
  commentCount?: number
  overdue?: boolean
}

export interface TicketComment {
  id: string
  ticketId: string
  authorId?: string | null
  content: string
  isInternal: boolean
  attachments?: unknown[]
  createdAt: string
  authorName?: string | null
}

export interface TicketReview {
  ticket: {
    id: string
    title: string
    status: string
    priority: string
    source?: string | null
    escalationLevel?: number | null
    createdAt: string
    firstResponseAt?: string | null
    resolvedAt?: string | null
    closedAt?: string | null
    doneAt?: string | null
    slaFirstResponseDueAt?: string | null
    slaResolveDueAt?: string | null
  }
  metrics: {
    firstResponseMinutes: number | null
    resolveMinutes: number | null
    firstResponseBreach: boolean
    resolveBreach: boolean
    commentCount: number
    internalCommentCount: number
    internalCommentRate: number
  }
  timeline: Array<{
    type: string
    at: string
    text: string
  }>
  insights: string[]
}

export interface TicketReviewActionResult {
  action: 'create_improvement_note' | 'create_kb_draft'
  commentId?: string | null
  kbId?: string
  kbName?: string
  documentId?: string
  message: string
}

export async function getTickets(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Ticket[]>(`/tickets${q ? `?${q}` : ''}`)
}

export async function getTicket(id: string) {
  return fetchApi<{ ticket: Ticket; comments: TicketComment[] }>(`/tickets/${id}`)
}

export async function getTicketReview(id: string) {
  return fetchApi<TicketReview>(`/tickets/${id}/review`)
}

export async function runTicketReviewAction(
  id: string,
  action: 'create_improvement_note' | 'create_kb_draft',
  kbId?: string
) {
  return fetchApi<TicketReviewActionResult>(`/tickets/${id}/review/actions`, {
    method: 'POST',
    body: JSON.stringify({ action, kbId }),
  })
}

export async function createTicket(data: Record<string, unknown>) {
  return fetchApi<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTicket(id: string, data: Record<string, unknown>) {
  return fetchApi<Ticket>(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteTicket(id: string) {
  return fetchApi<Ticket>(`/tickets/${id}`, { method: 'DELETE' })
}

export async function addTicketComment(ticketId: string, data: { content: string; isInternal?: boolean }) {
  return fetchApi<TicketComment>(`/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify(data) })
}

export async function assignTicket(ticketId: string, assigneeId: string) {
  return fetchApi<Ticket>(`/tickets/${ticketId}/assign`, { method: 'PUT', body: JSON.stringify({ assigneeId }) })
}

export async function transitionTicket(ticketId: string, toStatus: string) {
  return fetchApi<Ticket>(`/tickets/${ticketId}/transition`, { method: 'POST', body: JSON.stringify({ toStatus }) })
}

export async function escalateTicket(ticketId: string, reason?: string) {
  return fetchApi<Ticket>(`/tickets/${ticketId}/escalate`, { method: 'POST', body: JSON.stringify({ reason }) })
}

// ==================== Visitors ====================

export interface VisitorSession {
  id: string
  visitorId: string
  customerId?: string | null
  ipAddress?: string | null
  country?: string | null
  city?: string | null
  deviceType?: string | null
  browser?: string | null
  os?: string | null
  referrer?: string | null
  landingPage?: string | null
  currentPage?: string | null
  pageViews: number
  duration: number
  isOnline: boolean
  lastActiveAt: string
  createdAt: string
}

export async function getVisitors(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<VisitorSession[]>(`/visitors${q ? `?${q}` : ''}`)
}

export async function getVisitorStats() {
  return fetchApi<{ onlineCount: number; todayCount: number; topPages: { page: string; count: number }[] }>('/visitors/stats')
}

export interface PageView {
  id: string
  pageUrl: string
  pageTitle?: string | null
  referrer?: string | null
  duration?: number | null
  createdAt: string
}

export async function getVisitorPages(visitorId: string) {
  return fetchApi<PageView[]>(`/visitors/${visitorId}/pages`)
}

export async function getVisitorPageStats(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<{
    topPages: { pageUrl: string; pageTitle?: string | null; count: number }[]
    avgPagesPerSession: number
    avgSessionDuration: number
  }>(`/visitors/stats/pages${q ? `?${q}` : ''}`)
}

export interface ResponseTimeAnalytics {
  avgFirstResponseSeconds: number
  avgResponseSeconds: number
  avgResolutionSeconds: number
  slaComplianceRate: number
  slaThreshold: number
  responseByHour: { hour: number; avgSeconds: number; count: number }[]
  responseByAgent: {
    agentId: string
    agentName: string | null
    avgFirstResponse: number
    avgResponse: number
    totalConversations: number
    resolvedCount: number
  }[]
  dailyTrend: { date: string; avgFirstResponse: number; count: number }[]
}

export async function getResponseTimeAnalytics(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<ResponseTimeAnalytics>(`/analytics/response-times${q ? `?${q}` : ''}`)
}

export interface ResponseTimeDashboard {
  avgFirstResponseSeconds: number
  avgResolutionSeconds: number
  distribution: { bucket: string; count: number }[]
  dailyTrend: { date: string; avgFirstResponseSeconds: number; avgResolutionSeconds: number; count: number }[]
  agentStats: {
    agentId: string | null
    agentName: string | null
    avgFirstResponseSeconds: number
    avgResolutionSeconds: number
    totalConversations: number
    resolvedCount: number
  }[]
}

export async function getResponseTimeDashboard(days?: number) {
  return fetchApi<ResponseTimeDashboard>(`/analytics/response-time${days ? `?days=${days}` : ''}`)
}

// ==================== Satisfaction Analytics ====================

export interface SatisfactionAnalytics {
  avgScore: number
  totalRated: number
  totalResolved: number
  responseRate: number
  goodRate: number
  distribution: { score: number | null; count: number }[]
  dailyTrend: { date: string; avgScore: number; count: number }[]
  agentBreakdown: { agentId: string | null; agentName: string | null; avgScore: number; count: number }[]
}

export async function getSatisfactionAnalytics(days?: number) {
  return fetchApi<SatisfactionAnalytics>(`/analytics/satisfaction${days ? `?days=${days}` : ''}`)
}

// ==================== Realtime Monitor ====================

export interface RealtimeMetrics {
  onlineAgents: { id: string; name: string; status: string | null; activeConversations: number }[]
  pendingCount: number
  activeCount: number
  todayNew: number
  todayResolved: number
  todayAvgFirstResponseSeconds: number
  todayAvgSatisfaction: number
  longestWaitSeconds: number
  hourlyTrend: { hour: number; count: number }[]
}

export async function getRealtimeMetrics() {
  return fetchApi<RealtimeMetrics>('/analytics/realtime')
}

// ==================== Webhooks ====================

export interface Webhook {
  id: string
  name: string
  url: string
  events: string[]
  secret?: string | null
  isActive: boolean
  lastTriggeredAt?: string | null
  failCount: number
  createdAt: string
}

export async function getWebhooks() {
  return fetchApi<Webhook[]>('/webhooks')
}

export async function createWebhook(data: Record<string, unknown>) {
  return fetchApi<Webhook>('/webhooks', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateWebhook(id: string, data: Record<string, unknown>) {
  return fetchApi<Webhook>(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteWebhook(id: string) {
  return fetchApi<Webhook>(`/webhooks/${id}`, { method: 'DELETE' })
}

export async function testWebhook(id: string) {
  return fetchApi<{ success: boolean }>(`/webhooks/${id}/test`, { method: 'POST' })
}

// ==================== Blacklist ====================

export interface BlacklistItem {
  id: string
  type: string
  value: string
  reason?: string | null
  createdAt: string
}

export async function getBlacklist() {
  return fetchApi<BlacklistItem[]>('/blacklist')
}

export async function addToBlacklist(data: { type: string; value: string; reason?: string }) {
  return fetchApi<BlacklistItem>('/blacklist', { method: 'POST', body: JSON.stringify(data) })
}

export async function removeFromBlacklist(id: string) {
  return fetchApi<BlacklistItem>(`/blacklist/${id}`, { method: 'DELETE' })
}

// ==================== Auto Reply Rules ====================

export interface AutoReplyRule {
  id: string
  name: string
  isActive: boolean
  priority: number
  triggerType: string
  triggerConfig: Record<string, unknown>
  replyContent: string
  replyType: string
  menuOptions?: { label: string; reply: string }[] | null
  matchCount: number
  createdAt: string
  updatedAt: string
}

export async function getAutoReplyRules(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<AutoReplyRule[]>(`/auto-reply-rules${q ? `?${q}` : ''}`)
}

export async function getAutoReplyRule(id: string) {
  return fetchApi<AutoReplyRule>(`/auto-reply-rules/${id}`)
}

export async function createAutoReplyRule(data: Record<string, unknown>) {
  return fetchApi<AutoReplyRule>('/auto-reply-rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateAutoReplyRule(id: string, data: Record<string, unknown>) {
  return fetchApi<AutoReplyRule>(`/auto-reply-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function toggleAutoReplyRule(id: string) {
  return fetchApi<AutoReplyRule>(`/auto-reply-rules/${id}/toggle`, { method: 'PUT' })
}

export async function deleteAutoReplyRule(id: string) {
  return fetchApi<AutoReplyRule>(`/auto-reply-rules/${id}`, { method: 'DELETE' })
}

export async function testAutoReplyRule(message: string) {
  return fetchApi<{ matched: boolean; rule: AutoReplyRule | null }>(`/auto-reply-rules/test?message=${encodeURIComponent(message)}`)
}

// ==================== Customer Segments ====================

export interface CustomerSegment {
  id: string
  name: string
  description?: string | null
  filters: Record<string, unknown>
  color?: string | null
  customerCount: number
  createdBy?: string | null
  createdAt: string
  updatedAt: string
}

export async function getSegments() {
  return fetchApi<CustomerSegment[]>('/segments')
}

export async function createSegment(data: Record<string, unknown>) {
  return fetchApi<CustomerSegment>('/segments', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateSegment(id: string, data: Record<string, unknown>) {
  return fetchApi<CustomerSegment>(`/segments/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteSegment(id: string) {
  return fetchApi<CustomerSegment>(`/segments/${id}`, { method: 'DELETE' })
}

export async function getSegmentCustomers(id: string, params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Customer[]>(`/segments/${id}/customers${q ? `?${q}` : ''}`)
}

export async function refreshSegmentCount(id: string) {
  return fetchApi<CustomerSegment>(`/segments/${id}/refresh-count`, { method: 'POST' })
}

// ==================== Escalation Rules ====================

export interface EscalationRule {
  id: string
  orgId: string
  name: string
  isActive: boolean
  triggerType: string
  thresholdMinutes: number
  action: string
  actionConfig?: Record<string, unknown> | null
  createdAt: string
}

export async function getEscalationRules() {
  return fetchApi<EscalationRule[]>('/escalation-rules')
}

export async function createEscalationRule(data: {
  name: string; triggerType: string; thresholdMinutes: number;
  action: string; actionConfig?: Record<string, unknown>; isActive?: boolean
}) {
  return fetchApi<EscalationRule>('/escalation-rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateEscalationRule(id: string, data: Partial<{
  name: string; triggerType: string; thresholdMinutes: number;
  action: string; actionConfig: Record<string, unknown>; isActive: boolean
}>) {
  return fetchApi<EscalationRule>(`/escalation-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteEscalationRule(id: string) {
  return fetchApi<EscalationRule>(`/escalation-rules/${id}`, { method: 'DELETE' })
}

// ==================== Customer Merge / Duplicates ====================

export interface DuplicateGroup {
  key: string
  reason: string
  customers: Customer[]
}

export async function getCustomerDuplicates() {
  return fetchApi<DuplicateGroup[]>('/customers/duplicates')
}

export async function mergeCustomers(primaryId: string, mergeIds: string[]) {
  return fetchApi<{ primaryId: string; mergedCount: number }>('/customers/merge', {
    method: 'POST',
    body: JSON.stringify({ primaryId, mergeIds }),
  })
}

// ==================== Read Receipts ====================

export async function markConversationRead(conversationId: string, lastReadMessageId: string) {
  return fetchApi<{ marked: boolean }>(`/conversations/${conversationId}/read`, {
    method: 'POST',
    body: JSON.stringify({ lastReadMessageId }),
  })
}

// ==================== Conversation Summary & Rating ====================

export async function saveConversationSummary(conversationId: string, summary: string) {
  return fetchApi(`/conversations/${conversationId}/summary`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  })
}

export async function inviteRating(conversationId: string) {
  return fetchApi(`/conversations/${conversationId}/invite-rating`, { method: 'POST' })
}

export async function getColleagueConversations(params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return fetchApi<Conversation[]>(`/conversations/colleagues${q ? `?${q}` : ''}`)
}

// ==================== Widget Config ====================

export interface WidgetConfig {
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
}

export async function getWidgetConfig() {
  return fetchApi<WidgetConfig>('/org/widget-config')
}

export async function updateWidgetConfig(config: WidgetConfig) {
  return fetchApi<WidgetConfig>('/org/widget-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

// ==================== Agent Concurrent Chat Limit ====================

export async function updateAgentMaxChats(userId: string, maxConcurrentChats: number) {
  return fetchApi(`/org/members/${userId}/max-chats`, {
    method: 'PUT',
    body: JSON.stringify({ maxConcurrentChats }),
  })
}

// ==================== Agent Online Status ====================

export function updateAgentStatus(status: string) {
  return fetchApi<{ status: string }>('/auth/status', { method: 'PUT', body: JSON.stringify({ status }) })
}

export interface OnlineAgent {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
  onlineStatus: string | null
  lastOnlineAt: string | null
}

export function getOnlineAgents() {
  return fetchApi<OnlineAgent[]>('/auth/online')
}

// ==================== Routing Rules ====================

export interface RoutingRule {
  id: string
  orgId: string
  name: string
  isActive: boolean
  priority: number
  conditions: Record<string, unknown>
  targetType: string
  targetId?: string | null
  createdAt: string
}

export async function getRoutingRules() {
  return fetchApi<RoutingRule[]>('/routing-rules')
}

export async function createRoutingRule(data: Record<string, unknown>) {
  return fetchApi<RoutingRule>('/routing-rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateRoutingRule(id: string, data: Record<string, unknown>) {
  return fetchApi<RoutingRule>(`/routing-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteRoutingRule(id: string) {
  return fetchApi<RoutingRule>(`/routing-rules/${id}`, { method: 'DELETE' })
}

// ==================== Proactive Chat Rules ====================

export interface ProactiveChatRule {
  id: string
  orgId: string
  name: string
  isActive: boolean
  triggerType: string
  triggerConfig: Record<string, unknown>
  message: string
  displayDelay: number
  maxShowCount: number
  createdAt: string
}

export async function getProactiveChatRules() {
  return fetchApi<ProactiveChatRule[]>('/proactive-chat-rules')
}

export async function createProactiveChatRule(data: Record<string, unknown>) {
  return fetchApi<ProactiveChatRule>('/proactive-chat-rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateProactiveChatRule(id: string, data: Record<string, unknown>) {
  return fetchApi<ProactiveChatRule>(`/proactive-chat-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteProactiveChatRule(id: string) {
  return fetchApi<ProactiveChatRule>(`/proactive-chat-rules/${id}`, { method: 'DELETE' })
}

// ==================== Conversation History Export ====================

export async function exportConversationsCsv() {
  const token = getToken()
  const headers: HeadersInit = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}/conversations/export`, { headers })
  if (!res.ok) throw new Error('导出失败')
  return res.blob()
}

// ─── Quality Inspection ───────────────────────────────────────────────────
export interface Inspection {
  id: string
  conversationId: string
  inspectorId: string
  score: number
  grade: string
  categories?: Record<string, number>
  strengths?: string
  weaknesses?: string
  suggestions?: string
  status: string
  createdAt: string
  customerName?: string
  agentName?: string
  agentId?: string
  inspectorName?: string
}

export async function getInspections(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<Inspection[]>(`/inspections${qs}`)
}

export async function createInspection(data: {
  conversationId: string
  score: number
  categories?: Record<string, number>
  strengths?: string
  weaknesses?: string
  suggestions?: string
}) {
  return fetchApi<Inspection>('/inspections', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteInspection(id: string) {
  return fetchApi(`/inspections/${id}`, { method: 'DELETE' })
}

export async function getInspectionStats() {
  return fetchApi<{
    total: number
    avgScore: number
    gradeA: number
    gradeB: number
    gradeC: number
    gradeD: number
    gradeE: number
  }>('/inspections/stats')
}

// ─── AI Chat Assistant ────────────────────────────────────────────────────
export async function getAiSuggestion(conversationId: string) {
  return fetchApi<{ suggestion: string }>(`/conversations/${conversationId}/ai-suggest`, { method: 'POST' })
}

// ─── Message Search ───────────────────────────────────────────────────────
export interface MessageSearchResult {
  messageId: string
  content: string
  senderType: string
  createdAt: string
  conversationId: string
  customerName: string
  agentId?: string
  conversationStatus: string
}

export async function searchMessages(keyword: string, params?: Record<string, string>) {
  const qs = new URLSearchParams({ keyword, ...params }).toString()
  return fetchApi<MessageSearchResult[]>(`/conversations/search-messages?${qs}`)
}

// ─── Missed Conversations ─────────────────────────────────────────────────
export async function getMissedConversations(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return fetchApi<Array<{
    id: string
    customerId: string
    customerName: string
    channelType: string
    status: string
    priority: string
    createdAt: string
    lastMessageAt: string | null
    lastMessagePreview: string | null
    agentId: string | null
    firstResponseAt: string | null
    waitMinutes: number
  }>>(`/conversations/missed${qs}`)
}

// ─── Agent Performance ────────────────────────────────────────────────────
export interface AgentPerformance {
  agentId: string
  agentName: string
  agentAvatar: string | null
  totalConversations: number
  resolvedCount: number
  avgSatisfaction: number | null
  avgFirstResponse: number | null
  avgResolution: number | null
  messageCount: number
}

export async function getAgentPerformance(days?: number) {
  const qs = days ? `?days=${days}` : ''
  return fetchApi<AgentPerformance[]>(`/analytics/agent-performance${qs}`)
}

export interface SlaAnalytics {
  totalActive: number
  overdue: number
  nearDue: number
  resolvedCount: number
  closedCount: number
  byPriority: { priority: string; count: number }[]
  byAssignee: { assigneeId: string | null; assigneeName: string; total: number; overdue: number }[]
  dailyTrend: { date: string; created: number; resolved: number }[]
}

export async function getSlaAnalytics() {
  return fetchApi<SlaAnalytics>('/analytics/sla')
}

export interface QualityAnalytics {
  total: number
  avgScore: number
  byGrade: { grade: string; count: number }[]
  byInspector: { inspectorId: string | null; inspectorName: string; total: number; avgScore: number }[]
  dailyTrend: { date: string; count: number; avgScore: number }[]
}

export async function getQualityAnalytics(days = 30) {
  return fetchApi<QualityAnalytics>(`/analytics/quality?days=${days}`)
}
