'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  getNotifications, getUnreadNotificationCount,
  markNotificationRead, markAllNotificationsRead,
  deleteNotification, deleteAllReadNotifications,
  type Notification,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Bell, BellOff, CheckCheck, Inbox,
  MessageSquare, Users, AlertTriangle, Megaphone,
  UserPlus, ShieldCheck, Zap, ExternalLink, RefreshCw,
  Trash2,
} from 'lucide-react'
import { Pagination } from '@/components/pagination'

const TABS = [
  { id: 'all', label: '全部消息', icon: Bell },
  { id: 'unread', label: '未读', icon: Inbox },
] as const

const TYPE_FILTERS = [
  { id: '', label: '全部类型' },
  { id: 'conversation', label: '会话' },
  { id: 'lead', label: '线索' },
  { id: 'ticket', label: '工单' },
  { id: 'campaign', label: '营销' },
  { id: 'system', label: '系统' },
]

const TYPE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
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

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.system
}

function timeAgo(dateStr: string) {
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

function getResourceLink(n: Notification): string | null {
  if (!n.resourceType || !n.resourceId) return null
  switch (n.resourceType) {
    case 'conversation': return `/dashboard/service`
    case 'lead': return `/dashboard/leads/${n.resourceId}`
    case 'customer': return `/dashboard/customers/${n.resourceId}`
    case 'campaign': return `/dashboard/campaigns`
    case 'ticket': return `/dashboard/tickets/${n.resourceId}`
    case 'deal': return `/dashboard/deals/${n.resourceId}`
    default: return null
  }
}

export default function NotificationCenterPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
  if (tab === 'unread') params.unread = 'true'
  if (typeFilter) params.type = typeFilter

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['notifications-page', tab, typeFilter, page, pageSize],
    queryFn: () => getNotifications(params),
    staleTime: 10_000,
  })
  const allNotifications: Notification[] = listRes?.data ?? []
  const notifications = typeFilter
    ? allNotifications.filter(n => n.type.startsWith(typeFilter))
    : allNotifications
  const total = (listRes as unknown as { total?: number })?.total ?? notifications.length

  const { data: unreadRes } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30_000,
  })
  const unreadCount = unreadRes?.data?.count ?? 0

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-page'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] })
  }

  const markReadMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidateAll,
    onError: () => toast.error('标记已读失败'),
  })

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => { invalidateAll(); toast.success('已全部标记为已读') },
    onError: () => toast.error('操作失败'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => { invalidateAll(); toast.success('已删除') },
    onError: () => toast.error('删除失败'),
  })

  const deleteAllReadMut = useMutation({
    mutationFn: deleteAllReadNotifications,
    onSuccess: () => { invalidateAll(); toast.success('已清除已读消息') },
    onError: () => toast.error('清除失败'),
  })

  const handleClick = (n: Notification) => {
    if (!n.isRead) markReadMut.mutate(n.id)
    const link = getResourceLink(n)
    if (link) router.push(link)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">消息中心</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {unreadCount > 0 ? (
                <span>您有 <strong className="text-primary">{unreadCount}</strong> 条未读消息</span>
              ) : '所有消息已读'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="ghost"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications-page'] })}
            className="text-xs text-slate-500 gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </Button>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => markAllMut.mutate()} loading={markAllMut.isPending} className="text-xs gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> 全部已读
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => deleteAllReadMut.mutate()} loading={deleteAllReadMut.isPending} className="text-xs gap-1 text-slate-500">
            <Trash2 className="h-3.5 w-3.5" /> 清除已读
          </Button>
        </div>
      </div>

      {/* Tabs + Type Filters */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-px">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id as 'all' | 'unread'); setPage(1) }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  active ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.id === 'unread' && unreadCount > 0 && (
                  <Badge variant="danger" className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px]">{unreadCount}</Badge>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex gap-1">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => { setTypeFilter(f.id); setPage(1) }}
              className={cn(
                'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
                typeFilter === f.id ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-400">加载中...</div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <BellOff className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">{tab === 'unread' ? '没有未读消息' : '暂无消息'}</p>
            <p className="text-xs text-slate-400 mt-1">系统消息和工作提醒会显示在这里</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.map(n => {
              const meta = getTypeMeta(n.type)
              const Icon = meta.icon
              const link = getResourceLink(n)
              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 group',
                    !n.isRead && 'bg-primary/[0.02]'
                  )}
                >
                  <button
                    onClick={() => handleClick(n)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5', meta.bg)}>
                      <Icon className={cn('h-4.5 w-4.5', meta.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                          <p className={cn('text-sm truncate', !n.isRead ? 'font-semibold text-slate-800' : 'font-medium text-slate-600')}>{n.title}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap mt-0.5">{timeAgo(n.createdAt)}</span>
                      </div>
                      {n.content && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{n.content}</p>}
                      {link && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-primary mt-1 font-medium">
                          查看详情 <ExternalLink className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    {!n.isRead && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markReadMut.mutate(n.id) }}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-primary"
                        title="标记为已读"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMut.mutate(n.id) }}
                      className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      />
    </div>
  )
}
