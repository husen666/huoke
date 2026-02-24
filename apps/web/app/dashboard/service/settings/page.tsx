'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUserSettings, saveUserSettings,
  getCannedResponses, createCannedResponse, updateCannedResponse, deleteCannedResponse,
  getTeams, createTeam, deleteTeam,
  getAutoReplyRules, createAutoReplyRule, updateAutoReplyRule, toggleAutoReplyRule, deleteAutoReplyRule, testAutoReplyRule,
  getEscalationRules, createEscalationRule, updateEscalationRule, deleteEscalationRule,
  getRoutingRules, createRoutingRule, updateRoutingRule, deleteRoutingRule,
  getProactiveChatRules, createProactiveChatRule, updateProactiveChatRule, deleteProactiveChatRule,
  getBlacklist, addToBlacklist, removeFromBlacklist,
  getOrgMembers,
  getWidgetConfig, updateWidgetConfig,
  type CannedResponse, type Team, type AutoReplyRule, type EscalationRule,
  type RoutingRule, type ProactiveChatRule, type BlacklistItem, type OrgMember,
  type WidgetConfig,
} from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
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
import {
  Clock, MessageSquare, Zap, Code2, Shield, Plus, Pencil, Trash2,
  Copy, Check, AlertCircle, Users, Power,
  MessageSquareReply, Route, MessageCircle, Settings,
  Palette, Type, MapPin, Eye, EyeOff, MessageSquareDashed, ClipboardList,
  Star, Timer,
} from 'lucide-react'

type ServiceTab =
  | 'hours' | 'assign' | 'auto' | 'quickreply' | 'sla' | 'widget'
  | 'autoreply' | 'routing' | 'escalation' | 'proactive' | 'blacklist'

const SETTING_GROUPS = [
  {
    label: '基础配置',
    items: [
      { id: 'hours' as const, label: '工作时间', icon: Clock },
      { id: 'assign' as const, label: '分配规则', icon: Shield },
      { id: 'sla' as const, label: 'SLA 设置', icon: AlertCircle },
      { id: 'widget' as const, label: '客服组件', icon: Code2 },
    ],
  },
  {
    label: '消息回复',
    items: [
      { id: 'auto' as const, label: '自动回复', icon: MessageSquare },
      { id: 'quickreply' as const, label: '快捷回复', icon: Zap },
      { id: 'autoreply' as const, label: '回复规则', icon: MessageSquareReply },
    ],
  },
  {
    label: '客服规则',
    items: [
      { id: 'routing' as const, label: '路由规则', icon: Route },
      { id: 'escalation' as const, label: '升级规则', icon: AlertCircle },
      { id: 'proactive' as const, label: '主动邀请', icon: MessageCircle },
      { id: 'blacklist' as const, label: '黑名单', icon: Shield },
    ],
  },
]

export default function ServiceSettingsPage() {
  const [tab, setTab] = useState<ServiceTab>('hours')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> 客服设置
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">配置客服系统的工作时间、分配规则、回复策略和服务规范</p>
      </div>

      <div className="flex gap-6">
        <nav className="w-44 shrink-0 hidden lg:block">
          <div className="sticky top-20 space-y-5">
            {SETTING_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-2">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = tab === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        className={cn(
                          'flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="lg:hidden w-full">
          <Select
            value={tab}
            onChange={(v) => setTab(v as ServiceTab)}
            options={SETTING_GROUPS.flatMap(g => g.items.map(i => ({ value: i.id, label: `${g.label} · ${i.label}` })))}
            className="mb-4"
          />
        </div>

        <div className="flex-1 min-w-0">
          {tab === 'hours' && <WorkingHoursSection />}
          {tab === 'assign' && <AssignRulesSection />}
          {tab === 'auto' && <AutoReplySection />}
          {tab === 'quickreply' && <QuickReplySection />}
          {tab === 'sla' && <SlaSection />}
          {tab === 'widget' && <WidgetSection />}
          {tab === 'autoreply' && <AutoReplyRulesSection />}
          {tab === 'routing' && <RoutingRulesSection />}
          {tab === 'escalation' && <EscalationSection />}
          {tab === 'proactive' && <ProactiveChatSection />}
          {tab === 'blacklist' && <BlacklistSection />}
        </div>
      </div>
    </div>
  )
}

// ─── Working Hours ────────────────────────────────────────────────────────

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function WorkingHoursSection() {
  const queryClient = useQueryClient()
  const { data: settingsRes, isLoading, isError } = useQuery({
    queryKey: ['user-settings'],
    queryFn: () => getUserSettings(),
  })

  const saved = (settingsRes?.data as Record<string, unknown>)?.serviceSettings as Record<string, unknown> | undefined
  const [hours, setHours] = useState(
    DAYS.map((day, i) => ({
      day,
      enabled: i < 5,
      start: '09:00',
      end: '18:00',
    }))
  )
  const [offlineMsg, setOfflineMsg] = useState('您好，当前为非工作时间，我们将在工作时间内尽快回复您。')

  useEffect(() => {
    if (saved?.workingHours) {
      const wh = saved.workingHours as typeof hours
      if (Array.isArray(wh) && wh.length === 7) setHours(wh)
    }
    if (saved?.offlineMessage) setOfflineMsg(saved.offlineMessage as string)
  }, [saved])

  const mutation = useMutation({
    mutationFn: () => saveUserSettings({ serviceSettings: { ...saved, workingHours: hours, offlineMessage: offlineMsg } }),
    onSuccess: () => {
      toast.success('工作时间已保存')
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  if (isLoading) return <LoadingPage />
  if (isError) return <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">设置加载失败</p></div>

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> 工作时间设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">设置客服团队的在线时间，非工作时间将显示离线自动回复。</p>
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <label className="flex items-center gap-2 w-16 cursor-pointer">
                <input type="checkbox" checked={h.enabled}
                  onChange={(e) => { const next = [...hours]; next[i] = { ...next[i], enabled: e.target.checked }; setHours(next) }}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                <span className="text-sm font-medium text-slate-700">{h.day}</span>
              </label>
              {h.enabled ? (
                <div className="flex items-center gap-2">
                  <input type="time" value={h.start}
                    onChange={(e) => { const next = [...hours]; next[i] = { ...next[i], start: e.target.value }; setHours(next) }}
                    className="rounded border border-slate-200 px-2 py-1.5 text-sm" />
                  <span className="text-slate-400">—</span>
                  <input type="time" value={h.end}
                    onChange={(e) => { const next = [...hours]; next[i] = { ...next[i], end: e.target.value }; setHours(next) }}
                    className="rounded border border-slate-200 px-2 py-1.5 text-sm" />
                </div>
              ) : (
                <span className="text-sm text-slate-400">休息</span>
              )}
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">离线自动回复</label>
          <textarea value={offlineMsg} onChange={(e) => setOfflineMsg(e.target.value)} rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>
        <Button variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}>保存设置</Button>
      </CardContent>
    </Card>
  )
}

// ─── Auto Reply (Welcome / AI) ────────────────────────────────────────────

function AutoReplySection() {
  const queryClient = useQueryClient()
  const { data: settingsRes, isLoading, isError } = useQuery({ queryKey: ['user-settings'], queryFn: () => getUserSettings() })
  const saved = (settingsRes?.data as Record<string, unknown>)?.serviceSettings as Record<string, unknown> | undefined

  const [welcomeMsg, setWelcomeMsg] = useState('您好！欢迎咨询，请问有什么可以帮到您？')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiGreeting, setAiGreeting] = useState('我是 AI 智能助手，可以为您解答常见问题。如需人工服务，请发送「转人工」。')
  const [queueMsg, setQueueMsg] = useState('当前咨询人数较多，请您耐心等待，客服将尽快为您服务。')

  useEffect(() => {
    if (saved?.welcomeMessage) setWelcomeMsg(saved.welcomeMessage as string)
    if (saved?.aiAutoReply !== undefined) setAiEnabled(saved.aiAutoReply as boolean)
    if (saved?.aiGreeting) setAiGreeting(saved.aiGreeting as string)
    if (saved?.queueMessage) setQueueMsg(saved.queueMessage as string)
  }, [saved])

  const mutation = useMutation({
    mutationFn: () => saveUserSettings({
      serviceSettings: { ...saved, welcomeMessage: welcomeMsg, aiAutoReply: aiEnabled, aiGreeting, queueMessage: queueMsg }
    }),
    onSuccess: () => { toast.success('自动回复设置已保存'); queryClient.invalidateQueries({ queryKey: ['user-settings'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  if (isLoading) return <LoadingPage />
  if (isError) return <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">设置加载失败</p></div>

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> 欢迎语</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">新访客进入对话时自动发送的问候消息。</p>
          <textarea value={welcomeMsg} onChange={(e) => setWelcomeMsg(e.target.value)} rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Zap className="h-5 w-5" /> AI 智能回复</span>
            <button type="button" onClick={() => setAiEnabled(!aiEnabled)} className="relative w-10 h-[22px] rounded-full transition-colors shrink-0"
              style={{ background: aiEnabled ? 'var(--primary)' : '#e2e8f0' }}>
              <div className={cn('absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform', aiEnabled ? 'translate-x-[20px]' : 'translate-x-[2px]')} />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">启用后，AI 将基于知识库自动回复访客常见问题。</p>
          {aiEnabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">AI 自我介绍</label>
                <textarea value={aiGreeting} onChange={(e) => setAiGreeting(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">AI 回复基于您的知识库内容。请确保知识库中有足够的文档和 FAQ，以提供准确回复。</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> 排队提示</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">所有客服忙碌时自动发送的排队提示。</p>
          <textarea value={queueMsg} onChange={(e) => setQueueMsg(e.target.value)} rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </CardContent>
      </Card>
      <Button variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}>保存所有设置</Button>
    </div>
  )
}

// ─── Assign Rules ─────────────────────────────────────────────────────────

function AssignRulesSection() {
  const queryClient = useQueryClient()
  const { data: settingsRes, isLoading, isError } = useQuery({ queryKey: ['user-settings'], queryFn: () => getUserSettings() })
  const saved = (settingsRes?.data as Record<string, unknown>)?.serviceSettings as Record<string, unknown> | undefined

  const [assignMode, setAssignMode] = useState<'round_robin' | 'least_busy' | 'manual'>('round_robin')
  const [maxConcurrent, setMaxConcurrent] = useState(10)
  const [autoAccept, setAutoAccept] = useState(true)

  useEffect(() => {
    if (saved?.assignMode) setAssignMode(saved.assignMode as typeof assignMode)
    if (saved?.maxConcurrentConversations) setMaxConcurrent(saved.maxConcurrentConversations as number)
    if (saved?.autoAccept !== undefined) setAutoAccept(saved.autoAccept as boolean)
  }, [saved])

  const mutation = useMutation({
    mutationFn: () => saveUserSettings({
      serviceSettings: { ...saved, assignMode, maxConcurrentConversations: maxConcurrent, autoAccept }
    }),
    onSuccess: () => { toast.success('分配规则已保存'); queryClient.invalidateQueries({ queryKey: ['user-settings'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  if (isLoading) return <LoadingPage />
  if (isError) return <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">设置加载失败</p></div>

  return (
    <>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> 会话分配规则</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-slate-500">配置新会话如何分配给客服人员。</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">分配方式</label>
            <div className="space-y-2">
              {([
                ['round_robin', '轮询分配', '按顺序将新会话分配给客服，均匀分布工作量'],
                ['least_busy', '最少负载', '优先分配给当前服务会话最少的客服'],
                ['manual', '手动分配', '新会话进入待接入队列，客服手动领取'],
              ] as const).map(([value, label, desc]) => {
                const active = assignMode === value
                return (
                  <label key={value} className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                    active ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-slate-200 hover:bg-slate-50'
                  )}>
                    <input type="radio" name="assignMode" value={value} checked={active}
                      onChange={() => setAssignMode(value)} className="mt-0.5 h-4 w-4 text-primary focus:ring-primary" />
                    <div>
                      <p className={cn('text-sm font-medium', active ? 'text-primary' : 'text-slate-700')}>{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">单客服最大并发会话数</label>
            <Input type="number" min={1} max={100} value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 10)} className="w-32" />
            <p className="text-xs text-slate-400 mt-1">超过此数量将不再自动分配新会话给该客服</p>
          </div>
          <div className="rounded-lg border border-slate-200 px-4">
            <ToggleSwitch checked={autoAccept} onChange={setAutoAccept} label="自动接入" desc="分配给客服后自动将状态改为&quot;服务中&quot;" />
          </div>
          <Button variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}>保存规则</Button>
        </CardContent>
      </Card>
      <Card className="max-w-2xl mt-4">
        <CardContent className="py-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800 flex items-center gap-2"><Users className="h-4 w-4" /> 客服分组 / 团队管理</p>
            <p className="text-xs text-slate-500 mt-0.5">管理客服团队、成员分配，在组织架构中统一管理</p>
          </div>
          <a href="/dashboard/org/teams" className="text-sm text-primary hover:underline font-medium whitespace-nowrap">前往管理 →</a>
        </CardContent>
      </Card>
    </>
  )
}

// ─── Team Groups ──────────────────────────────────────────────────────────

function TeamGroupsSection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null)

  const { data: teamsRes, isLoading } = useQuery({ queryKey: ['teams'], queryFn: getTeams })
  const teamList: Team[] = teamsRes?.data ?? []

  const createMut = useMutation({
    mutationFn: () => createTeam({ name: form.name, description: form.description || undefined }),
    onSuccess: () => { toast.success('分组已创建'); setShowCreate(false); setForm({ name: '', description: '' }); queryClient.invalidateQueries({ queryKey: ['teams'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => { toast.success('分组已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['teams'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <>
      <Card className="max-w-2xl mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> 客服分组</CardTitle>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> 新建分组</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">将客服人员分配到不同组，便于按组分配和管理会话。</p>
          {isLoading ? <LoadingPage /> : teamList.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">暂无客服分组</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3" /> 创建第一个</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {teamList.map(team => (
                <div key={team.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50 group">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-slate-800">{team.name}</p>
                    {team.description && <p className="text-xs text-slate-500 mt-0.5">{team.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">创建于 {new Date(team.createdAt).toLocaleDateString('zh-CN')}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(team)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)} title="新建客服分组">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate() }} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">分组名称 *</label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例如：售前咨询组" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">分组描述</label>
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="描述分组职责..." rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" /></div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={createMut.isPending} disabled={!form.name.trim()}>创建</Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除分组「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button>
        </div>
      </Dialog>
    </>
  )
}

// ─── SLA ──────────────────────────────────────────────────────────────────

function SlaSection() {
  const queryClient = useQueryClient()
  const { data: settingsRes, isLoading, isError } = useQuery({ queryKey: ['user-settings'], queryFn: () => getUserSettings() })
  const saved = (settingsRes?.data as Record<string, unknown>)?.serviceSettings as Record<string, unknown> | undefined

  const [firstResponse, setFirstResponse] = useState(5)
  const [resolution, setResolution] = useState(60)
  const [alertEnabled, setAlertEnabled] = useState(true)
  const [alertBefore, setAlertBefore] = useState(2)
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false)
  const [autoCloseTimeout, setAutoCloseTimeout] = useState(30)

  useEffect(() => {
    if (saved?.slaFirstResponse) setFirstResponse(saved.slaFirstResponse as number)
    if (saved?.slaResolution) setResolution(saved.slaResolution as number)
    if (saved?.slaAlertEnabled !== undefined) setAlertEnabled(saved.slaAlertEnabled as boolean)
    if (saved?.slaAlertBefore) setAlertBefore(saved.slaAlertBefore as number)
    if (saved?.autoCloseEnabled !== undefined) setAutoCloseEnabled(saved.autoCloseEnabled as boolean)
    if (saved?.autoCloseTimeout) setAutoCloseTimeout(saved.autoCloseTimeout as number)
  }, [saved])

  const mutation = useMutation({
    mutationFn: () => saveUserSettings({
      serviceSettings: { ...saved, slaFirstResponse: firstResponse, slaResolution: resolution, slaAlertEnabled: alertEnabled, slaAlertBefore: alertBefore, autoCloseEnabled, autoCloseTimeout }
    }),
    onSuccess: () => { toast.success('SLA 设置已保存'); queryClient.invalidateQueries({ queryKey: ['user-settings'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  if (isLoading) return <LoadingPage />
  if (isError) return <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">设置加载失败</p></div>

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> SLA 服务等级设置</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-slate-500">设置服务等级协议（SLA），确保客户获得及时响应。</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">首次响应时限</label>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Input type="number" min={1} value={firstResponse} onChange={(e) => setFirstResponse(parseInt(e.target.value) || 5)} className="w-24" />
              <span className="text-sm text-slate-500 shrink-0">分钟</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">客服需在此时间内发送第一条回复</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">解决时限</label>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Input type="number" min={1} value={resolution} onChange={(e) => setResolution(parseInt(e.target.value) || 60)} className="w-24" />
              <span className="text-sm text-slate-500 shrink-0">分钟</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">会话需在此时间内解决</p>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 px-4">
          <ToggleSwitch checked={alertEnabled} onChange={setAlertEnabled} label="SLA 超时预警" desc="即将超时前发送提醒消息给客服" />
        </div>
        {alertEnabled && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">提前预警时间</label>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Input type="number" min={1} value={alertBefore} onChange={(e) => setAlertBefore(parseInt(e.target.value) || 2)} className="w-24" />
              <span className="text-sm text-slate-500 shrink-0">分钟前</span>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-slate-200 px-4">
          <ToggleSwitch checked={autoCloseEnabled} onChange={setAutoCloseEnabled} label="对话自动关闭" desc="会话在无活动一段时间后自动关闭" />
        </div>
        {autoCloseEnabled && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">无活动超时时间</label>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Input type="number" min={1} value={autoCloseTimeout} onChange={(e) => setAutoCloseTimeout(parseInt(e.target.value) || 30)} className="w-24" />
              <span className="text-sm text-slate-500 shrink-0">分钟</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">会话在无新消息超过此时间后将自动关闭</p>
          </div>
        )}
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-700 mb-2">当前 SLA 标准</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-slate-600">首响 ≤ {firstResponse} 分钟</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-slate-600">解决 ≤ {resolution} 分钟</span></div>
            {autoCloseEnabled && <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-slate-600">自动关闭 {autoCloseTimeout} 分钟</span></div>}
          </div>
        </div>
        <Button variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}>保存 SLA 设置</Button>
      </CardContent>
    </Card>
  )
}

// ─── Quick Reply ──────────────────────────────────────────────────────────

function QuickReplySection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<CannedResponse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null)
  const [form, setForm] = useState({ title: '', content: '', shortcut: '', category: '', isPublic: true })

  const { data: crRes, isLoading, isError } = useQuery({ queryKey: ['canned-responses'], queryFn: () => getCannedResponses() })
  const items: CannedResponse[] = crRes?.data ?? []

  useEffect(() => {
    if (editTarget) setForm({ title: editTarget.title, content: editTarget.content, shortcut: editTarget.shortcut ?? '', category: editTarget.category ?? '', isPublic: editTarget.isPublic })
    else if (showCreate) setForm({ title: '', content: '', shortcut: '', category: '', isPublic: true })
  }, [editTarget, showCreate])

  const createMut = useMutation({
    mutationFn: () => createCannedResponse({ ...form, shortcut: form.shortcut || undefined, category: form.category || undefined }),
    onSuccess: () => { toast.success('快捷回复已创建'); setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['canned-responses'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })
  const updateMut = useMutation({
    mutationFn: () => updateCannedResponse(editTarget!.id, { ...form, shortcut: form.shortcut || undefined, category: form.category || undefined }),
    onSuccess: () => { toast.success('快捷回复已更新'); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['canned-responses'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCannedResponse(id),
    onSuccess: () => { toast.success('已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['canned-responses'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const grouped = items.reduce<Record<string, CannedResponse[]>>((acc, r) => { const cat = r.category || '默认'; if (!acc[cat]) acc[cat] = []; acc[cat].push(r); return acc }, {})

  if (isError) return <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">设置加载失败</p></div>

  return (
    <>
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> 快捷回复管理</CardTitle>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> 新建</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">创建快捷回复后，客服在对话中可一键使用，提高回复效率。</p>
          {isLoading ? <LoadingPage /> : items.length === 0 ? (
            <div className="py-8 text-center">
              <Zap className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">暂无快捷回复</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3" /> 创建第一个</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([category, catItems]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{category}</p>
                  <div className="space-y-2">
                    {catItems.map(cr => (
                      <div key={cr.id} className="flex items-start justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50 group">
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-slate-800">{cr.title}</p>
                            {cr.shortcut && <Badge variant="outline" className="text-[10px]">/{cr.shortcut}</Badge>}
                            {!cr.isPublic && <Badge variant="default" className="text-[10px]">私有</Badge>}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2">{cr.content}</p>
                          <p className="text-[10px] text-slate-400 mt-1">使用 {cr.useCount} 次</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => setEditTarget(cr)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(cr)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={showCreate || !!editTarget} onOpenChange={() => { setShowCreate(false); setEditTarget(null) }} title={editTarget ? '编辑快捷回复' : '新建快捷回复'}>
        <form onSubmit={(e) => { e.preventDefault(); editTarget ? updateMut.mutate() : createMut.mutate() }} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">标题 *</label>
            <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例如：欢迎语" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">回复内容 *</label>
            <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} placeholder="输入快捷回复完整内容..." rows={4} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">快捷指令</label>
              <div className="flex items-center"><span className="text-slate-400 mr-1">/</span><Input value={form.shortcut} onChange={(e) => setForm(f => ({ ...f, shortcut: e.target.value }))} placeholder="greet" /></div></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
              <Input value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} placeholder="例如：问候" /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm(f => ({ ...f, isPublic: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
            <span className="text-sm text-slate-700">公开（所有团队成员可用）</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setEditTarget(null) }}>取消</Button>
            <Button type="submit" variant="primary" loading={editTarget ? updateMut.isPending : createMut.isPending}>{editTarget ? '保存' : '创建'}</Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除「{deleteTarget?.title}」吗？</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button>
        </div>
      </Dialog>
    </>
  )
}

// ─── Widget (客服组件) ──────────────────────────────────────────────────

const PRESET_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5', '#0d9488', '#334155']

function ToggleSwitch({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between w-full group py-2">
      <div className="text-left">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <div className={cn(
        'relative w-10 h-[22px] rounded-full transition-colors shrink-0 ml-4',
        checked ? 'bg-primary' : 'bg-slate-200'
      )}>
        <div className={cn(
          'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]'
        )} />
      </div>
    </button>
  )
}

function SectionCard({ icon: Icon, title, desc, children, action }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">{title}</CardTitle>
              {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

function WidgetSection() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const orgId = user?.orgId ?? ''

  const [copied, setCopied] = useState(false)

  const { data: config, isLoading } = useQuery({ queryKey: ['widget-config'], queryFn: () => getWidgetConfig().then(r => r.data ?? {}) })
  const [form, setForm] = useState<WidgetConfig>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => { if (config) { setForm(config); setDirty(false) } }, [config])

  const update = (patch: Partial<WidgetConfig>) => {
    setForm(prev => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const saveMut = useMutation({
    mutationFn: () => updateWidgetConfig(form),
    onSuccess: () => { toast.success('保存成功'); queryClient.invalidateQueries({ queryKey: ['widget-config'] }); setDirty(false) },
    onError: () => toast.error('保存失败'),
  })

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'
  const embedCode = `<script src="${origin}/widget.js" data-site-token="${orgId}"></script>`
  const themeColor = form.themeColor ?? '#7c3aed'
  const pos = form.position ?? 'bottom-right'

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode).then(() => { setCopied(true); toast.success('嵌入代码已复制'); setTimeout(() => setCopied(false), 2000) })
  }

  if (isLoading) return <LoadingPage />

  return (
    <div className="space-y-5">
      {/* Header with save */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">客服组件配置</h3>
          <p className="text-sm text-slate-500 mt-0.5">配置嵌入到您网站的客服聊天组件外观和行为</p>
        </div>
        <Button variant="primary" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending} size="sm" className="gap-1.5">
          {saveMut.isPending ? <><span className="animate-spin">⏳</span> 保存中...</> : <><Check className="h-3.5 w-3.5" /> 保存配置</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left column: Settings */}
        <div className="xl:col-span-2 space-y-5">
          {/* Appearance */}
          <SectionCard icon={Palette} title="外观设置" desc="自定义组件的视觉风格">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2">主题颜色</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => update({ themeColor: c })}
                        className={cn('h-7 w-7 rounded-full transition-all border-2', themeColor === c ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-105')}
                        style={{ background: c }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 border-l pl-3 border-slate-200">
                    <input type="color" value={themeColor} onChange={e => update({ themeColor: e.target.value })} className="h-7 w-7 rounded border-0 cursor-pointer p-0" />
                    <Input value={themeColor} onChange={e => update({ themeColor: e.target.value })} className="w-24 h-8 text-xs font-mono" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    <MapPin className="h-3 w-3 inline mr-1" />组件位置
                  </label>
                  <div className="flex gap-2">
                    {[{ v: 'bottom-right', l: '右下角' }, { v: 'bottom-left', l: '左下角' }].map(p => (
                      <button key={p.v} onClick={() => update({ position: p.v as 'bottom-right' | 'bottom-left' })}
                        className={cn('flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
                          pos === p.v ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    <Type className="h-3 w-3 inline mr-1" />公司名称
                  </label>
                  <Input value={form.companyName ?? ''} onChange={e => update({ companyName: e.target.value })} placeholder="在线客服" className="h-9" />
                </div>
              </div>

              <div className="flex gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={form.showAgentAvatar ?? true} onChange={e => update({ showAgentAvatar: e.target.checked })} className="rounded border-slate-300 text-primary focus:ring-primary/30" />
                  <Eye className="h-3.5 w-3.5 text-slate-400" /> 显示客服头像
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={form.showAgentName ?? true} onChange={e => update({ showAgentName: e.target.checked })} className="rounded border-slate-300 text-primary focus:ring-primary/30" />
                  <Eye className="h-3.5 w-3.5 text-slate-400" /> 显示客服姓名
                </label>
              </div>
            </div>
          </SectionCard>

          {/* Messages */}
          <SectionCard icon={MessageSquareDashed} title="消息设置" desc="配置自动消息和弹窗行为">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">欢迎语</label>
                <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  rows={2} value={form.greeting ?? ''} onChange={e => update({ greeting: e.target.value })} placeholder="您好！有什么可以帮您的吗？" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">离线消息</label>
                <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  rows={2} value={form.offlineGreeting ?? ''} onChange={e => update({ offlineGreeting: e.target.value })} placeholder="当前非工作时间，请留言我们会尽快回复您" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  <Timer className="h-3 w-3 inline mr-1" />自动弹出延迟
                </label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} value={form.autoPopupDelay ?? 0} onChange={e => update({ autoPopupDelay: parseInt(e.target.value) || 0 })} className="w-24 h-9" />
                  <span className="text-xs text-slate-400">秒（0 = 不弹出）</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pre-chat form */}
            <SectionCard icon={ClipboardList} title="咨询前表单" desc="访客发起对话前需填写的信息">
              <div className="space-y-3">
                <ToggleSwitch checked={form.preChatFormEnabled ?? false} onChange={v => update({ preChatFormEnabled: v })}
                  label="开启表单" desc="访客需先填写信息才能发起对话" />
                {form.preChatFormEnabled && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {(form.preChatFormFields ?? [
                      { field: 'name', label: '姓名', required: true, type: 'text' },
                      { field: 'phone', label: '手机号', required: false, type: 'tel' },
                      { field: 'email', label: '邮箱', required: false, type: 'email' },
                    ]).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <Input value={f.label} onChange={e => {
                          const fields = [...(form.preChatFormFields ?? [])]
                          fields[i] = { ...fields[i], label: e.target.value }
                          update({ preChatFormFields: fields })
                        }} className="flex-1 h-8 text-xs" placeholder="字段名" />
                        <Select
                          options={[
                            { value: 'text', label: '文本' },
                            { value: 'tel', label: '手机' },
                            { value: 'email', label: '邮箱' },
                          ]}
                          value={f.type}
                          onChange={(v) => {
                            const fields = [...(form.preChatFormFields ?? [])]
                            fields[i] = { ...fields[i], type: v }
                            update({ preChatFormFields: fields })
                          }}
                          className="w-20"
                        />
                        <label className="flex items-center gap-1 text-[10px] whitespace-nowrap text-slate-500 cursor-pointer">
                          <input type="checkbox" checked={f.required} onChange={e => {
                            const fields = [...(form.preChatFormFields ?? [])]
                            fields[i] = { ...fields[i], required: e.target.checked }
                            update({ preChatFormFields: fields })
                          }} className="rounded border-slate-300 text-primary h-3 w-3" />
                          必填
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Satisfaction & Grade */}
            <SectionCard icon={Star} title="评价与分级" desc="满意度调查和对话自动分级">
              <div className="space-y-3">
                <ToggleSwitch checked={form.postChatSurveyEnabled ?? true} onChange={v => update({ postChatSurveyEnabled: v })}
                  label="满意度调查" desc="对话结束后自动发送" />
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2">对话分级规则</p>
                  <div className="space-y-1.5">
                    {(form.conversationGradeRules ?? [
                      { grade: '无效', minMessages: 0 },
                      { grade: '简单', minMessages: 1 },
                      { grade: '普通', minMessages: 5 },
                      { grade: '深度', minMessages: 15 },
                      { grade: '重要', minMessages: 30 },
                    ]).map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Input value={r.grade} onChange={e => {
                          const rules = [...(form.conversationGradeRules ?? [])]
                          rules[i] = { ...rules[i], grade: e.target.value }
                          update({ conversationGradeRules: rules })
                        }} className="w-16 h-7 text-xs" />
                        <span className="text-slate-400">≥</span>
                        <Input type="number" min={0} value={r.minMessages} onChange={e => {
                          const rules = [...(form.conversationGradeRules ?? [])]
                          rules[i] = { ...rules[i], minMessages: parseInt(e.target.value) || 0 }
                          update({ conversationGradeRules: rules })
                        }} className="w-14 h-7 text-xs" />
                        <span className="text-slate-400">条</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Embed code */}
          <SectionCard icon={Code2} title="网站嵌入代码" desc="将代码粘贴到网页 </body> 标签之前">
            <div className="space-y-3">
              <div className="relative">
                <pre className="rounded-lg bg-slate-900 text-green-400 p-4 pr-14 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{embedCode}</pre>
                <button onClick={handleCopy} className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-slate-700/80 hover:bg-slate-600 text-slate-300 transition-colors" title="复制">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right column: Live preview */}
        <div className="xl:col-span-1">
          <div className="sticky top-20 space-y-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider px-1">实时预览</p>
            <div className="relative rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 overflow-hidden shadow-sm" style={{ height: 480 }}>
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200">
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                </div>
                <div className="flex-1 mx-2 h-5 rounded bg-white border border-slate-200 flex items-center px-2">
                  <span className="text-[9px] text-slate-400 font-mono truncate">https://your-website.com</span>
                </div>
              </div>

              {/* Page content mock */}
              <div className="p-5 space-y-3">
                <div className="h-5 w-32 rounded bg-slate-200/70" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
                <div className="h-3 w-3/5 rounded bg-slate-100" />
                <div className="h-20 rounded-lg bg-slate-100/80 mt-4" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-2/3 rounded bg-slate-100" />
              </div>

              {/* Chat window (expanded preview) */}
              <div className="absolute shadow-2xl rounded-xl overflow-hidden border border-slate-200"
                style={{ width: 220, bottom: 76, [(pos === 'bottom-right') ? 'right' : 'left']: 12 }}>
                <div className="px-3 py-2.5 text-white" style={{ background: themeColor }}>
                  <p className="text-[10px] font-semibold">{form.companyName || '在线客服'}</p>
                  <p className="text-[8px] opacity-80 mt-0.5">通常在几分钟内回复</p>
                </div>
                <div className="bg-white p-2.5 space-y-2" style={{ minHeight: 80 }}>
                  <div className="flex gap-1.5 items-start">
                    {(form.showAgentAvatar ?? true) && (
                      <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[7px] font-bold text-white" style={{ background: themeColor }}>客</div>
                    )}
                    <div>
                      {(form.showAgentName ?? true) && <p className="text-[7px] text-slate-400 mb-0.5">客服</p>}
                      <div className="bg-slate-100 rounded-lg px-2 py-1.5">
                        <p className="text-[9px] text-slate-700 leading-relaxed">{form.greeting || '您好！有什么可以帮您的吗？'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-100 px-2.5 py-2 flex items-center gap-1.5">
                  <div className="flex-1 h-5 rounded bg-slate-50 border border-slate-200 px-1.5 flex items-center">
                    <span className="text-[8px] text-slate-300">输入消息...</span>
                  </div>
                  <div className="h-5 w-5 rounded flex items-center justify-center text-white" style={{ background: themeColor }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </div>
                </div>
              </div>

              {/* FAB button */}
              <button className="absolute flex items-center justify-center w-12 h-12 rounded-full text-white transition-transform hover:scale-105"
                style={{ background: themeColor, boxShadow: `0 4px 16px ${themeColor}40`, bottom: 14, [(pos === 'bottom-right') ? 'right' : 'left']: 14 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// Sections moved from System Settings → Service Settings
// ===========================================================================

// ─── Auto Reply Rules (keyword/regex based) ───────────────────────────────

const TRIGGER_TYPE_OPTIONS = [
  { value: 'keyword', label: '关键词匹配' },
  { value: 'regex', label: '正则表达式' },
  { value: 'first_message', label: '首条消息' },
  { value: 'no_agent_online', label: '无客服在线' },
]
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  keyword: '关键词', regex: '正则', first_message: '首条消息', no_agent_online: '无客服',
}
const MATCH_MODE_OPTIONS = [
  { value: 'contains', label: '包含' },
  { value: 'exact', label: '精确' },
  { value: 'startsWith', label: '开头' },
]

function triggerSummary(rule: AutoReplyRule): string {
  const config = rule.triggerConfig
  if (rule.triggerType === 'keyword') {
    const keywords = (config.keywords as string[]) || []
    const mode = (config.matchMode as string) || 'contains'
    const modeLabel = MATCH_MODE_OPTIONS.find((o) => o.value === mode)?.label || mode
    return `${modeLabel}: ${keywords.slice(0, 3).join(', ')}${keywords.length > 3 ? '...' : ''}`
  }
  if (rule.triggerType === 'regex') return `/${config.pattern as string}/i`
  return '-'
}

function AutoReplyRulesSection() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<AutoReplyRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AutoReplyRule | null>(null)
  const [testMsg, setTestMsg] = useState('')
  const [testResult, setTestResult] = useState<string | null>(null)

  const { data: rulesRes, isLoading, isError } = useQuery({ queryKey: ['auto-reply-rules'], queryFn: () => getAutoReplyRules(), staleTime: 5 * 60_000 })
  const rules: AutoReplyRule[] = rulesRes?.data ?? []

  const toggleMut = useMutation({
    mutationFn: (id: string) => toggleAutoReplyRule(id),
    onSuccess: () => { toast.success('状态已切换'); queryClient.invalidateQueries({ queryKey: ['auto-reply-rules'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAutoReplyRule(id),
    onSuccess: () => { toast.success('规则已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['auto-reply-rules'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const handleTest = async () => {
    if (!testMsg.trim()) return
    try {
      const res = await testAutoReplyRule(testMsg)
      if (res.data?.matched) setTestResult(`匹配规则: ${res.data.rule?.name} → ${res.data.rule?.replyContent?.slice(0, 100)}`)
      else setTestResult('无匹配规则')
    } catch { setTestResult('测试失败') }
  }

  return (
    <>
      <Card className="max-w-4xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>自动回复规则</CardTitle>
            <Button variant="primary" size="sm" onClick={() => { setEditTarget(null); setShowForm(true) }}><Plus className="h-4 w-4" /> 新建规则</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center mb-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="输入消息测试匹配..." className="flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') handleTest() }} />
            <Button variant="outline" size="sm" onClick={handleTest} className="shrink-0 whitespace-nowrap">测试</Button>
            {testResult && <span className="text-sm text-slate-600 ml-2">{testResult}</span>}
          </div>
          {isLoading ? <LoadingPage /> : isError ? (
            <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">加载失败</p></div>
          ) : rules.length === 0 ? (
            <div className="py-8 text-center"><MessageSquareReply className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无自动回复规则</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>名称</TableHead><TableHead>触发类型</TableHead><TableHead>触发条件</TableHead>
                <TableHead>匹配次数</TableHead><TableHead>状态</TableHead><TableHead className="w-24">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell><Badge variant="default">{TRIGGER_TYPE_LABELS[rule.triggerType] ?? rule.triggerType}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{triggerSummary(rule)}</TableCell>
                  <TableCell className="text-slate-600">{rule.matchCount}</TableCell>
                  <TableCell>
                    <button type="button" onClick={() => toggleMut.mutate(rule.id)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full cursor-pointer transition-colors ${rule.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      <Power className="h-3 w-3" />{rule.isActive ? '启用' : '禁用'}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditTarget(rule); setShowForm(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <AutoReplyFormDialog open={showForm} rule={editTarget}
        onClose={() => { setShowForm(false); setEditTarget(null) }}
        onSuccess={() => { setShowForm(false); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['auto-reply-rules'] }) }} />
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除规则「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button>
        </div>
      </Dialog>
    </>
  )
}

function AutoReplyFormDialog({ open, rule, onClose, onSuccess }: {
  open: boolean; rule: AutoReplyRule | null; onClose: () => void; onSuccess: () => void
}) {
  const isEdit = !!rule
  const [name, setName] = useState(''); const [priority, setPriority] = useState(0)
  const [triggerType, setTriggerType] = useState('keyword'); const [keywords, setKeywords] = useState('')
  const [matchMode, setMatchMode] = useState('contains'); const [regexPattern, setRegexPattern] = useState('')
  const [replyContent, setReplyContent] = useState(''); const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (open && rule) {
      setName(rule.name); setPriority(rule.priority); setTriggerType(rule.triggerType); setReplyContent(rule.replyContent); setIsActive(rule.isActive)
      const config = rule.triggerConfig
      if (rule.triggerType === 'keyword') { setKeywords(((config.keywords as string[]) || []).join(', ')); setMatchMode((config.matchMode as string) || 'contains') }
      else if (rule.triggerType === 'regex') { setRegexPattern((config.pattern as string) || '') }
    } else if (open) { setName(''); setPriority(0); setTriggerType('keyword'); setKeywords(''); setMatchMode('contains'); setRegexPattern(''); setReplyContent(''); setIsActive(true) }
  }, [open, rule])

  const createMut = useMutation({ mutationFn: (data: Record<string, unknown>) => createAutoReplyRule(data), onSuccess: () => { toast.success('规则创建成功'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败') })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateAutoReplyRule(id, data), onSuccess: () => { toast.success('规则更新成功'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let triggerConfig: Record<string, unknown> = {}
    if (triggerType === 'keyword') triggerConfig = { keywords: keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean), matchMode }
    else if (triggerType === 'regex') triggerConfig = { pattern: regexPattern }
    const data = { name, priority, triggerType, triggerConfig, replyContent, isActive }
    if (isEdit && rule) updateMut.mutate({ id: rule.id, data }); else createMut.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑规则' : '新建规则'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">规则名称 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：价格咨询自动回复" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
            <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} placeholder="数字越大优先级越高" /></div>
        </div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">触发类型</label>
          <Select value={triggerType} onChange={(v) => setTriggerType(v)} options={TRIGGER_TYPE_OPTIONS} /></div>
        {triggerType === 'keyword' && (<div className="space-y-3">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">关键词（逗号分隔）</label>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="价格, 报价, 多少钱" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">匹配模式</label>
            <Select value={matchMode} onChange={(v) => setMatchMode(v)} options={MATCH_MODE_OPTIONS} /></div>
        </div>)}
        {triggerType === 'regex' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">正则表达式</label>
          <Input value={regexPattern} onChange={(e) => setRegexPattern(e.target.value)} placeholder="例如：价格|报价|费用" /></div>)}
        <div><label className="block text-sm font-medium text-slate-700 mb-1">回复内容 *</label>
          <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="自动回复的内容..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/40" required /></div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
          <span className="text-sm text-slate-700">启用此规则</span>
        </label>
        {(createMut.error || updateMut.error) && <p className="text-sm text-red-600">{(createMut.error || updateMut.error) instanceof Error ? (createMut.error || updateMut.error)!.message : '操作失败'}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={createMut.isPending || updateMut.isPending}>{isEdit ? '保存' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

// ─── Escalation Section ───────────────────────────────────────────────────

const ESC_TRIGGER_LABELS: Record<string, string> = { first_response_sla: '首次响应超时', resolution_sla: '解决时间超时', no_response: '客户无人回复', priority_high: '高优先级超时' }
const ACTION_LABELS_ESC: Record<string, string> = { notify_manager: '提醒管理员', reassign: '重新分配', change_priority: '提升优先级', notify_team: '提醒团队' }

function EscalationSection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<EscalationRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EscalationRule | null>(null)

  const { data: rulesRes, isLoading, isError } = useQuery({ queryKey: ['escalation-rules'], queryFn: () => getEscalationRules(), staleTime: 5 * 60_000 })
  const rules: EscalationRule[] = rulesRes?.data ?? []

  const deleteMut = useMutation({ mutationFn: (id: string) => deleteEscalationRule(id), onSuccess: () => { toast.success('规则已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['escalation-rules'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败') })
  const toggleMut = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateEscalationRule(id, { isActive }), onSuccess: () => { toast.success('状态已更新'); queryClient.invalidateQueries({ queryKey: ['escalation-rules'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  return (
    <>
      <Card className="max-w-3xl">
        <CardHeader><div className="flex items-center justify-between"><CardTitle>升级规则</CardTitle>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> 添加规则</Button></div></CardHeader>
        <CardContent>
          {isLoading ? <LoadingPage /> : isError ? (
            <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">加载失败</p></div>
          ) : rules.length === 0 ? (
            <div className="py-8 text-center"><AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无升级规则</p></div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>触发条件</TableHead><TableHead>阈值</TableHead><TableHead>动作</TableHead><TableHead>启用</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>{rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell><Badge variant="default">{ESC_TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}</Badge></TableCell>
                  <TableCell>{rule.thresholdMinutes} 分钟</TableCell>
                  <TableCell><Badge variant="primary">{ACTION_LABELS_ESC[rule.action] ?? rule.action}</Badge></TableCell>
                  <TableCell><input type="checkbox" checked={rule.isActive} onChange={() => toggleMut.mutate({ id: rule.id, isActive: !rule.isActive })} className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer" /></TableCell>
                  <TableCell><div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditTarget(rule)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      <EscalationFormDialog open={showCreate || !!editTarget} rule={editTarget}
        onClose={() => { setShowCreate(false); setEditTarget(null) }}
        onSuccess={() => { setShowCreate(false); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['escalation-rules'] }) }} />
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除规则「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button></div>
      </Dialog>
    </>
  )
}

function EscalationFormDialog({ open, rule, onClose, onSuccess }: { open: boolean; rule: EscalationRule | null; onClose: () => void; onSuccess: () => void }) {
  const isEdit = !!rule
  const [name, setName] = useState(''); const [triggerType, setTriggerType] = useState('first_response_sla')
  const [thresholdMinutes, setThresholdMinutes] = useState('30'); const [action, setAction] = useState('notify_manager')
  const [targetUserId, setTargetUserId] = useState(''); const [priority, setPriority] = useState('urgent')

  const { data: membersRes } = useQuery({
    queryKey: ['org-members-esc'],
    queryFn: () => getOrgMembers(),
    staleTime: 5 * 60_000,
  })
  const escalationMembers = membersRes?.data ?? []

  useEffect(() => {
    if (open && rule) {
      setName(rule.name); setTriggerType(rule.triggerType); setThresholdMinutes(String(rule.thresholdMinutes)); setAction(rule.action)
      const cfg = (rule.actionConfig ?? {}) as Record<string, string>; setTargetUserId(cfg.targetUserId ?? ''); setPriority(cfg.priority ?? 'urgent')
    } else if (open) { setName(''); setTriggerType('first_response_sla'); setThresholdMinutes('30'); setAction('notify_manager'); setTargetUserId(''); setPriority('urgent') }
  }, [open, rule])

  const createMut = useMutation({ mutationFn: (data: Parameters<typeof createEscalationRule>[0]) => createEscalationRule(data), onSuccess: () => { toast.success('规则已创建'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败') })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateEscalationRule>[1] }) => updateEscalationRule(id, data), onSuccess: () => { toast.success('规则已更新'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); const mins = parseInt(thresholdMinutes); if (!name.trim() || isNaN(mins) || mins < 1) return
    const actionConfig: Record<string, unknown> = {}
    if (action === 'reassign' && targetUserId) actionConfig.targetUserId = targetUserId
    if (action === 'change_priority') actionConfig.priority = priority
    const payload = { name: name.trim(), triggerType, thresholdMinutes: mins, action, ...(Object.keys(actionConfig).length > 0 ? { actionConfig } : {}) }
    if (isEdit) updateMut.mutate({ id: rule!.id, data: payload }); else createMut.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑升级规则' : '添加升级规则'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-700 mb-1">规则名称</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如: 首响超时15分钟提醒" required /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">触发条件</label>
          <Select value={triggerType} onChange={setTriggerType} options={[
            { value: 'first_response_sla', label: '首次响应超时' }, { value: 'resolution_sla', label: '解决时间超时' },
            { value: 'no_response', label: '客户无人回复' }, { value: 'priority_high', label: '高优先级超时' },
          ]} /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">阈值 (分钟)</label>
          <Input type="number" value={thresholdMinutes} onChange={(e) => setThresholdMinutes(e.target.value)} min={1} required /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">执行动作</label>
          <Select value={action} onChange={setAction} options={[
            { value: 'notify_manager', label: '提醒管理员' }, { value: 'reassign', label: '重新分配' },
            { value: 'change_priority', label: '提升优先级' }, { value: 'notify_team', label: '提醒团队' },
          ]} /></div>
        {action === 'reassign' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">目标客服</label>
          <Select value={targetUserId} onChange={setTargetUserId} placeholder="选择客服"
            options={escalationMembers.map((m: any) => ({ value: m.id, label: `${m.name} (${{ owner: '所有者', admin: '管理员', manager: '主管', agent: '客服', viewer: '查看者' }[m.role as string] ?? m.role})` }))} /></div>)}
        {action === 'change_priority' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">目标优先级</label>
          <Select value={priority} onChange={setPriority} options={[{ value: 'urgent', label: '紧急' }, { value: 'high', label: '高' }]} /></div>)}
        {(createMut.error || updateMut.error) && <p className="text-sm text-red-600">{(createMut.error || updateMut.error) instanceof Error ? (createMut.error || updateMut.error)!.message : '操作失败'}</p>}
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={createMut.isPending || updateMut.isPending}>{isEdit ? '保存' : '创建'}</Button></div>
      </form>
    </Dialog>
  )
}

// ─── Blacklist Section ────────────────────────────────────────────────────

const BLACKLIST_TYPE_MAP: Record<string, { label: string; variant: 'primary' | 'default' | 'success' | 'warning' | 'danger' }> = {
  ip: { label: 'IP地址', variant: 'primary' }, visitor: { label: '访客', variant: 'default' }, keyword: { label: '关键词', variant: 'warning' },
}

function BlacklistSection() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BlacklistItem | null>(null)
  const [newType, setNewType] = useState('ip'); const [newValue, setNewValue] = useState(''); const [newReason, setNewReason] = useState('')

  const { data: blacklistRes, isLoading, isError } = useQuery({ queryKey: ['blacklist'], queryFn: () => getBlacklist(), staleTime: 5 * 60_000 })
  const items: BlacklistItem[] = blacklistRes?.data ?? []

  const addMut = useMutation({ mutationFn: () => addToBlacklist({ type: newType, value: newValue, reason: newReason || undefined }), onSuccess: () => { toast.success('已添加到黑名单'); setShowAdd(false); setNewValue(''); setNewReason(''); queryClient.invalidateQueries({ queryKey: ['blacklist'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '添加失败') })
  const removeMut = useMutation({ mutationFn: (id: string) => removeFromBlacklist(id), onSuccess: () => { toast.success('已从黑名单移除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['blacklist'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '移除失败') })

  return (
    <>
      <Card className="max-w-3xl">
        <CardHeader><div className="flex items-center justify-between"><CardTitle>黑名单管理</CardTitle>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> 添加</Button></div></CardHeader>
        <CardContent>
          {isLoading ? <LoadingPage /> : isError ? (
            <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">黑名单加载失败</p></div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center"><Shield className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无黑名单记录</p></div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>类型</TableHead><TableHead>值</TableHead><TableHead>原因</TableHead><TableHead>添加时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>{items.map((item) => {
                const typeInfo = BLACKLIST_TYPE_MAP[item.type] ?? { label: item.type, variant: 'default' as const }
                return (<TableRow key={item.id}>
                  <TableCell><Badge variant={typeInfo.variant}>{typeInfo.label}</Badge></TableCell>
                  <TableCell className="text-slate-700 font-mono text-xs">{item.value}</TableCell>
                  <TableCell className="text-slate-500">{item.reason ?? '-'}</TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">{new Date(item.createdAt).toLocaleString('zh-CN')}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(item)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>)
              })}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={showAdd} onOpenChange={() => setShowAdd(false)} title="添加黑名单">
        <form onSubmit={(e) => { e.preventDefault(); if (newValue.trim()) addMut.mutate() }} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <Select value={newType} onChange={(v) => setNewType(v)} options={[{ value: 'ip', label: 'IP地址' }, { value: 'visitor', label: '访客' }, { value: 'keyword', label: '关键词' }]} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">值</label>
            <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={newType === 'ip' ? '例如: 192.168.1.1' : newType === 'visitor' ? '访客 ID' : '关键词'} required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">原因</label>
            <Input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="添加原因（可选）" /></div>
          {addMut.error && <p className="text-sm text-red-600">{addMut.error instanceof Error ? addMut.error.message : '添加失败'}</p>}
          <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={addMut.isPending}>添加</Button></div>
        </form>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认移除">
        <p className="text-sm text-slate-600 mb-4">确定要从黑名单中移除「{deleteTarget?.value}」吗？</p>
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && removeMut.mutate(deleteTarget.id)} loading={removeMut.isPending}>移除</Button></div>
      </Dialog>
    </>
  )
}

// ─── Routing Rules Section ────────────────────────────────────────────────

const TARGET_TYPE_OPTIONS = [
  { value: 'agent', label: '指定客服' }, { value: 'team', label: '指定团队' }, { value: 'round_robin_team', label: '轮询分配' },
]

function conditionsSummary(conds: Record<string, unknown>): string {
  const parts: string[] = []
  if (conds.channel) parts.push(`渠道: ${conds.channel}`)
  if (conds.pageUrl) parts.push(`页面: ${conds.pageUrl}`)
  if (conds.language) parts.push(`语言: ${conds.language}`)
  if (conds.visitorCountry) parts.push(`国家: ${conds.visitorCountry}`)
  if (Array.isArray(conds.tags) && conds.tags.length) parts.push(`标签: ${(conds.tags as string[]).join(',')}`)
  return parts.length > 0 ? parts.join('; ') : '-'
}

function RoutingRulesSection() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<RoutingRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoutingRule | null>(null)

  const { data: rulesRes, isLoading, isError } = useQuery({ queryKey: ['routing-rules'], queryFn: () => getRoutingRules(), staleTime: 5 * 60_000 })
  const rules: RoutingRule[] = rulesRes?.data ?? []

  const deleteMut = useMutation({ mutationFn: (id: string) => deleteRoutingRule(id), onSuccess: () => { toast.success('规则已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['routing-rules'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败') })
  const toggleMut = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateRoutingRule(id, { isActive }), onSuccess: () => { toast.success('状态已更新'); queryClient.invalidateQueries({ queryKey: ['routing-rules'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  return (
    <>
      <Card className="max-w-4xl">
        <CardHeader><div className="flex items-center justify-between"><CardTitle>路由规则</CardTitle>
          <Button variant="primary" size="sm" onClick={() => { setEditTarget(null); setShowForm(true) }}><Plus className="h-4 w-4" /> 新建规则</Button></div></CardHeader>
        <CardContent>
          {isLoading ? <LoadingPage /> : isError ? (
            <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">加载失败</p></div>
          ) : rules.length === 0 ? (
            <div className="py-8 text-center"><Route className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无路由规则，新会话将使用默认轮询分配</p></div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>条件</TableHead><TableHead>目标</TableHead><TableHead>优先级</TableHead><TableHead>启用</TableHead><TableHead className="w-24">操作</TableHead></TableRow></TableHeader>
              <TableBody>{rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{conditionsSummary(rule.conditions)}</TableCell>
                  <TableCell><Badge variant="primary">{TARGET_TYPE_OPTIONS.find(o => o.value === rule.targetType)?.label ?? rule.targetType}</Badge></TableCell>
                  <TableCell className="text-slate-600">{rule.priority}</TableCell>
                  <TableCell><input type="checkbox" checked={rule.isActive} onChange={() => toggleMut.mutate({ id: rule.id, isActive: !rule.isActive })} className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer" /></TableCell>
                  <TableCell><div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditTarget(rule); setShowForm(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      <RoutingRuleFormDialog open={showForm} rule={editTarget}
        onClose={() => { setShowForm(false); setEditTarget(null) }}
        onSuccess={() => { setShowForm(false); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['routing-rules'] }) }} />
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除规则「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button></div>
      </Dialog>
    </>
  )
}

function RoutingRuleFormDialog({ open, rule, onClose, onSuccess }: { open: boolean; rule: RoutingRule | null; onClose: () => void; onSuccess: () => void }) {
  const isEdit = !!rule
  const [name, setName] = useState(''); const [priority, setPriority] = useState(0)
  const [targetType, setTargetType] = useState('round_robin_team'); const [targetId, setTargetId] = useState('')
  const [channel, setChannel] = useState(''); const [pageUrl, setPageUrl] = useState(''); const [isActive, setIsActive] = useState(true)

  const { data: membersRes } = useQuery({ queryKey: ['org-members-routing'], queryFn: () => getOrgMembers(), enabled: open })
  const members: OrgMember[] = membersRes?.data ?? []
  const { data: teamsRes } = useQuery({ queryKey: ['teams'], queryFn: () => getTeams(), enabled: open })
  const teamList: Team[] = teamsRes?.data ?? []

  useEffect(() => {
    if (open && rule) {
      setName(rule.name); setPriority(rule.priority); setTargetType(rule.targetType); setTargetId(rule.targetId || ''); setIsActive(rule.isActive)
      const conds = rule.conditions as Record<string, string>; setChannel(conds.channel || ''); setPageUrl(conds.pageUrl || '')
    } else if (open) { setName(''); setPriority(0); setTargetType('round_robin_team'); setTargetId(''); setChannel(''); setPageUrl(''); setIsActive(true) }
  }, [open, rule])

  const createMut = useMutation({ mutationFn: (data: Record<string, unknown>) => createRoutingRule(data), onSuccess: () => { toast.success('规则创建成功'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败') })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateRoutingRule(id, data), onSuccess: () => { toast.success('规则更新成功'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  const needsTarget = targetType === 'agent' || targetType === 'team' || targetType === 'round_robin_team'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const conditions: Record<string, unknown> = {}
    if (channel.trim()) conditions.channel = channel.trim()
    if (pageUrl.trim()) conditions.pageUrl = pageUrl.trim()
    const data = { name: name.trim(), priority, targetType, isActive, conditions, ...(needsTarget && targetId ? { targetId } : {}) }
    if (isEdit && rule) updateMut.mutate({ id: rule.id, data }); else createMut.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑路由规则' : '新建路由规则'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">规则名称 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：定价页访客 → 销售" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
            <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} placeholder="数字越大越优先" /></div>
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">匹配条件</p>
          <div><label className="block text-xs text-slate-500 mb-1">渠道（可选）</label>
            <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="网站Widget / 企微 / 抖音" /></div>
          <div><label className="block text-xs text-slate-500 mb-1">页面 URL 包含（可选）</label>
            <Input value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="/pricing" /></div>
        </div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">分配目标</label>
          <Select value={targetType} onChange={(v) => { setTargetType(v); setTargetId('') }} options={TARGET_TYPE_OPTIONS} /></div>
        {targetType === 'agent' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">指定客服</label>
          <Select value={targetId} onChange={(v) => setTargetId(v)} options={[{ value: '', label: '请选择客服' }, ...members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }))]} /></div>)}
        {(targetType === 'team' || targetType === 'round_robin_team') && (<div><label className="block text-sm font-medium text-slate-700 mb-1">指定团队</label>
          <Select value={targetId} onChange={(v) => setTargetId(v)} options={[{ value: '', label: '请选择团队' }, ...teamList.map((t) => ({ value: t.id, label: `${t.name}${t.memberCount ? ` (${t.memberCount}人)` : ''}` }))]} />
          {teamList.length === 0 && <p className="text-xs text-slate-400 mt-1">暂无团队，请先在组织架构 → 团队中创建</p>}
        </div>)}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
          <span className="text-sm text-slate-700">启用此规则</span>
        </label>
        {(createMut.error || updateMut.error) && <p className="text-sm text-red-600">{(createMut.error || updateMut.error) instanceof Error ? (createMut.error || updateMut.error)!.message : '操作失败'}</p>}
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={createMut.isPending || updateMut.isPending}>{isEdit ? '保存' : '创建'}</Button></div>
      </form>
    </Dialog>
  )
}

// ─── Proactive Chat Section ───────────────────────────────────────────────

const PROACTIVE_TRIGGER_OPTIONS = [
  { value: 'time_on_page', label: '页面停留时间' }, { value: 'page_url', label: '页面 URL' },
  { value: 'scroll_depth', label: '滚动深度' }, { value: 'exit_intent', label: '离开意图' }, { value: 'returning_visitor', label: '回访访客' },
]
const PROACTIVE_TRIGGER_LABELS: Record<string, string> = {
  time_on_page: '停留时间', page_url: '页面匹配', scroll_depth: '滚动深度', exit_intent: '离开意图', returning_visitor: '回访',
}

function proactiveTriggerSummary(rule: ProactiveChatRule): string {
  const cfg = rule.triggerConfig
  if (rule.triggerType === 'time_on_page') return `${cfg.seconds ?? 30}秒后`
  if (rule.triggerType === 'page_url') return `URL: ${cfg.urlPattern ?? ''}`
  if (rule.triggerType === 'scroll_depth') return `滚动 ${cfg.depth ?? 50}%`
  if (rule.triggerType === 'exit_intent') return '检测到离开'
  if (rule.triggerType === 'returning_visitor') return '回访用户'
  return '-'
}

function ProactiveChatSection() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<ProactiveChatRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProactiveChatRule | null>(null)

  const { data: rulesRes, isLoading, isError } = useQuery({ queryKey: ['proactive-chat-rules'], queryFn: () => getProactiveChatRules(), staleTime: 5 * 60_000 })
  const rules: ProactiveChatRule[] = rulesRes?.data ?? []

  const deleteMut = useMutation({ mutationFn: (id: string) => deleteProactiveChatRule(id), onSuccess: () => { toast.success('规则已删除'); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['proactive-chat-rules'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败') })
  const toggleMut = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateProactiveChatRule(id, { isActive }), onSuccess: () => { toast.success('状态已更新'); queryClient.invalidateQueries({ queryKey: ['proactive-chat-rules'] }) }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  return (
    <>
      <Card className="max-w-4xl">
        <CardHeader><div className="flex items-center justify-between"><CardTitle>主动邀请规则</CardTitle>
          <Button variant="primary" size="sm" onClick={() => { setEditTarget(null); setShowForm(true) }}><Plus className="h-4 w-4" /> 新建规则</Button></div></CardHeader>
        <CardContent>
          {isLoading ? <LoadingPage /> : isError ? (
            <div className="py-8 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">加载失败</p></div>
          ) : rules.length === 0 ? (
            <div className="py-8 text-center"><MessageCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无主动邀请规则</p></div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>触发条件</TableHead><TableHead>消息预览</TableHead><TableHead>延迟(秒)</TableHead><TableHead>启用</TableHead><TableHead className="w-24">操作</TableHead></TableRow></TableHeader>
              <TableBody>{rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell><Badge variant="default">{PROACTIVE_TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}</Badge>
                    <span className="text-xs text-slate-400 ml-1">{proactiveTriggerSummary(rule)}</span></TableCell>
                  <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{rule.message}</TableCell>
                  <TableCell className="text-slate-600">{rule.displayDelay}</TableCell>
                  <TableCell><input type="checkbox" checked={rule.isActive} onChange={() => toggleMut.mutate({ id: rule.id, isActive: !rule.isActive })} className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer" /></TableCell>
                  <TableCell><div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditTarget(rule); setShowForm(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteTarget(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      <ProactiveChatFormDialog open={showForm} rule={editTarget}
        onClose={() => { setShowForm(false); setEditTarget(null) }}
        onSuccess={() => { setShowForm(false); setEditTarget(null); queryClient.invalidateQueries({ queryKey: ['proactive-chat-rules'] }) }} />
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-slate-600 mb-4">确定要删除规则「{deleteTarget?.name}」吗？</p>
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>删除</Button></div>
      </Dialog>
    </>
  )
}

function ProactiveChatFormDialog({ open, rule, onClose, onSuccess }: { open: boolean; rule: ProactiveChatRule | null; onClose: () => void; onSuccess: () => void }) {
  const isEdit = !!rule
  const [name, setName] = useState(''); const [triggerType, setTriggerType] = useState('time_on_page')
  const [seconds, setSeconds] = useState('30'); const [urlPattern, setUrlPattern] = useState(''); const [scrollDepth, setScrollDepth] = useState('70')
  const [message, setMessage] = useState(''); const [displayDelay, setDisplayDelay] = useState('0'); const [maxShowCount, setMaxShowCount] = useState('1'); const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (open && rule) {
      setName(rule.name); setTriggerType(rule.triggerType); setMessage(rule.message); setDisplayDelay(String(rule.displayDelay)); setMaxShowCount(String(rule.maxShowCount)); setIsActive(rule.isActive)
      const cfg = rule.triggerConfig; setSeconds(String(cfg.seconds ?? 30)); setUrlPattern((cfg.urlPattern as string) ?? ''); setScrollDepth(String(cfg.depth ?? 70))
    } else if (open) { setName(''); setTriggerType('time_on_page'); setSeconds('30'); setUrlPattern(''); setScrollDepth('70'); setMessage(''); setDisplayDelay('0'); setMaxShowCount('1'); setIsActive(true) }
  }, [open, rule])

  const createMut = useMutation({ mutationFn: (data: Record<string, unknown>) => createProactiveChatRule(data), onSuccess: () => { toast.success('规则创建成功'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败') })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateProactiveChatRule(id, data), onSuccess: () => { toast.success('规则更新成功'); onSuccess() }, onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败') })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let triggerConfig: Record<string, unknown> = {}
    if (triggerType === 'time_on_page') triggerConfig = { seconds: parseInt(seconds) || 30 }
    else if (triggerType === 'page_url') triggerConfig = { urlPattern }
    else if (triggerType === 'scroll_depth') triggerConfig = { depth: parseInt(scrollDepth) || 70 }
    const data = { name: name.trim(), triggerType, triggerConfig, message: message.trim(), displayDelay: parseInt(displayDelay) || 0, maxShowCount: parseInt(maxShowCount) || 1, isActive }
    if (isEdit && rule) updateMut.mutate({ id: rule.id, data }); else createMut.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑主动邀请规则' : '新建主动邀请规则'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-700 mb-1">规则名称 *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：定价页30秒邀请" required /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">触发类型</label>
          <Select value={triggerType} onChange={(v) => setTriggerType(v)} options={PROACTIVE_TRIGGER_OPTIONS} /></div>
        {triggerType === 'time_on_page' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">停留秒数</label>
          <Input type="number" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="30" min={1} /></div>)}
        {triggerType === 'page_url' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">URL 匹配模式</label>
          <Input value={urlPattern} onChange={(e) => setUrlPattern(e.target.value)} placeholder="/pricing" /></div>)}
        {triggerType === 'scroll_depth' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">滚动百分比</label>
          <Input type="number" value={scrollDepth} onChange={(e) => setScrollDepth(e.target.value)} placeholder="70" min={1} max={100} /></div>)}
        <div><label className="block text-sm font-medium text-slate-700 mb-1">邀请消息 *</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="您好！看到您正在浏览我们的产品，有什么可以帮您的吗？"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/40" required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">显示延迟（秒）</label>
            <Input type="number" value={displayDelay} onChange={(e) => setDisplayDelay(e.target.value)} min={0} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">每次会话最多显示</label>
            <Input type="number" value={maxShowCount} onChange={(e) => setMaxShowCount(e.target.value)} min={1} /></div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
          <span className="text-sm text-slate-700">启用此规则</span>
        </label>
        {(createMut.error || updateMut.error) && <p className="text-sm text-red-600">{(createMut.error || updateMut.error) instanceof Error ? (createMut.error || updateMut.error)!.message : '操作失败'}</p>}
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={createMut.isPending || updateMut.isPending}>{isEdit ? '保存' : '创建'}</Button></div>
      </form>
    </Dialog>
  )
}
