'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers, createCustomer, deleteCustomer,
  batchUpdateCustomers, batchDeleteCustomers, getOrgMembers,
  getSegments, createSegment, deleteSegment, refreshSegmentCount,
  getCustomerDuplicates, mergeCustomers,
  type Customer, type OrgMember, type CustomerSegment, type DuplicateGroup,
} from '@/lib/api'
import { useDebounce } from '@/lib/use-debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { PageHeader, ErrorState, EmptyState, SearchInput, SortToggle, FilterBar, BatchActionBar, DeleteConfirmDialog, useListParams, useRowSelection } from '@/components/shared'
import { Plus, UserCircle, Trash2, UserPlus, RefreshCw, X, Download, Bookmark, FolderPlus, GitMerge, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import { Pagination } from '@/components/pagination'
import { toast } from 'sonner'

const stageOptions = [
  { value: '', label: '全部阶段' },
  { value: 'potential', label: '潜在客户' },
  { value: 'active', label: '活跃客户' },
  { value: 'inactive', label: '不活跃' },
  { value: 'churned', label: '已流失' },
  { value: 'lead', label: '线索' },
  { value: 'opportunity', label: '商机' },
  { value: 'negotiation', label: '谈判' },
  { value: 'won', label: '成交' },
  { value: 'lost', label: '流失' },
]

const typeOptions = [
  { value: '', label: '全部类型' },
  { value: 'enterprise', label: '企业客户' },
  { value: 'individual', label: '个人客户' },
]

const stageLabel: Record<string, string> = {
  potential: '潜在客户', active: '活跃客户', inactive: '不活跃', churned: '已流失',
  lead: '线索', opportunity: '商机', negotiation: '谈判', won: '成交', lost: '流失',
}
const stageVariant: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  potential: 'default', active: 'primary', inactive: 'warning', churned: 'default',
  lead: 'default', opportunity: 'primary', negotiation: 'warning', won: 'success',
}

export default function CustomersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const lp = useListParams({ pageSize: 20, sortBy: 'updatedAt', sortOrder: 'desc' })
  const [stage, setStage] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(searchParams.get('action') === 'new')
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [showBatchAssign, setShowBatchAssign] = useState(false)
  const [showBatchStage, setShowBatchStage] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [batchOwner, setBatchOwner] = useState('')
  const [batchStage, setBatchStage] = useState('')
  const [exporting, setExporting] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [showSaveSegment, setShowSaveSegment] = useState(false)
  const [segmentName, setSegmentName] = useState('')
  const [segmentDesc, setSegmentDesc] = useState('')
  const [segmentColor, setSegmentColor] = useState('#3b82f6')
  const [deleteSegmentTarget, setDeleteSegmentTarget] = useState<CustomerSegment | null>(null)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [loadingDuplicates, setLoadingDuplicates] = useState(false)
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null)
  const [mergePrimaryId, setMergePrimaryId] = useState('')

  const { data: segmentsRes } = useQuery({
    queryKey: ['segments'],
    queryFn: () => getSegments(),
    staleTime: 60_000,
  })
  const segments: CustomerSegment[] = segmentsRes?.data ?? []

  const saveSegmentMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createSegment(data),
    onSuccess: () => {
      toast.success('分群保存成功')
      setShowSaveSegment(false)
      setSegmentName('')
      setSegmentDesc('')
      queryClient.invalidateQueries({ queryKey: ['segments'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const deleteSegmentMut = useMutation({
    mutationFn: (id: string) => deleteSegment(id),
    onSuccess: () => {
      toast.success('分群已删除')
      setDeleteSegmentTarget(null)
      if (activeSegmentId === deleteSegmentTarget?.id) {
        setActiveSegmentId(null)
        setStage('')
        setType('')
      }
      queryClient.invalidateQueries({ queryKey: ['segments'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const handleApplySegment = (seg: CustomerSegment) => {
    if (activeSegmentId === seg.id) {
      setActiveSegmentId(null)
      setStage('')
      setType('')
      setSearch('')
      lp.resetPage()
      return
    }
    setActiveSegmentId(seg.id)
    const f = seg.filters as Record<string, unknown>
    setStage((f.stage as string) || '')
    setType((f.type as string) || '')
    setSearch((f.search as string) || '')
    lp.resetPage()
  }

  const handleSaveSegment = () => {
    const filters: Record<string, unknown> = {}
    if (stage) filters.stage = stage
    if (type) filters.type = type
    if (debouncedSearch) filters.search = debouncedSearch
    saveSegmentMut.mutate({ name: segmentName, description: segmentDesc || undefined, filters, color: segmentColor })
  }

  const { data: membersRes } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => getOrgMembers(),
    staleTime: 60_000,
  })
  const members: OrgMember[] = membersRes?.data ?? []

  const batchUpdateMut = useMutation({
    mutationFn: ({ ids, data }: { ids: string[]; data: Record<string, unknown> }) => batchUpdateCustomers(ids, data),
    onSuccess: () => {
      toast.success('批量操作成功')
      selection.clearSelection()
      setShowBatchAssign(false)
      setShowBatchStage(false)
      setBatchOwner('')
      setBatchStage('')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  const batchDeleteMut = useMutation({
    mutationFn: (ids: string[]) => batchDeleteCustomers(ids),
    onSuccess: () => {
      toast.success('批量删除成功')
      selection.clearSelection()
      setShowBatchDelete(false)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      toast.success('客户删除成功')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : '操作失败')
    },
  })

  const mergeMut = useMutation({
    mutationFn: ({ primaryId, mergeIds }: { primaryId: string; mergeIds: string[] }) => mergeCustomers(primaryId, mergeIds),
    onSuccess: (res) => {
      toast.success(`合并成功，已合并 ${res.data?.mergedCount ?? 0} 条记录`)
      setMergeGroup(null)
      setMergePrimaryId('')
      setShowDuplicates(false)
      setDuplicateGroups([])
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '合并失败'),
  })

  const handleFindDuplicates = async () => {
    setLoadingDuplicates(true)
    try {
      const res = await getCustomerDuplicates()
      setDuplicateGroups(res.data ?? [])
      setShowDuplicates(true)
    } catch {
      toast.error('查找重复失败')
    }
    setLoadingDuplicates(false)
  }

  const debouncedSearch = useDebounce(search, 400)

  const params: Record<string, string> = { page: String(lp.page), pageSize: String(lp.pageSize), sortBy: lp.sortBy, sortOrder: lp.sortOrder }
  if (stage) params.stage = stage
  if (type) params.type = type
  if (debouncedSearch) params.search = debouncedSearch

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customers', params],
    queryFn: () => getCustomers(params),
    staleTime: 30_000,
  })

  const list: Customer[] = data?.data ?? []
  const total = data?.total ?? 0
  const selection = useRowSelection(list)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await getCustomers({ ...params, pageSize: '9999' })
      const rows = res.data || []
      downloadCsv(rows, [
        { key: 'name', label: '名称' },
        { key: 'email', label: '邮箱' },
        { key: 'phone', label: '电话' },
        { key: 'companyName', label: '公司' },
        { key: 'stage', label: '阶段' },
        { key: 'score', label: '评分' },
        { key: 'createdAt', label: '创建时间' },
      ], `customers_${new Date().toISOString().split('T')[0]}.csv`)
      toast.success('导出成功')
    } catch { toast.error('导出失败') }
    setExporting(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="客户管理"
        subtitle="管理客户信息和生命周期"
        actions={
          <>
            {(stage || type || debouncedSearch) && (
              <Button variant="outline" onClick={() => setShowSaveSegment(true)}>
                <FolderPlus className="h-4 w-4" />
                保存为分群
              </Button>
            )}
            <Button variant="outline" onClick={handleFindDuplicates} disabled={loadingDuplicates}>
              <Users className="h-4 w-4" />
              {loadingDuplicates ? '查找中...' : '查找重复'}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? '导出中...' : '导出'}
            </Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              新建客户
            </Button>
          </>
        }
      />

      {segments.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-500 flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> 客户分群:</span>
              {segments.map((seg) => (
                <div key={seg.id} className="group inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleApplySegment(seg)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                      activeSegmentId === seg.id
                        ? 'ring-2 ring-offset-1'
                        : 'hover:opacity-80'
                    )}
                    style={{
                      backgroundColor: `${seg.color || '#3b82f6'}18`,
                      color: seg.color || '#3b82f6',
                      ...(activeSegmentId === seg.id ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${seg.color || '#3b82f6'}` } : {}),
                    }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color || '#3b82f6' }} />
                    {seg.name}
                    <span className="text-xs opacity-60">({seg.customerCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteSegmentTarget(seg) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500"
                    title="删除分群"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {activeSegmentId && (
                <button
                  type="button"
                  onClick={() => { setActiveSegmentId(null); setStage(''); setType(''); setSearch(''); lp.resetPage() }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline ml-1"
                >
                  清除筛选
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <FilterBar>
        <Select placeholder="阶段" options={stageOptions} value={stage} onChange={(v) => { setStage(v); lp.resetPage() }} className="w-[120px]" />
        <Select placeholder="类型" options={typeOptions} value={type} onChange={(v) => { setType(v); lp.resetPage() }} className="w-[120px]" />
        <SearchInput placeholder="搜索客户名称、手机号..." value={search} onChange={setSearch} onSearch={lp.resetPage} />
        <Select
          options={[
            { value: 'updatedAt', label: '更新时间' },
            { value: 'createdAt', label: '创建时间' },
            { value: 'name', label: '客户名称' },
            { value: 'score', label: '评分' },
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
            <EmptyState icon={UserCircle} message="暂无客户" actionLabel="创建第一个客户" onAction={() => setShowCreate(true)} />
          ) : (
            <>
              {selection.selectedIds.size > 0 && (
                <BatchActionBar count={selection.selectedIds.size} onClear={selection.clearSelection}>
                  <Button size="sm" variant="outline" onClick={() => setShowBatchAssign(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> 批量分配
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBatchStage(true)}>
                    <RefreshCw className="h-3.5 w-3.5" /> 批量修改阶段
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setShowBatchDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> 批量删除
                  </Button>
                </BatchActionBar>
              )}
              <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer"
                        checked={selection.isAllSelected}
                        onChange={selection.toggleAll}
                      />
                    </TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>公司</TableHead>
                    <TableHead>阶段</TableHead>
                    <TableHead>评分</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="w-16">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn('cursor-pointer hover:bg-slate-50', selection.selectedIds.has(row.id) && 'bg-primary/5')}
                      onClick={() => router.push(`/dashboard/customers/${row.id}`)}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer"
                          checked={selection.selectedIds.has(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => selection.toggleOne(row.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.type === 'enterprise' ? '企业' : '个人'}</TableCell>
                      <TableCell>{row.phone ?? '-'}</TableCell>
                      <TableCell>{row.companyName ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={stageVariant[row.stage] ?? 'default'}>
                          {stageLabel[row.stage] ?? row.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn('font-medium', (row.score ?? 0) >= 80 ? 'text-success' : (row.score ?? 0) >= 60 ? 'text-warning' : 'text-slate-500')}>
                        {row.score ?? '-'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(row.updatedAt).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      <CreateCustomerDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false)
          queryClient.invalidateQueries({ queryKey: ['customers'] })
        }}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="客户"
        entityName={deleteTarget?.name ?? '未知客户'}
        onConfirm={() => deleteTarget && delMutation.mutate(deleteTarget.id)}
        loading={delMutation.isPending}
      />

      <Dialog open={showBatchAssign} onOpenChange={() => { setShowBatchAssign(false); setBatchOwner('') }} title="批量分配">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">将选中的 {selection.selectedIds.size} 个客户分配给：</p>
          <Select
            placeholder="选择负责人"
            options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }))}
            value={batchOwner}
            onChange={setBatchOwner}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setShowBatchAssign(false); setBatchOwner('') }}>取消</Button>
            <Button
              variant="primary"
              disabled={!batchOwner}
              loading={batchUpdateMut.isPending}
              onClick={() => batchUpdateMut.mutate({ ids: [...selection.selectedIds], data: { ownerId: batchOwner } })}
            >确认分配</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showBatchStage} onOpenChange={() => { setShowBatchStage(false); setBatchStage('') }} title="批量修改阶段">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">将选中的 {selection.selectedIds.size} 个客户阶段修改为：</p>
          <Select
            placeholder="选择阶段"
            options={stageOptions.filter((o) => o.value)}
            value={batchStage}
            onChange={setBatchStage}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setShowBatchStage(false); setBatchStage('') }}>取消</Button>
            <Button
              variant="primary"
              disabled={!batchStage}
              loading={batchUpdateMut.isPending}
              onClick={() => batchUpdateMut.mutate({ ids: [...selection.selectedIds], data: { stage: batchStage } })}
            >确认修改</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showBatchDelete} onOpenChange={() => setShowBatchDelete(false)} title="批量删除">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">确定要删除选中的 <strong>{selection.selectedIds.size}</strong> 个客户吗？此操作不可恢复。</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowBatchDelete(false)}>取消</Button>
            <Button variant="danger" loading={batchDeleteMut.isPending} onClick={() => batchDeleteMut.mutate([...selection.selectedIds])}>确认删除</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showSaveSegment} onOpenChange={() => setShowSaveSegment(false)} title="保存为客户分群">
        <form onSubmit={(e) => { e.preventDefault(); if (segmentName.trim()) handleSaveSegment() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">分群名称 *</label>
            <Input value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="例如：高分VIP客户" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <Input value={segmentDesc} onChange={(e) => setSegmentDesc(e.target.value)} placeholder="分群描述（可选）" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">颜色</label>
            <div className="flex gap-2 flex-wrap">
              {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'].map((c) => (
                <button key={c} type="button" onClick={() => setSegmentColor(c)} className="h-8 w-8 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: segmentColor === c ? '#1e293b' : 'transparent' }} />
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <p className="font-medium mb-1">当前筛选条件：</p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              {stage && <li>阶段: {stageLabel[stage] ?? stage}</li>}
              {type && <li>类型: {type === 'enterprise' ? '企业客户' : '个人客户'}</li>}
              {debouncedSearch && <li>搜索: {debouncedSearch}</li>}
              {!stage && !type && !debouncedSearch && <li className="text-slate-400">无筛选条件</li>}
            </ul>
          </div>
          {saveSegmentMut.error && <p className="text-sm text-red-600">{saveSegmentMut.error instanceof Error ? saveSegmentMut.error.message : '保存失败'}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowSaveSegment(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={saveSegmentMut.isPending}>保存</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!deleteSegmentTarget} onOpenChange={() => setDeleteSegmentTarget(null)} title="删除分群">
        <p className="text-sm text-slate-600 mb-4">确定要删除分群「{deleteSegmentTarget?.name}」吗？此操作不会删除客户数据。</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteSegmentTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteSegmentTarget && deleteSegmentMut.mutate(deleteSegmentTarget.id)} loading={deleteSegmentMut.isPending}>删除</Button>
        </div>
      </Dialog>

      {/* Duplicates Dialog */}
      <Dialog open={showDuplicates} onOpenChange={() => setShowDuplicates(false)} title="重复客户检查">
        <div className="max-h-[60vh] overflow-y-auto space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="py-8 text-center">
              <UserCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">未发现重复客户</p>
            </div>
          ) : (
            duplicateGroups.map((group) => (
              <div key={group.key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="warning">{group.reason}</Badge>
                  <Button size="sm" variant="outline" onClick={() => { setMergeGroup(group); setMergePrimaryId(group.customers[0]?.id ?? '') }}>
                    <GitMerge className="h-3.5 w-3.5" /> 合并
                  </Button>
                </div>
                <div className="space-y-1">
                  {group.customers.map((cust) => (
                    <div key={cust.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="font-medium">{cust.name}</span>
                      {cust.phone && <span className="text-slate-400">{cust.phone}</span>}
                      {cust.email && <span className="text-slate-400">{cust.email}</span>}
                      {cust.companyName && <span className="text-slate-400">{cust.companyName}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={!!mergeGroup} onOpenChange={() => { setMergeGroup(null); setMergePrimaryId('') }} title="合并客户">
        {mergeGroup && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">选择主记录（其他记录将被合并到此记录中）:</p>
            <div className="space-y-2">
              {mergeGroup.customers.map((cust) => (
                <label key={cust.id} className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  mergePrimaryId === cust.id ? 'border-primary bg-primary/5' : 'border-slate-200 hover:bg-slate-50'
                )}>
                  <input type="radio" name="primary" value={cust.id} checked={mergePrimaryId === cust.id}
                    onChange={() => setMergePrimaryId(cust.id)} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">{cust.name}</p>
                    <p className="text-xs text-slate-400">
                      {[cust.phone, cust.email, cust.companyName].filter(Boolean).join(' · ') || '-'}
                    </p>
                  </div>
                  {mergePrimaryId === cust.id && <Badge variant="primary" className="ml-auto">主记录</Badge>}
                </label>
              ))}
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-700">合并将把所有会话、商机、工单、标签转移到主记录，并删除其他重复记录。此操作不可撤销。</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setMergeGroup(null); setMergePrimaryId('') }}>取消</Button>
              <Button
                variant="primary"
                disabled={!mergePrimaryId}
                loading={mergeMut.isPending}
                onClick={() => {
                  if (!mergePrimaryId || !mergeGroup) return
                  const mergeIds = mergeGroup.customers.filter(c => c.id !== mergePrimaryId).map(c => c.id)
                  mergeMut.mutate({ primaryId: mergePrimaryId, mergeIds })
                }}
              >
                <GitMerge className="h-3.5 w-3.5" /> 确认合并
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function CreateCustomerDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', type: 'individual' as string, phone: '', email: '', wechatId: '', companyName: '', companyIndustry: '',
  })

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createCustomer(data),
    onSuccess: () => {
      toast.success('客户创建成功')
      onSuccess()
      setForm({ name: '', type: 'individual', phone: '', email: '', wechatId: '', companyName: '', companyIndustry: '' })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const data: Record<string, string> = { name: form.name, type: form.type }
    if (form.phone) data.phone = form.phone
    if (form.email) data.email = form.email
    if (form.wechatId) data.wechatId = form.wechatId
    if (form.companyName) data.companyName = form.companyName
    if (form.companyIndustry) data.companyIndustry = form.companyIndustry
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title="新建客户">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">客户名称 *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="姓名或公司名" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <Select
              options={[{ value: 'individual', label: '个人' }, { value: 'enterprise', label: '企业' }]}
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="手机号" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="邮箱" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">微信</label>
            <Input value={form.wechatId} onChange={(e) => setForm({ ...form, wechatId: e.target.value })} placeholder="微信号" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">公司名称</label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="公司名称" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">行业</label>
            <Input value={form.companyIndustry} onChange={(e) => setForm({ ...form, companyIndustry: e.target.value })} placeholder="例如：互联网、教育、金融" />
          </div>
        </div>
        {mutation.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {mutation.error instanceof Error ? mutation.error.message : '创建失败'}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>创建</Button>
        </div>
      </form>
    </Dialog>
  )
}
