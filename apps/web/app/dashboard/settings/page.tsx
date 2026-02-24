'use client'

import React, { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getUserSettings, saveUserSettings,
  getTags, createTag, updateTag, deleteTag,
  getAuditLogs,
  exportLeadsCsv, exportCustomersCsv, exportDealsCsv,
  getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook,
  type Tag, type AuditLog, type Webhook,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Pagination } from '@/components/pagination'
import { PlanGuard, usePlan } from '@/components/plan-guard'
import {
  Bell, CheckCircle, AlertCircle, Tag as TagIcon, Plus, Trash2, Pencil,
  ScrollText, Database, Link2, Search, CalendarDays, Settings, Lock,
} from 'lucide-react'

type SettingsTab = 'notify' | 'tags' | 'data' | 'webhook' | 'auditlog'

const SETTING_GROUPS = [
  {
    label: '通用设置',
    items: [
      { id: 'notify' as const, label: '消息偏好', icon: Bell },
      { id: 'tags' as const, label: '标签管理', icon: TagIcon },
      { id: 'data' as const, label: '数据导出', icon: Database, feature: 'export' },
    ],
  },
  {
    label: '开发者',
    items: [
      { id: 'webhook' as const, label: 'Webhook', icon: Link2, feature: 'webhooks' },
      { id: 'auditlog' as const, label: '操作日志', icon: ScrollText },
    ],
  },
]

function GatedContent({ feature, children }: { feature?: string; children: React.ReactNode }) {
  if (!feature) return <>{children}</>
  return <PlanGuard feature={feature}>{children}</PlanGuard>
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('notify')
  const { hasFeature } = usePlan()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> 系统设置
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">管理消息偏好、标签、数据导出和 Webhook 等系统配置</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 hidden lg:block">
          <div className="sticky top-20 space-y-5">
            {SETTING_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-2">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = tab === item.id
                    const locked = !!item.feature && !hasFeature(item.feature)
                    return (
                      <button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        className={cn(
                          'flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          locked && 'opacity-60',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                        {locked && <Lock className="ml-auto h-3 w-3 text-slate-400" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Mobile tabs */}
        <div className="lg:hidden w-full">
          <Select
            value={tab}
            onChange={(v) => setTab(v as SettingsTab)}
            options={SETTING_GROUPS.flatMap(g => g.items.map(i => ({ value: i.id, label: `${g.label} · ${i.label}` })))}
            className="mb-4"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {tab === 'notify' && <NotifySection />}
          {tab === 'tags' && <TagsSection />}
          {tab === 'data' && <GatedContent feature="export"><DataSection /></GatedContent>}
          {tab === 'webhook' && <GatedContent feature="webhooks"><WebhookSection /></GatedContent>}
          {tab === 'auditlog' && <AuditLogSection />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notify Section
// ---------------------------------------------------------------------------

function NotifySection() {
  const queryClient = useQueryClient()
  const { data: settingsRes, isLoading, isError } = useQuery({ queryKey: ['user-settings'], queryFn: () => getUserSettings() })
  const notifySettings = (settingsRes?.data as Record<string, unknown>)?.notifications as Record<string, boolean> | undefined
  const [notify, setNotify] = useState({ email: true, sms: false, wecom: true, browser: true })
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (notifySettings) setNotify((prev) => ({ ...prev, ...notifySettings })) }, [notifySettings])

  const mutation = useMutation({
    mutationFn: () => saveUserSettings({ notifications: notify }),
    onSuccess: () => { toast.success('消息设置已保存'); queryClient.invalidateQueries({ queryKey: ['user-settings'] }); setSaved(true); setTimeout(() => setSaved(false), 3000) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  if (isLoading) return <LoadingPage />
  if (isError) return <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">消息设置加载失败，请刷新重试</p></div>

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>消息偏好</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {([['email', '邮件消息', '通过邮件接收系统消息'], ['sms', '短信消息', '通过短信接收重要消息'], ['wecom', '企微消息', '通过企业微信接收消息'], ['browser', '浏览器消息', '通过浏览器推送接收消息']] as const).map(([key, label, desc]) => (
          <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
            <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
            <input type="checkbox" checked={notify[key]} onChange={(e) => setNotify((p) => ({ ...p, [key]: e.target.checked }))} className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary" />
          </label>
        ))}
        {saved && <p className="text-sm text-success flex items-center gap-1"><CheckCircle className="h-4 w-4" /> 已保存</p>}
        <Button variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}>保存设置</Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tags Section
// ---------------------------------------------------------------------------

const TAG_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1']

function TagsSection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Tag | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [newCategory, setNewCategory] = useState('')

  const { data: tagsRes, isLoading, isError } = useQuery({ queryKey: ['tags'], queryFn: () => getTags(), staleTime: 5 * 60_000 })
  const tags: Tag[] = tagsRes?.data ?? []

  const createMut = useMutation({
    mutationFn: () => createTag({ name: newName, color: newColor, category: newCategory || undefined }),
    onSuccess: () => { toast.success('标签已创建'); queryClient.invalidateQueries({ queryKey: ['tags'] }); setNewName(''); setNewColor(TAG_COLORS[0]); setNewCategory(''); setShowCreate(false) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) => updateTag(id, { name, color }),
    onSuccess: () => { toast.success('标签已更新'); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['tags'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => { toast.success('标签已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['tags'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const grouped = tags.reduce<Record<string, Tag[]>>((acc, t) => { const cat = t.category || '默认'; if (!acc[cat]) acc[cat] = []; acc[cat].push(t); return acc }, {})

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>标签管理</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> 新建标签</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingPage /> : isError ? (
          <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">标签加载失败</p></div>
        ) : tags.length === 0 ? (
          <div className="py-8 text-center"><TagIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无标签</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3" /> 创建第一个</Button></div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, catTags]) => (
              <div key={category}>
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {catTags.map((tag) => (
                    <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium group"
                      style={{ backgroundColor: `${tag.color ?? '#3b82f6'}20`, color: tag.color ?? '#3b82f6' }}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color ?? '#3b82f6' }} />
                      {tag.name}
                      <button type="button" onClick={() => setEditTarget(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity" title="编辑"><Pencil className="h-3 w-3" /></button>
                      <button type="button" onClick={() => setDeleteTarget(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity" title="删除"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)} title="新建标签">
        <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMut.mutate() }} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">标签名 *</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="标签名称" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">颜色</label>
            <div className="flex gap-2 flex-wrap">{TAG_COLORS.map((color) => (
              <button key={color} type="button" onClick={() => setNewColor(color)} className="h-8 w-8 rounded-full border-2 transition-all"
                style={{ backgroundColor: color, borderColor: newColor === color ? '#1e293b' : 'transparent' }} />
            ))}</div></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="例如：优先级" /></div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={createMut.isPending}>创建</Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除标签「{deleteTarget?.name}」吗？此操作不可恢复。</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => { if (deleteTarget) deleteMut.mutate(deleteTarget.id) }} loading={deleteMut.isPending}>删除</Button>
        </div>
      </Dialog>
      <EditTagDialog open={!!editTarget} tag={editTarget} onClose={() => setEditTarget(null)}
        onSubmit={(n, c) => updateMut.mutate({ id: editTarget!.id, name: n, color: c })} isPending={updateMut.isPending} error={updateMut.error} />
    </Card>
  )
}

function EditTagDialog({ open, tag, onClose, onSubmit, isPending, error }: {
  open: boolean; tag: Tag | null; onClose: () => void; onSubmit: (name: string, color: string) => void; isPending: boolean; error: Error | null
}) {
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(TAG_COLORS[0])
  useEffect(() => { if (open && tag) { setEditName(tag.name); setEditColor(tag.color ?? TAG_COLORS[0]) } }, [open, tag])

  return (
    <Dialog open={open} onOpenChange={onClose} title="编辑标签">
      <form onSubmit={(e) => { e.preventDefault(); if (editName.trim()) onSubmit(editName.trim(), editColor) }} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-700 mb-1">标签名 *</label>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="标签名称" required /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">颜色</label>
          <div className="flex gap-2 flex-wrap">{TAG_COLORS.map((color) => (
            <button key={color} type="button" onClick={() => setEditColor(color)} className="h-8 w-8 rounded-full border-2 transition-all"
              style={{ backgroundColor: color, borderColor: editColor === color ? '#1e293b' : 'transparent' }} />
          ))}</div></div>
        {error && <p className="text-sm text-red-600">{error instanceof Error ? error.message : '更新失败'}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={isPending}>保存</Button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Data Export Section
// ---------------------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

function ExportRow({ label, desc, loading, onClick }: { label: string; desc: string; loading: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
      <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
      <Button variant="outline" size="sm" loading={loading} onClick={onClick}>导出 CSV</Button>
    </div>
  )
}

function DataSection() {
  const [exporting, setExporting] = useState<string | null>(null)
  const handleExport = async (type: string, fn: () => Promise<void>) => {
    setExporting(type); try { await fn(); toast.success(`${type}导出成功`) } catch { toast.error('导出失败') } finally { setExporting(null) }
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>数据导出</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">将数据导出为 CSV 文件，可在 Excel 中打开查看</p>
        <div className="space-y-3">
          <ExportRow label="线索数据" desc="导出所有线索" loading={exporting === '线索'}
            onClick={() => handleExport('线索', async () => { const blob = await exportLeadsCsv(); downloadBlob(blob, `leads-${new Date().toISOString().slice(0, 10)}.csv`) })} />
          <ExportRow label="客户数据" desc="导出所有客户" loading={exporting === '客户'}
            onClick={() => handleExport('客户', async () => { const blob = await exportCustomersCsv(); downloadBlob(blob, `customers-${new Date().toISOString().slice(0, 10)}.csv`) })} />
          <ExportRow label="商机数据" desc="导出所有商机" loading={exporting === '商机'}
            onClick={() => handleExport('商机', async () => { const blob = await exportDealsCsv(); downloadBlob(blob, `deals-${new Date().toISOString().slice(0, 10)}.csv`) })} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Audit Log Section
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = { create: '创建', update: '更新', delete: '删除', login: '登录', export: '导出', import: '导入' }
const RESOURCE_LABELS: Record<string, string> = {
  lead: '线索', customer: '客户', conversation: '会话', campaign: '活动', workflow: '工作流',
  deal: '商机', knowledge_base: '知识库', document: '文档', tag: '标签', channel: '渠道',
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: '全部操作' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'export', label: '导出' },
  { value: 'login', label: '登录' },
]

const RESOURCE_FILTER_OPTIONS = [
  { value: '', label: '全部资源' },
  { value: 'lead', label: '线索' },
  { value: 'customer', label: '客户' },
  { value: 'deal', label: '商机' },
  { value: 'ticket', label: '工单' },
  { value: 'campaign', label: '活动' },
  { value: 'workflow', label: '工作流' },
]

function AuditLogSection() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const params: Record<string, string> = { page: String(page), pageSize: '20' }
  if (actionFilter) params.action = actionFilter
  if (resourceFilter) params.resourceType = resourceFilter
  if (startDate) params.startDate = startDate
  if (endDate) params.endDate = endDate

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, resourceFilter, startDate, endDate],
    queryFn: () => getAuditLogs(params),
  })
  const logs: AuditLog[] = data?.data ?? []
  const total = (data as unknown as { total?: number })?.total ?? 0

  const handleFilterChange = () => setPage(1)

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> 操作日志</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3 mb-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">操作类型</label>
            <Select value={actionFilter} onChange={(v) => { setActionFilter(v); handleFilterChange() }} options={ACTION_FILTER_OPTIONS} />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">资源类型</label>
            <Select value={resourceFilter} onChange={(v) => { setResourceFilter(v); handleFilterChange() }} options={RESOURCE_FILTER_OPTIONS} />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><CalendarDays className="h-3 w-3" />开始日期</label>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); handleFilterChange() }} className="h-9" />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><CalendarDays className="h-3 w-3" />结束日期</label>
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); handleFilterChange() }} className="h-9" />
          </div>
          {(actionFilter || resourceFilter || startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setActionFilter(''); setResourceFilter(''); setStartDate(''); setEndDate(''); setPage(1) }}>
              清除筛选
            </Button>
          )}
        </div>

        {isLoading ? <LoadingPage /> : isError ? (
          <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">操作日志加载失败，请刷新重试</p></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8">
            <Search className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">暂无匹配的操作日志</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>操作</TableHead>
                  <TableHead>资源类型</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</TableCell>
                    <TableCell><span className="font-medium">{log.userName ?? '-'}</span>{log.userEmail && <span className="text-xs text-slate-400 ml-1">({log.userEmail})</span>}</TableCell>
                    <TableCell><Badge variant={log.action === 'delete' ? 'danger' : log.action === 'create' ? 'success' : 'default'}>{ACTION_LABELS[log.action] ?? log.action}</Badge></TableCell>
                    <TableCell className="text-slate-600">{RESOURCE_LABELS[log.resourceType] ?? log.resourceType}</TableCell>
                    <TableCell className="text-xs text-slate-400">{log.ipAddress ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              pageSize={20}
              total={total}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Webhook Section
// ---------------------------------------------------------------------------

const WEBHOOK_EVENTS = [
  { key: 'conversation_new', label: '新会话' },
  { key: 'conversation_resolved', label: '会话解决' },
  { key: 'message_new', label: '新消息' },
  { key: 'ticket_created', label: '工单创建' },
  { key: 'ticket_resolved', label: '工单解决' },
  { key: 'lead_new', label: '新线索' },
  { key: 'customer_new', label: '新客户' },
]

function WebhookSection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Webhook | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null)

  const { data: webhooksRes, isLoading, isError } = useQuery({
    queryKey: ['webhooks'], queryFn: () => getWebhooks(), staleTime: 5 * 60_000,
  })
  const webhooks: Webhook[] = webhooksRes?.data ?? []

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createWebhook(data),
    onSuccess: () => { toast.success('Webhook 创建成功'); setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['webhooks'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateWebhook(id, data),
    onSuccess: () => { toast.success('Webhook 更新成功'); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['webhooks'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => { toast.success('Webhook 已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['webhooks'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })
  const testMut = useMutation({
    mutationFn: (id: string) => testWebhook(id),
    onSuccess: () => toast.success('测试请求已发送'),
    onError: (e) => toast.error(e instanceof Error ? e.message : '测试失败'),
  })

  const handleToggle = (wh: Webhook) => { updateMut.mutate({ id: wh.id, data: { isActive: !wh.isActive } }) }

  return (
    <>
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Webhook 管理</CardTitle>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> 添加 Webhook</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <LoadingPage /> : isError ? (
            <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">Webhook 加载失败</p></div>
          ) : webhooks.length === 0 ? (
            <div className="py-8 text-center"><Link2 className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂未配置 Webhook</p></div>
          ) : (
            webhooks.map((wh) => (
              <div key={wh.id} className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{wh.name}</p>
                    <Badge variant={wh.isActive ? 'success' : 'default'}>{wh.isActive ? '启用' : '禁用'}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => testMut.mutate(wh.id)} loading={testMut.isPending}>测试</Button>
                    <Button variant="outline" size="sm" onClick={() => setEditTarget(wh)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(wh)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <p className="text-sm text-slate-500 truncate mb-2">{wh.url}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {wh.events.map((ev) => (
                    <Badge key={ev} variant="default" className="text-xs">{WEBHOOK_EVENTS.find((e) => e.key === ev)?.label ?? ev}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={wh.isActive} onChange={() => handleToggle(wh)} className="h-4 w-4 rounded border-slate-300" />
                    <span>活跃</span>
                  </label>
                  {wh.lastTriggeredAt && <span>上次触发: {new Date(wh.lastTriggeredAt).toLocaleString('zh-CN')}</span>}
                  {wh.failCount > 0 && <span className="text-red-400">失败: {wh.failCount} 次</span>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <WebhookFormDialog open={showCreate || !!editTarget} webhook={editTarget}
        onClose={() => { setShowCreate(false); setEditTarget(null) }}
        onSubmit={(data) => { if (editTarget) updateMut.mutate({ id: editTarget.id, data }); else createMut.mutate(data) }}
        isPending={createMut.isPending || updateMut.isPending} error={createMut.error || updateMut.error} />
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除 Webhook「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button>
        </div>
      </Dialog>
    </>
  )
}

function WebhookFormDialog({ open, webhook, onClose, onSubmit, isPending, error }: {
  open: boolean; webhook: Webhook | null; onClose: () => void
  onSubmit: (data: Record<string, unknown>) => void; isPending: boolean; error: Error | null
}) {
  const isEdit = !!webhook
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [secret, setSecret] = useState('')

  useEffect(() => {
    if (open && webhook) { setName(webhook.name); setUrl(webhook.url); setEvents(webhook.events); setSecret('') }
    else if (open) { setName(''); setUrl(''); setEvents([]); setSecret('') }
  }, [open, webhook])

  const toggleEvent = (key: string) => { setEvents((prev) => prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]) }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑 Webhook' : '添加 Webhook'}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, url, events, ...(secret ? { secret } : {}) }) }} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：CRM 回调" required /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">URL</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" required /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">触发事件</label>
          <div className="flex flex-wrap gap-2 mt-1">{WEBHOOK_EVENTS.map((ev) => (
            <label key={ev.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={events.includes(ev.key)} onChange={() => toggleEvent(ev.key)} className="h-4 w-4 rounded border-slate-300" /> {ev.label}
            </label>
          ))}</div></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">密钥（可选）</label>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="用于签名验证" /></div>
        {error && <p className="text-sm text-red-600">{error instanceof Error ? error.message : '操作失败'}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={isPending}>{isEdit ? '保存' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
