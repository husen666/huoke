'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDeals, createDeal, updateDeal, deleteDeal, getPipelineSummary, getCustomers,
  type Deal, type PipelineSummary, type Customer,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { Plus, Handshake, Trash2, Pencil, DollarSign, TrendingUp, LayoutList, Columns3, Target, CalendarClock, Trophy, BarChart3, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import { Pagination } from '@/components/pagination'
import { toast } from 'sonner'
import { PageHeader, ErrorState, EmptyState, SearchInput, SortToggle, FilterBar, DeleteConfirmDialog, useListParams } from '@/components/shared'
import { useDebounce } from '@/lib/use-debounce'

const STAGES = [
  { value: 'initial', label: '初步接触', color: '#6366f1' },
  { value: 'qualified', label: '需求确认', color: '#3b82f6' },
  { value: 'proposal', label: '方案报价', color: '#f59e0b' },
  { value: 'negotiation', label: '商务谈判', color: '#f97316' },
  { value: 'won', label: '赢单', color: '#10b981' },
  { value: 'lost', label: '丢单', color: '#ef4444' },
]

const stageLabel: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.value, s.label]))
const stageVariant: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  initial: 'default', qualified: 'primary', proposal: 'warning', negotiation: 'warning', won: 'success', lost: 'default',
}

const stageFilterOptions = [{ value: '', label: '全部阶段' }, ...STAGES.map((s) => ({ value: s.value, label: s.label }))]

export default function DealsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [stage, setStage] = useState('')
  const [dealSearch, setDealSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Deal | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null)
  const lp = useListParams({ pageSize: 20, sortBy: 'updatedAt', sortOrder: 'desc' })
  const [amountFilter, setAmountFilter] = useState('')
  const [exporting, setExporting] = useState(false)

  const params: Record<string, string> = { page: String(lp.page), pageSize: String(lp.pageSize), sortBy: lp.sortBy, sortOrder: lp.sortOrder }
  if (stage) params.stage = stage
  const debouncedSearch = useDebounce(dealSearch, 400)
  if (debouncedSearch) params.search = debouncedSearch

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deals', params],
    queryFn: () => getDeals(params),
    staleTime: 30_000,
  })
  const rawList: Deal[] = data?.data ?? []

  const list = amountFilter
    ? rawList.filter((d) => {
        const amt = parseFloat(d.amount) || 0
        switch (amountFilter) {
          case 'lt10w': return amt < 100000
          case '10w-50w': return amt >= 100000 && amt < 500000
          case '50w-100w': return amt >= 500000 && amt < 1000000
          case 'gt100w': return amt >= 1000000
          default: return true
        }
      })
    : rawList
  const total = amountFilter ? list.length : (data?.total ?? 0)

  const { data: pipelineRes } = useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: () => getPipelineSummary(),
    staleTime: 30_000,
  })
  const pipeline: PipelineSummary[] = pipelineRes?.data ?? []

  const { data: allDealsRes } = useQuery({
    queryKey: ['deals', 'all-for-forecast'],
    queryFn: () => getDeals({ pageSize: '200' }),
    staleTime: 60_000,
  })
  const allDeals: Deal[] = allDealsRes?.data ?? []

  const forecast = useMemo(() => {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const nextMonth = thisMonth === 11 ? 0 : thisMonth + 1
    const nextMonthYear = thisMonth === 11 ? thisYear + 1 : thisYear

    const nonClosed = allDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
    const weightedValue = nonClosed.reduce((sum, d) => {
      const amt = parseFloat(d.amount) || 0
      const prob = d.probability ?? 0
      return sum + amt * prob / 100
    }, 0)

    const closesThisMonth = nonClosed.filter(d => {
      if (!d.expectedCloseDate) return false
      const dt = new Date(d.expectedCloseDate)
      return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear
    }).length

    const closesNextMonth = nonClosed.filter(d => {
      if (!d.expectedCloseDate) return false
      const dt = new Date(d.expectedCloseDate)
      return dt.getMonth() === nextMonth && dt.getFullYear() === nextMonthYear
    }).length

    const wonDeals = allDeals.filter(d => d.stage === 'won')
    const lostDeals = allDeals.filter(d => d.stage === 'lost')
    const totalDecided = wonDeals.length + lostDeals.length
    const winRate = totalDecided > 0 ? (wonDeals.length / totalDecided * 100) : 0

    const avgWonAmount = wonDeals.length > 0
      ? wonDeals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0) / wonDeals.length
      : 0

    const closedWithDates = wonDeals.filter(d => d.actualCloseDate)
    const avgDaysToClose = closedWithDates.length > 0
      ? closedWithDates.reduce((s, d) => {
          const created = new Date(d.createdAt).getTime()
          const closed = new Date(d.actualCloseDate!).getTime()
          return s + (closed - created) / (1000 * 60 * 60 * 24)
        }, 0) / closedWithDates.length
      : 0

    return { weightedValue, closesThisMonth, closesNextMonth, winRate, wonCount: wonDeals.length, lostCount: lostDeals.length, avgWonAmount, avgDaysToClose }
  }, [allDeals])

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteDeal(id),
    onSuccess: () => {
      toast.success('商机删除成功')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-summary'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const formatAmount = (amt: string) => {
    const n = parseFloat(amt)
    if (isNaN(n)) return '¥0'
    if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`
    return `¥${n.toLocaleString()}`
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await getDeals({ ...params, pageSize: '9999' })
      const rows = res.data || []
      downloadCsv(rows, [
        { key: 'title', label: '标题' },
        { key: 'amount', label: '金额' },
        { key: 'stage', label: '阶段', transform: (v) => stageLabel[String(v)] ?? String(v ?? '') },
        { key: 'customerName', label: '客户' },
        { key: 'ownerName', label: '负责人' },
        { key: 'expectedCloseDate', label: '预计成交日' },
        { key: 'createdAt', label: '创建时间' },
      ], `deals_${new Date().toISOString().split('T')[0]}.csv`)
      toast.success('导出成功')
    } catch { toast.error('导出失败') }
    setExporting(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="商机管理"
        subtitle="跟踪商机全生命周期"
        actions={
          <>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={cn('px-3 py-1.5 text-xs font-medium transition-colors', viewMode === 'list' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50')}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={cn('px-3 py-1.5 text-xs font-medium transition-colors', viewMode === 'kanban' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50')}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? '导出中...' : '导出'}
            </Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 新建商机
            </Button>
          </>
        }
      />

      {/* Pipeline summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGES.map((s) => {
          const item = pipeline.find((p) => p.stage === s.value)
          return (
            <Card key={s.value} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setStage(s.value); lp.resetPage() }}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-medium text-slate-600">{s.label}</span>
                </div>
                <p className="text-xl font-bold text-slate-800">{item?.count ?? 0}</p>
                <p className="text-xs text-slate-500">{formatAmount(item?.totalAmount ?? '0')}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Sales Forecast */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> 销售预测</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Target className="h-4 w-4 text-indigo-600" />
                </div>
                <span className="text-xs font-medium text-slate-500">加权管道价值</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{formatAmount(String(forecast.weightedValue))}</p>
              <p className="text-xs text-slate-400 mt-1">基于成交概率加权计算</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-xs font-medium text-slate-500">本月预计成交</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{forecast.closesThisMonth} <span className="text-sm font-normal text-slate-400">笔</span></p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                  <CalendarClock className="h-4 w-4 text-cyan-600" />
                </div>
                <span className="text-xs font-medium text-slate-500">下月预计成交</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{forecast.closesNextMonth} <span className="text-sm font-normal text-slate-400">笔</span></p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-xs font-medium text-slate-500">赢单率</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{forecast.winRate.toFixed(1)}%</p>
              <p className="text-xs text-slate-400 mt-1">{forecast.wonCount} 赢 / {forecast.lostCount} 丢</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Win/Loss Analysis */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> 赢单/丢单分析</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">赢单/丢单比</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-green-600">{forecast.wonCount}</span>
                <span className="text-slate-400 mb-0.5">/</span>
                <span className="text-2xl font-bold text-red-500">{forecast.lostCount}</span>
              </div>
              {(forecast.wonCount + forecast.lostCount) > 0 && (
                <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${forecast.winRate}%` }}
                  />
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">平均赢单金额</p>
              <p className="text-2xl font-bold text-slate-800">{formatAmount(String(forecast.avgWonAmount))}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">平均成交周期</p>
              <p className="text-2xl font-bold text-slate-800">
                {forecast.avgDaysToClose > 0 ? `${Math.round(forecast.avgDaysToClose)} 天` : '-'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">赢单率趋势</p>
              <p className="text-2xl font-bold text-slate-800">{forecast.winRate.toFixed(1)}%</p>
              <p className="text-xs text-slate-400 mt-1">共 {forecast.wonCount + forecast.lostCount} 笔已结算</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <KanbanBoard
          pipeline={pipeline}
          onEditDeal={setEditItem}
          onDeleteDeal={setDeleteTarget}
          formatAmount={formatAmount}
        />
      )}

      {/* List View */}
      {viewMode === 'list' && (
      <>
      <FilterBar>
        <Select options={stageFilterOptions} value={stage} onChange={(v) => { setStage(v); lp.resetPage() }} className="w-[120px]" />
        <Select
          options={[
            { value: '', label: '全部金额' },
            { value: 'lt10w', label: '<10万' },
            { value: '10w-50w', label: '10-50万' },
            { value: '50w-100w', label: '50-100万' },
            { value: 'gt100w', label: '>100万' },
          ]}
          value={amountFilter}
          onChange={(v) => { setAmountFilter(v); lp.resetPage() }}
          placeholder="按金额筛选"
          className="w-[120px]"
        />
        <SearchInput
          placeholder="搜索商机名称..."
          value={dealSearch}
          onChange={(v) => { setDealSearch(v); lp.resetPage() }}
        />
        <Select
          options={[
            { value: 'updatedAt', label: '更新时间' },
            { value: 'createdAt', label: '创建时间' },
            { value: 'amount', label: '金额' },
            { value: 'title', label: '标题' },
            { value: 'expectedCloseDate', label: '预计成交日' },
          ]}
          value={lp.sortBy}
          onChange={(v) => { lp.setSortBy(v); lp.resetPage() }}
          className="w-[120px]"
        />
        <SortToggle sortOrder={lp.sortOrder} onToggle={lp.toggleSortOrder} />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingPage />
          ) : isError ? (
            <ErrorState />
          ) : list.length === 0 ? (
            <EmptyState icon={Handshake} message="暂无商机" actionLabel="创建第一个商机" onAction={() => setShowCreate(true)} />
          ) : (
            <>
              <div className="space-y-3">
                {list.map((deal) => (
                  <div key={deal.id} className="flex items-center gap-4 rounded-lg border border-slate-200 p-4 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/deals/${deal.id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{deal.title}</p>
                        <Badge variant={stageVariant[deal.stage] ?? 'default'}>
                          {stageLabel[deal.stage] ?? deal.stage}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{formatAmount(deal.amount)}</span>
                        {deal.probability != null && <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />{deal.probability}%</span>}
                        {deal.expectedCloseDate && <span>预计成交: {new Date(deal.expectedCloseDate).toLocaleDateString('zh-CN')}</span>}
                      </div>
                      {deal.notes && <p className="text-xs text-slate-400 mt-1 truncate">{deal.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEditItem(deal) }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeleteTarget(deal) }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                page={lp.page}
                pageSize={lp.pageSize}
                total={total}
                onPageChange={lp.setPage}
                onPageSizeChange={lp.setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
      </>
      )}

      <DealFormDialog
        open={showCreate || !!editItem}
        editItem={editItem}
        onClose={() => { setShowCreate(false); setEditItem(null) }}
        onSuccess={() => {
          setShowCreate(false); setEditItem(null)
          queryClient.invalidateQueries({ queryKey: ['deals'] })
          queryClient.invalidateQueries({ queryKey: ['pipeline-summary'] })
        }}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="商机"
        entityName={deleteTarget?.title ?? ''}
        onConfirm={() => deleteTarget && delMutation.mutate(deleteTarget.id)}
        loading={delMutation.isPending}
      />
    </div>
  )
}

function KanbanBoard({
  pipeline,
  onEditDeal,
  onDeleteDeal,
  formatAmount,
}: {
  pipeline: PipelineSummary[]
  onEditDeal: (deal: Deal) => void
  onDeleteDeal: (deal: Deal) => void
  formatAmount: (v: string) => string
}) {
  const queryClient = useQueryClient()

  const { data: allDealsRes } = useQuery({
    queryKey: ['deals', 'all-for-forecast'],
    queryFn: () => getDeals({ pageSize: '200' }),
    staleTime: 60_000,
  })
  const allDeals = (allDealsRes?.data ?? []) as Deal[]
  const dealsByStage = useMemo(() => STAGES.reduce<Record<string, Deal[]>>((acc, s) => {
    acc[s.value] = allDeals.filter((d) => d.stage === s.value)
    return acc
  }, {}), [allDeals])

  const moveMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => updateDeal(id, { stage }),
    onSuccess: () => {
      toast.success('阶段更新成功')
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-summary'] })
    },
    onError: () => toast.error('操作失败'),
  })

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((stg) => {
        const deals = dealsByStage[stg.value] ?? []
        const summary = pipeline.find((p) => p.stage === stg.value)
        const stageIndex = STAGES.findIndex((s) => s.value === stg.value)
        return (
          <div key={stg.value} className="min-w-[280px] w-[280px] shrink-0">
            <div className="rounded-t-lg px-3 py-2" style={{ backgroundColor: `${stg.color}15` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stg.color }} />
                  <span className="text-sm font-semibold" style={{ color: stg.color }}>{stg.label}</span>
                </div>
                <span className="text-xs font-medium text-slate-500">{summary?.count ?? deals.length}</span>
              </div>
              {summary && Number(summary.totalAmount) > 0 && (
                <p className="text-xs text-slate-500 mt-0.5">{formatAmount(summary.totalAmount ?? '0')}</p>
              )}
            </div>
            <div className="space-y-2 rounded-b-lg border border-t-0 border-slate-200 bg-slate-50/50 p-2 min-h-[200px]">
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onEditDeal(deal)}
                >
                  <p className="text-sm font-medium truncate">{deal.title}</p>
                  <p className="text-lg font-bold mt-1" style={{ color: stg.color }}>
                    {formatAmount(deal.amount)}
                  </p>
                  {deal.expectedCloseDate && (
                    <p className="text-xs text-slate-400 mt-1">预计 {new Date(deal.expectedCloseDate).toLocaleDateString('zh-CN')}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1">
                      {stageIndex > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveMut.mutate({ id: deal.id, stage: STAGES[stageIndex - 1].value }) }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200"
                          title={`移至 ${STAGES[stageIndex - 1].label}`}
                        >
                          ← {STAGES[stageIndex - 1].label}
                        </button>
                      )}
                      {stageIndex < STAGES.length - 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveMut.mutate({ id: deal.id, stage: STAGES[stageIndex + 1].value }) }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white hover:opacity-80"
                          style={{ backgroundColor: STAGES[stageIndex + 1].color }}
                          title={`移至 ${STAGES[stageIndex + 1].label}`}
                        >
                          {STAGES[stageIndex + 1].label} →
                        </button>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteDeal(deal) }}
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {deals.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-xs text-slate-400">暂无商机</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DealFormDialog({ open, editItem, onClose, onSuccess }: { open: boolean; editItem: Deal | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    customerId: '', title: '', amount: '', stage: 'initial', probability: '', expectedCloseDate: '', notes: '',
  })
  const isEdit = !!editItem

  React.useEffect(() => {
    if (open && editItem) {
      setForm({
        customerId: editItem.customerId,
        title: editItem.title,
        amount: editItem.amount,
        stage: editItem.stage,
        probability: editItem.probability != null ? String(editItem.probability) : '',
        expectedCloseDate: editItem.expectedCloseDate ? editItem.expectedCloseDate.slice(0, 10) : '',
        notes: editItem.notes ?? '',
      })
    } else if (open) {
      setForm({ customerId: '', title: '', amount: '', stage: 'initial', probability: '', expectedCloseDate: '', notes: '' })
    }
  }, [open, editItem])

  const { data: cusRes } = useQuery({
    queryKey: ['customers-for-deal'],
    queryFn: () => getCustomers({ pageSize: '100' }),
    enabled: open && !isEdit,
  })
  const customers: Customer[] = cusRes?.data ?? []

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => isEdit && editItem ? updateDeal(editItem.id, data) : createDeal(data),
    onSuccess: () => { toast.success(isEdit ? '商机更新成功' : '商机创建成功'); onSuccess() },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.amount.trim()) {
      toast.error('请填写商机名称和金额')
      return
    }
    if (!isEdit && !form.customerId) {
      toast.error('请选择关联客户')
      return
    }
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt < 0) {
      toast.error('请输入有效的金额')
      return
    }
    const data: Record<string, unknown> = {
      title: form.title,
      amount: form.amount,
      stage: form.stage,
    }
    if (!isEdit) data.customerId = form.customerId
    if (form.probability) {
      const prob = parseInt(form.probability, 10)
      data.probability = Math.max(0, Math.min(100, isNaN(prob) ? 0 : prob))
    }
    if (form.expectedCloseDate) data.expectedCloseDate = new Date(form.expectedCloseDate).toISOString()
    if (form.notes) data.notes = form.notes
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑商机' : '新建商机'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">关联客户 *</label>
            {customers.length > 0 ? (
              <Select
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                value={form.customerId}
                onChange={(v) => setForm((p) => ({ ...p, customerId: v }))}
                placeholder="选择客户"
              />
            ) : (
              <p className="text-sm text-slate-500">暂无客户，请先创建客户</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">商机名称 *</label>
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="商机名称" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">金额 (元) *</label>
            <Input type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">阶段</label>
            <Select
              options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
              value={form.stage}
              onChange={(v) => setForm((p) => ({ ...p, stage: v }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">成交概率 (%)</label>
            <Input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((p) => ({ ...p, probability: e.target.value }))} placeholder="0-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">预计成交日期</label>
            <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="备注（可选）" />
        </div>
        {mutation.error && <p className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : '操作失败'}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{isEdit ? '保存' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
