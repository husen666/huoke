'use client'

import { useState, useMemo, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  getServiceAnalytics, type ServiceAnalytics,
  getAgentPerformance, type AgentPerformance,
  getMissedConversations,
  searchMessages, type MessageSearchResult,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  MessageSquare, CheckCircle, Star, TrendingUp, Users,
  Smile, AlertTriangle, Search, Clock, AlertCircle, Trophy,
  Timer, ThumbsUp, MessageCircle, ExternalLink, Download, ArrowLeft,
} from 'lucide-react'
import { CHANNEL_LABELS, STATUS_LABELS } from '../constants'

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '紧急', high: '高', normal: '普通', low: '低',
}

type StatsView = 'overview' | 'performance' | 'missed' | 'search'

export default function ServiceStatsPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <ServiceStatsContent />
    </Suspense>
  )
}

function ServiceStatsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = (searchParams.get('tab') as StatsView) || 'overview'
  const setView = (v: StatsView) => {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'overview') params.delete('tab')
    else params.set('tab', v)
    router.push(`?${params.toString()}`, { scroll: false })
  }
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - (range === '7d' ? 7 : range === '30d' ? 30 : 90))

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['service-analytics', range],
    queryFn: () => getServiceAnalytics({ from: fromDate.toISOString() }),
    staleTime: 60_000,
  })
  const stats = res?.data as ServiceAnalytics | undefined

  const resolvedCount = stats?.byStatus?.find(s => s.status === 'resolved')?.count ?? 0
  const pendingCount = stats?.byStatus?.find(s => s.status === 'pending')?.count ?? 0
  const activeCount = stats?.byStatus?.find(s => s.status === 'active')?.count ?? 0
  const resolveRate = stats?.totalConversations ? Math.round((resolvedCount / stats.totalConversations) * 100) : 0

  const sortedChannels = useMemo(() => [...(stats?.byChannel ?? [])].sort((a, b) => b.count - a.count), [stats?.byChannel])
  const satMaxCount = useMemo(() => Math.max(...(stats?.satisfactionDistribution ?? []).map(s => s.count), 1), [stats?.satisfactionDistribution])

  if (isLoading) return <LoadingPage />

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <AlertTriangle className="h-10 w-10 mb-3 text-amber-400" />
      <p className="text-lg font-medium text-slate-600">加载统计数据失败</p>
      <p className="text-sm mt-1">请检查网络连接后重试</p>
      <button onClick={() => window.location.reload()} className="mt-3 px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors">刷新页面</button>
    </div>
  )

  if (view === 'performance') return <AgentPerformanceSection onBack={() => setView('overview')} />
  if (view === 'missed') return <MissedConversationsSection onBack={() => setView('overview')} />
  if (view === 'search') return <MessageSearchSection onBack={() => setView('overview')} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">客服统计</h2>
          <p className="text-sm text-slate-500 mt-0.5">全面了解客服团队绩效和服务质量</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => {
              if (!stats) return
              const rows = [
                ['指标', '值'],
                ['总会话数', String(stats.totalConversations ?? 0)],
                ['解决率', `${resolveRate}%`],
                ['平均满意度', stats.avgSatisfaction != null ? Number(stats.avgSatisfaction).toFixed(1) : '0'],
                ['总消息数', String(stats.totalMessages ?? 0)],
                ...(stats.byStatus ?? []).map(s => [`状态-${STATUS_LABELS[s.status] ?? s.status}`, String(s.count)]),
                ...(stats.byChannel ?? []).map(c => [`渠道-${CHANNEL_LABELS[c.channelType] ?? c.channelType}`, String(c.count)]),
              ]
              const csv = rows.map(r => r.join(',')).join('\n')
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `客服统计_${range}.csv`; a.click()
              URL.revokeObjectURL(url)
            }}
          >
            <Download className="h-3.5 w-3.5" /> 导出报表
          </Button>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['7d', '30d', '90d'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors',
                  range === r ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {r === '7d' ? '近7天' : r === '30d' ? '近30天' : '近90天'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="总会话数"
          value={stats?.totalConversations ?? 0}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <KpiCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="解决率"
          value={`${resolveRate}%`}
          color="text-green-600"
          bg="bg-green-50"
          sub={`${resolvedCount} 已解决`}
        />
        <KpiCard
          icon={<Star className="h-5 w-5" />}
          label="平均满意度"
          value={stats?.avgSatisfaction != null ? Number(stats.avgSatisfaction).toFixed(1) : '0'}
          color="text-amber-600"
          bg="bg-amber-50"
          sub="满分 5.0"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="总消息数"
          value={stats?.totalMessages ?? 0}
          color="text-purple-600"
          bg="bg-purple-50"
          sub={`平均 ${stats?.avgMessagesPerConv ?? 0} 条/会话`}
        />
      </div>

      {/* Row: Status + Channel + Priority */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">会话状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(stats?.byStatus ?? []).map(s => {
                const pct = stats?.totalConversations ? Math.round((s.count / stats.totalConversations) * 100) : 0
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-600">{STATUS_LABELS[s.status] ?? s.status}</span>
                      <span className="font-medium">{s.count} <span className="text-slate-400 text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', {
                          'bg-amber-400': s.status === 'pending',
                          'bg-blue-500': s.status === 'active',
                          'bg-green-500': s.status === 'resolved',
                          'bg-slate-400': s.status === 'closed',
                        })}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {(!stats?.byStatus || stats.byStatus.length === 0) && (
                <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">渠道分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedChannels.map(ch => {
                const pct = stats?.totalConversations ? Math.round((ch.count / stats.totalConversations) * 100) : 0
                return (
                  <div key={ch.channelType} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-sm text-slate-600">{CHANNEL_LABELS[ch.channelType] ?? ch.channelType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ch.count}</span>
                      <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                )
              })}
              {(!stats?.byChannel || stats.byChannel.length === 0) && (
                <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">优先级分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {['urgent', 'high', 'normal', 'low'].map(p => {
                const item = stats?.byPriority?.find(x => x.priority === p)
                const count = item?.count ?? 0
                return (
                  <div key={p} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2.5 h-2.5 rounded-full', {
                        'bg-red-500': p === 'urgent',
                        'bg-orange-500': p === 'high',
                        'bg-blue-500': p === 'normal',
                        'bg-slate-400': p === 'low',
                      })} />
                      <span className="text-sm text-slate-600">{PRIORITY_LABELS[p]}</span>
                    </div>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">每日会话趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.dailyTrend && stats.dailyTrend.length > 0 ? (() => {
            const maxCount = Math.max(...stats.dailyTrend.map(x => x.count), 1)
            return <div className="h-48 flex items-end gap-1">
              {stats.dailyTrend.map((d, i) => {
                const h = (d.count / maxCount) * 100
                const rh = d.count > 0 ? (d.resolved / d.count) * h : 0
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {d.date.slice(5)}: {d.count}条 / {d.resolved}已解决
                    </div>
                    <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
                      <div className="w-full bg-blue-200 rounded-t" style={{ height: `${h}%`, minHeight: d.count > 0 ? '4px' : '0' }}>
                        <div className="w-full bg-green-500 rounded-t" style={{ height: `${rh > 0 ? (rh / h) * 100 : 0}%`, minHeight: d.resolved > 0 ? '2px' : '0' }} />
                      </div>
                    </div>
                    {i % Math.max(1, Math.floor(stats.dailyTrend.length / 8)) === 0 && (
                      <span className="text-[9px] text-slate-400 mt-1">{d.date.slice(5)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          })() : (
            <p className="text-sm text-slate-400 text-center py-8">暂无趋势数据</p>
          )}
          <div className="flex items-center gap-6 mt-3 justify-center text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-200" /> 总会话</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-green-500" /> 已解决</span>
          </div>
        </CardContent>
      </Card>

      {/* Service Effectiveness */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Timer className="h-5 w-5 text-blue-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">平均首响</p>
            <p className="text-lg font-bold text-slate-800">{stats?.avgFirstResponse ? `${Math.round(stats.avgFirstResponse)}s` : '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">平均解决时间</p>
            <p className="text-lg font-bold text-slate-800">{stats?.avgResolutionTime ? `${Math.round(stats.avgResolutionTime / 60)}m` : '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageCircle className="h-5 w-5 text-purple-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">平均消息数/会话</p>
            <p className="text-lg font-bold text-slate-800">{stats?.avgMessagesPerConv ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">待处理</p>
            <p className="text-lg font-bold text-slate-800">{pendingCount + activeCount}</p>
            <p className="text-[10px] text-slate-400">{pendingCount} 排队 · {activeCount} 服务中</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Users className="h-4 w-4" /> 客服绩效排名
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.agentStats && stats.agentStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="text-left pb-3 font-medium">排名</th>
                    <th className="text-left pb-3 font-medium">客服</th>
                    <th className="text-right pb-3 font-medium">总会话</th>
                    <th className="text-right pb-3 font-medium">已解决</th>
                    <th className="text-right pb-3 font-medium">解决率</th>
                    <th className="text-right pb-3 font-medium">满意度</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.agentStats
                    .sort((a, b) => b.resolved - a.resolved)
                    .map((agent, idx) => {
                      const rate = agent.total > 0 ? Math.round((agent.resolved / agent.total) * 100) : 0
                      const sat = Number(agent.avgSatisfaction) || 0
                      return (
                        <tr key={agent.agentId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3">
                            <span className={cn(
                              'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                              idx === 0 ? 'bg-amber-100 text-amber-700' :
                              idx === 1 ? 'bg-slate-200 text-slate-600' :
                              idx === 2 ? 'bg-orange-100 text-orange-600' :
                              'text-slate-400'
                            )}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Avatar name={agent.agentName ?? '客服'} size="sm" />
                              <span className="font-medium text-slate-700">{agent.agentName ?? '未知'}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-medium">{agent.total}</td>
                          <td className="py-3 text-right font-medium text-green-600">{agent.resolved}</td>
                          <td className="py-3 text-right">
                            <span className={cn('font-medium', rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-amber-600' : 'text-red-500')}>
                              {rate}%
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Star className={cn('h-3.5 w-3.5', sat >= 4 ? 'text-amber-400 fill-amber-400' : 'text-slate-300')} />
                              <span className="font-medium">{sat > 0 ? sat.toFixed(1) : '-'}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">暂无客服绩效数据</p>
          )}
        </CardContent>
      </Card>

      {/* Satisfaction Distribution */}
      {stats?.satisfactionDistribution && stats.satisfactionDistribution.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Smile className="h-4 w-4" /> 满意度分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-6 justify-center h-40">
              {[1, 2, 3, 4, 5].map(score => {
                const item = stats.satisfactionDistribution.find(s => s.score === score)
                const count = item?.count ?? 0
                const h = satMaxCount > 0 ? (count / satMaxCount) * 100 : 0
                return (
                  <div key={score} className="flex flex-col items-center gap-2 flex-1 max-w-20">
                    <span className="text-sm font-medium text-slate-600">{count}</span>
                    <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                      <div
                        className={cn('w-full rounded-t transition-all', {
                          'bg-red-400': score <= 2,
                          'bg-amber-400': score === 3,
                          'bg-green-400': score === 4,
                          'bg-green-500': score === 5,
                        })}
                        style={{ height: `${h}%`, minHeight: count > 0 ? '8px' : '0' }}
                      />
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: score }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => setView('performance')}
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-primary/30 hover:shadow-md transition-all text-left group">
          <div className="p-3 rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-100 transition-colors"><Trophy className="h-6 w-6" /></div>
          <div><p className="font-semibold text-slate-800">客服绩效看板</p><p className="text-xs text-slate-500 mt-0.5">查看每位客服的详细KPI数据</p></div>
        </button>
        <button onClick={() => setView('missed')}
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-red-300 hover:shadow-md transition-all text-left group">
          <div className="p-3 rounded-xl bg-red-50 text-red-600 group-hover:bg-red-100 transition-colors"><AlertCircle className="h-6 w-6" /></div>
          <div><p className="font-semibold text-slate-800">遗漏对话</p><p className="text-xs text-slate-500 mt-0.5">追踪超时未回复的会话</p></div>
        </button>
        <button onClick={() => setView('search')}
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-md transition-all text-left group">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors"><Search className="h-6 w-6" /></div>
          <div><p className="font-semibold text-slate-800">对话内容搜索</p><p className="text-xs text-slate-500 mt-0.5">全局搜索消息记录</p></div>
        </button>
      </div>
    </div>
  )
}

// ===========================================================================
// Agent Performance Section
// ===========================================================================

function AgentPerformanceSection({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState(30)
  const { data: res, isLoading } = useQuery({
    queryKey: ['agent-performance', days],
    queryFn: () => getAgentPerformance(days),
    staleTime: 60_000,
  })
  const agents: AgentPerformance[] = res?.data ?? []
  const sorted = useMemo(() => [...agents].sort((a, b) => b.totalConversations - a.totalConversations), [agents])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> 返回</Button>
          <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Trophy className="h-5 w-5 text-violet-600" /> 客服绩效看板</h2>
            <p className="text-sm text-slate-500 mt-0.5">每位客服的详细工作数据和KPI排名</p></div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => {
              if (sorted.length === 0) return
              const rows = [
                ['客服', '总会话', '已解决', '平均满意度', '平均首响(秒)', '平均解决(秒)', '消息数'],
                ...sorted.map(a => [
                  a.agentName ?? '', String(a.totalConversations), String(a.resolvedCount),
                  a.avgSatisfaction != null ? (Number(a.avgSatisfaction) || 0).toFixed(1) : '-', String(a.avgFirstResponse ?? '-'),
                  String(a.avgResolution ?? '-'), String(a.messageCount ?? 0),
                ]),
              ]
              const csv = rows.map(r => r.join(',')).join('\n')
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `客服绩效_${days}天.csv`; a.click()
              URL.revokeObjectURL(url)
            }}
          >
            <Download className="h-3.5 w-3.5" /> 导出
          </Button>
          <Select value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: '7', label: '近7天' }, { value: '30', label: '近30天' }, { value: '90', label: '近90天' }]} />
        </div>
      </div>

      {isLoading ? <LoadingPage /> : agents.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Users className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">暂无客服绩效数据</p></CardContent></Card>
      ) : (() => {
        const avgSat = (() => { const scores = agents.filter(a => a.avgSatisfaction); return scores.length ? (scores.reduce((s, a) => s + (a.avgSatisfaction ?? 0), 0) / scores.length).toFixed(1) : '-' })()
        return <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={<Users className="h-5 w-5" />} label="客服人数" value={agents.length} color="text-violet-600" bg="bg-violet-50" />
            <KpiCard icon={<MessageSquare className="h-5 w-5" />} label="总会话量" value={agents.reduce((s, a) => s + a.totalConversations, 0)} color="text-blue-600" bg="bg-blue-50" />
            <KpiCard icon={<CheckCircle className="h-5 w-5" />} label="总解决量" value={agents.reduce((s, a) => s + a.resolvedCount, 0)} color="text-green-600" bg="bg-green-50" />
            <KpiCard icon={<Star className="h-5 w-5" />} label="平均满意度" value={avgSat} color="text-amber-600" bg="bg-amber-50" />
          </div>

          <Card>
            <CardHeader><CardTitle>客服排行</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>排名</TableHead><TableHead>客服</TableHead><TableHead>会话量</TableHead><TableHead>解决量</TableHead>
                  <TableHead>解决率</TableHead><TableHead>满意度</TableHead><TableHead>首响(分钟)</TableHead><TableHead>解决(分钟)</TableHead><TableHead>消息数</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sorted.map((agent, idx) => {
                    const resolveRate = agent.totalConversations > 0 ? Math.round(agent.resolvedCount / agent.totalConversations * 100) : 0
                    return (
                      <TableRow key={agent.agentId}>
                        <TableCell>
                          <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                            idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-500'
                          )}>{idx + 1}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" src={agent.agentAvatar ?? undefined} name={agent.agentName ?? '?'} />
                            <span className="font-medium">{agent.agentName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{agent.totalConversations}</TableCell>
                        <TableCell>{agent.resolvedCount}</TableCell>
                        <TableCell><Badge variant={resolveRate >= 80 ? 'success' : resolveRate >= 50 ? 'warning' : 'danger'}>{resolveRate}%</Badge></TableCell>
                        <TableCell>{agent.avgSatisfaction ? <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />{agent.avgSatisfaction}</span> : <span className="text-slate-400">-</span>}</TableCell>
                        <TableCell className={cn(agent.avgFirstResponse && agent.avgFirstResponse > 5 ? 'text-red-600 font-medium' : 'text-slate-600')}>{agent.avgFirstResponse ?? '-'}</TableCell>
                        <TableCell className="text-slate-600">{agent.avgResolution ?? '-'}</TableCell>
                        <TableCell className="text-slate-600">{agent.messageCount ?? 0}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      })()}
    </div>
  )
}

// ===========================================================================
// Missed Conversations Section
// ===========================================================================

function MissedConversationsSection({ onBack }: { onBack: () => void }) {
  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['missed-conversations'],
    queryFn: () => getMissedConversations({ pageSize: '50' }),
    refetchInterval: 30000,
    staleTime: 15_000,
  })
  const list = res?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> 返回</Button>
          <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><AlertCircle className="h-5 w-5 text-red-600" /> 遗漏对话</h2>
            <p className="text-sm text-slate-500 mt-0.5">待接入且无首次回复的会话，每30秒自动刷新</p></div>
        </div>
        <div className="flex items-center gap-2">
          {list.length > 0 && <Badge variant="danger">{list.length} 条待处理</Badge>}
          <Button variant="outline" size="sm" onClick={() => refetch()}>刷新</Button>
        </div>
      </div>

      {isLoading ? <LoadingPage /> : list.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-700">没有遗漏对话</p>
          <p className="text-sm text-slate-500 mt-1">所有会话均已得到及时回复</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>客户</TableHead><TableHead>渠道</TableHead><TableHead>优先级</TableHead>
                <TableHead>等待时间</TableHead><TableHead>最后消息</TableHead><TableHead>操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {list.map((conv) => {
                  const waitMins = Math.round(conv.waitMinutes)
                  const urgent = waitMins > 10
                  return (
                    <TableRow key={conv.id} className={urgent ? 'bg-red-50/50' : ''}>
                      <TableCell className="font-medium">{conv.customerName}</TableCell>
                      <TableCell><Badge variant="default">{CHANNEL_LABELS[conv.channelType] ?? conv.channelType}</Badge></TableCell>
                      <TableCell><Badge variant={conv.priority === 'urgent' ? 'danger' : conv.priority === 'high' ? 'warning' : 'default'}>{PRIORITY_LABELS[conv.priority] ?? conv.priority}</Badge></TableCell>
                      <TableCell>
                        <span className={cn('flex items-center gap-1 font-mono text-sm', urgent ? 'text-red-600 font-bold' : 'text-slate-600')}>
                          <Timer className="h-3.5 w-3.5" />
                          {waitMins < 60 ? `${waitMins} 分钟` : `${Math.floor(waitMins / 60)}h ${waitMins % 60}m`}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{conv.lastMessagePreview ?? '-'}</TableCell>
                      <TableCell>
                        <Link href={`/dashboard/service?conv=${conv.id}`}>
                          <Button variant="primary" size="sm">立即接入</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===========================================================================
// Message Search Section
// ===========================================================================

function MessageSearchSection({ onBack }: { onBack: () => void }) {
  const [keyword, setKeyword] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const { data: res, isLoading, isFetching } = useQuery({
    queryKey: ['message-search', searchTerm],
    queryFn: () => searchMessages(searchTerm),
    enabled: searchTerm.length >= 2,
    staleTime: 60_000,
  })
  const results: MessageSearchResult[] = res?.data ?? []

  const handleSearch = () => { if (keyword.trim().length >= 2) setSearchTerm(keyword.trim()) }

  function highlightKeyword(text: string, kw: string): React.ReactNode {
    if (!kw) return text
    const idx = text.toLowerCase().indexOf(kw.toLowerCase())
    if (idx === -1) return text
    return <>{text.slice(0, idx)}<mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + kw.length)}</mark>{text.slice(idx + kw.length)}</>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; 返回</Button>
        <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Search className="h-5 w-5 text-blue-600" /> 对话内容搜索</h2>
          <p className="text-sm text-slate-500 mt-0.5">在所有会话消息中搜索关键词</p></div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="输入关键词搜索消息内容（至少2个字符）..."
              className="flex-1 min-w-0" onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }} />
            <Button variant="primary" onClick={handleSearch} loading={isFetching} disabled={keyword.trim().length < 2} className="shrink-0 whitespace-nowrap">
              <Search className="h-4 w-4" /> 搜索
            </Button>
          </div>
        </CardContent>
      </Card>

      {searchTerm && (
        isLoading ? <LoadingPage /> : results.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">未找到包含「{searchTerm}」的消息</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">找到 {results.length} 条匹配消息</p>
            {results.map((msg) => (
              <Card key={msg.messageId} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant={msg.senderType === 'agent' ? 'primary' : msg.senderType === 'customer' ? 'default' : 'outline'}>
                          {msg.senderType === 'agent' ? '客服' : msg.senderType === 'customer' ? '客户' : msg.senderType === 'ai' ? 'AI' : msg.senderType === 'bot' ? '机器人' : msg.senderType === 'system' ? '系统' : msg.senderType}
                        </Badge>
                        <span className="text-sm font-medium text-slate-700">{msg.customerName}</span>
                        <Badge variant={msg.conversationStatus === 'resolved' ? 'success' : msg.conversationStatus === 'active' ? 'primary' : 'default'} className="text-[10px]">
                          {STATUS_LABELS[msg.conversationStatus] ?? msg.conversationStatus}
                        </Badge>
                        <span className="text-xs text-slate-400">{new Date(msg.createdAt).toLocaleString('zh-CN')}</span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2">{highlightKeyword(msg.content, searchTerm)}</p>
                    </div>
                    <Link href={`/dashboard/service?conv=${msg.conversationId}`}>
                      <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function KpiCard({ icon, label, value, color, bg, sub }: {
  icon: React.ReactNode; label: string; value: string | number; color: string; bg: string; sub?: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl', bg, color)}>{icon}</div>
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
