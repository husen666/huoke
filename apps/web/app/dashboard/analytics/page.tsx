'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAnalyticsOverview, getAnalyticsLeads, getAiInsights, getPipelineSummary, getServiceAnalytics, getConversionFunnel, getResponseTimeAnalytics, getResponseTimeDashboard, getSatisfactionAnalytics, type ServiceAnalytics, type ResponseTimeAnalytics, type ResponseTimeDashboard, type SatisfactionAnalytics } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Sector,
  LineChart, Line, ComposedChart,
} from 'recharts'
import { Users, UserCircle, MessageSquare, Sparkles, Activity, RefreshCw, TrendingUp, Calendar, AlertTriangle, ArrowDown, Download, Timer, CheckCircle, Clock, Star, ThumbsUp, BarChart2 } from 'lucide-react'

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
  new: '新线索', contacted: '已联系', qualified: '已筛选',
  converted: '已转化', disqualified: '已淘汰',
}
const sourceLabelMap: Record<string, string> = {
  wecom: '企微', douyin: '抖音', xiaohongshu: '小红书', baidu: '百度',
  kuaishou: '快手', bilibili: 'B站', zhihu: '知乎', weibo: '微博', manual: '手动',
}

type Period = 'today' | 'week' | 'month' | 'quarter' | 'all'

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本季度', value: 'quarter' },
  { label: '全部', value: 'all' },
]

function getDateRange(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {}
  const now = new Date()
  const to = now.toISOString()
  const from = new Date(now)
  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      break
    case 'week': {
      const day = from.getDay() || 7
      from.setDate(from.getDate() - day + 1)
      from.setHours(0, 0, 0, 0)
      break
    }
    case 'month':
      from.setDate(1)
      from.setHours(0, 0, 0, 0)
      break
    case 'quarter': {
      const q = Math.floor(from.getMonth() / 3) * 3
      from.setMonth(q, 1)
      from.setHours(0, 0, 0, 0)
      break
    }
  }
  return { from: from.toISOString(), to }
}

type TabKey = 'overview' | 'response-time' | 'satisfaction'

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0秒'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分` : ''}`
  if (minutes > 0) return `${minutes}分${seconds > 0 ? `${seconds}秒` : ''}`
  return `${seconds}秒`
}

const BUCKET_LABELS: Record<string, string> = {
  under_30s: '<30秒',
  '30s_1min': '30秒-1分',
  '1_5min': '1-5分',
  '5_15min': '5-15分',
  '15_30min': '15-30分',
  over_30min: '>30分',
}

const BUCKET_ORDER = ['under_30s', '30s_1min', '1_5min', '5_15min', '15_30min', 'over_30min']

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [rtDays, setRtDays] = useState(30)
  const [satDays, setSatDays] = useState(30)

  const dateRange = getDateRange(period)

  const leadParams: Record<string, string> = {}
  if (dateRange.from) leadParams.from = dateRange.from
  if (dateRange.to) leadParams.to = dateRange.to

  const { data: overviewRes, isLoading, isError: overviewError } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => getAnalyticsOverview(),
    staleTime: 2 * 60_000,
  })

  const { data: leadsRes, isError: leadsError } = useQuery({
    queryKey: ['analytics', 'leads', leadParams],
    queryFn: () => getAnalyticsLeads(leadParams),
    staleTime: 60_000,
  })

  const [insightsData, setInsightsData] = useState<{ insights: string[]; source?: string } | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      const res = await getAiInsights()
      if (res.success && res.data) {
        setInsightsData(res.data as { insights: string[]; source?: string })
      } else {
        setInsightsError('返回数据异常，请稍后重试')
      }
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : '网络请求失败，请检查网络连接后重试')
    } finally {
      setInsightsLoading(false)
    }
  }, [])

  const { data: pipelineRes } = useQuery({
    queryKey: ['analytics', 'pipeline'],
    queryFn: () => getPipelineSummary(),
    staleTime: 2 * 60_000,
  })

  const { data: serviceRes } = useQuery({
    queryKey: ['analytics', 'service'],
    queryFn: () => getServiceAnalytics(),
    staleTime: 2 * 60_000,
  })

  const { data: funnelRes } = useQuery({
    queryKey: ['conversion-funnel'],
    queryFn: getConversionFunnel,
    staleTime: 2 * 60_000,
  })

  const { data: rtRes, isLoading: rtLoading } = useQuery({
    queryKey: ['analytics', 'response-time', rtDays],
    queryFn: () => getResponseTimeDashboard(rtDays),
    staleTime: 2 * 60_000,
    enabled: activeTab === 'response-time',
  })

  const { data: satRes, isLoading: satLoading } = useQuery({
    queryKey: ['analytics', 'satisfaction', satDays],
    queryFn: () => getSatisfactionAnalytics(satDays),
    staleTime: 2 * 60_000,
    enabled: activeTab === 'satisfaction',
  })

  const ov = overviewRes?.data ?? { leadCount: 0, customerCount: 0, conversationCount: 0, dealAmountTotal: '0', channelCount: 0 }
  const leadData = leadsRes?.data

  const statusData = useMemo(() => (leadData?.byStatus ?? []).map((s) => ({
    name: statusLabelMap[s.status] ?? s.status,
    value: s.count,
  })), [leadData?.byStatus])

  const sourceData = useMemo(() => (leadData?.bySource ?? []).map((s) => ({
    name: sourceLabelMap[s.sourcePlatform] ?? s.sourcePlatform,
    count: s.count,
  })), [leadData?.bySource])

  const sortedSourceData = useMemo(() => [...sourceData].sort((a, b) => b.count - a.count), [sourceData])

  const conversionRate = useMemo(() => {
    const total = statusData.reduce((sum, d) => sum + d.value, 0)
    const converted = statusData.find((d) => d.name === '已转化')?.value ?? 0
    return total > 0 ? ((converted / total) * 100).toFixed(1) : '0'
  }, [statusData])

  const insights = insightsData?.insights ?? []

  const serviceAnalytics = serviceRes?.data as ServiceAnalytics | undefined
  const agentStats = useMemo(() => [...(serviceAnalytics?.agentStats ?? [])].sort((a, b) => {
    const rateA = a.total > 0 ? a.resolved / a.total : 0
    const rateB = b.total > 0 ? b.resolved / b.total : 0
    return rateB - rateA
  }), [serviceAnalytics?.agentStats])
  const maxAgentConvs = useMemo(() => Math.max(...agentStats.map(a => a.total), 1), [agentStats])

  const rtData = rtRes?.data as ResponseTimeDashboard | undefined
  const distributionData = useMemo(() => rtData
    ? BUCKET_ORDER.map(key => {
        const found = rtData.distribution.find(d => d.bucket === key)
        return { name: BUCKET_LABELS[key] ?? key, count: found?.count ?? 0 }
      })
    : [], [rtData])
  const totalRtConversations = useMemo(() => distributionData.reduce((s, d) => s + d.count, 0), [distributionData])
  const sortedAgentStats = useMemo(() => [...(rtData?.agentStats ?? [])].sort(
    (a, b) => a.avgFirstResponseSeconds - b.avgFirstResponseSeconds
  ), [rtData?.agentStats])

  if (isLoading) return <LoadingPage />

  if (overviewError) return (
    <div className="flex flex-col items-center justify-center h-64 text-red-500">
      <AlertTriangle className="h-8 w-8 mb-2" />
      <p>数据加载失败，请刷新重试</p>
    </div>
  )

  const handleExportCsv = () => {
    const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label ?? period
    const rows: string[][] = [
      ['报表时间范围', periodLabel],
      ['导出时间', new Date().toLocaleString('zh-CN')],
      [],
      ['指标', '数值'],
      ['线索总量', String(ov.leadCount)],
      ['客户总量', String(ov.customerCount)],
      ['会话总量', String(ov.conversationCount)],
      ['转化率', `${conversionRate}%`],
      ['商机金额', `¥${Number(ov.dealAmountTotal).toLocaleString()}`],
      [],
      ['线索状态', '数量'],
      ...statusData.map(d => [d.name, String(d.value)]),
      [],
      ['渠道来源', '数量'],
      ...sourceData.map(d => [d.name, String(d.count)]),
      [],
      ['客服绩效', '总对话数', '已解决', '解决率', '平均满意度'],
      ...agentStats.map(a => [
        a.agentName ?? '未知',
        String(a.total),
        String(a.resolved),
        `${a.total > 0 ? ((a.resolved / a.total) * 100).toFixed(1) : '0.0'}%`,
        parseFloat(a.avgSatisfaction || '0') > 0 ? parseFloat(a.avgSatisfaction || '0').toFixed(1) : '-',
      ]),
    ]
    const BOM = '\uFEFF'
    const csv = BOM + rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('报表已导出')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">数据分析</h1>
            <p className="text-sm text-muted-foreground mt-0.5">全面洞察业务指标和趋势</p>
          </div>
          <div className="flex items-center gap-1 ml-2 border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'overview' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              总览
            </button>
            <button
              onClick={() => setActiveTab('response-time')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'response-time' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Timer className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              响应时间
            </button>
            <button
              onClick={() => setActiveTab('satisfaction')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'satisfaction' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Star className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              满意度
            </button>
          </div>
          {activeTab === 'overview' && (
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" />
              导出报表
            </Button>
          )}
        </div>
        {activeTab === 'overview' && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.value ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'response-time' && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setRtDays(d)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  rtDays === d ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
        )}
        {activeTab === 'satisfaction' && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setSatDays(d)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  satDays === d ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'response-time' && (
        <ResponseTimeTab
          data={rtData}
          loading={rtLoading}
          distributionData={distributionData}
          totalConversations={totalRtConversations}
          agentStats={sortedAgentStats}
        />
      )}

      {activeTab === 'satisfaction' && (
        <SatisfactionTab data={satRes?.data as SatisfactionAnalytics | undefined} loading={satLoading} />
      )}

      {activeTab === 'overview' && leadsError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          部分数据加载失败，请稍后刷新重试。
        </div>
      )}

      {activeTab === 'overview' && <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="线索总量" value={ov.leadCount} icon={Users} />
        <StatCard title="客户总量" value={ov.customerCount} icon={UserCircle} />
        <StatCard title="会话总量" value={ov.conversationCount} icon={MessageSquare} />
        <StatCard title="转化率" value={`${conversionRate}%`} icon={TrendingUp} />
        <StatCard title="商机金额" value={`¥${Number(ov.dealAmountTotal).toLocaleString()}`} icon={Activity} />
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        <span>以下图表按所选时间范围显示</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>线索状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <div className="h-[300px] [&_svg]:outline-none [&_svg_*]:outline-none">
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
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>渠道来源分布</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedSourceData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedSourceData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      <ConversionFunnel
        funnel={funnelRes?.data}
        pipeline={pipelineRes?.data ?? []}
      />

      {/* Agent Performance */}
      {agentStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              客服绩效对比
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium">客服姓名</th>
                    <th className="pb-2 pr-4 font-medium text-center">总对话数</th>
                    <th className="pb-2 pr-4 font-medium text-center">已解决</th>
                    <th className="pb-2 pr-4 font-medium text-center">解决率</th>
                    <th className="pb-2 font-medium text-center">平均满意度</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((agent) => {
                    const rate = agent.total > 0 ? ((agent.resolved / agent.total) * 100).toFixed(1) : '0.0'
                    const sat = parseFloat(agent.avgSatisfaction || '0')
                    return (
                      <tr key={agent.agentId} className="border-b border-slate-100">
                        <td className="py-2.5 pr-4 font-medium text-slate-700">{agent.agentName ?? '未知'}</td>
                        <td className="py-2.5 pr-4 text-center">{agent.total}</td>
                        <td className="py-2.5 pr-4 text-center text-emerald-600">{agent.resolved}</td>
                        <td className="py-2.5 pr-4 text-center">
                          <span className={parseFloat(rate) >= 80 ? 'text-emerald-600 font-semibold' : parseFloat(rate) >= 50 ? 'text-amber-600' : 'text-red-500'}>
                            {rate}%
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {sat > 0 ? (
                            <span className="text-amber-600 font-medium">{sat.toFixed(1)} ★</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-medium text-slate-500 mb-2">对话量对比</p>
            <div className="space-y-2">
              {agentStats.map((agent) => (
                <div key={agent.agentId} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-20 truncate text-right">{agent.agentName ?? '未知'}</span>
                  <div className="flex-1 h-6 bg-slate-50 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded flex items-center px-2 transition-all"
                      style={{ width: `${Math.max((agent.total / maxAgentConvs) * 100, 4)}%` }}
                    >
                      <span className="text-[10px] text-white font-medium">{agent.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI 洞察
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              disabled={insightsLoading}
              onClick={fetchInsights}
              className="text-primary"
            >
              <RefreshCw className={`h-4 w-4${insightsLoading ? ' animate-spin' : ''}`} />
              {insightsLoading ? '分析中...' : '刷新洞察'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          {insightsLoading ? (
            <div className="flex items-center gap-2 text-slate-500 animate-pulse">
              <Sparkles className="h-4 w-4" />
              <span>AI 正在分析数据，请稍候...</span>
            </div>
          ) : insightsError ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{insightsError}</span>
              </div>
              <Button variant="outline" size="sm" onClick={fetchInsights} className="text-xs">
                <RefreshCw className="h-3 w-3" /> 重试
              </Button>
            </div>
          ) : insights.length > 0 ? (
            <div className="space-y-1.5">
              {insights.map((line, i) => <p key={i}>{line}</p>)}
              {insightsData?.source === 'fallback' && (
                <p className="text-xs text-slate-400 pt-1">基于统计数据生成，点击"刷新洞察"获取 AI 分析</p>
              )}
            </div>
          ) : (
            <p className="text-slate-500">点击"刷新洞察"让 AI 分析您的业务数据，获取智能建议。</p>
          )}
        </CardContent>
      </Card>
      </>}
    </div>
  )
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number | string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <Icon className="h-7 w-7 text-slate-400" />
        </div>
        <p className="text-2xl font-bold mt-2">{value}</p>
        <p className="text-sm text-slate-500">{title}</p>
      </CardContent>
    </Card>
  )
}

function EmptyChart() {
  return (
    <div className="h-[300px] flex items-center justify-center">
      <div className="text-center">
        <Activity className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">暂无数据</p>
      </div>
    </div>
  )
}

const FUNNEL_STAGES = [
  { key: 'visitor', label: '访客', color: '#3b82f6' },
  { key: 'lead', label: '线索', color: '#8b5cf6' },
  { key: 'customer', label: '客户', color: '#f59e0b' },
  { key: 'opportunity', label: '商机', color: '#10b981' },
  { key: 'won', label: '成交', color: '#ef4444' },
]

function ConversionFunnel({ funnel, pipeline }: {
  funnel?: { visitors: number; leads: number; customers: number; deals: number; won: number }
  pipeline: { stage: string; count: number; totalAmount: string | null }[]
}) {
  const opportunityCount = funnel?.deals ?? pipeline.reduce((sum, p) => {
    if (!['won', 'closed_won', 'closed_lost'].includes(p.stage)) return sum + p.count
    return sum
  }, 0)
  const wonCount = funnel?.won ?? (pipeline.find((p) => p.stage === 'won')?.count ?? pipeline.find((p) => p.stage === 'closed_won')?.count ?? 0)

  const stages = [
    { ...FUNNEL_STAGES[0], count: funnel?.visitors ?? 0 },
    { ...FUNNEL_STAGES[1], count: funnel?.leads ?? 0 },
    { ...FUNNEL_STAGES[2], count: funnel?.customers ?? 0 },
    { ...FUNNEL_STAGES[3], count: opportunityCount },
    { ...FUNNEL_STAGES[4], count: wonCount },
  ]

  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          转化漏斗
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((stage, i) => {
            const widthPct = Math.max((stage.count / maxCount) * 100, 8)
            const prevCount = i > 0 ? stages[i - 1].count : null
            const conversionRate = prevCount && prevCount > 0
              ? ((stage.count / prevCount) * 100).toFixed(1)
              : null

            return (
              <div key={stage.key}>
                {i > 0 && conversionRate && (
                  <div className="flex items-center gap-2 py-1 pl-4">
                    <ArrowDown className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">转化率 {conversionRate}%</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600 w-12 shrink-0 text-right">{stage.label}</span>
                  <div className="flex-1 relative">
                    <div
                      className="h-9 rounded-lg flex items-center px-3 transition-all duration-500"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: `${stage.color}20`,
                        borderLeft: `4px solid ${stage.color}`,
                      }}
                    >
                      <span className="text-sm font-bold" style={{ color: stage.color }}>{stage.count}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ResponseTimeTab({
  data,
  loading,
  distributionData,
  totalConversations,
  agentStats,
}: {
  data: ResponseTimeDashboard | undefined
  loading: boolean
  distributionData: { name: string; count: number }[]
  totalConversations: number
  agentStats: ResponseTimeDashboard['agentStats']
}) {
  if (loading) return <LoadingPage />

  if (!data) return (
    <div className="h-64 flex items-center justify-center">
      <div className="text-center">
        <Timer className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">暂无响应时间数据</p>
      </div>
    </div>
  )

  const trendData = data.dailyTrend.map(d => ({
    date: d.date.slice(5),
    avgFirst: d.avgFirstResponseSeconds,
    avgResolution: d.avgResolutionSeconds,
    count: d.count,
  }))

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-slate-500">平均首次响应</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {formatDuration(data.avgFirstResponseSeconds)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <span className="text-sm text-slate-500">平均解决时间</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {formatDuration(data.avgResolutionSeconds)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-5 w-5 text-violet-500" />
              <span className="text-sm text-slate-500">总会话数</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {totalConversations}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>首次响应时间分布</CardTitle>
          </CardHeader>
          <CardContent>
            {distributionData.some(d => d.count > 0) ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [`${v} 次`, '会话数']} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>每日响应时间趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: '秒', position: 'insideTopLeft', offset: -5, style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: '秒', position: 'insideTopRight', offset: -5, style: { fontSize: 11 } }} />
                    <Tooltip formatter={(v: number, name: string) => [formatDuration(v), name === 'avgFirst' ? '首次响应' : '解决时间']} />
                    <Legend formatter={(v: string) => v === 'avgFirst' ? '平均首次响应' : '平均解决时间'} />
                    <Line yAxisId="left" type="monotone" dataKey="avgFirst" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="avgResolution" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {agentStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              客服响应排行
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium">客服姓名</th>
                    <th className="pb-2 pr-4 font-medium text-center">平均首次响应</th>
                    <th className="pb-2 pr-4 font-medium text-center">平均解决时间</th>
                    <th className="pb-2 pr-4 font-medium text-center">总会话</th>
                    <th className="pb-2 font-medium text-center">解决率</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((agent) => {
                    const resolveRate = agent.totalConversations > 0
                      ? ((agent.resolvedCount / agent.totalConversations) * 100).toFixed(1)
                      : '0.0'
                    return (
                      <tr key={agent.agentId ?? 'unknown'} className="border-b border-slate-100">
                        <td className="py-2.5 pr-4 font-medium text-slate-700">{agent.agentName ?? '未知'}</td>
                        <td className="py-2.5 pr-4 text-center">{formatDuration(agent.avgFirstResponseSeconds)}</td>
                        <td className="py-2.5 pr-4 text-center">{formatDuration(agent.avgResolutionSeconds)}</td>
                        <td className="py-2.5 pr-4 text-center">{agent.totalConversations}</td>
                        <td className="py-2.5 text-center">
                          <span className={parseFloat(resolveRate) >= 80 ? 'text-emerald-600 font-semibold' : parseFloat(resolveRate) >= 50 ? 'text-amber-600' : 'text-red-500'}>
                            {resolveRate}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

const SCORE_COLORS: Record<number, string> = {
  5: '#22c55e',
  4: '#84cc16',
  3: '#eab308',
  2: '#f97316',
  1: '#ef4444',
}

function SatisfactionTab({ data, loading }: { data: SatisfactionAnalytics | undefined; loading: boolean }) {
  if (loading) return <LoadingPage />

  if (!data) return (
    <div className="h-64 flex items-center justify-center">
      <div className="text-center">
        <Star className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">暂无满意度数据</p>
      </div>
    </div>
  )

  const totalRatings = data.distribution.reduce((sum, d) => sum + d.count, 0)

  const trendData = data.dailyTrend.map(d => ({
    date: d.date.slice(5),
    avgScore: d.avgScore,
    count: d.count,
  }))

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-5 w-5 text-amber-500" />
              <span className="text-sm text-slate-500">综合评分</span>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              {(Number(data.avgScore) || 0).toFixed(1)}
              <span className="text-lg font-normal text-slate-400">/5.0</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-slate-500">评价率</span>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              {data.responseRate}
              <span className="text-lg font-normal text-slate-400">%</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">{data.totalRated} / {data.totalResolved} 已解决会话</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <ThumbsUp className="h-5 w-5 text-emerald-500" />
              <span className="text-sm text-slate-500">好评率</span>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              {data.goodRate}
              <span className="text-lg font-normal text-slate-400">%</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">4-5星评价占比</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>评分分布</CardTitle>
          </CardHeader>
          <CardContent>
            {totalRatings > 0 ? (
              <div className="space-y-3">
                {[5, 4, 3, 2, 1].map(score => {
                  const item = data.distribution.find(d => d.score === score)
                  const count = item?.count ?? 0
                  const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0
                  return (
                    <div key={score} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-12 text-right flex items-center justify-end gap-1">
                        {score} <Star className="h-3.5 w-3.5" style={{ color: SCORE_COLORS[score] }} />
                      </span>
                      <div className="flex-1 h-7 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: SCORE_COLORS[score] }}
                        />
                      </div>
                      <span className="text-sm text-slate-600 w-20 text-right">
                        {count} <span className="text-slate-400">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>满意度趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" domain={[0, 5]} tick={{ fontSize: 11 }} label={{ value: '分', position: 'insideTopLeft', offset: -5, style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: '次', position: 'insideTopRight', offset: -5, style: { fontSize: 11 } }} />
                    <Tooltip formatter={(v: number, name: string) => [name === 'avgScore' ? (Number(v) || 0).toFixed(2) : v, name === 'avgScore' ? '平均评分' : '评价数']} />
                    <Legend formatter={(v: string) => v === 'avgScore' ? '平均评分' : '评价数'} />
                    <Line yAxisId="left" type="monotone" dataKey="avgScore" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Bar yAxisId="right" dataKey="count" fill="#3b82f6" opacity={0.15} radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent CSAT Leaderboard */}
      {data.agentBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              客服满意度排行
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium w-12 text-center">排名</th>
                    <th className="pb-2 pr-4 font-medium">客服姓名</th>
                    <th className="pb-2 pr-4 font-medium text-center">平均评分</th>
                    <th className="pb-2 font-medium text-center">评价数</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agentBreakdown.map((agent, idx) => (
                    <tr key={agent.agentId ?? idx} className="border-b border-slate-100">
                      <td className="py-2.5 pr-4 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-700' :
                          idx === 1 ? 'bg-slate-100 text-slate-600' :
                          idx === 2 ? 'bg-orange-100 text-orange-700' :
                          'text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-slate-700">{agent.agentName ?? '未知'}</td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className="text-amber-600 font-semibold">{(Number(agent.avgScore) || 0).toFixed(1)} ★</span>
                      </td>
                      <td className="py-2.5 text-center text-slate-600">{agent.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
