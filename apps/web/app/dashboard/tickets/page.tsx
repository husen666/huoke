'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTickets, createTicket, updateTicket, deleteTicket,
  getOrgMembers, getCustomers, type Ticket, type OrgMember,
} from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { downloadCsv } from '@/lib/csv'
import { Pagination } from '@/components/pagination'
import { toast } from 'sonner'
import { PageHeader, ErrorState, EmptyState, SearchInput, SortToggle, FilterBar, DeleteConfirmDialog, useListParams } from '@/components/shared'
import { useDebounce } from '@/lib/use-debounce'
import { Plus, ClipboardList, Trash2, Pencil, FileText, Download } from 'lucide-react'

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'open', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'waiting_user', label: '待用户反馈' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

const priorityFilterOptions = [
  { value: '', label: '全部优先级' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
]

const typeOptions = [
  { value: 'general', label: '常规' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: '功能需求' },
  { value: 'inquiry', label: '咨询' },
]

const priorityOptions = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
]

const statusLabel: Record<string, string> = {
  open: '待处理', processing: '处理中', waiting_user: '待用户反馈', in_progress: '处理中', pending: '待用户反馈', resolved: '已解决', closed: '已关闭',
}
const statusVariant: Record<string, 'primary' | 'warning' | 'success' | 'default'> = {
  open: 'primary', processing: 'warning', waiting_user: 'warning', in_progress: 'warning', pending: 'warning', resolved: 'success', closed: 'default',
}

const priorityLabel: Record<string, string> = {
  low: '低', medium: '中', high: '高', urgent: '紧急',
}
const priorityVariant: Record<string, 'default' | 'primary' | 'warning' | 'danger'> = {
  low: 'default', medium: 'primary', high: 'warning', urgent: 'danger',
}

const typeLabel: Record<string, string> = {
  general: '常规', bug: 'Bug', feature: '功能需求', inquiry: '咨询',
}

const sortByOptions = [
  { value: 'updatedAt', label: '更新时间' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'priority', label: '优先级' },
  { value: 'title', label: '标题' },
]

function formatTicketNo(id?: string) {
  if (!id) return '--'
  return String(id).slice(0, 8).toUpperCase()
}

export default function TicketsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const lp = useListParams({ pageSize: 12 })
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [overdueOnly, setOverdueOnly] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Ticket | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null)
  const [exporting, setExporting] = useState(false)

  const params: Record<string, string> = { ...lp.params }
  if (status) params.status = status
  if (priority) params.priority = priority
  if (overdueOnly) params.overdue = '1'
  const debouncedSearch = useDebounce(search, 400)
  if (debouncedSearch) params.search = debouncedSearch

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tickets', params],
    queryFn: () => getTickets(params),
    staleTime: 30_000,
  })
  const list: Ticket[] = (data?.data as Ticket[]) ?? []
  const total = data?.total ?? list.length

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteTicket(id),
    onSuccess: () => {
      toast.success('工单已删除')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const exportParams: Record<string, string> = { pageSize: '9999' }
      if (status) exportParams.status = status
      if (priority) exportParams.priority = priority
      if (search) exportParams.search = search
      const res = await getTickets(exportParams)
      const allTickets = (res?.data ?? []) as Ticket[]
      downloadCsv(allTickets, [
        { key: 'id', label: '工单号', transform: (v) => v ? `#${formatTicketNo(String(v))}` : '' },
        { key: 'id', label: 'ID' },
        { key: 'title', label: '标题' },
        { key: 'status', label: '状态', transform: (v) => statusLabel[String(v)] ?? String(v ?? '') },
        { key: 'priority', label: '优先级', transform: (v) => priorityLabel[String(v)] ?? String(v ?? '') },
        { key: 'createdAt', label: '创建时间', transform: (v) => v ? new Date(String(v)).toLocaleString('zh-CN') : '' },
      ], `tickets-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success('导出成功')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="工单管理"
        subtitle="管理和跟踪所有客户工单"
        actions={<>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" /> {exporting ? '导出中...' : '导出'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> 创建工单
          </Button>
        </>}
      />

      <FilterBar>
        <Select options={statusOptions} value={status} onChange={(v) => { setStatus(v); lp.resetPage() }} className="w-[120px]" />
        <Select options={priorityFilterOptions} value={priority} onChange={(v) => { setPriority(v); lp.resetPage() }} className="w-[120px]" />
        <Select options={[{ value: '', label: 'SLA: 全部' }, { value: '1', label: 'SLA: 已超时' }]} value={overdueOnly} onChange={(v) => { setOverdueOnly(v); lp.resetPage() }} className="w-[130px]" />
        <SearchInput placeholder="搜索工单标题..." value={search} onChange={(v) => { setSearch(v); lp.resetPage() }} />
        <Select options={sortByOptions} value={lp.sortBy} onChange={(v) => { lp.setSortBy(v); lp.resetPage() }} className="w-[120px]" />
        <SortToggle sortOrder={lp.sortOrder} onToggle={lp.toggleSortOrder} />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <LoadingPage /> : isError ? (
            <ErrorState />
          ) : list.length === 0 ? (
            <EmptyState icon={ClipboardList} message="暂无工单" actionLabel="创建第一个工单" onAction={() => setShowCreate(true)} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">工单号</TableHead>
                      <TableHead className="pl-5">工单标题</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>SLA截止</TableHead>
                      <TableHead>负责人</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="w-20 pr-5">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((t) => (
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                        onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                      >
                        <TableCell className="pl-5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                          #{formatTicketNo(t.id)}
                        </TableCell>
                        <TableCell className="pl-5 font-medium text-slate-800 max-w-[280px] truncate">{t.title}</TableCell>
                        <TableCell className="text-slate-600 text-sm">{typeLabel[t.type] ?? t.type}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[t.status] ?? 'default'} className="text-[11px]">
                            {statusLabel[t.status] ?? t.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant[t.priority] ?? 'default'} className="text-[11px]">
                            {priorityLabel[t.priority] ?? t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {t.slaResolveDueAt ? (
                            <span className={new Date(t.slaResolveDueAt).getTime() < Date.now() && !['resolved', 'closed'].includes(t.status) ? 'text-red-600 font-medium' : 'text-slate-500'}>
                              {new Date(t.slaResolveDueAt).toLocaleString('zh-CN')}
                            </span>
                          ) : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm">{t.assigneeName ?? <span className="text-slate-400">未指派</span>}</TableCell>
                        <TableCell className="text-slate-500 text-xs whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell className="pr-5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => setEditItem(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="编辑">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="删除">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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

      <TicketFormDialog
        open={showCreate || !!editItem}
        editItem={editItem}
        onClose={() => { setShowCreate(false); setEditItem(null) }}
        onSuccess={() => { setShowCreate(false); setEditItem(null); queryClient.invalidateQueries({ queryKey: ['tickets'] }) }}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="工单"
        entityName={deleteTarget?.title}
        onConfirm={() => deleteTarget && delMutation.mutate(deleteTarget.id)}
        loading={delMutation.isPending}
      />
    </div>
  )
}

const TICKET_TEMPLATES = [
  { name: '客户投诉', type: 'general', priority: 'high', description: '客户投诉问题描述：\n\n涉及订单/产品：\n\n期望解决方案：' },
  { name: 'Bug 报告', type: 'bug', priority: 'high', description: '问题描述：\n\n复现步骤：\n1. \n2. \n3. \n\n预期行为：\n\n实际行为：' },
  { name: '功能需求', type: 'feature', priority: 'medium', description: '需求描述：\n\n使用场景：\n\n期望效果：' },
  { name: '咨询工单', type: 'inquiry', priority: 'low', description: '咨询内容：\n\n' },
]

function TicketFormDialog({ open, editItem, onClose, onSuccess }: { open: boolean; editItem: Ticket | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', type: 'general', priority: 'medium',
    assigneeId: '', customerId: '', dueDate: '',
  })
  const isEdit = !!editItem

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState<{ id: string; name: string }[]>([])
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [selectedCustomerName, setSelectedCustomerName] = useState('')
  const customerDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerOptions([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await getCustomers({ search: customerSearch, pageSize: '10' })
        setCustomerOptions((res.data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
      } catch { setCustomerOptions([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data: membersRes } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => getOrgMembers(),
    staleTime: 60_000,
  })
  const members: OrgMember[] = membersRes?.data ?? []
  const memberOptions = [{ value: '', label: '未指派' }, ...members.map((m) => ({ value: m.id, label: m.name }))]

  const applyTemplate = (tpl: typeof TICKET_TEMPLATES[number]) => {
    setForm(prev => ({
      ...prev,
      type: tpl.type,
      priority: tpl.priority,
      description: tpl.description,
    }))
  }

  React.useEffect(() => {
    if (open && editItem) {
      setForm({
        title: editItem.title,
        description: editItem.description ?? '',
        type: editItem.type,
        priority: editItem.priority,
        assigneeId: editItem.assigneeId ?? '',
        customerId: editItem.customerId ?? '',
        dueDate: editItem.dueDate ? editItem.dueDate.slice(0, 16) : '',
      })
      setSelectedCustomerName(editItem.customerName ?? '')
      setCustomerSearch('')
    } else if (open) {
      setForm({ title: '', description: '', type: 'general', priority: 'medium', assigneeId: '', customerId: '', dueDate: '' })
      setSelectedCustomerName('')
      setCustomerSearch('')
    }
  }, [open, editItem])

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => isEdit && editItem ? updateTicket(editItem.id, data) : createTicket(data),
    onSuccess: () => {
      toast.success(isEdit ? '工单已更新' : '工单已创建')
      onSuccess()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const data: Record<string, unknown> = {
      title: form.title,
      description: form.description || undefined,
      type: form.type,
      priority: form.priority,
    }
    if (form.assigneeId) data.assigneeId = form.assigneeId
    if (form.customerId) data.customerId = form.customerId
    if (form.dueDate) data.dueDate = new Date(form.dueDate).toISOString()
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑工单' : '创建工单'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">选择模板</label>
            <div className="grid grid-cols-2 gap-2">
              {TICKET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700">{tpl.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">工单标题 *</label>
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="输入工单标题" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="工单详细描述..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <Select options={typeOptions} value={form.type} onChange={(v) => setForm((p) => ({ ...p, type: v }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
            <Select options={priorityOptions} value={form.priority} onChange={(v) => setForm((p) => ({ ...p, priority: v }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">负责人</label>
            <Select options={memberOptions} value={form.assigneeId} onChange={(v) => setForm((p) => ({ ...p, assigneeId: v }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
            <Input type="datetime-local" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
          </div>
        </div>
        <div ref={customerDropdownRef} className="relative">
          <label className="block text-sm font-medium text-slate-700 mb-1">关联客户（可选）</label>
          <Input
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value)
              setCustomerDropdownOpen(true)
              if (!e.target.value.trim()) {
                setForm((p) => ({ ...p, customerId: '' }))
                setSelectedCustomerName('')
              }
            }}
            onFocus={() => { if (customerSearch.trim()) setCustomerDropdownOpen(true) }}
            placeholder={selectedCustomerName || '搜索客户名称...'}
          />
          {selectedCustomerName && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-slate-500">已选：{selectedCustomerName}</span>
              <button type="button" onClick={() => {
                setForm((p) => ({ ...p, customerId: '' }))
                setSelectedCustomerName('')
                setCustomerSearch('')
              }} className="text-xs text-red-400 hover:text-red-500">清除</button>
            </div>
          )}
          {customerDropdownOpen && customerOptions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
              {customerOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setForm((p) => ({ ...p, customerId: c.id }))
                    setSelectedCustomerName(c.name)
                    setCustomerSearch('')
                    setCustomerDropdownOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
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
