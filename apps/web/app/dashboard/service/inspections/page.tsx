'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getInspections,
  createInspection,
  deleteInspection,
  getInspectionStats,
  type Inspection,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { Pagination } from '@/components/pagination'
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Star,
  TrendingUp,
  AlertCircle,
  BarChart3,
  XCircle,
  Search,
  Eye,
} from 'lucide-react'
import { PlanGuard } from '@/components/plan-guard'

const GRADE_CONFIG: Record<string, { color: string; variant: 'success' | 'primary' | 'warning' | 'danger' | 'default'; bg: string }> = {
  A: { color: 'text-emerald-600', variant: 'success', bg: 'bg-emerald-50' },
  B: { color: 'text-blue-600', variant: 'primary', bg: 'bg-blue-50' },
  C: { color: 'text-amber-600', variant: 'warning', bg: 'bg-amber-50' },
  D: { color: 'text-orange-600', variant: 'warning', bg: 'bg-orange-50' },
  E: { color: 'text-red-600', variant: 'danger', bg: 'bg-red-50' },
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'E'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(str: string | undefined | null, max: number) {
  if (!str) return '-'
  return str.length > max ? str.slice(0, max) + '…' : str
}

function InspectionsPageContent() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [viewItem, setViewItem] = useState<Inspection | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Form state
  const [formConvId, setFormConvId] = useState('')
  const [formScore, setFormScore] = useState(80)
  const [formStrengths, setFormStrengths] = useState('')
  const [formWeaknesses, setFormWeaknesses] = useState('')
  const [formSuggestions, setFormSuggestions] = useState('')

  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ['inspection-stats'],
    queryFn: getInspectionStats,
    staleTime: 30_000,
  })
  const stats = statsRes?.data

  const { data: listRes, isLoading: listLoading, isError } = useQuery({
    queryKey: ['inspections', debouncedSearch, page],
    queryFn: () => {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
      if (debouncedSearch) params.keyword = debouncedSearch
      return getInspections(params)
    },
    staleTime: 30_000,
  })
  const inspections = listRes?.data ?? []
  const total = listRes?.total ?? inspections.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const createMut = useMutation({
    mutationFn: createInspection,
    onSuccess: () => {
      toast.success('质检记录已创建')
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-stats'] })
      resetForm()
      setCreateOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteInspection,
    onSuccess: () => {
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-stats'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  function resetForm() {
    setFormConvId('')
    setFormScore(80)
    setFormStrengths('')
    setFormWeaknesses('')
    setFormSuggestions('')
  }

  function handleCreate() {
    if (!formConvId.trim()) {
      toast.error('请输入会话ID')
      return
    }
    if (formScore < 1 || formScore > 100) {
      toast.error('评分范围为 1-100')
      return
    }
    createMut.mutate({
      conversationId: formConvId.trim(),
      score: formScore,
      strengths: formStrengths || undefined,
      weaknesses: formWeaknesses || undefined,
      suggestions: formSuggestions || undefined,
    })
  }

  if (listLoading && !inspections.length) return <LoadingPage />
  if (isError) {
    return (
      <div className="py-16 text-center">
        <XCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-slate-500">加载失败，请刷新重试</p>
      </div>
    )
  }

  const gradeGradient = scoreToGrade(formScore)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">质检中心</h2>
            <p className="text-sm text-slate-500 mt-0.5">对客服会话进行质量评估与打分</p>
          </div>
        </div>
        <Button variant="primary" onClick={() => { resetForm(); setCreateOpen(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />新建质检
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">{statsLoading ? '-' : (stats?.total ?? 0)}</p>
              <p className="text-xs text-slate-500">总质检数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Star className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {statsLoading ? '-' : (stats?.avgScore != null ? Number(stats.avgScore).toFixed(1) : '-')}
              </p>
              <p className="text-xs text-slate-500">平均分</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {statsLoading ? '-' : ((stats?.gradeA ?? 0) + (stats?.gradeB ?? 0))}
              </p>
              <p className="text-xs text-slate-500">优良(A+B)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {statsLoading ? '-' : ((stats?.gradeD ?? 0) + (stats?.gradeE ?? 0))}
              </p>
              <p className="text-xs text-slate-500">待改进(D+E)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grade Distribution */}
      {stats && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">等级分布</p>
            <div className="flex items-center gap-3 flex-wrap">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((g) => {
                const count = stats[`grade${g}` as keyof typeof stats] as number
                const cfg = GRADE_CONFIG[g]
                return (
                  <div key={g} className="flex items-center gap-1.5">
                    <Badge variant={cfg.variant}>{g}级</Badge>
                    <span className="text-sm font-semibold text-slate-700">{count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索会话、客服..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {inspections.length === 0 ? (
        <div className="py-16 text-center">
          <ClipboardCheck className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">暂无质检记录</p>
          <p className="text-xs text-slate-400 mt-1">点击「新建质检」开始评估</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会话</TableHead>
                  <TableHead className="text-center w-20">评分</TableHead>
                  <TableHead className="text-center w-16">等级</TableHead>
                  <TableHead>优点</TableHead>
                  <TableHead>不足</TableHead>
                  <TableHead>质检员</TableHead>
                  <TableHead className="w-32">时间</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((item) => {
                  const grade = item.grade || scoreToGrade(item.score)
                  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG.C
                  return (
                    <TableRow key={item.id} className="cursor-pointer" onClick={() => setViewItem(item)}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate max-w-[180px]">
                            {item.customerName || item.conversationId.slice(0, 8)}
                          </p>
                          {item.agentName && (
                            <p className="text-xs text-slate-400">客服: {item.agentName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-bold ${cfg.color}`}>
                          {item.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={cfg.variant}>{grade}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">{truncate(item.strengths, 30)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">{truncate(item.weaknesses, 30)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{item.inspectorName || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-primary"
                            onClick={() => setViewItem(item)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                            onClick={async () => {
                              const ok = await confirm({ title: '确认删除', description: '确定删除此质检记录？此操作不可撤销。', confirmText: '删除', variant: 'danger' })
                              if (ok) deleteMut.mutate(item.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      />

      {/* Detail Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null) }} title="质检详情" className="max-w-lg">
        {viewItem && (() => {
          const grade = viewItem.grade || scoreToGrade(viewItem.score)
          const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG.C
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">会话</p>
                  <p className="text-sm font-semibold text-slate-800">{viewItem.customerName || viewItem.conversationId.slice(0, 8)}</p>
                  {viewItem.agentName && <p className="text-xs text-slate-400">客服: {viewItem.agentName}</p>}
                </div>
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${cfg.bg}`}>
                    <span className={`text-2xl font-bold ${cfg.color}`}>{viewItem.score}</span>
                  </div>
                  <p className="text-xs mt-1"><Badge variant={cfg.variant}>{grade}级</Badge></p>
                </div>
              </div>
              {viewItem.strengths && (
                <div>
                  <p className="text-xs font-medium text-emerald-700 mb-1">优点</p>
                  <p className="text-sm text-slate-600 bg-emerald-50 rounded-lg p-3">{viewItem.strengths}</p>
                </div>
              )}
              {viewItem.weaknesses && (
                <div>
                  <p className="text-xs font-medium text-amber-700 mb-1">不足</p>
                  <p className="text-sm text-slate-600 bg-amber-50 rounded-lg p-3">{viewItem.weaknesses}</p>
                </div>
              )}
              {viewItem.suggestions && (
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-1">建议</p>
                  <p className="text-sm text-slate-600 bg-blue-50 rounded-lg p-3">{viewItem.suggestions}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                <span>质检员: {viewItem.inspectorName || '-'}</span>
                <span>{formatDate(viewItem.createdAt)}</span>
              </div>
            </div>
          )
        })()}
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="新建质检" className="max-w-xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">会话 ID</label>
            <Input
              value={formConvId}
              onChange={(e) => setFormConvId(e.target.value)}
              placeholder="输入会话 ID"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">评分</label>
              <span className={`text-lg font-bold ${GRADE_CONFIG[gradeGradient]?.color ?? 'text-slate-700'}`}>
                {formScore} <span className="text-xs font-medium">/ 100</span>
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={formScore}
              onChange={(e) => setFormScore(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-slate-200 accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>1</span>
              <span>等级: <span className={`font-semibold ${GRADE_CONFIG[gradeGradient]?.color}`}>{gradeGradient}</span></span>
              <span>100</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">优点</label>
            <textarea
              value={formStrengths}
              onChange={(e) => setFormStrengths(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="服务中做得好的方面..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">不足</label>
            <textarea
              value={formWeaknesses}
              onChange={(e) => setFormWeaknesses(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="需要改进的地方..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">建议</label>
            <textarea
              value={formSuggestions}
              onChange={(e) => setFormSuggestions(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="改进建议..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" loading={createMut.isPending} onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />提交质检
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default function InspectionsPage() {
  return <PlanGuard feature="quality_inspection"><InspectionsPageContent /></PlanGuard>
}
