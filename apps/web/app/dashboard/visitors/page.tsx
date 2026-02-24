'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getVisitors, getVisitorStats, getVisitorPages, createConversation, addToBlacklist, type VisitorSession, type PageView } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import {
  Users, Eye, Clock, TrendingDown, AlertTriangle,
  Globe, Monitor, Smartphone, MessageSquare, ShieldBan,
  MapPin, Activity, Search, Route, ExternalLink,
} from 'lucide-react'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) return `${s}秒`
  return `${m}分${s}秒`
}

function calcEngagementScore(v: VisitorSession) {
  return Math.min(100, Math.round(v.pageViews * 10 + (v.duration / 60) * 5))
}

function getReferrerDomain(referrer: string | null | undefined): string {
  if (!referrer) return '直接访问'
  try {
    return new URL(referrer).hostname.replace('www.', '')
  } catch {
    return referrer.slice(0, 30)
  }
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600">{score}</span>
    </div>
  )
}

const deviceFilterOptions = [
  { value: '', label: '全部设备' },
  { value: 'desktop', label: '桌面端' },
  { value: 'mobile', label: '移动端' },
  { value: 'tablet', label: '平板' },
]

const onlineFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
]

export default function VisitorsPage() {
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorSession | null>(null)
  const [inviting, setInviting] = useState<string | null>(null)
  const [searchIp, setSearchIp] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [onlineFilter, setOnlineFilter] = useState('')
  const [blacklistTarget, setBlacklistTarget] = useState<VisitorSession | null>(null)
  const [trajectoryVisitor, setTrajectoryVisitor] = useState<VisitorSession | null>(null)

  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ['visitor-stats'],
    queryFn: () => getVisitorStats(),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const { data: visitorsRes, isLoading: visitorsLoading, isError } = useQuery({
    queryKey: ['visitors'],
    queryFn: () => getVisitors(),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const { data: trajectoryRes, isLoading: trajectoryLoading } = useQuery({
    queryKey: ['visitor-trajectory', trajectoryVisitor?.id],
    queryFn: () => getVisitorPages(trajectoryVisitor!.id),
    enabled: !!trajectoryVisitor,
  })

  const stats = statsRes?.data
  const visitors: VisitorSession[] = visitorsRes?.data ?? []

  const avgDuration = useMemo(() => {
    if (visitors.length === 0) return 0
    return Math.round(visitors.reduce((sum, v) => sum + v.duration, 0) / visitors.length / 60 * 10) / 10
  }, [visitors])

  const bounceRate = useMemo(() => {
    if (visitors.length === 0) return 0
    const bounced = visitors.filter(v => v.pageViews <= 1).length
    return Math.round((bounced / visitors.length) * 100)
  }, [visitors])

  const topPages = useMemo(() => {
    return (stats?.topPages ?? []).slice(0, 5)
  }, [stats])

  const maxPageCount = useMemo(() => {
    return Math.max(...topPages.map(p => p.count), 1)
  }, [topPages])

  const filteredVisitors = useMemo(() => {
    let result = visitors
    if (searchIp) {
      const q = searchIp.toLowerCase()
      result = result.filter(v =>
        (v.ipAddress && v.ipAddress.toLowerCase().includes(q)) ||
        v.visitorId.toLowerCase().includes(q)
      )
    }
    if (deviceFilter) {
      result = result.filter(v => v.deviceType === deviceFilter)
    }
    if (onlineFilter === 'online') {
      result = result.filter(v => v.isOnline)
    } else if (onlineFilter === 'offline') {
      result = result.filter(v => !v.isOnline)
    }
    return result
  }, [visitors, searchIp, deviceFilter, onlineFilter])

  const handleInviteChat = async (visitor: VisitorSession) => {
    if (!visitor.customerId) {
      toast.error('该访客尚未关联客户，无法发起对话')
      return
    }
    setInviting(visitor.id)
    try {
      await createConversation({ customerId: visitor.customerId, channelType: 'web_widget' })
      toast.success('对话已创建')
    } catch {
      toast.error('创建对话失败')
    } finally {
      setInviting(null)
    }
  }

  const confirmBlacklist = async () => {
    if (!blacklistTarget?.ipAddress) {
      toast.error('无法获取访客 IP')
      return
    }
    try {
      await addToBlacklist({ type: 'ip', value: blacklistTarget.ipAddress, reason: '手动加入黑名单' })
      toast.success('已加入黑名单')
      setBlacklistTarget(null)
      setSelectedVisitor(null)
    } catch {
      toast.error('操作失败')
    }
  }

  if (statsLoading || visitorsLoading) return <LoadingPage />

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 text-red-500">
      <AlertTriangle className="h-8 w-8 mb-2" />
      <p>数据加载失败，请刷新重试</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">访客追踪</h1>
            <p className="text-sm text-muted-foreground mt-0.5">实时监控网站访客行为</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-sm font-semibold text-emerald-700">{stats?.onlineCount ?? 0} 在线</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Users className="h-7 w-7 text-emerald-500" />
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            </div>
            <p className="text-2xl font-bold mt-2">{stats?.onlineCount ?? 0}</p>
            <p className="text-sm text-slate-500">当前在线</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Eye className="h-7 w-7 text-blue-500" />
            <p className="text-2xl font-bold mt-2">{stats?.todayCount ?? 0}</p>
            <p className="text-sm text-slate-500">今日访客</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Clock className="h-7 w-7 text-purple-500" />
            <p className="text-2xl font-bold mt-2">{avgDuration}<span className="text-sm font-normal text-slate-400 ml-0.5">分</span></p>
            <p className="text-sm text-slate-500">平均停留</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <TrendingDown className="h-7 w-7 text-amber-500" />
            <p className="text-2xl font-bold mt-2">{bounceRate}<span className="text-sm font-normal text-slate-400 ml-0.5">%</span></p>
            <p className="text-sm text-slate-500">跳出率</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select options={deviceFilterOptions} value={deviceFilter} onChange={setDeviceFilter} className="w-[130px]" />
        <Select options={onlineFilterOptions} value={onlineFilter} onChange={setOnlineFilter} className="w-[130px]" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索 IP 地址或访客 ID..."
            value={searchIp}
            onChange={(e) => setSearchIp(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Visitor Table */}
      <Card>
        <CardContent className="pt-6">
          {filteredVisitors.length === 0 ? (
            <div className="py-12 text-center">
              <Eye className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">暂无访客记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium">访客</th>
                    <th className="pb-2 pr-4 font-medium">地区</th>
                    <th className="pb-2 pr-4 font-medium">设备</th>
                    <th className="pb-2 pr-4 font-medium">当前页面</th>
                    <th className="pb-2 pr-4 font-medium">来源</th>
                    <th className="pb-2 pr-4 font-medium">浏览量</th>
                    <th className="pb-2 pr-4 font-medium">参与度</th>
                    <th className="pb-2 pr-4 font-medium">状态</th>
                    <th className="pb-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisitors.map((v) => {
                    const score = calcEngagementScore(v)
                    const DeviceIcon = v.deviceType === 'mobile' ? Smartphone : Monitor
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedVisitor(v)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                              <Globe className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <div>
                              <p className="font-mono text-xs text-slate-600" title={v.visitorId}>{v.visitorId.slice(0, 8)}</p>
                              <p className="text-[10px] text-slate-400">{v.ipAddress ?? '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600">
                          {[v.country, v.city].filter(Boolean).join(' ') || '-'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <DeviceIcon className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-xs">{v.browser ?? '-'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600 max-w-[180px] truncate" title={v.currentPage ?? ''}>
                          {v.currentPage ?? '-'}
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-slate-500">
                          {getReferrerDomain(v.referrer)}
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-center">{v.pageViews}</td>
                        <td className="py-2.5 pr-4">
                          <ScoreBar score={score} />
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={v.isOnline ? 'success' : 'default'}>
                            {v.isOnline ? '在线' : '离线'}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-violet-600 hover:text-violet-700"
                              onClick={(e) => { e.stopPropagation(); setTrajectoryVisitor(v) }}
                            >
                              <Route className="h-3 w-3 mr-1" />
                              查看轨迹
                            </Button>
                            {v.isOnline && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-primary hover:text-primary/80"
                                loading={inviting === v.id}
                                onClick={(e) => { e.stopPropagation(); handleInviteChat(v) }}
                              >
                                <MessageSquare className="h-3 w-3 mr-1" />
                                发起对话
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Pages */}
      {topPages.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-slate-800">热门页面</h3>
            </div>
            <div className="space-y-3">
              {topPages.map((page, i) => (
                <div key={page.page} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate max-w-[70%]" title={page.page}>{page.page}</span>
                      <span className="text-xs font-medium text-slate-500">{page.count} 次</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
                        style={{ width: `${(page.count / maxPageCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visitor Detail Dialog */}
      <Dialog
        open={!!selectedVisitor}
        onOpenChange={() => setSelectedVisitor(null)}
        title="访客详情"
      >
        {selectedVisitor && (
          <VisitorDetail
            visitor={selectedVisitor}
            onInviteChat={() => handleInviteChat(selectedVisitor)}
            onBlacklist={() => setBlacklistTarget(selectedVisitor)}
            inviting={inviting === selectedVisitor.id}
          />
        )}
      </Dialog>

      {/* Blacklist Confirmation Dialog */}
      <Dialog
        open={!!blacklistTarget}
        onOpenChange={() => setBlacklistTarget(null)}
        title="确认加入黑名单"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            确定要将 IP 地址 <span className="font-mono font-semibold text-slate-800">{blacklistTarget?.ipAddress ?? '-'}</span> 加入黑名单吗？加入后该 IP 将无法访问。
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBlacklistTarget(null)}>取消</Button>
            <Button variant="danger" onClick={confirmBlacklist}>
              <ShieldBan className="h-3.5 w-3.5 mr-1" />
              确认加入黑名单
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Trajectory Timeline Dialog */}
      <Dialog
        open={!!trajectoryVisitor}
        onOpenChange={() => setTrajectoryVisitor(null)}
        title="访客浏览轨迹"
      >
        {trajectoryVisitor && (
          <TrajectoryTimeline
            visitor={trajectoryVisitor}
            pages={trajectoryRes?.data ?? []}
            loading={trajectoryLoading}
          />
        )}
      </Dialog>
    </div>
  )
}

function VisitorDetail({ visitor, onInviteChat, onBlacklist, inviting }: {
  visitor: VisitorSession
  onInviteChat: () => void
  onBlacklist: () => void
  inviting: boolean
}) {
  const score = calcEngagementScore(visitor)
  const scoreLabel = score >= 70 ? '高参与' : score >= 40 ? '中等' : '低参与'
  const scoreColor = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-slate-500'

  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-3">
        <InfoItem icon={Globe} label="IP 地址" value={visitor.ipAddress ?? '-'} />
        <InfoItem icon={MapPin} label="地区" value={[visitor.country, visitor.city].filter(Boolean).join(' ') || '-'} />
        <InfoItem icon={Monitor} label="设备" value={{ desktop: '桌面端', mobile: '移动端', tablet: '平板' }[visitor.deviceType ?? ''] ?? visitor.deviceType ?? '-'} />
        <InfoItem icon={Globe} label="浏览器" value={visitor.browser ?? '-'} />
        <InfoItem icon={Monitor} label="操作系统" value={visitor.os ?? '-'} />
        <InfoItem icon={Clock} label="停留时长" value={formatDuration(visitor.duration)} />
      </div>

      {/* Page Journey */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">页面旅程</p>
        <div className="space-y-1.5">
          {visitor.landingPage && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0">着陆</span>
              <span className="text-slate-600 truncate" title={visitor.landingPage}>{visitor.landingPage}</span>
            </div>
          )}
          {visitor.referrer && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium shrink-0">来源</span>
              <span className="text-slate-600 truncate" title={visitor.referrer}>{getReferrerDomain(visitor.referrer)}</span>
            </div>
          )}
          {visitor.currentPage && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium shrink-0">当前</span>
              <span className="text-slate-600 truncate" title={visitor.currentPage}>{visitor.currentPage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Engagement Score */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">参与度分析</p>
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#94a3b8'}
                strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${score} ${100 - score}`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">{score}</span>
          </div>
          <div>
            <p className={`text-sm font-semibold ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {visitor.pageViews} 页浏览 × 10 + {formatDuration(visitor.duration)} × 5
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-slate-100 pt-3 flex gap-2">
        {visitor.isOnline && (
          <Button variant="primary" size="sm" onClick={onInviteChat} loading={inviting} className="flex-1">
            <MessageSquare className="h-3.5 w-3.5 mr-1" />
            发起对话
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onBlacklist} className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200">
          <ShieldBan className="h-3.5 w-3.5 mr-1" />
          加入黑名单
        </Button>
      </div>
    </div>
  )
}

function TrajectoryTimeline({ visitor, pages, loading }: {
  visitor: VisitorSession
  pages: PageView[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
        <span className="ml-2 text-sm text-slate-400">加载中...</span>
      </div>
    )
  }

  if (pages.length === 0) {
    return (
      <div className="text-center py-12">
        <Route className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">暂无浏览记录</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Globe className="h-3.5 w-3.5" />
        <span>{visitor.ipAddress ?? '-'}</span>
        <span className="text-slate-300">|</span>
        <span>{[visitor.country, visitor.city].filter(Boolean).join(' ') || '-'}</span>
        <span className="text-slate-300">|</span>
        <span>共 {pages.length} 个页面</span>
      </div>

      <div className="relative max-h-[420px] overflow-y-auto pr-1">
        {pages.map((pv, i) => {
          const isFirst = i === 0
          const isLast = i === pages.length - 1
          const time = new Date(pv.createdAt)
          const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' })
          let pathDisplay: string
          try {
            const url = new URL(pv.pageUrl)
            pathDisplay = url.pathname + url.search
          } catch {
            pathDisplay = pv.pageUrl
          }

          return (
            <div key={pv.id} className="flex gap-3">
              {/* Timeline bar */}
              <div className="flex flex-col items-center w-5 shrink-0">
                <div
                  className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                    isFirst
                      ? 'bg-violet-500 border-violet-500'
                      : isLast
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-white border-slate-300'
                  }`}
                />
                {!isLast && <div className="w-px flex-1 bg-slate-200 my-0.5" />}
              </div>

              {/* Content */}
              <div className={`flex-1 min-w-0 pb-4 ${isLast ? 'pb-0' : ''}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{dateStr} {timeStr}</span>
                  {pv.duration != null && pv.duration > 0 && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                      <Clock className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />
                      {pv.duration >= 60 ? `${Math.floor(pv.duration / 60)}分${pv.duration % 60}秒` : `${pv.duration}秒`}
                    </span>
                  )}
                  {isFirst && (
                    <span className="text-[10px] bg-violet-50 text-violet-600 rounded px-1.5 py-0.5 font-medium shrink-0">入口</span>
                  )}
                </div>
                <p className="text-sm text-slate-800 font-medium truncate" title={pv.pageTitle || pathDisplay}>
                  {pv.pageTitle || pathDisplay}
                </p>
                <a
                  href={pv.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-400 hover:text-violet-500 transition-colors truncate flex items-center gap-0.5 group"
                  title={pv.pageUrl}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="truncate">{pathDisplay}</span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="text-xs text-slate-700 font-medium truncate">{value}</p>
      </div>
    </div>
  )
}
