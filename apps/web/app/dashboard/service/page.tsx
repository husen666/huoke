'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getServiceAnalytics, getConversations, getOrgMembersDetail, type ServiceAnalytics, type Conversation, type OrgMemberDetail } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { LoadingPage } from '@/components/ui/loading'
import { cn } from '@/lib/utils'
import { CHANNEL_LABELS } from './constants'
import Link from 'next/link'
import {
  MessageSquare, CheckCircle, Star, Clock, Users,
  AlertTriangle, Headphones, ArrowRight, Circle,
  TrendingUp,
} from 'lucide-react'

function timeAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

export default function ServiceOverview() {
  const { data: statsRes, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['service-analytics-overview'],
    queryFn: () => {
      const from = new Date()
      from.setDate(from.getDate() - 30)
      return getServiceAnalytics({ from: from.toISOString() })
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const stats = statsRes?.data as ServiceAnalytics | undefined

  const { data: convsRes } = useQuery({
    queryKey: ['service-overview-convs'],
    queryFn: () => getConversations({ pageSize: '100' }),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
  const allConvs: Conversation[] = convsRes?.data ?? []

  const { data: membersRes } = useQuery({
    queryKey: ['org-members-detail'],
    queryFn: () => getOrgMembersDetail(),
    staleTime: 5 * 60_000,
  })
  const members: OrgMemberDetail[] = membersRes?.data ?? []

  const activeConvs = useMemo(() => allConvs.filter(c => c.status === 'active'), [allConvs])
  const pendingConvs = useMemo(() => allConvs.filter(c => c.status === 'pending'), [allConvs])

  const agentWorkload = useMemo(() => {
    const countByAgent = new Map<string, { active: number; total: number }>()
    for (const c of allConvs) {
      if (!c.agentId) continue
      const entry = countByAgent.get(c.agentId) ?? { active: 0, total: 0 }
      entry.total++
      if (c.status === 'active') entry.active++
      countByAgent.set(c.agentId, entry)
    }
    return members
      .filter(m => m.role !== 'viewer')
      .map(m => {
        const counts = countByAgent.get(m.id) ?? { active: 0, total: 0 }
        return { ...m, active: counts.active, total: counts.total }
      })
      .sort((a, b) => b.active - a.active)
  }, [allConvs, members])

  const resolvedCount = stats?.byStatus?.find(s => s.status === 'resolved')?.count ?? 0
  const resolveRate = stats?.totalConversations ? Math.round((resolvedCount / stats.totalConversations) * 100) : 0

  if (statsLoading) return <LoadingPage />

  if (statsError) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <AlertTriangle className="h-10 w-10 mb-3 text-amber-400" />
      <p className="text-lg font-medium text-slate-600">加载失败</p>
      <p className="text-sm mt-1">请检查网络连接后重试</p>
      <button onClick={() => window.location.reload()} className="mt-3 px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors">刷新页面</button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">客服中心</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          客服团队运营概览 · 近30天数据
          <span className="inline-flex items-center gap-1 ml-2 text-[10px] text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />实时</span>
        </p>
      </div>

      {/* Real-time Status */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatusCard label="排队等待" value={pendingConvs.length} icon={Clock} color={pendingConvs.length > 0 ? 'text-amber-600' : 'text-slate-500'} bg={pendingConvs.length > 0 ? 'bg-amber-50' : 'bg-slate-50'} pulse={pendingConvs.length > 0} />
        <StatusCard label="服务中" value={activeConvs.length} icon={Headphones} color="text-blue-600" bg="bg-blue-50" />
        <StatusCard label="30天总会话" value={stats?.totalConversations ?? 0} icon={MessageSquare} color="text-indigo-600" bg="bg-indigo-50" />
        <StatusCard label="解决率" value={`${resolveRate}%`} icon={CheckCircle} color="text-emerald-600" bg="bg-emerald-50" />
        <StatusCard label="平均满意度" value={stats?.avgSatisfaction != null ? Number(stats.avgSatisfaction).toFixed(1) : '-'} icon={Star} color="text-amber-600" bg="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pending Queue */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" /> 排队中的会话
              </CardTitle>
              {pendingConvs.length > 0 && (
                <Badge variant="warning" className="text-[10px]">{pendingConvs.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pendingConvs.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">暂无排队会话</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pendingConvs.slice(0, 10).map(c => (
                  <div key={c.id} className="flex items-center gap-2.5 rounded-lg p-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <Avatar name={c.customerName ?? '访客'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{c.customerName || '网站访客'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{c.lastMessagePreview || '等待接入...'}</p>
                    </div>
                    <span className="text-[10px] text-amber-600 shrink-0">{timeAgo(c.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Workload */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" /> 客服工作负载
              </CardTitle>
              <Link href="/dashboard/service/agents" className="text-xs text-primary hover:underline flex items-center gap-1">
                详情 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {agentWorkload.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无客服数据</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="text-left pb-2 font-medium">客服</th>
                      <th className="text-center pb-2 font-medium">状态</th>
                      <th className="text-right pb-2 font-medium">服务中</th>
                      <th className="text-right pb-2 font-medium">总会话</th>
                      <th className="text-right pb-2 font-medium">负载</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentWorkload.slice(0, 8).map(a => {
                      const load = a.active
                      const loadColor = load >= 10 ? 'text-red-600 bg-red-50' : load >= 5 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'
                      const loadLabel = load >= 10 ? '繁忙' : load >= 5 ? '较忙' : '空闲'
                      return (
                        <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar name={a.name ?? ''} size="sm" />
                              <div>
                                <p className="text-xs font-medium text-slate-700">{a.name}</p>
                                <p className="text-[10px] text-slate-400">{a.role === 'admin' ? '管理员' : a.role === 'owner' ? '所有者' : '客服'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Circle className={cn('h-2 w-2 fill-current', a.status === 'active' ? 'text-emerald-500' : 'text-slate-300')} />
                              <span className="text-[10px] text-slate-500">{a.status === 'active' ? '在线' : '离线'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-medium text-slate-700">{a.active}</td>
                          <td className="py-2.5 text-right text-slate-500">{a.total}</td>
                          <td className="py-2.5 text-right">
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', loadColor)}>{loadLabel}</span>
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
      </div>

      {/* Service Effectiveness Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Channel Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">渠道分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {(stats?.byChannel ?? []).sort((a, b) => b.count - a.count).slice(0, 5).map(ch => {
                const pct = stats?.totalConversations ? Math.round((ch.count / stats.totalConversations) * 100) : 0
                return (
                  <div key={ch.channelType}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-slate-600">{CHANNEL_LABELS[ch.channelType] ?? ch.channelType}</span>
                      <span className="text-slate-500">{ch.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {(!stats?.byChannel || stats.byChannel.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-6">暂无数据</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Daily Trend Mini */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">会话趋势</CardTitle>
              <Link href="/dashboard/service/stats" className="text-[10px] text-primary hover:underline">详细统计</Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.dailyTrend && stats.dailyTrend.length > 0 ? (() => {
              const trendSlice = stats.dailyTrend.slice(-14)
              const maxCount = Math.max(...trendSlice.map(x => x.count), 1)
              return (
              <div className="h-32 flex items-end gap-[2px]">
                {trendSlice.map((d) => {
                  const h = (d.count / maxCount) * 100
                  return (
                    <div key={d.date} className="flex-1 flex flex-col justify-end group relative" style={{ height: '100%' }}>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                        {d.date.slice(5)}: {d.count}
                      </div>
                      <div className="w-full bg-primary/40 hover:bg-primary/70 rounded-sm transition-colors" style={{ height: `${h}%`, minHeight: d.count > 0 ? '3px' : '0' }} />
                    </div>
                  )
                })}
              </div>
              )
            })() : (
              <p className="text-xs text-slate-400 text-center py-10">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* Satisfaction */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">满意度分布</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.satisfactionDistribution && stats.satisfactionDistribution.length > 0 ? (() => {
              const satMax = Math.max(...stats.satisfactionDistribution.map(s => s.count), 1)
              return (
              <div className="flex items-end gap-3 justify-center h-28">
                {[1, 2, 3, 4, 5].map(score => {
                  const item = stats.satisfactionDistribution.find(s => s.score === score)
                  const count = item?.count ?? 0
                  const h = satMax > 0 ? (count / satMax) * 100 : 0
                  return (
                    <div key={score} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-[10px] font-medium text-slate-500">{count}</span>
                      <div className="w-full flex flex-col justify-end" style={{ height: '70px' }}>
                        <div className={cn('w-full rounded-sm', score <= 2 ? 'bg-red-300' : score === 3 ? 'bg-amber-300' : 'bg-emerald-400')}
                          style={{ height: `${h}%`, minHeight: count > 0 ? '4px' : '0' }} />
                      </div>
                      <div className="flex gap-px">
                        {Array.from({ length: score }).map((_, i) => (
                          <Star key={i} className="h-2 w-2 text-amber-400 fill-amber-400" />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })() : (
              <div className="text-center py-8">
                <Star className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">暂无评价数据</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance Top 5 */}
      {stats?.agentStats && stats.agentStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" /> 客服绩效 TOP 5
              </CardTitle>
              <Link href="/dashboard/service/stats" className="text-xs text-primary hover:underline flex items-center gap-1">
                完整排名 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {stats.agentStats
                .sort((a, b) => b.resolved - a.resolved)
                .slice(0, 5)
                .map((agent, idx) => {
                  const rate = agent.total > 0 ? Math.round((agent.resolved / agent.total) * 100) : 0
                  const sat = parseFloat(agent.avgSatisfaction)
                  return (
                    <div key={agent.agentId} className="rounded-xl border border-slate-100 p-3 text-center hover:shadow-sm transition-shadow">
                      <div className="relative inline-block">
                        <Avatar name={agent.agentName ?? '客服'} size="md" />
                        {idx < 3 && (
                          <span className={cn('absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white',
                            idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-400'
                          )}>{idx + 1}</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700 mt-2 truncate">{agent.agentName ?? '未知'}</p>
                      <div className="mt-2 space-y-1 text-[10px]">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>会话</span><span className="font-medium text-slate-700">{agent.total}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>解决率</span>
                          <span className={cn('font-medium', rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-500')}>{rate}%</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>满意度</span>
                          <span className="font-medium flex items-center gap-0.5">
                            <Star className={cn('h-2.5 w-2.5', sat >= 4 ? 'text-amber-400 fill-amber-400' : 'text-slate-300')} />
                            {sat > 0 ? sat.toFixed(1) : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusCard({ label, value, icon: Icon, color, bg, pulse }: {
  label: string; value: string | number; icon: React.ElementType; color: string; bg: string; pulse?: boolean
}) {
  return (
    <Card className={pulse ? 'ring-1 ring-amber-200' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg relative', bg)}>
            <Icon className={cn('h-4 w-4', color)} />
            {pulse && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />}
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold text-slate-800">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

