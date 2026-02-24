'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLeads, createLead, deleteLead, exportLeadsCsv, importLeadsCsv,
  batchUpdateLeads, batchDeleteLeads, checkLeadDuplicate, getOrgMembers,
  type Lead, type OrgMember,
} from '@/lib/api'
import { useDebounce } from '@/lib/use-debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { Plus, Users, Trash2, Download, Upload, AlertTriangle, UserPlus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pagination } from '@/components/pagination'
import { toast } from 'sonner'
import { usePlan, UpgradeBanner, handlePlanError } from '@/components/plan-guard'
import { PageHeader, ErrorState, EmptyState, SearchInput, SortToggle, FilterBar, BatchActionBar, DeleteConfirmDialog, useListParams, useRowSelection } from '@/components/shared'

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'new', label: '新线索' },
  { value: 'contacted', label: '已联系' },
  { value: 'qualified', label: '已筛选' },
  { value: 'converted', label: '已转化' },
  { value: 'disqualified', label: '已淘汰' },
]

const sourceOptions = [
  { value: '', label: '全部来源' },
  { value: 'wecom', label: '企微' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'baidu', label: '百度' },
  { value: 'manual', label: '手动录入' },
]

const statusLabel: Record<string, string> = {
  new: '新线索', contacted: '已联系', qualified: '已筛选',
  converted: '已转化', disqualified: '已淘汰',
}

const statusVariant: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  new: 'default', contacted: 'primary', qualified: 'warning', converted: 'success',
}

const sourceLabel: Record<string, string> = {
  wecom: '企微', douyin: '抖音', xiaohongshu: '小红书', baidu: '百度',
  kuaishou: '快手', bilibili: 'B站', zhihu: '知乎', manual: '手动录入',
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  return 'text-slate-500'
}

export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { isAtLimit } = usePlan()
  const lp = useListParams({ pageSize: 20 })
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(searchParams.get('action') === 'new')
  const [showImport, setShowImport] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [showBatchAssign, setShowBatchAssign] = useState(false)
  const [showBatchStatus, setShowBatchStatus] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [batchAssignee, setBatchAssignee] = useState('')
  const [batchStatus, setBatchStatus] = useState('')


  const { data: membersRes } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => getOrgMembers(),
    staleTime: 60_000,
  })
  const members: OrgMember[] = membersRes?.data ?? []

  const batchUpdateMut = useMutation({
    mutationFn: ({ ids, data }: { ids: string[]; data: Record<string, unknown> }) => batchUpdateLeads(ids, data),
    onSuccess: () => {
      toast.success('批量操作成功')
      selection.clearSelection()
      setShowBatchAssign(false)
      setShowBatchStatus(false)
      setBatchAssignee('')
      setBatchStatus('')
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  const batchDeleteMut = useMutation({
    mutationFn: (ids: string[]) => batchDeleteLeads(ids),
    onSuccess: () => {
      toast.success('批量删除成功')
      selection.clearSelection()
      setShowBatchDelete(false)
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      toast.success('线索删除成功')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  const debouncedSearch = useDebounce(search, 400)

  const params: Record<string, string> = { page: String(lp.page), pageSize: String(lp.pageSize), sortBy: lp.sortBy, sortOrder: lp.sortOrder }
  if (status) params.status = status
  if (source) params.sourcePlatform = source
  if (debouncedSearch) params.search = debouncedSearch

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', params],
    queryFn: () => getLeads(params),
    staleTime: 30_000,
  })

  const list: Lead[] = data?.data ?? []
  const total = data?.total ?? 0
  const selection = useRowSelection(list)

  return (
    <div className="space-y-4">
      <PageHeader
        title="线索管理"
        subtitle="管理和跟踪所有销售线索"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                const blob = await exportLeadsCsv()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
                a.click(); URL.revokeObjectURL(url)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : '导出失败')
              }
            }}>
              <Download className="h-4 w-4" /> 导出
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" /> 导入
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 新建线索
            </Button>
          </>
        }
      />

      {isAtLimit('leads') && <UpgradeBanner resource="leads" label="线索数量" />}

      <FilterBar>
        <Select placeholder="状态" options={statusOptions} value={status} onChange={(v) => { setStatus(v); lp.resetPage() }} className="w-[120px]" />
        <Select placeholder="来源" options={sourceOptions} value={source} onChange={(v) => { setSource(v); lp.resetPage() }} className="w-[120px]" />
        <SearchInput
          placeholder="搜索姓名、手机号、公司..."
          value={search}
          onChange={setSearch}
          onSearch={lp.resetPage}
        />
        <Select
          options={[
            { value: 'createdAt', label: '创建时间' },
            { value: 'updatedAt', label: '更新时间' },
            { value: 'score', label: '评分' },
            { value: 'contactName', label: '姓名' },
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
            <EmptyState icon={Users} message="暂无线索数据" actionLabel="创建第一条线索" onAction={() => setShowCreate(true)} />
          ) : (
            <>
              {selection.selectedIds.size > 0 && (
                <BatchActionBar count={selection.selectedIds.size} onClear={selection.clearSelection}>
                  <Button size="sm" variant="outline" onClick={() => setShowBatchAssign(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> 批量分配
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBatchStatus(true)}>
                    <RefreshCw className="h-3.5 w-3.5" /> 批量修改状态
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
                    <TableHead>姓名</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>公司</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>评分</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="w-16">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn('cursor-pointer hover:bg-slate-50', selection.selectedIds.has(row.id) && 'bg-primary/5')}
                      onClick={() => router.push(`/dashboard/leads/${row.id}`)}
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
                      <TableCell className="font-medium">{row.contactName ?? '-'}</TableCell>
                      <TableCell>{row.contactPhone ?? '-'}</TableCell>
                      <TableCell>{row.companyName ?? '-'}</TableCell>
                      <TableCell>{sourceLabel[row.sourcePlatform] ?? row.sourcePlatform}</TableCell>
                      <TableCell className={cn('font-medium', scoreColor(row.score ?? 0))}>{row.score ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[row.status] ?? 'default'}>
                          {statusLabel[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(row.createdAt).toLocaleString('zh-CN')}
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

      <ImportLeadDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); queryClient.invalidateQueries({ queryKey: ['leads'] }) }}
      />

      <CreateLeadDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false)
          queryClient.invalidateQueries({ queryKey: ['leads'] })
        }}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="线索"
        entityName={deleteTarget?.contactName || deleteTarget?.companyName || '未知'}
        onConfirm={() => deleteTarget && delMutation.mutate(deleteTarget.id)}
        loading={delMutation.isPending}
      />

      <Dialog open={showBatchAssign} onOpenChange={() => { setShowBatchAssign(false); setBatchAssignee('') }} title="批量分配">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">将选中的 {selection.selectedIds.size} 条线索分配给：</p>
          <Select
            placeholder="选择成员"
            options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }))}
            value={batchAssignee}
            onChange={setBatchAssignee}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setShowBatchAssign(false); setBatchAssignee('') }}>取消</Button>
            <Button
              variant="primary"
              disabled={!batchAssignee}
              loading={batchUpdateMut.isPending}
              onClick={() => batchUpdateMut.mutate({ ids: [...selection.selectedIds], data: { assignedTo: batchAssignee } })}
            >确认分配</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showBatchStatus} onOpenChange={() => { setShowBatchStatus(false); setBatchStatus('') }} title="批量修改状态">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">将选中的 {selection.selectedIds.size} 条线索状态修改为：</p>
          <Select
            placeholder="选择状态"
            options={statusOptions.filter((o) => o.value)}
            value={batchStatus}
            onChange={setBatchStatus}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setShowBatchStatus(false); setBatchStatus('') }}>取消</Button>
            <Button
              variant="primary"
              disabled={!batchStatus}
              loading={batchUpdateMut.isPending}
              onClick={() => batchUpdateMut.mutate({ ids: [...selection.selectedIds], data: { status: batchStatus } })}
            >确认修改</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showBatchDelete} onOpenChange={() => setShowBatchDelete(false)} title="批量删除">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">确定要删除选中的 <strong>{selection.selectedIds.size}</strong> 条线索吗？此操作不可恢复。</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowBatchDelete(false)}>取消</Button>
            <Button variant="danger" loading={batchDeleteMut.isPending} onClick={() => batchDeleteMut.mutate([...selection.selectedIds])}>确认删除</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function ImportLeadDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ imported: number } | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请选择文件')
      return importLeadsCsv(file)
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('导入成功')
        setResult(res.data)
        setTimeout(() => { onSuccess(); setFile(null); setResult(null) }, 1500)
      }
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setFile(null); setResult(null) }} title="导入线索">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          上传 CSV 文件导入线索。CSV 表头需包含：contactName, contactPhone, contactEmail, contactWechat, companyName, companyIndustry, sourcePlatform
        </p>
        <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="csv-upload"
          />
          <label htmlFor="csv-upload" className="cursor-pointer">
            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{file ? file.name : '点击选择 CSV 文件'}</p>
          </label>
        </div>
        {result && <p className="text-sm text-success">成功导入 {result.imported} 条线索！</p>}
        {mutation.error && <p className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : '导入失败'}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => { onClose(); setFile(null); setResult(null) }}>取消</Button>
          <Button variant="primary" onClick={() => mutation.mutate()} disabled={!file} loading={mutation.isPending}>开始导入</Button>
        </div>
      </div>
    </Dialog>
  )
}

function CreateLeadDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    contactName: '', contactPhone: '', contactEmail: '', contactWechat: '',
    companyName: '', sourcePlatform: 'manual',
  })
  const [duplicates, setDuplicates] = useState<Lead[]>([])
  const [dupChecked, setDupChecked] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createLead(data),
    onSuccess: () => {
      toast.success('线索创建成功')
      onSuccess()
      setForm({ contactName: '', contactPhone: '', contactEmail: '', contactWechat: '', companyName: '', sourcePlatform: 'manual' })
      setDuplicates([])
      setDupChecked(false)
    },
    onError: (e) => { if (!handlePlanError(e)) toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  const doCreate = () => {
    const data: Record<string, string> = { sourcePlatform: form.sourcePlatform }
    if (form.contactName) data.contactName = form.contactName
    if (form.contactPhone) data.contactPhone = form.contactPhone
    if (form.contactEmail) data.contactEmail = form.contactEmail
    if (form.contactWechat) data.contactWechat = form.contactWechat
    if (form.companyName) data.companyName = form.companyName
    mutation.mutate(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!form.contactName.trim()) newErrors.contactName = '请填写联系人姓名'
    if (!form.contactPhone.trim() && !form.contactEmail.trim()) newErrors.contact = '手机号和邮箱至少填写一项'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    setErrors({})
    if (dupChecked) { doCreate(); return }
    if (form.contactPhone || form.contactEmail) {
      try {
        const params: Record<string, string> = {}
        if (form.contactPhone) params.phone = form.contactPhone
        if (form.contactEmail) params.email = form.contactEmail
        const res = await checkLeadDuplicate(params)
        const dups = res.data?.duplicates ?? []
        if (dups.length > 0) {
          setDuplicates(dups)
          return
        }
      } catch { /* proceed on error */ }
    }
    doCreate()
  }

  const handleClose = () => {
    onClose()
    setDuplicates([])
    setDupChecked(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose} title="新建线索">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">姓名 <span className="text-red-500">*</span></label>
            <Input value={form.contactName} onChange={(e) => { setForm({ ...form, contactName: e.target.value }); setDuplicates([]); setDupChecked(false); setErrors(prev => { const { contactName, ...rest } = prev; return rest }) }} placeholder="联系人姓名" className={errors.contactName ? 'border-red-400' : ''} />
            {errors.contactName && <p className="text-xs text-red-500 mt-1">{errors.contactName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号 <span className="text-red-500">*</span></label>
            <Input value={form.contactPhone} onChange={(e) => { setForm({ ...form, contactPhone: e.target.value }); setDuplicates([]); setDupChecked(false); setErrors(prev => { const { contact, ...rest } = prev; return rest }) }} placeholder="手机号" className={errors.contact ? 'border-red-400' : ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱 <span className="text-red-500">*</span></label>
            <Input value={form.contactEmail} onChange={(e) => { setForm({ ...form, contactEmail: e.target.value }); setDuplicates([]); setDupChecked(false); setErrors(prev => { const { contact, ...rest } = prev; return rest }) }} placeholder="邮箱" className={errors.contact ? 'border-red-400' : ''} />
            {errors.contact && <p className="text-xs text-red-500 mt-1">{errors.contact}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">微信</label>
            <Input value={form.contactWechat} onChange={(e) => setForm({ ...form, contactWechat: e.target.value })} placeholder="微信号" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">公司名称</label>
          <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="公司名称" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">来源</label>
          <Select
            options={sourceOptions.filter((o) => o.value)}
            value={form.sourcePlatform}
            onChange={(v) => setForm({ ...form, sourcePlatform: v })}
          />
        </div>
        {duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">检测到可能重复的线索：</p>
                <ul className="mt-1 space-y-0.5 text-amber-700">
                  {duplicates.map((d) => (
                    <li key={d.id}>{d.contactName ?? '未知'} - {d.contactPhone ?? d.contactEmail ?? '无联系方式'}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-amber-600">是否继续创建？</p>
              </div>
            </div>
          </div>
        )}
        {mutation.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {mutation.error instanceof Error ? mutation.error.message : '创建失败'}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleClose}>取消</Button>
          {duplicates.length > 0 ? (
            <Button type="button" variant="primary" loading={mutation.isPending} onClick={() => { setDupChecked(true); doCreate() }}>仍然创建</Button>
          ) : (
            <Button type="submit" variant="primary" loading={mutation.isPending}>创建</Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
