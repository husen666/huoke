'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWorkflows, createWorkflow, updateWorkflow, toggleWorkflow, deleteWorkflow, type Workflow } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import { Plus, GitBranch, Play, Pause, Trash2, Pencil, ArrowDown, Zap, Mail, Bell, Clock, UserPlus, Tag, MessageSquare, AlertTriangle, Search } from 'lucide-react'
import { PlanGuard } from '@/components/plan-guard'


const triggerOptions = [
  { value: 'lead_created', label: '线索创建时' },
  { value: 'lead_score_change', label: '线索评分变化时' },
  { value: 'customer_stage_change', label: '客户阶段变化时' },
  { value: 'message_received', label: '收到消息时' },
  { value: 'message_unreplied', label: '消息未回复时' },
  { value: 'scheduled', label: '定时触发' },
  { value: 'manual', label: '手动触发' },
]

const triggerLabel: Record<string, string> = Object.fromEntries(triggerOptions.map((o) => [o.value, o.label]))

interface WorkflowStep {
  id: string
  type: string
  label: string
  config: Record<string, string>
}

const ACTION_TYPES = [
  { value: 'send_message', label: '发送消息', icon: MessageSquare, fields: ['content'] },
  { value: 'send_email', label: '发送邮件', icon: Mail, fields: ['subject', 'body'] },
  { value: 'send_notification', label: '发送通知', icon: Bell, fields: ['message'] },
  { value: 'assign_agent', label: '分配客服', icon: UserPlus, fields: ['agentId'] },
  { value: 'add_tag', label: '添加标签', icon: Tag, fields: ['tagName'] },
  { value: 'update_status', label: '更新状态', icon: ArrowDown, fields: ['targetStatus'] },
  { value: 'wait', label: '等待', icon: Clock, fields: ['duration'] },
  { value: 'ai_reply', label: 'AI 自动回复', icon: Zap, fields: [] },
  { value: 'condition', label: '条件判断', icon: GitBranch, fields: ['expression'] },
]

const actionLabel: Record<string, string> = Object.fromEntries(ACTION_TYPES.map((a) => [a.value, a.label]))
const FIELD_LABELS: Record<string, string> = {
  content: '消息内容', subject: '邮件主题', body: '邮件内容',
  message: '消息内容', agentId: '客服 ID', tagName: '标签名称',
  duration: '等待时间(分钟)', targetStatus: '目标状态', expression: '条件表达式',
}

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已禁用' },
]

const triggerFilterOptions = [
  { value: '', label: '全部触发类型' },
  ...triggerOptions,
]

function WorkflowsPageContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Workflow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [triggerFilter, setTriggerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const apiParams: Record<string, string> = {}
  if (searchQuery.trim()) apiParams.search = searchQuery.trim()
  if (triggerFilter) apiParams.triggerType = triggerFilter
  if (statusFilter !== 'all') apiParams.isActive = statusFilter === 'active' ? 'true' : 'false'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflows', searchQuery, triggerFilter, statusFilter],
    queryFn: () => getWorkflows(Object.keys(apiParams).length > 0 ? apiParams : undefined),
    staleTime: 30_000,
  })
  const rawList: Workflow[] = (data?.data as Workflow[]) ?? []

  const list = rawList.filter((w) => {
    if (searchQuery.trim() && !w.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false
    if (triggerFilter && w.triggerType !== triggerFilter) return false
    if (statusFilter === 'active' && !w.isActive) return false
    if (statusFilter === 'inactive' && w.isActive) return false
    return true
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) => toggleWorkflow(id, enable),
    onSuccess: () => {
      toast.success('工作流状态已更新')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const delMut = useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      toast.success('工作流删除成功')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">工作流</h1>
          <p className="text-sm text-muted-foreground mt-0.5">自动化业务流程和触发器</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> 创建工作流
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索工作流名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="min-w-[160px]">
          <Select value={triggerFilter} onChange={(v) => setTriggerFilter(v)} options={triggerFilterOptions} />
        </div>
        <div className="min-w-[130px]">
          <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} options={statusOptions} />
        </div>
        {(searchQuery || triggerFilter || statusFilter !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setTriggerFilter(''); setStatusFilter('all') }}>
            清除筛选
          </Button>
        )}
      </div>

      {isLoading ? <LoadingPage /> : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <AlertTriangle className="h-10 w-10 mb-3 text-amber-400" />
          <p className="text-lg font-medium text-slate-600">加载数据失败</p>
          <p className="text-sm mt-1">请检查网络连接后刷新页面重试</p>
        </div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center">
          {rawList.length === 0 && !searchQuery && !triggerFilter && statusFilter === 'all' ? (
            <>
              <GitBranch className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">暂无工作流</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> 创建第一个工作流
              </Button>
            </>
          ) : (
            <>
              <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">没有匹配的工作流</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setSearchQuery(''); setTriggerFilter(''); setStatusFilter('all') }}>
                清除筛选条件
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((w) => {
            const steps = (w.definition as { nodes?: WorkflowStep[] })?.nodes ?? []
            return (
              <Card key={w.id}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 shrink-0 min-w-[240px]">
                      <GitBranch className="h-8 w-8 text-primary shrink-0" />
                      <div>
                        <p className="font-semibold">{w.name}</p>
                        <p className="text-sm text-slate-500">{triggerLabel[w.triggerType] ?? w.triggerType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 flex-wrap">
                      <Badge variant={w.isActive ? 'success' : 'default'}>
                        {w.isActive ? '已启用' : '已停用'}
                      </Badge>
                      <span className="text-sm text-slate-600">执行 {w.executionCount ?? 0} 次</span>
                      {steps.length > 0 && (
                        <span className="text-sm text-slate-500">{steps.length} 个步骤</span>
                      )}
                      {w.description && <span className="text-sm text-slate-400 truncate max-w-[200px]">{w.description}</span>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant={w.isActive ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => toggleMut.mutate({ id: w.id, enable: !w.isActive })}
                        loading={toggleMut.isPending}
                      >
                        {w.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {w.isActive ? '停用' : '启用'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/workflows/${w.id}`)}>
                        <Pencil className="h-4 w-4" /> 编辑
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(w)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {steps.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap pl-11">
                      {steps.map((step, i) => (
                        <React.Fragment key={step.id}>
                          {i > 0 && <ArrowDown className="h-3 w-3 text-slate-300" />}
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {actionLabel[step.type] ?? step.type}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </ul>
      )}

      <WorkflowFormDialog
        open={showCreate || !!editTarget}
        workflow={editTarget}
        onClose={() => { setShowCreate(false); setEditTarget(null) }}
        onSuccess={() => { setShowCreate(false); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['workflows'] }) }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除工作流「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && delMut.mutate(deleteTarget.id)} loading={delMut.isPending}>删除</Button>
        </div>
      </Dialog>
    </div>
  )
}

function WorkflowFormDialog({ open, workflow, onClose, onSuccess }: { open: boolean; workflow: Workflow | null; onClose: () => void; onSuccess: () => void }) {
  const isEdit = !!workflow
  const [form, setForm] = useState({ name: '', description: '', triggerType: 'lead_created' })
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [showAddStep, setShowAddStep] = useState(false)

  useEffect(() => {
    if (open && workflow) {
      setForm({ name: workflow.name, description: workflow.description ?? '', triggerType: workflow.triggerType })
      setSteps((workflow.definition as { nodes?: WorkflowStep[] })?.nodes ?? [])
    } else if (open) {
      setForm({ name: '', description: '', triggerType: 'lead_created' })
      setSteps([])
    }
  }, [open, workflow])

  const mutation = useMutation({
    mutationFn: () => {
      const data = { ...form, definition: { nodes: steps, edges: [] } }
      return isEdit ? updateWorkflow(workflow!.id, data) : createWorkflow(data)
    },
    onSuccess: () => {
      toast.success('工作流保存成功')
      onSuccess()
      setForm({ name: '', description: '', triggerType: 'lead_created' })
      setSteps([])
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const addStep = (type: string) => {
    const action = ACTION_TYPES.find((a) => a.value === type)
    if (!action) return
    const config: Record<string, string> = {}
    action.fields.forEach((f) => { config[f] = '' })
    setSteps([...steps, { id: `step-${Date.now()}`, type, label: action.label, config }])
    setShowAddStep(false)
  }

  const updateStepConfig = (stepId: string, field: string, value: string) => {
    setSteps(steps.map((s) => s.id === stepId ? { ...s, config: { ...s.config, [field]: value } } : s))
  }

  const removeStep = (stepId: string) => {
    setSteps(steps.filter((s) => s.id !== stepId))
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑工作流' : '创建工作流'}>
      <form onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) mutation.mutate() }} className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">工作流名称 *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：新线索自动分配" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="工作流描述" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">触发条件</label>
          <Select options={triggerOptions} value={form.triggerType} onChange={(v) => setForm({ ...form, triggerType: v })} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">执行步骤</label>
          <div className="space-y-2">
            {steps.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-300 rounded-lg">
                暂无步骤，点击下方按钮添加
              </p>
            ) : (
              steps.map((step, index) => {
                const action = ACTION_TYPES.find((a) => a.value === step.type)
                const Icon = action?.icon ?? Zap
                return (
                  <div key={step.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono w-5">{index + 1}.</span>
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{step.label}</span>
                      </div>
                      <button type="button" onClick={() => removeStep(step.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {action && action.fields.length > 0 && (
                      <div className="space-y-2 ml-7">
                        {action.fields.map((field) => (
                          <Input
                            key={field}
                            value={step.config[field] ?? ''}
                            onChange={(e) => updateStepConfig(step.id, field, e.target.value)}
                            placeholder={FIELD_LABELS[field] ?? field}
                            className="h-8 text-xs"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {showAddStep ? (
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-medium text-slate-600 mb-2">选择动作类型</p>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_TYPES.map((a) => {
                  const Icon = a.icon
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => addStep(a.value)}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium hover:bg-slate-50 transition-colors text-left"
                    >
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      {a.label}
                    </button>
                  )
                })}
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAddStep(false)}>取消</Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => setShowAddStep(true)}>
              <Plus className="h-3 w-3" /> 添加步骤
            </Button>
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

export default function WorkflowsPage() {
  return <PlanGuard feature="workflows"><WorkflowsPageContent /></PlanGuard>
}
