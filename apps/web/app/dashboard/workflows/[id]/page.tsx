'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWorkflow, updateWorkflow, toggleWorkflow, getWorkflowRuns, executeWorkflow, type Workflow } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { ArrowLeft, ArrowDown, Save, Play, Pause, Plus, Trash2, ChevronUp, ChevronDown, Activity, Clock, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Breadcrumb } from '@/components/breadcrumb'

const triggerLabels: Record<string, string> = {
  lead_created: '线索创建时',
  lead_score_change: '线索评分变化时',
  customer_stage_change: '客户阶段变化时',
  message_received: '收到消息时',
  message_unreplied: '消息未回复时',
  scheduled: '定时触发',
  manual: '手动触发',
  new_lead: '线索创建时',
  lead_status_change: '线索状态变更',
  new_conversation: '新会话创建',
}

const actionTypes = [
  { value: 'send_message', label: '发送消息' },
  { value: 'send_email', label: '发送邮件' },
  { value: 'send_notification', label: '发送消息' },
  { value: 'assign_agent', label: '分配客服' },
  { value: 'assign_lead', label: '分配线索' },
  { value: 'update_status', label: '更新状态' },
  { value: 'add_tag', label: '添加标签' },
  { value: 'wait', label: '等待延时' },
  { value: 'ai_reply', label: 'AI 自动回复' },
  { value: 'condition', label: '条件判断' },
]

interface WorkflowStep {
  id: string
  type: string
  label: string
  config: Record<string, string>
}

export default function WorkflowDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => getWorkflow(id),
  })

  const { data: runsData } = useQuery({
    queryKey: ['workflow-runs', id],
    queryFn: () => getWorkflowRuns(id),
  })
  const runs = runsData?.data || []

  const workflow = res?.data as Workflow | undefined

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState('')
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (workflow && !initialized) {
      setName(workflow.name)
      setDescription(workflow.description ?? '')
      setTriggerType(workflow.triggerType)
      const def = workflow.definition as { nodes?: WorkflowStep[] } | null
      setSteps(def?.nodes ?? [])
      setInitialized(true)
    }
  }, [workflow, initialized])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateWorkflow(id, {
        name,
        description: description || null,
        triggerType,
        definition: { nodes: steps, edges: [] },
      }),
    onSuccess: () => {
      toast.success('工作流保存成功')
      queryClient.invalidateQueries({ queryKey: ['workflow', id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const toggleMutation = useMutation({
    mutationFn: () => toggleWorkflow(id, !workflow?.isActive),
    onSuccess: () => {
      toast.success(workflow?.isActive ? '工作流已停用' : '工作流已启用')
      queryClient.invalidateQueries({ queryKey: ['workflow', id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: 'send_notification', label: '新步骤', config: {} },
    ])
  }, [])

  const removeStep = useCallback((stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId))
  }, [])

  const moveStep = useCallback((index: number, direction: 'up' | 'down') => {
    setSteps((prev) => {
      const next = [...prev]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  const updateStep = useCallback((stepId: string, field: string, value: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? field === 'type' || field === 'label'
            ? { ...s, [field]: value }
            : { ...s, config: { ...s.config, [field]: value } }
          : s
      )
    )
  }, [])

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-500">加载失败，请重试</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/workflows')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-slate-500">工作流不存在</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/workflows')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: '工作流', href: '/dashboard/workflows' }, { label: workflow.name }]} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/workflows')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{workflow.name}</h1>
          <Badge variant={workflow.isActive ? 'success' : 'secondary'}>
            {workflow.isActive ? '运行中' : '已停用'}
          </Badge>
          {(workflow.executionCount ?? 0) > 0 && (
            <Badge variant="primary">
              <Zap className="h-3 w-3 mr-1" />
              已执行 {workflow.executionCount} 次
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {workflow.lastExecutedAt && (
            <span className="text-xs text-slate-500 flex items-center gap-1 mr-2">
              <Clock className="h-3.5 w-3.5" />
              上次执行: {new Date(workflow.lastExecutedAt).toLocaleString('zh-CN')}
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
          >
            {workflow.isActive ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {workflow.isActive ? '停用' : '启用'}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">名称</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">描述</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={3} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">触发条件</label>
                <Select
                  options={Object.entries(triggerLabels).map(([value, label]) => ({ value, label }))}
                  value={triggerType}
                  onChange={setTriggerType}
                  className="mt-1"
                />
              </div>
              <div className="pt-2 text-xs text-slate-500 space-y-1">
                <p>执行次数: {workflow.executionCount ?? 0}</p>
                {workflow.lastExecutedAt && (
                  <p>上次执行: {new Date(workflow.lastExecutedAt).toLocaleString('zh-CN')}</p>
                )}
                <p>创建时间: {new Date(workflow.createdAt).toLocaleString('zh-CN')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>执行步骤</CardTitle>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-1" /> 添加步骤
              </Button>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <p>暂无步骤</p>
                  <p className="text-xs mt-1">点击"添加步骤"开始构建工作流</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {steps.map((step, idx) => (
                    <div key={step.id}>
                      {idx > 0 && (
                        <div className="flex justify-center py-1">
                          <ArrowDown className="h-5 w-5 text-slate-300" />
                        </div>
                      )}
                    <div
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-col items-center gap-1 pt-1 text-slate-400">
                        <button type="button" onClick={() => moveStep(idx, 'up')} disabled={idx === 0} className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-xs font-mono w-6 text-center font-semibold text-primary">{idx + 1}</span>
                        <button type="button" onClick={() => moveStep(idx, 'down')} disabled={idx === steps.length - 1} className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-slate-500">动作类型</label>
                            <Select
                              options={actionTypes}
                              value={step.type}
                              onChange={(v) => updateStep(step.id, 'type', v)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">步骤名称</label>
                            <Input
                              value={step.label}
                              onChange={(e) => updateStep(step.id, 'label', e.target.value)}
                              className="mt-1"
                              placeholder="描述此步骤..."
                            />
                          </div>
                        </div>
                        {step.type === 'send_message' && (
                          <div>
                            <label className="text-xs text-slate-500">消息内容</label>
                            <Textarea
                              value={step.config.message ?? ''}
                              onChange={(e) => updateStep(step.id, 'message', e.target.value)}
                              className="mt-1"
                              rows={2}
                              placeholder="输入要发送的消息..."
                            />
                          </div>
                        )}
                        {step.type === 'wait' && (
                          <div>
                            <label className="text-xs text-slate-500">等待时间（分钟）</label>
                            <Input
                              type="number"
                              value={step.config.minutes ?? ''}
                              onChange={(e) => updateStep(step.id, 'minutes', e.target.value)}
                              className="mt-1"
                              placeholder="例如: 30"
                            />
                          </div>
                        )}
                        {step.type === 'condition' && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs text-slate-500">字段</label>
                                <Select
                                  options={[
                                    { value: 'lead.score', label: '线索评分' },
                                    { value: 'lead.status', label: '线索状态' },
                                    { value: 'lead.sourcePlatform', label: '来源平台' },
                                    { value: 'customer.stage', label: '客户阶段' },
                                    { value: 'conversation.channel', label: '会话渠道' },
                                    { value: 'message.content', label: '消息内容' },
                                  ]}
                                  value={step.config.condField ?? ''}
                                  onChange={(v) => updateStep(step.id, 'condField', v)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">运算符</label>
                                <Select
                                  options={[
                                    { value: 'eq', label: '等于' },
                                    { value: 'neq', label: '不等于' },
                                    { value: 'gt', label: '大于' },
                                    { value: 'lt', label: '小于' },
                                    { value: 'gte', label: '大于等于' },
                                    { value: 'contains', label: '包含' },
                                  ]}
                                  value={step.config.condOp ?? ''}
                                  onChange={(v) => updateStep(step.id, 'condOp', v)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">值</label>
                                <Input
                                  value={step.config.condValue ?? ''}
                                  onChange={(e) => updateStep(step.id, 'condValue', e.target.value)}
                                  className="mt-1"
                                  placeholder="比较值..."
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">或使用表达式</label>
                              <Input
                                value={step.config.expression ?? ''}
                                onChange={(e) => updateStep(step.id, 'expression', e.target.value)}
                                className="mt-1"
                                placeholder="例如: lead.score > 80 && lead.status == 'qualified'"
                              />
                            </div>
                          </div>
                        )}
                        {step.type === 'update_status' && (
                          <div>
                            <label className="text-xs text-slate-500">目标状态</label>
                            <Select
                              options={[
                                { value: 'new', label: '新线索' },
                                { value: 'contacted', label: '已联系' },
                                { value: 'qualified', label: '已筛选' },
                                { value: 'converted', label: '已转化' },
                              ]}
                              value={step.config.targetStatus ?? ''}
                              onChange={(v) => updateStep(step.id, 'targetStatus', v)}
                              className="mt-1"
                            />
                          </div>
                        )}
                        {step.type === 'send_email' && (
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-slate-500">邮件主题</label>
                              <Input
                                value={step.config.subject ?? ''}
                                onChange={(e) => updateStep(step.id, 'subject', e.target.value)}
                                className="mt-1"
                                placeholder="邮件主题..."
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">邮件内容</label>
                              <Textarea
                                value={step.config.body ?? ''}
                                onChange={(e) => updateStep(step.id, 'body', e.target.value)}
                                className="mt-1"
                                rows={2}
                                placeholder="邮件正文..."
                              />
                            </div>
                          </div>
                        )}
                        {step.type === 'assign_agent' && (
                          <div>
                            <label className="text-xs text-slate-500">客服 ID</label>
                            <Input
                              value={step.config.agentId ?? ''}
                              onChange={(e) => updateStep(step.id, 'agentId', e.target.value)}
                              className="mt-1"
                              placeholder="输入客服 ID..."
                            />
                          </div>
                        )}
                        {step.type === 'assign_lead' && (
                          <div>
                            <label className="text-xs text-slate-500">目标负责人 ID</label>
                            <Input
                              value={step.config.assignTo ?? ''}
                              onChange={(e) => updateStep(step.id, 'assignTo', e.target.value)}
                              className="mt-1"
                              placeholder="输入负责人 ID..."
                            />
                          </div>
                        )}
                        {step.type === 'send_notification' && (
                          <div>
                            <label className="text-xs text-slate-500">消息内容</label>
                            <Input
                              value={step.config.message ?? ''}
                              onChange={(e) => updateStep(step.id, 'message', e.target.value)}
                              className="mt-1"
                              placeholder="输入消息内容..."
                            />
                          </div>
                        )}
                        {step.type === 'add_tag' && (
                          <div>
                            <label className="text-xs text-slate-500">标签名称</label>
                            <Input
                              value={step.config.tagName ?? ''}
                              onChange={(e) => updateStep(step.id, 'tagName', e.target.value)}
                              className="mt-1"
                              placeholder="输入标签名称..."
                            />
                          </div>
                        )}
                        {step.type === 'ai_reply' && (
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-slate-500">AI 提示词</label>
                              <Textarea
                                value={step.config.prompt ?? ''}
                                onChange={(e) => updateStep(step.id, 'prompt', e.target.value)}
                                className="mt-1"
                                rows={3}
                                placeholder="指导 AI 如何回复，例如：你是一个专业的客服，用中文友好地回复用户的问题..."
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-slate-500">最大回复长度</label>
                                <Input
                                  type="number"
                                  value={step.config.maxTokens ?? '500'}
                                  onChange={(e) => updateStep(step.id, 'maxTokens', e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">温度 (0-1)</label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="1"
                                  value={step.config.temperature ?? '0.7'}
                                  onChange={(e) => updateStep(step.id, 'temperature', e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 shrink-0"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Execution Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> 执行日志
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                await executeWorkflow(id)
                toast.success('工作流已触发执行')
                queryClient.invalidateQueries({ queryKey: ['workflow-runs', id] })
                queryClient.invalidateQueries({ queryKey: ['workflow', id] })
              } catch { toast.error('执行失败') }
            }}>
              <Play className="h-4 w-4 mr-1" /> 手动执行
            </Button>
            <Badge variant="primary">
              共 {workflow.executionCount ?? 0} 次执行
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-slate-200 p-4 text-center">
              <p className="text-3xl font-bold text-primary">{workflow.executionCount ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">总执行次数</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 text-center">
              <p className="text-sm font-medium text-slate-700">
                {workflow.lastExecutedAt ? new Date(workflow.lastExecutedAt).toLocaleString('zh-CN') : '-'}
              </p>
              <p className="text-xs text-slate-500 mt-1">上次执行时间</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 text-center">
              <Badge variant={workflow.isActive ? 'success' : 'secondary'} className="text-sm">
                {workflow.isActive ? '运行中' : '已停用'}
              </Badge>
              <p className="text-xs text-slate-500 mt-2">当前状态</p>
            </div>
          </div>

          {runs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无执行记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="text-left px-4 py-2.5 font-medium">执行时间</th>
                    <th className="text-left px-4 py-2.5 font-medium">触发事件</th>
                    <th className="text-left px-4 py-2.5 font-medium">状态</th>
                    <th className="text-left px-4 py-2.5 font-medium">耗时</th>
                    <th className="text-left px-4 py-2.5 font-medium">步骤</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run: any) => (
                    <tr key={run.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{new Date(run.startedAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 text-slate-600">{triggerLabels[run.triggerEvent] ?? run.triggerEvent}</td>
                      <td className="px-4 py-3">
                        <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'secondary'}>
                          {run.status === 'completed' ? '成功' : run.status === 'failed' ? '失败' : '运行中'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{run.duration ? `${run.duration}ms` : '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{run.stepsExecuted}/{run.stepsTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
