'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock3, User, ArrowRight } from 'lucide-react'
import { getSlaAnalytics } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingPage } from '@/components/ui/loading'

const priorityLabel: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export default function SlaDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'sla'],
    queryFn: async () => (await getSlaAnalytics()).data,
    staleTime: 30_000,
  })

  if (isLoading) return <LoadingPage />
  if (isError || !data) return <div className="text-sm text-red-500">SLA 数据加载失败</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">SLA 看板</h1>
          <p className="text-sm text-slate-500 mt-1">监控工单时效，快速定位风险队列</p>
        </div>
        <Link href="/dashboard/tickets?overdue=1" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          查看超时工单 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Clock3} label="活跃工单" value={data.totalActive} />
        <MetricCard icon={AlertTriangle} label="已超时" value={data.overdue} tone="danger" />
        <MetricCard icon={Clock3} label="4小时内到期" value={data.nearDue} tone="warning" />
        <MetricCard icon={CheckCircle2} label="已完成" value={data.resolvedCount + data.closedCount} tone="success" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">优先级分布</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.byPriority.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据</p>
            ) : data.byPriority.map((p) => (
              <div key={p.priority} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">{priorityLabel[p.priority] ?? p.priority}</span>
                <Badge variant={p.priority === 'urgent' ? 'danger' : p.priority === 'high' ? 'warning' : 'default'}>{p.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">坐席 SLA 风险</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.byAssignee.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据</p>
            ) : data.byAssignee.map((a) => (
              <div key={`${a.assigneeId ?? 'none'}`} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><User className="h-3.5 w-3.5" /> {a.assigneeName}</span>
                  <span className="text-xs text-slate-500">总计 {a.total}</span>
                </div>
                <p className={`text-xs mt-1 ${a.overdue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  超时 {a.overdue} 单
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tone?: 'default' | 'warning' | 'danger' | 'success'
}) {
  const toneClass = tone === 'danger'
    ? 'text-red-600 bg-red-50'
    : tone === 'warning'
      ? 'text-amber-600 bg-amber-50'
      : tone === 'success'
        ? 'text-emerald-600 bg-emerald-50'
        : 'text-primary bg-blue-50'
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneClass}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
