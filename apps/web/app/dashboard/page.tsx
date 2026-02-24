'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { formatRelativeTime, cn } from '@/lib/utils'
import {
  getAnalyticsOverview, getLeadStats, getConversations, getLeads, getTickets, getDeals,
  getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
  getUsage,
  type AnalyticsOverview, type Conversation, type Lead, type Ticket, type Deal, type Notification,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/loading'
import {
  Users, MessageSquare, UserCircle, Target, Activity, ArrowUpRight, Layers,
  Plus, Inbox, Megaphone, ClipboardList, AlertTriangle, CheckCircle2,
  TrendingUp, Calendar, ArrowRight, Bell, RefreshCw, CheckCheck,
  Zap, UserPlus, ShieldCheck, ExternalLink, Crown, HardDrive,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Sector,
} from 'recharts'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

const HoverActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 4}
        startAngle={startAngle} endAngle={endAngle} fill={fill} stroke="none" />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 6} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.3} stroke="none" />
    </g>
  )
}

const COLORS = ['#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#6b7280']

const statusLabelMap: Record<string, string> = {
  new: '新线索', contacted: '已联系', qualified: '已筛选', converted: '已转化', disqualified: '已淘汰',
}
const sourceLabelMap: Record<string, string> = {
  wecom: '企微', douyin: '抖音', xiaohongshu: '小红书', baidu: '百度',
  kuaishou: '快手', bilibili: 'B站', zhihu: '知乎', weibo: '微博', manual: '手动录入',
}
const ticketStatusLabel: Record<string, string> = {
  open: '待处理', processing: '处理中', waiting_user: '待用户反馈', in_progress: '处理中', pending: '待用户反馈', resolved: '已解决', closed: '已关闭',
}
const ticketPriorityLabel: Record<string, string> = {
  low: '低', medium: '中', high: '高', urgent: '紧急',
}
const ticketPriorityVariant: Record<string, 'default' | 'primary' | 'warning' | 'danger'> = {
  low: 'default', medium: 'primary', high: 'warning', urgent: 'danger',
}
const dealStageLabel: Record<string, string> = {
  initial: '初步接触', qualified: '需求确认', proposal: '方案报价',
  negotiation: '商务谈判', won: '赢单', lost: '丢单',
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? user?.email ?? '用户'
  const queryClient = useQueryClient()
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }, 30_000)
    return () => clearInterval(timer)
  }, [autoRefresh, queryClient])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await queryClient.invalidateQueries()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const res = await getAnalyticsOverview()
      return res.data ?? null
    },
    staleTime: 30_000,
  })

  const { data: leadStats, isLoading: leadStatsLoading } = useQuery({
    queryKey: ['leads', 'stats'],
    queryFn: async () => {
      const res = await getLeadStats()
      return res.data ?? null
    },
    staleTime: 60_000,
  })

  const { data: openTicketsRes } = useQuery({
    queryKey: ['dashboard-tickets-open'],
    queryFn: () => getTickets({ status: 'open', pageSize: '5' }),
    staleTime: 30_000,
  })
  const openTickets = (openTicketsRes?.data ?? []) as Ticket[]

  const { data: urgentTicketsRes } = useQuery({
    queryKey: ['dashboard-tickets-urgent'],
    queryFn: () => getTickets({ priority: 'urgent', pageSize: '10' }),
    staleTime: 30_000,
  })
  const urgentTickets = ((urgentTicketsRes?.data ?? []) as Ticket[]).filter(t => t.status !== 'closed' && t.status !== 'resolved')

  const { data: recentDealsRes } = useQuery({
    queryKey: ['dashboard-deals-recent'],
    queryFn: () => getDeals({ pageSize: '5' }),
    staleTime: 30_000,
  })
  const recentDeals = (recentDealsRes?.data ?? []) as Deal[]

  const ov = overview ?? { leadCount: 0, customerCount: 0, conversationCount: 0, dealAmountTotal: '0', dealCount: 0, campaignCount: 0, channelCount: 0 }

  const statusData = useMemo(() => (leadStats?.byStatus ?? []).map((s) => ({
    name: statusLabelMap[s.status] ?? s.status,
    value: s.count,
  })), [leadStats?.byStatus])

  const sourceData = useMemo(() => (leadStats?.bySource ?? []).map((s) => ({
    name: sourceLabelMap[s.sourcePlatform] ?? s.sourcePlatform,
    count: s.count,
  })), [leadStats?.bySource])

  const todayStr = useMemo(() => new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }), [])

  const pendingCount = useMemo(() => {
    const allPendingIds = new Set([...openTickets.map(t => t.id), ...urgentTickets.map(t => t.id)])
    return allPendingIds.size
  }, [openTickets, urgentTickets])
  const newLeadCount = useMemo(() => (leadStats?.byStatus ?? []).find(s => s.status === 'new')?.count ?? 0, [leadStats?.byStatus])

  if (overviewLoading || leadStatsLoading) return <LoadingPage />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{getGreeting()}，{name}</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> {todayStr}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-700">
                您有 <strong>{pendingCount}</strong> 项待处理事项
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300"
              />
              自动刷新
            </label>
            <Button variant="outline" size="sm" onClick={handleManualRefresh} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      {overviewError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          数据加载失败，请检查网络连接后刷新页面。
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="线索总量" value={ov.leadCount} icon={Users} color="text-primary" href="/dashboard/leads" />
        <StatCard title="客户总量" value={ov.customerCount} icon={UserCircle} color="text-success" href="/dashboard/customers" />
        <StatCard title="商机数" value={ov.dealCount ?? 0} icon={Target} color="text-orange-500" href="/dashboard/deals" />
        <StatCard title="活动数" value={ov.campaignCount ?? 0} icon={Megaphone} color="text-violet-500" href="/dashboard/campaigns" />
        <StatCard title="会话总量" value={ov.conversationCount} icon={MessageSquare} color="text-warning" href="/dashboard/service" />
        <StatCard title="渠道数" value={ov.channelCount} icon={Layers} color="text-secondary" href="/dashboard/channels" />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/leads?action=new" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <Plus className="h-4 w-4 text-primary" /> 新建线索
        </Link>
        <Link href="/dashboard/customers?action=new" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <Plus className="h-4 w-4 text-success" /> 新建客户
        </Link>
        <Link href="/dashboard/tickets" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <ClipboardList className="h-4 w-4 text-orange-500" /> 工单管理
        </Link>
        <Link href="/dashboard/sla" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> SLA看板
        </Link>
        <Link href="/dashboard/quality" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> 质检中心
        </Link>
        <Link href="/dashboard/inbox" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <Bell className="h-4 w-4 text-warning" /> 消息中心
        </Link>
        <Link href="/dashboard/campaigns" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <Megaphone className="h-4 w-4 text-secondary" /> 营销活动
        </Link>
      </div>

      {/* Plan Usage Summary */}
      <PlanUsageSummary />

      {/* Pending Tasks + Urgent Tickets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" /> 待处理工单
              </CardTitle>
              <Link href="/dashboard/tickets?status=open" className="text-sm text-primary hover:underline flex items-center gap-1">
                查看全部 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {openTickets.length === 0 ? (
              <div className="flex items-center gap-3 py-6 justify-center text-slate-400">
                <CheckCircle2 className="h-6 w-6" />
                <span className="text-sm">所有工单已处理完毕</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {openTickets.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/dashboard/tickets/${t.id}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {ticketStatusLabel[t.status] ?? t.status}
                          {t.assigneeName && ` · ${t.assigneeName}`}
                          {' · '}{formatRelativeTime(t.createdAt)}
                        </p>
                      </div>
                      <Badge variant={ticketPriorityVariant[t.priority] ?? 'default'} className="shrink-0">
                        {ticketPriorityLabel[t.priority] ?? t.priority}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> 紧急事项
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {urgentTickets.length === 0 && newLeadCount === 0 ? (
              <div className="flex items-center gap-3 py-6 justify-center text-slate-400">
                <CheckCircle2 className="h-6 w-6" />
                <span className="text-sm">暂无紧急事项</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {urgentTickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/dashboard/tickets/${t.id}`}
                      className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/50 p-3 hover:bg-red-50 transition-colors"
                    >
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          紧急工单 · {formatRelativeTime(t.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
                {newLeadCount > 0 && (
                  <li>
                    <Link
                      href="/dashboard/leads?status=new"
                      className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3 hover:bg-blue-50 transition-colors"
                    >
                      <Users className="h-4 w-4 text-blue-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{newLeadCount} 条新线索待跟进</p>
                        <p className="text-xs text-slate-500 mt-0.5">请及时联系</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Deals + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" /> 最近商机
              </CardTitle>
              <Link href="/dashboard/deals" className="text-sm text-primary hover:underline flex items-center gap-1">
                查看全部 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentDeals.length === 0 ? (
              <div className="flex items-center gap-3 py-6 justify-center text-slate-400">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm">暂无商机</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {recentDeals.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dashboard/deals/${d.id}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <Target className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{d.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ¥{(parseFloat(d.amount) || 0).toLocaleString()} · {dealStageLabel[d.stage] ?? d.stage}
                        </p>
                      </div>
                      <Badge variant={d.stage === 'won' ? 'success' : d.stage === 'lost' ? 'default' : 'primary'} className="shrink-0">
                        {dealStageLabel[d.stage] ?? d.stage}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-2xl font-bold text-slate-800">¥{(Number(ov.dealAmountTotal) || 0).toLocaleString()}</span>
                <span className="text-sm">累计商机金额</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <RecentActivity />
      </div>

      {/* Message Center */}
      <MessageCenter />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>线索状态分布</CardTitle></CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <div className="h-[280px] [&_svg]:outline-none [&_svg_*]:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      activeShape={HoverActiveShape}
                    >
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState text="暂无线索数据" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>渠道来源分布</CardTitle></CardHeader>
          <CardContent>
            {sourceData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData} margin={{ left: 20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState text="暂无渠道数据" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const PLAN_LABELS: Record<string, string> = { starter: '创业版', pro: '专业版', enterprise: '企业版' }

function formatStorage(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

function UsageBar({
  label,
  current,
  limit,
  formatter,
  icon: Icon,
}: {
  label: string
  current: number
  limit: number
  formatter?: (v: number) => string
  icon: React.ComponentType<{ className?: string }>
}) {
  const fmt = formatter ?? ((v: number) => v.toLocaleString())
  const unlimited = limit < 0 || limit >= 999999
  const pct = unlimited ? 0 : limit > 0 ? Math.min((current / limit) * 100, 100) : 0
  const warn = !unlimited && pct >= 80
  const full = !unlimited && pct >= 100
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
            full ? 'bg-red-50' : warn ? 'bg-amber-50' : 'bg-slate-50'
          )}>
            <Icon className={cn('h-4 w-4', full ? 'text-red-500' : warn ? 'text-amber-500' : 'text-slate-500')} />
          </div>
          <span className="text-xs text-slate-600 truncate">{label}</span>
        </div>
        <span className={cn(
          'text-[11px] rounded-full px-1.5 py-0.5 border shrink-0',
          full
            ? 'text-red-600 border-red-200 bg-red-50'
            : warn
              ? 'text-amber-700 border-amber-200 bg-amber-50'
              : 'text-emerald-700 border-emerald-200 bg-emerald-50'
        )}>
          {unlimited ? '不限' : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="flex items-end gap-1 mb-2">
        <span className={cn('text-lg font-semibold leading-none', full ? 'text-red-600' : warn ? 'text-amber-600' : 'text-slate-800')}>
          {fmt(current)}
        </span>
        <span className="text-xs text-slate-500 leading-none">/ {unlimited ? '不限' : fmt(limit)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            unlimited
              ? 'bg-emerald-400'
              : full
                ? 'bg-gradient-to-r from-red-500 to-rose-500'
                : warn
                  ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                  : 'bg-gradient-to-r from-primary to-blue-500'
          )}
          style={{ width: unlimited ? '100%' : `${pct}%` }}
        />
      </div>
    </div>
  )
}

function PlanUsageSummary() {
  const { data: usage } = useQuery({
    queryKey: ['platform-usage'],
    queryFn: async () => { const r = await getUsage(); return r.data ?? null },
    staleTime: 60_000,
    retry: 1,
  })
  if (!usage) return null
  const usageItems = [
    { label: '团队席位', current: usage.usage.seats, limit: usage.limits.seats, icon: Users },
    { label: '线索数量', current: usage.usage.leads, limit: usage.limits.leads, icon: Target },
    { label: '本月会话', current: usage.usage.conversationsThisMonth, limit: usage.limits.conversationsPerMonth, icon: MessageSquare },
    { label: '知识库', current: usage.usage.knowledgeBases, limit: usage.limits.knowledgeBases, icon: Layers },
    { label: '存储空间', current: usage.usage.storageMb ?? 0, limit: usage.limits.storageMb ?? -1, icon: HardDrive, formatter: formatStorage },
  ]

  return (
    <Card className="border-violet-100 bg-gradient-to-br from-violet-50/40 via-white to-white">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                套餐用量
                <Badge variant="primary" className="text-xs font-medium">{PLAN_LABELS[usage.plan] ?? usage.plan}</Badge>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">实时展示当前账号核心资源使用情况</p>
            </div>
          </div>
          <Link href="/dashboard/org/billing" className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-50 transition-colors">
            管理套餐 <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {usageItems.map((item) => (
            <UsageBar
              key={item.label}
              label={item.label}
              current={item.current}
              limit={item.limit}
              formatter={item.formatter}
              icon={item.icon}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ title, value, icon: Icon, color, href }: {
  title: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; href: string
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
          <div className="flex items-center gap-1">
            <Icon className={`h-5 w-5 ${color}`} />
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  )
}

function RecentActivity() {
  const { data: convRes } = useQuery({
    queryKey: ['recent-conversations'],
    queryFn: () => getConversations({ pageSize: '5' }),
    staleTime: 30_000,
  })
  const { data: leadRes } = useQuery({
    queryKey: ['recent-leads'],
    queryFn: () => getLeads({ pageSize: '5' }),
    staleTime: 30_000,
  })
  const recentConvs = (convRes?.data ?? []) as Conversation[]
  const recentLeads = (leadRes?.data ?? []) as Lead[]

  type ActivityItem = { id: string; type: 'conversation' | 'lead'; title: string; desc: string; time: string; href: string }
  const items: ActivityItem[] = useMemo(() => [
    ...recentConvs.map((c) => ({
      id: `c-${c.id}`,
      type: 'conversation' as const,
      title: c.customerName || c.channelType,
      desc: c.lastMessagePreview || '新会话',
      time: c.lastMessageAt ?? c.createdAt,
      href: `/dashboard/service?conv=${c.id}`,
    })),
    ...recentLeads.map((l) => ({
      id: `l-${l.id}`,
      type: 'lead' as const,
      title: l.contactName || l.companyName || '新线索',
      desc: `${sourceLabelMap[l.sourcePlatform] ?? l.sourcePlatform} · ${statusLabelMap[l.status] ?? l.status}`,
      time: l.createdAt,
      href: `/dashboard/leads/${l.id}`,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8), [recentConvs, recentLeads])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> 最近动态
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center gap-3 py-6 justify-center text-slate-400">
            <Activity className="h-5 w-5" />
            <span className="text-sm">暂无动态</span>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="flex items-center gap-3 hover:bg-slate-50 rounded-lg p-2 -mx-2 transition-colors">
                  {item.type === 'conversation' ? (
                    <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Users className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-slate-500 truncate">{item.desc}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {formatRelativeTime(item.time)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const NOTIF_TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  conversation_new:      { icon: MessageSquare, color: 'text-blue-600',    bg: 'bg-blue-50' },
  conversation_assign:   { icon: Users,         color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  conversation_transfer: { icon: Users,         color: 'text-violet-600',  bg: 'bg-violet-50' },
  conversation_resolved: { icon: CheckCheck,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  sla_warning:           { icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-50' },
  sla_breach:            { icon: AlertTriangle, color: 'text-red-600',     bg: 'bg-red-50' },
  lead_new:              { icon: Zap,           color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  lead_assign:           { icon: UserPlus,      color: 'text-teal-600',    bg: 'bg-teal-50' },
  campaign_complete:     { icon: Megaphone,     color: 'text-pink-600',    bg: 'bg-pink-50' },
  member_join:           { icon: UserPlus,      color: 'text-green-600',   bg: 'bg-green-50' },
  role_change:           { icon: ShieldCheck,   color: 'text-orange-600',  bg: 'bg-orange-50' },
  system:                { icon: Bell,          color: 'text-slate-600',   bg: 'bg-slate-100' },
}

function getNotifMeta(type: string) {
  return NOTIF_TYPE_META[type] ?? NOTIF_TYPE_META.system
}

function notifTimeAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return '刚刚'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}天前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function getNotifLink(n: Notification): string | null {
  if (!n.resourceType || !n.resourceId) return null
  switch (n.resourceType) {
    case 'conversation': return '/dashboard/service'
    case 'lead': return `/dashboard/leads/${n.resourceId}`
    case 'customer': return `/dashboard/customers/${n.resourceId}`
    case 'campaign': return '/dashboard/campaigns'
    case 'ticket': return `/dashboard/tickets/${n.resourceId}`
    case 'deal': return `/dashboard/deals/${n.resourceId}`
    default: return null
  }
}

function MessageCenter() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'all' | 'unread'>('all')

  const { data: notifRes, isLoading } = useQuery({
    queryKey: ['dashboard-notifications', tab],
    queryFn: () => getNotifications({
      pageSize: '8',
      ...(tab === 'unread' ? { unread: 'true' } : {}),
    }),
    staleTime: 15_000,
  })
  const notifications: Notification[] = notifRes?.data ?? []

  const { data: unreadRes } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const unreadCount = unreadRes?.data?.count ?? 0

  const markReadMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    },
  })

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
      toast.success('已全部标记为已读')
    },
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            消息中心
            {unreadCount > 0 && (
              <Badge variant="danger" className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => markAllMut.mutate()} className="text-xs text-slate-500 h-7">
                <CheckCheck className="h-3.5 w-3.5 mr-1" /> 全部已读
              </Button>
            )}
            <Link href="/dashboard/inbox" className="text-sm text-primary hover:underline flex items-center gap-1">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardHeader>

      {/* Mini tabs */}
      <div className="px-6 pb-2 flex items-center gap-1 border-b border-slate-100 -mt-1">
        {(['all', 'unread'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              tab === t ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            )}
          >
            {t === 'all' ? '全部' : '未读'}
            {t === 'unread' && unreadCount > 0 && (
              <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1 min-w-[14px] inline-block text-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <CardContent className="pt-3">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400">
            <Inbox className="h-8 w-8 mb-2 text-slate-300" />
            <p className="text-sm font-medium">{tab === 'unread' ? '没有未读消息' : '暂无消息'}</p>
            <p className="text-xs mt-0.5">系统消息和工作提醒会显示在这里</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.map(n => {
              const meta = getNotifMeta(n.type)
              const NIcon = meta.icon
              const link = getNotifLink(n)
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) markReadMut.mutate(n.id)
                    if (link) window.location.href = link
                  }}
                  className={cn(
                    'flex items-start gap-3 py-3 px-1 cursor-pointer rounded-lg transition-colors hover:bg-slate-50 -mx-1',
                    !n.isRead && 'bg-primary/[0.02]'
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', meta.bg)}>
                    <NIcon className={cn('h-4 w-4', meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        <p className={cn(
                          'text-sm truncate',
                          !n.isRead ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'
                        )}>{n.title}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap mt-0.5">
                        {notifTimeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.content && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 leading-relaxed">{n.content}</p>
                    )}
                    {link && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-primary mt-1 font-medium">
                        查看详情 <ExternalLink className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center">
      <div className="text-center">
        <Activity className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">{text}</p>
      </div>
    </div>
  )
}
