'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, updateAgentStatus, type Notification as AppNotification } from '@/lib/api'
import {
  LayoutDashboard,
  Users,
  UserCircle,
  BookOpen,
  Megaphone,
  GitBranch,
  BarChart3,
  Settings,
  Bell,
  Flame,
  LogOut,
  ChevronDown,
  Handshake,
  Headphones,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  ClipboardList,
  History,
  Eye,
  Volume2,
  VolumeX,
  Radio,
  MonitorDot,
  User,
  MessageSquare,
  CheckCheck,
  AlertTriangle,
  Zap,
  UserPlus,
  ShieldCheck,
  ExternalLink,
  Crown,
  Lock,
  Gauge,
  ClipboardCheck,
  Pin,
} from 'lucide-react'
import { cn, APP_VERSION } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { ErrorBoundary } from '@/components/error-boundary'
import { TrialBanner, usePlan } from '@/components/plan-guard'
import { Avatar } from '@/components/ui/avatar'
import { GlobalSearch } from '@/components/global-search'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { connectSocket } from '@/lib/socket'
import {
  sendDesktopNotification,
  playNotificationSound,
  requestNotificationPermission,
  isSoundEnabled,
  setSoundEnabled,
} from '@/lib/notifications'

const ROLE_LEVELS: Record<string, number> = { owner: 100, admin: 80, manager: 60, agent: 40, viewer: 10 }

interface NavItem { href: string; label: string; icon: React.ElementType; minRole?: string; feature?: string }
interface NavGroup { key: string; title: string; items: NavItem[] }
const navGroups: NavGroup[] = [
  {
    key: 'core',
    title: '核心运营',
    items: [
      { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
      { href: '/dashboard/leads', label: '线索管理', icon: Users },
      { href: '/dashboard/customers', label: '客户管理', icon: UserCircle },
      { href: '/dashboard/deals', label: '商机管理', icon: Handshake },
    ],
  },
  {
    key: 'service',
    title: '客服工单',
    items: [
      { href: '/dashboard/service', label: '客服中心', icon: Headphones },
      { href: '/dashboard/tickets', label: '工单管理', icon: ClipboardList },
      { href: '/dashboard/sla', label: 'SLA看板', icon: Gauge, minRole: 'manager' },
      { href: '/dashboard/quality', label: '质检中心', icon: ClipboardCheck, minRole: 'manager' },
      { href: '/dashboard/history', label: '历史对话', icon: History },
      { href: '/dashboard/visitors', label: '访客追踪', icon: Eye },
    ],
  },
  {
    key: 'growth',
    title: '增长自动化',
    items: [
      { href: '/dashboard/campaigns', label: '营销活动', icon: Megaphone, minRole: 'manager', feature: 'campaigns' },
      { href: '/dashboard/workflows', label: '工作流', icon: GitBranch, minRole: 'manager', feature: 'workflows' },
      { href: '/dashboard/channels', label: '渠道管理', icon: Radio, minRole: 'admin' },
      { href: '/dashboard/knowledge', label: '知识库', icon: BookOpen },
    ],
  },
  {
    key: 'system',
    title: '分析与系统',
    items: [
      { href: '/dashboard/analytics', label: '数据分析', icon: BarChart3, minRole: 'manager' },
      { href: '/dashboard/monitor', label: '实时监控', icon: MonitorDot, minRole: 'manager' },
      { href: '/dashboard/inbox', label: '消息中心', icon: Bell },
      { href: '/dashboard/org', label: '组织架构', icon: Building2, minRole: 'admin' },
      { href: '/dashboard/settings', label: '系统设置', icon: Settings, minRole: 'admin' },
    ],
  },
]

const breadcrumbMap: Record<string, string> = {
  '/dashboard': '工作台',
  '/dashboard/leads': '线索管理',
  '/dashboard/customers': '客户管理',
  '/dashboard/service': '客服中心',
  '/dashboard/tickets': '工单管理',
  '/dashboard/sla': 'SLA看板',
  '/dashboard/quality': '质检中心',
  '/dashboard/history': '历史对话',
  '/dashboard/visitors': '访客追踪',
  '/dashboard/service/stats': '客服统计',
  '/dashboard/service/agents': '客服管理',
  '/dashboard/service/consultations': '离线咨询',
  '/dashboard/service/settings': '客服设置',
  '/dashboard/service/inspections': '质检中心',
  '/dashboard/inbox': '消息中心',
  '/dashboard/knowledge': '知识库',
  '/dashboard/deals': '商机管理',
  '/dashboard/campaigns': '营销活动',
  '/dashboard/workflows': '工作流',
  '/dashboard/channels': '渠道管理',
  '/dashboard/analytics': '数据分析',
  '/dashboard/monitor': '实时监控',
  '/dashboard/org': '组织架构',
  '/dashboard/org/departments': '部门管理',
  '/dashboard/org/teams': '团队管理',
  '/dashboard/org/roles': '角色管理',
  '/dashboard/org/permissions': '权限管理',
  '/dashboard/org/info': '企业信息',
  '/dashboard/org/billing': '套餐与用量',
  '/dashboard/settings': '系统设置',
  '/dashboard/profile': '个人资料',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const detailSegmentLabels: Record<string, string> = {
  leads: '线索详情',
  customers: '客户详情',
  deals: '商机详情',
  campaigns: '活动详情',
  tickets: '工单详情',
  workflows: '工作流详情',
}

const SIDEBAR_KEY = 'huoke-sidebar-collapsed'
const RECENT_NAV_KEY = 'huoke-recent-nav'
const PINNED_NAV_KEY = 'huoke-pinned-nav'

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

function getNotifLink(n: AppNotification): string | null {
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

function NavTooltip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null
  return (
    <span className="absolute left-full ml-2 z-[60] whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
      {label}
    </span>
  )
}

function canAccessNavItem(item: NavItem, userRole?: string, hasFeature?: (feature: string) => boolean) {
  if (item.minRole) {
    const userLevel = ROLE_LEVELS[userRole ?? 'viewer'] ?? 0
    const requiredLevel = ROLE_LEVELS[item.minRole] ?? 0
    if (userLevel < requiredLevel) return false
  }
  if (item.feature && hasFeature && !hasFeature(item.feature)) return false
  return true
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isAuthenticated, _hydrated, updateUser } = useAuthStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [recentNav, setRecentNav] = useState<string[]>([])
  const [pinnedNav, setPinnedNav] = useState<string[]>([])
  const { hasFeature } = usePlan()

  const [soundOn, setSoundOn] = useState(true)
  const [permissionAsked, setPermissionAsked] = useState(false)
  const [agentStatus, setAgentStatus] = useState<string>(user?.onlineStatus ?? 'online')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const queryClient = useQueryClient()

  const statusOptions = [
    { value: 'online', label: '在线', color: 'bg-green-500' },
    { value: 'away', label: '离开', color: 'bg-amber-500' },
    { value: 'busy', label: '忙碌', color: 'bg-red-500' },
    { value: 'offline', label: '离线', color: 'bg-slate-400' },
  ] as const

  const statusMut = useMutation({
    mutationFn: (status: string) => updateAgentStatus(status),
    onSuccess: (_, status) => {
      setAgentStatus(status)
      updateUser({ onlineStatus: status })
      toast.success(`状态已切换为${statusOptions.find(o => o.value === status)?.label}`)
    },
    onError: () => toast.error('状态切换失败'),
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY)
      if (saved === 'true') setCollapsed(true)
    } catch { /* */ }
    setSoundOn(isSoundEnabled())
    try {
      const raw = localStorage.getItem(RECENT_NAV_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as string[]
        if (Array.isArray(parsed)) setRecentNav(parsed.slice(0, 5))
      }
    } catch { /* */ }
    try {
      const raw = localStorage.getItem(PINNED_NAV_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as string[]
        if (Array.isArray(parsed)) setPinnedNav(parsed.slice(0, 6))
      }
    } catch { /* */ }
  }, [])

  useEffect(() => {
    if (!pathname?.startsWith('/dashboard')) return
    const allItems = navGroups.flatMap((g) => g.items)
    const exists = allItems.some((i) => i.href === pathname)
    if (!exists) return
    setRecentNav((prev) => {
      const next = [pathname, ...prev.filter((p) => p !== pathname)].slice(0, 5)
      try { localStorage.setItem(RECENT_NAV_KEY, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [pathname])

  const togglePinNav = useCallback((href: string) => {
    setPinnedNav((prev) => {
      const exists = prev.includes(href)
      const next = exists ? prev.filter((p) => p !== href) : [href, ...prev].slice(0, 6)
      try { localStorage.setItem(PINNED_NAV_KEY, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [])

  // Request notification permission once after mount
  useEffect(() => {
    if (!_hydrated || !isAuthenticated || permissionAsked) return
    const asked = localStorage.getItem('huoke-notif-asked')
    if (asked) return
    const timer = setTimeout(() => {
      requestNotificationPermission().then(() => {
        localStorage.setItem('huoke-notif-asked', '1')
        setPermissionAsked(true)
      })
    }, 3000)
    return () => clearTimeout(timer)
  }, [_hydrated, isAuthenticated, permissionAsked])

  // Socket: listen for real-time notification and message events
  useEffect(() => {
    if (!_hydrated || !isAuthenticated) return
    const socket = connectSocket()

    const handleNotification = (data: { title?: string; content?: string; resourceType?: string; resourceId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
      playNotificationSound()
      const href = data.resourceType === 'conversation' ? '/dashboard/service'
        : data.resourceType === 'lead' && data.resourceId ? `/dashboard/leads/${data.resourceId}`
        : data.resourceType === 'customer' && data.resourceId ? `/dashboard/customers/${data.resourceId}`
        : data.resourceType === 'ticket' && data.resourceId ? `/dashboard/tickets/${data.resourceId}`
        : data.resourceType === 'deal' && data.resourceId ? `/dashboard/deals/${data.resourceId}`
        : '/dashboard/inbox'
      sendDesktopNotification(
        data.title ?? '新消息',
        data.content ?? '',
        () => router.push(href),
      )
    }

    const handleNewMessage = (data: { conversationId?: string; content?: string; customerName?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
      playNotificationSound()
      sendDesktopNotification(
        data.customerName ?? '新消息',
        data.content ?? '您有一条新消息',
        () => router.push('/dashboard/service'),
      )
    }

    socket.on('notification:new', handleNotification)
    socket.on('message:new', handleNewMessage)

    return () => {
      socket.off('notification:new', handleNotification)
      socket.off('message:new', handleNewMessage)
    }
  }, [_hydrated, isAuthenticated, queryClient, router])

  const toggleSound = useCallback(() => {
    setSoundOn(prev => {
      const next = !prev
      setSoundEnabled(next)
      return next
    })
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_KEY, String(next)) } catch { /* */ }
      return next
    })
  }, [])

  const { data: notifRes } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => getNotifications({ pageSize: '10' }),
    enabled: _hydrated && isAuthenticated,
    staleTime: 1000 * 30,
  })
  const { data: unreadRes } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => getUnreadNotificationCount(),
    enabled: _hydrated && isAuthenticated,
    refetchInterval: 30000,
  })
  const notifications: AppNotification[] = notifRes?.data ?? []
  const unreadCount = unreadRes?.data?.count ?? 0
  const markReadMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
    onError: () => toast.error('操作失败'),
  })
  const markAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
    onError: () => toast.error('操作失败'),
  })

  useEffect(() => {
    if (_hydrated && !isAuthenticated) {
      router.replace('/login')
    }
  }, [_hydrated, isAuthenticated, router])

  useEffect(() => {
    if (_hydrated && isAuthenticated && user?.org?.onboardingCompleted === false && user?.role === 'owner') {
      router.replace('/onboarding')
    }
  }, [_hydrated, isAuthenticated, user, router])

  const breadcrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map((segment, i, arr) => {
      const path = '/' + arr.slice(0, i + 1).join('/')
      let label = breadcrumbMap[path]
      if (label === undefined && UUID_REGEX.test(segment)) {
        const parentSegment = arr[i - 1]
        label = detailSegmentLabels[parentSegment] ?? segment
      }
      return { path, label: label ?? segment }
    })

  if (!_hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Flame className="h-10 w-10 text-primary animate-pulse" />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const sidebarW = collapsed ? 'w-[68px]' : 'w-64'
  const contentPl = collapsed ? 'lg:pl-[68px]' : 'lg:pl-64'
  const navLookup = new Map(navGroups.flatMap((g) => g.items.map((i) => [i.href, i] as const)))
  const pinnedItems = pinnedNav
    .map((href) => navLookup.get(href))
    .filter((item): item is NavItem => !!item && canAccessNavItem(item, user?.role, hasFeature))
  const recentItems = recentNav
    .map((href) => navLookup.get(href))
    .filter((item): item is NavItem => !!item && canAccessNavItem(item, user?.role, hasFeature))
    .filter((item) => !pinnedNav.includes(item.href))

  return (
    <ConfirmProvider>
    <div className="min-h-screen flex">
      <GlobalSearch />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-50 h-screen flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out',
        sidebarW,
        'lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Header */}
        <div className={cn('flex h-14 items-center border-b border-slate-700/50 shrink-0', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
          <Flame className="h-7 w-7 text-primary shrink-0" />
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-base font-bold text-white tracking-wide">火客</span>
              <span className="text-[9px] text-slate-400/50 font-mono leading-none px-1 py-0.5 rounded bg-slate-700/40 ml-0.5">{APP_VERSION}</span>
              <Link
                href="/dashboard/org/billing"
                className="flex items-center gap-1 ml-auto px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:brightness-125 whitespace-nowrap"
                style={{
                  background: user?.org?.plan === 'enterprise'
                    ? 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))'
                    : user?.org?.plan === 'pro'
                    ? 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))'
                    : 'linear-gradient(135deg, rgba(56,189,248,0.12), rgba(99,102,241,0.08))',
                  border: `1px solid ${
                    user?.org?.plan === 'enterprise' ? 'rgba(251,191,36,0.25)' :
                    user?.org?.plan === 'pro' ? 'rgba(139,92,246,0.25)' : 'rgba(56,189,248,0.2)'
                  }`,
                  color: user?.org?.plan === 'enterprise' ? 'rgb(253,224,71)' :
                    user?.org?.plan === 'pro' ? 'rgb(196,181,253)' : 'rgb(147,197,253)',
                }}
              >
                <Crown className="w-3 h-3" />
                {user?.org?.plan === 'enterprise' ? '企业版' : user?.org?.plan === 'pro' ? '专业版' : '创业版'}
              </Link>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
          {pinnedItems.length > 0 && (
            <div className="mb-3">
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-500">
                  固定常用
                </p>
              )}
              <div className="space-y-0.5">
                {pinnedItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  const Icon = item.icon
                  const locked = !!item.feature && !hasFeature(item.feature)
                  return (
                    <div
                      key={`pinned-${item.href}`}
                      className={cn(
                        'group relative rounded-lg transition-all',
                        isActive
                          ? 'bg-gradient-to-r from-primary to-indigo-500 text-white shadow-md shadow-primary/25'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      )}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center text-sm font-medium',
                          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5 pr-9',
                          locked && 'opacity-60'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                        {!collapsed && locked && <Lock className="ml-auto h-3.5 w-3.5 text-slate-500" />}
                        <NavTooltip label={locked ? `${item.label}（需升级）` : item.label} show={collapsed} />
                      </Link>
                      {!collapsed && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePinNav(item.href) }}
                          className={cn(
                            'absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors',
                            isActive ? 'text-white/85 hover:text-white hover:bg-white/15' : 'text-slate-500 hover:text-violet-300 hover:bg-slate-700'
                          )}
                          title="取消固定"
                          aria-label="取消固定"
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="my-2 mx-2 border-t border-slate-700/40" />
            </div>
          )}
          {recentItems.length > 0 && (
            <div className="mb-3">
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-500">
                  最近访问
                </p>
              )}
              <div className="space-y-0.5">
                {recentItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                    const Icon = item.icon
                    const locked = !!item.feature && !hasFeature(item.feature)
                    return (
                      <div
                        key={`recent-${item.href}`}
                        className={cn(
                          'group relative rounded-lg transition-all',
                          isActive
                            ? 'bg-gradient-to-r from-primary to-indigo-500 text-white shadow-md shadow-primary/25'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            'flex items-center text-sm font-medium',
                            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5 pr-9',
                            locked && 'opacity-60'
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                          {!collapsed && locked && <Lock className="ml-auto h-3.5 w-3.5 text-slate-500" />}
                          <NavTooltip label={locked ? `${item.label}（需升级）` : item.label} show={collapsed} />
                        </Link>
                        {!collapsed && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePinNav(item.href) }}
                            className={cn(
                              'absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors',
                              isActive ? 'text-white/85 hover:text-white hover:bg-white/15' : 'text-slate-500 hover:text-violet-300 hover:bg-slate-700'
                            )}
                            title="固定到顶部"
                            aria-label="固定到顶部"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
              <div className="my-2 mx-2 border-t border-slate-700/40" />
            </div>
          )}
          {navGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => canAccessNavItem(item, user?.role, hasFeature))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.key} className={cn(groupIdx > 0 && 'mt-3')}>
                {collapsed ? (
                  groupIdx > 0 ? <div className="my-2 mx-2 border-t border-slate-700/40" /> : null
                ) : (
                  <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-500">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                    const Icon = item.icon
                    const locked = !!item.feature && !hasFeature(item.feature)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'group relative flex items-center rounded-lg text-sm font-medium transition-all',
                          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                          locked && 'opacity-60',
                          isActive
                            ? 'bg-gradient-to-r from-primary to-indigo-500 text-white shadow-md shadow-primary/25'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                        {!collapsed && locked && <Lock className="ml-auto h-3.5 w-3.5 text-slate-500" />}
                        <NavTooltip label={locked ? `${item.label}（需升级）` : item.label} show={collapsed} />
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Keyboard shortcut hint */}
        {!collapsed && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-slate-800/50 flex items-center gap-2 text-xs text-slate-400">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono text-[10px]">Ctrl+K</kbd>
            <span>快速搜索</span>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="hidden lg:flex items-center border-t border-slate-700/50 px-2 py-2">
          <button
            onClick={toggleCollapse}
            className={cn(
              'flex items-center gap-2 rounded-lg py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full',
              collapsed ? 'justify-center px-0' : 'px-3'
            )}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5 shrink-0" /> : <PanelLeftClose className="h-4.5 w-4.5 shrink-0" />}
            {!collapsed && <span className="text-xs whitespace-nowrap">收起侧边栏</span>}
          </button>
        </div>

        {/* User area */}
        <div className={cn('border-t border-slate-700/50 p-2', collapsed ? 'flex justify-center' : '')}>
          {collapsed ? (
            <Link href="/dashboard/profile" className="group relative block">
              <Avatar src={user?.avatarUrl} name={user?.name ?? user?.email ?? '用户'} size="sm" className="bg-slate-600 text-white cursor-pointer hover:ring-2 hover:ring-primary transition-all" />
              <NavTooltip label="个人资料" show={true} />
            </Link>
          ) : (
            <Link href="/dashboard/profile" className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors">
              <Avatar src={user?.avatarUrl} name={user?.name ?? user?.email ?? '用户'} size="sm" className="bg-slate-600 text-white" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {user?.name ?? user?.email ?? '用户'}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <span className={cn('h-1.5 w-1.5 rounded-full', statusOptions.find(o => o.value === agentStatus)?.color ?? 'bg-slate-400')} />
                  {statusOptions.find(o => o.value === agentStatus)?.label ?? '离线'}
                </p>
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={cn('flex flex-1 flex-col transition-all duration-300 ease-in-out', contentPl)}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" aria-label="打开菜单">
              <Menu className="h-5 w-5 text-slate-600" />
            </button>
            {/* Desktop collapse toggle (also in header for quick access) */}
            <button onClick={toggleCollapse} className="hidden lg:flex rounded-lg p-1.5 hover:bg-slate-100" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}>
              {collapsed ? <PanelLeftOpen className="h-5 w-5 text-slate-500" /> : <PanelLeftClose className="h-5 w-5 text-slate-500" />}
            </button>
            <nav className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
            {breadcrumbs.map((b, i) => (
              <span key={b.path} className="flex items-center gap-2">
                {i > 0 && <span>/</span>}
                <Link href={b.path} className="hover:text-primary">
                  {b.label}
                </Link>
              </span>
            ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* Agent Status Selector */}
            <div className="relative">
              <button
                onClick={() => { setStatusMenuOpen(!statusMenuOpen); setUserMenuOpen(false); setNotifyOpen(false) }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 text-sm text-slate-600"
                aria-label="切换状态"
              >
                <span className={cn('h-2.5 w-2.5 rounded-full', statusOptions.find(o => o.value === agentStatus)?.color ?? 'bg-slate-400')} />
                <span className="hidden sm:inline">{statusOptions.find(o => o.value === agentStatus)?.label}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {statusMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setStatusMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { statusMut.mutate(opt.value); setStatusMenuOpen(false) }}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50',
                          agentStatus === opt.value ? 'text-primary font-medium' : 'text-slate-700'
                        )}
                      >
                        <span className={cn('h-2.5 w-2.5 rounded-full', opt.color)} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Sound toggle */}
            <button
              onClick={toggleSound}
              className="rounded-full p-2 hover:bg-slate-100 relative"
              aria-label={soundOn ? '关闭提示音' : '开启提示音'}
              title={soundOn ? '提示音已开启' : '提示音已关闭'}
            >
              {soundOn
                ? <Volume2 className="h-5 w-5 text-slate-600" />
                : <VolumeX className="h-5 w-5 text-slate-400" />
              }
            </button>
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => { setNotifyOpen(!notifyOpen); setUserMenuOpen(false) }}
                className="rounded-full p-2 hover:bg-slate-100 relative"
                aria-label="消息"
              >
                <Bell className="h-5 w-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifyOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifyOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-96 rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">消息中心</p>
                        {unreadCount > 0 && (
                          <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center font-bold">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllMut.mutate()}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <CheckCheck className="h-3 w-3" /> 全部已读
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center py-8 text-slate-400">
                          <Bell className="h-8 w-8 mb-2 text-slate-200" />
                          <p className="text-sm font-medium">暂无消息</p>
                          <p className="text-xs mt-0.5">系统消息和工作提醒会显示在这里</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {notifications.map((n) => {
                            const meta = getNotifMeta(n.type)
                            const NIcon = meta.icon
                            const link = getNotifLink(n)
                            return (
                              <button
                                key={n.id}
                                onClick={() => {
                                  if (!n.isRead) markReadMut.mutate(n.id)
                                  const href = link ?? '/dashboard/inbox'
                                  router.push(href)
                                  setNotifyOpen(false)
                                }}
                                className={cn(
                                  'w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50',
                                  !n.isRead && 'bg-primary/[0.03]'
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
                                  {n.content && <p className="text-xs text-slate-500 mt-0.5 truncate leading-relaxed">{n.content}</p>}
                                  {link && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-primary mt-1 font-medium">
                                      查看详情 <ExternalLink className="h-2.5 w-2.5" />
                                    </span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { router.push('/dashboard/inbox'); setNotifyOpen(false) }}
                      className="w-full text-center text-xs text-primary hover:bg-slate-50 py-2.5 border-t border-slate-100 font-medium flex items-center justify-center gap-1"
                    >
                      查看全部消息 <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
                aria-label="用户菜单"
              >
                <Avatar src={user?.avatarUrl} name={user?.name ?? user?.email ?? '用户'} size="sm" />
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-800 truncate">{user?.name ?? '用户'}</p>
                      <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/dashboard/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <User className="h-4 w-4 text-slate-400" />
                        个人资料
                      </Link>
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <Settings className="h-4 w-4 text-slate-400" />
                        系统设置
                      </Link>
                    </div>
                    <div className="border-t border-slate-100 py-1">
                      <button
                        onClick={() => {
                          logout()
                          router.push('/login')
                          setUserMenuOpen(false)
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" />
                        退出登录
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {(user?.org?.trialEndsAt || user?.org?.planExpiresAt) && <TrialBanner trialEndsAt={user.org.trialEndsAt} planExpiresAt={user.org.planExpiresAt} />}
        <main className="flex-1 bg-background p-4 lg:p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
    </ConfirmProvider>
  )
}
