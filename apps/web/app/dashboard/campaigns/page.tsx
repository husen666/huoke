'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCampaigns, createCampaign, updateCampaign, deleteCampaign, executeCampaign, type Campaign } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { downloadCsv } from '@/lib/csv'
import { Pagination } from '@/components/pagination'
import { toast } from 'sonner'
import { Plus, Megaphone, Play, Trash2, Pencil, Download } from 'lucide-react'
import { PlanGuard } from '@/components/plan-guard'
import { PageHeader, ErrorState, EmptyState, FilterBar, SearchInput, SortToggle, DeleteConfirmDialog, useListParams } from '@/components/shared'
import { useDebounce } from '@/lib/use-debounce'

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'running', label: '进行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'ended', label: '已结束' },
]

const typeOptions = [
  { value: 'mass_message', label: '群发消息' },
  { value: 'drip', label: '自动培育' },
  { value: 'event', label: '活动推广' },
  { value: 'recall', label: '老客召回' },
]

const channelOptions = [
  { value: 'wecom', label: '企微' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'sms', label: '短信' },
  { value: 'email', label: '邮件' },
]

const statusLabel: Record<string, string> = { draft: '草稿', scheduled: '已排期', running: '进行中', paused: '已暂停', ended: '已结束', completed: '已完成', cancelled: '已取消' }
const statusVariant: Record<string, 'success' | 'warning' | 'default'> = { running: 'success', draft: 'default', scheduled: 'default', paused: 'warning', ended: 'default', completed: 'default', cancelled: 'default' }
const channelLabel: Record<string, string> = { wecom: '企业微信', wechat: '微信', douyin: '抖音', xiaohongshu: '小红书', sms: '短信', email: '邮件' }
const typeLabel: Record<string, string> = { mass_message: '群发消息', nurture_sequence: '培育序列', drip: '培育序列', event_invite: '活动邀请', event: '活动邀请', ab_test: 'A/B 测试', recall: '客户召回' }

function CampaignsPageContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const lp = useListParams({ pageSize: 12, sortBy: 'createdAt', sortOrder: 'desc' })
  const [status, setStatus] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [campaignSearch, setCampaignSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Campaign | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)
  const [exporting, setExporting] = useState(false)
  const [executingId, setExecutingId] = useState<string | null>(null)

  const params: Record<string, string> = { ...lp.params }
  if (status) params.status = status
  if (typeFilter) params.type = typeFilter
  const debouncedSearch = useDebounce(campaignSearch, 400)
  if (debouncedSearch) params.search = debouncedSearch

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns', params],
    queryFn: () => getCampaigns(params),
    staleTime: 30_000,
  })
  const list: Campaign[] = (data?.data as Campaign[]) ?? []
  const total = data?.total ?? list.length

  const execMutation = useMutation({
    mutationFn: (id: string) => { setExecutingId(id); return executeCampaign(id); },
    onSuccess: () => {
      toast.success('活动已执行')
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['campaigns'] }), 4000)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
    onSettled: () => setExecutingId(null),
  })

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => {
      toast.success('活动删除成功')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await getCampaigns({ ...params, pageSize: '9999' })
      const rows = (res.data as Campaign[]) || []
      const flatRows = rows.map(d => ({
        ...d,
        sentCount: d.stats?.sentCount ?? 0,
        openedCount: d.stats?.openedCount ?? 0,
        repliedCount: d.stats?.repliedCount ?? 0,
      }))
      downloadCsv(flatRows as unknown as Record<string, unknown>[], [
        { key: 'name', label: '名称' },
        { key: 'type', label: '类型' },
        { key: 'status', label: '状态', transform: (v) => statusLabel[String(v)] ?? String(v ?? '') },
        { key: 'sentCount', label: '发送数' },
        { key: 'openedCount', label: '打开数' },
        { key: 'repliedCount', label: '回复数' },
        { key: 'createdAt', label: '创建时间' },
      ], `campaigns_${new Date().toISOString().split('T')[0]}.csv`)
      toast.success('导出成功')
    } catch { toast.error('导出失败') }
    setExporting(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="营销活动"
        subtitle="创建和管理营销推广活动"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? '导出中...' : '导出'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 创建活动
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <FilterBar>
            <Select placeholder="状态" options={statusOptions} value={status} onChange={(v) => { setStatus(v); lp.resetPage() }} className="w-[130px]" />
            <Select
              placeholder="类型"
              options={[{ value: '', label: '全部类型' }, ...typeOptions]}
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); lp.resetPage() }}
              className="w-[130px]"
            />
            <SearchInput
              placeholder="搜索活动名称..."
              value={campaignSearch}
              onChange={(v) => { setCampaignSearch(v); lp.resetPage() }}
            />
            <Select
              options={[
                { value: 'createdAt', label: '创建时间' },
                { value: 'name', label: '名称' },
                { value: 'sentCount', label: '发送数' },
              ]}
              value={lp.sortBy}
              onChange={(v) => { lp.setSortBy(v); lp.resetPage() }}
              className="w-[120px]"
            />
            <SortToggle sortOrder={lp.sortOrder} onToggle={lp.toggleSortOrder} />
          </FilterBar>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? <LoadingPage /> : isError ? (
            <ErrorState />
          ) : list.length === 0 ? (
            <EmptyState icon={Megaphone} message="暂无营销活动" actionLabel="创建第一个活动" onAction={() => setShowCreate(true)} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
                    onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Megaphone className="h-5 w-5 text-primary shrink-0" />
                        <h3 className="text-base font-semibold text-slate-800 truncate">{c.name}</h3>
                      </div>
                      <Badge variant={statusVariant[c.status] ?? 'default'}>{statusLabel[c.status] ?? c.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mb-2 line-clamp-2">{c.description || '无描述'}</p>
                    <p className="text-xs text-slate-400 mb-4">渠道: {c.channelType ? (channelLabel[c.channelType] ?? c.channelType) : '-'} · 类型: {typeLabel[c.type] ?? c.type}</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
                      <div><p className="font-semibold text-slate-800">{c.stats?.sentCount ?? 0}</p><p className="text-xs text-slate-500">已发送</p></div>
                      <div><p className="font-semibold text-slate-800">{c.stats?.openedCount ?? 0}</p><p className="text-xs text-slate-500">已打开</p></div>
                      <div><p className="font-semibold text-slate-800">{c.stats?.repliedCount ?? 0}</p><p className="text-xs text-slate-500">已回复</p></div>
                    </div>
                    {(c.stats?.sentCount ?? 0) > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>打开率</span>
                          <span>{Math.round(((c.stats?.openedCount ?? 0) / (c.stats?.sentCount ?? 1)) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.round(((c.stats?.openedCount ?? 0) / (c.stats?.sentCount ?? 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {c.status === 'draft' && (
                        <Button size="sm" variant="primary" onClick={() => execMutation.mutate(c.id)} loading={executingId === c.id && execMutation.isPending}>
                          <Play className="h-3 w-3" /> 执行
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEditItem(c)}><Pencil className="h-3 w-3" /> 编辑</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(c)}><Trash2 className="h-3 w-3" /></Button>
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

      <CampaignFormDialog
        open={showCreate || !!editItem}
        editItem={editItem}
        onClose={() => { setShowCreate(false); setEditItem(null) }}
        onSuccess={() => { setShowCreate(false); setEditItem(null); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) }}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="营销活动"
        entityName={deleteTarget?.name}
        onConfirm={() => deleteTarget && delMutation.mutate(deleteTarget.id)}
        loading={delMutation.isPending}
      />
    </div>
  )
}

function CampaignFormDialog({ open, editItem, onClose, onSuccess }: { open: boolean; editItem: Campaign | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', type: 'mass_message', channelType: 'wecom', content: '', targetCount: '', scheduledAt: '', audienceFilter: 'all' })
  const isEdit = !!editItem

  React.useEffect(() => {
    if (open && editItem) {
      setForm({
        name: editItem.name, description: editItem.description ?? '', type: editItem.type,
        channelType: editItem.channelType ?? 'wecom',
        content: (editItem as unknown as Record<string, unknown>).content as string ?? '',
        targetCount: (editItem as unknown as Record<string, unknown>).targetCount ? String((editItem as unknown as Record<string, unknown>).targetCount) : '',
        scheduledAt: editItem.scheduledAt ? editItem.scheduledAt.slice(0, 16) : '',
        audienceFilter: (editItem as unknown as Record<string, unknown>).audienceFilter as string ?? 'all',
      })
    } else if (open) {
      setForm({ name: '', description: '', type: 'mass_message', channelType: 'wecom', content: '', targetCount: '', scheduledAt: '', audienceFilter: 'all' })
    }
  }, [open, editItem])

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => isEdit && editItem ? updateCampaign(editItem.id, data) : createCampaign(data),
    onSuccess: () => {
      toast.success('活动保存成功')
      onSuccess()
      setForm({ name: '', description: '', type: 'mass_message', channelType: 'wecom', content: '', targetCount: '', scheduledAt: '', audienceFilter: 'all' })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const data: Record<string, unknown> = { name: form.name, description: form.description, type: form.type, channelType: form.channelType, audienceFilter: form.audienceFilter }
    if (form.content) data.content = form.content
    if (form.targetCount) data.targetCount = parseInt(form.targetCount, 10)
    if (form.scheduledAt) data.scheduledAt = new Date(form.scheduledAt).toISOString()
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑活动' : '创建活动'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">活动名称 *</label>
          <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="活动名称" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
          <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="活动描述" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <Select options={typeOptions} value={form.type} onChange={(v) => setForm((p) => ({ ...p, type: v }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">渠道</label>
            <Select options={channelOptions} value={form.channelType} onChange={(v) => setForm((p) => ({ ...p, channelType: v }))} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">受众筛选</label>
          <Select
            options={[
              { value: 'all', label: '全部客户/线索' },
              { value: 'new_leads', label: '新线索 (未联系)' },
              { value: 'qualified_leads', label: '已筛选线索' },
              { value: 'active_customers', label: '活跃客户' },
              { value: 'dormant_customers', label: '沉睡客户 (30天未互动)' },
              { value: 'high_value', label: '高价值客户 (评分≥80)' },
            ]}
            value={form.audienceFilter}
            onChange={(v) => setForm((p) => ({ ...p, audienceFilter: v }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">消息内容 / 模板</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="输入要发送的消息内容，支持变量如 {{客户姓名}}、{{公司名称}}..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">目标人数</label>
            <Input type="number" min="1" value={form.targetCount} onChange={(e) => setForm((p) => ({ ...p, targetCount: e.target.value }))} placeholder="预计发送人数" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">定时发送</label>
            <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} />
          </div>
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

export default function CampaignsPage() {
  return <PlanGuard feature="campaigns"><CampaignsPageContent /></PlanGuard>
}
