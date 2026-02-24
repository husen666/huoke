'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ClipboardCheck, ShieldCheck, TrendingUp } from 'lucide-react'
import { getQualityAnalytics } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/loading'

export default function QualityDashboardPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'quality', days],
    queryFn: async () => (await getQualityAnalytics(days)).data,
    staleTime: 30_000,
  })

  if (isLoading) return <LoadingPage />
  if (isError || !data) return <div className="text-sm text-red-500">质检数据加载失败</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">质检中心</h1>
          <p className="text-sm text-slate-500 mt-1">评估服务质量，持续改进团队表现</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant={days === d ? 'primary' : 'outline'} size="sm" onClick={() => setDays(d)}>
              {d}天
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={ClipboardCheck} label="质检总数" value={data.total} />
        <Metric icon={TrendingUp} label="平均分" value={Number(data.avgScore.toFixed(2))} />
        <Metric icon={ShieldCheck} label="A/B等级占比" value={calcABRate(data.byGrade)} suffix="%" />
        <Metric icon={CheckCircle2} label="参与质检员" value={data.byInspector.length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">等级分布</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.byGrade.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据</p>
            ) : data.byGrade.map((g) => (
              <div key={g.grade} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">等级 {g.grade || '-'}</span>
                <span className="text-sm font-medium text-slate-800">{g.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">质检员表现</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.byInspector.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据</p>
            ) : data.byInspector
              .slice()
              .sort((a, b) => b.avgScore - a.avgScore)
              .map((r) => (
                <div key={`${r.inspectorId ?? 'none'}`} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{r.inspectorName}</span>
                    <span className="text-xs text-slate-500">{r.total} 条</span>
                  </div>
                  <p className="text-xs mt-1 text-primary">平均分 {r.avgScore.toFixed(2)}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function calcABRate(byGrade: { grade: string; count: number }[]) {
  const total = byGrade.reduce((s, g) => s + g.count, 0)
  if (total <= 0) return 0
  const good = byGrade
    .filter((g) => ['A', 'B', 'a', 'b'].includes(String(g.grade || '')))
    .reduce((s, g) => s + g.count, 0)
  return Number(((good / total) * 100).toFixed(1))
}

function Metric({
  icon: Icon,
  label,
  value,
  suffix = '',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  suffix?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{value}{suffix}</p>
          </div>
          <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-blue-50 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
