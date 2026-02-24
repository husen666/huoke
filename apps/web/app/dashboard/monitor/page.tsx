'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRealtimeMetrics, type RealtimeMetrics } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingPage } from '@/components/ui/loading'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Users, Clock, MessageSquare, CheckCircle, AlertTriangle, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0秒'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分` : ''}`
  if (minutes > 0) return `${minutes}分${seconds > 0 ? `${seconds}秒` : ''}`
  return `${seconds}秒`
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  online: { label: '在线', color: 'bg-green-50 border-green-200', dotColor: 'bg-green-500' },
  away: { label: '离开', color: 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500' },
  busy: { label: '忙碌', color: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
}

const STATUS_ORDER = ['online', 'away', 'busy']

export default function MonitorPage() {
  const { data: res, isLoading } = useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: getRealtimeMetrics,
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const data = res?.data as RealtimeMetrics | undefined

  const sortedAgents = useMemo(() => [...(data?.onlineAgents ?? [])].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status ?? '')
    const bi = STATUS_ORDER.indexOf(b.status ?? '')
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  }), [data?.onlineAgents])

  if (isLoading) return <LoadingPage />

  if (!data) return (
    <div className="h-64 flex items-center justify-center">
      <div className="text-center">
        <Activity className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">暂无监控数据</p>
      </div>
    </div>
  )

  const hourlyData = data.hourlyTrend.map(h => ({
    hour: `${h.hour}:00`,
    count: h.count,
  }))

  const longestWarnLevel = data.longestWaitSeconds > 300 ? 'text-red-600' :
    data.longestWaitSeconds > 120 ? 'text-amber-600' : 'text-slate-800'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">实时监控</h1>
          <p className="text-sm text-muted-foreground mt-0.5">实时查看客服运营状况</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          每10秒自动刷新
        </div>
      </div>

      {/* Status Bar */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-5 w-5 text-green-600" />
              <span className="text-sm text-green-700">在线客服</span>
            </div>
            <p className="text-3xl font-bold text-green-800">{data.onlineAgents.length}<span className="text-lg font-normal">人</span></p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-5 w-5 text-amber-600" />
              <span className="text-sm text-amber-700">排队中</span>
            </div>
            <p className="text-3xl font-bold text-amber-800">{data.pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-blue-700">进行中</span>
            </div>
            <p className="text-3xl font-bold text-blue-800">{data.activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-sm text-emerald-700">今日已解决</span>
            </div>
            <p className="text-3xl font-bold text-emerald-800">{data.todayResolved}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent Status Grid */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                客服状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedAgents.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedAgents.map(agent => {
                    const cfg = STATUS_CONFIG[agent.status ?? ''] ?? STATUS_CONFIG.online
                    return (
                      <div
                        key={agent.id}
                        className={cn('rounded-lg border p-3 transition-colors', cfg.color)}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', cfg.dotColor)} />
                          <span className="text-sm font-medium text-slate-800 truncate">{agent.name}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{cfg.label}</span>
                          <span className="font-medium text-slate-700">{agent.activeConversations} 个会话</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-sm text-slate-400">
                  暂无在线客服
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live Metrics */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-slate-500">今日平均首次响应</span>
              </div>
              <p className="text-xl font-bold text-slate-800">
                {formatDuration(data.todayAvgFirstResponseSeconds)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-slate-500">今日平均满意度</span>
              </div>
              <p className="text-xl font-bold text-slate-800">
                {data.todayAvgSatisfaction > 0 ? `${data.todayAvgSatisfaction.toFixed(1)} ★` : '-'}
              </p>
            </CardContent>
          </Card>
          <Card className={data.longestWaitSeconds > 300 ? 'border-red-200' : ''}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={cn('h-4 w-4', data.longestWaitSeconds > 300 ? 'text-red-500' : 'text-slate-400')} />
                <span className="text-xs text-slate-500">当前最长等待</span>
              </div>
              <p className={cn('text-xl font-bold', longestWarnLevel)}>
                {data.longestWaitSeconds > 0 ? formatDuration(data.longestWaitSeconds) : '无排队'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hourly Trend */}
      <Card>
        <CardHeader>
          <CardTitle>近12小时会话趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {hourlyData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [`${v} 个`, '会话数']} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center">
              <div className="text-center">
                <Activity className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">暂无数据</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
