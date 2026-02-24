'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLead, updateLead, convertLead, assignLead, rescoreLead, getOrgMembers, type Lead, type OrgMember } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft, UserPlus, Phone, Mail, MessageSquare, Building, Pencil, Clock,
  Sparkles, StickyNote, Save, RefreshCw, CheckCircle2, ArrowRight, Copy, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Breadcrumb } from '@/components/breadcrumb'

const STATUS_FLOW = [
  { value: 'new', label: '新线索', color: 'bg-blue-500' },
  { value: 'contacted', label: '已联系', color: 'bg-indigo-500' },
  { value: 'qualified', label: '已筛选', color: 'bg-amber-500' },
  { value: 'converted', label: '已转化', color: 'bg-green-500' },
]

const statusLabel: Record<string, string> = {
  new: '新线索', contacted: '已联系', qualified: '已筛选',
  converted: '已转化', disqualified: '已淘汰',
}
const statusVariant: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'danger'> = {
  new: 'primary', contacted: 'default', qualified: 'warning', converted: 'success', disqualified: 'danger',
}
const sourceLabel: Record<string, string> = {
  wecom: '企微', douyin: '抖音', xiaohongshu: '小红书', baidu: '百度',
  kuaishou: '快手', bilibili: 'B站', zhihu: '知乎', manual: '手动录入',
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const id = params.id as string
  const [showEdit, setShowEdit] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLead(id),
    staleTime: 30_000,
  })

  const lead = res?.data as Lead | undefined

  const rescoreMutation = useMutation({
    mutationFn: () => rescoreLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      toast.success('评分已更新')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'AI 评分失败'),
  })

  const [convertedCustomerId, setConvertedCustomerId] = useState<string | null>(null)
  const convertMutation = useMutation({
    mutationFn: () => convertLead(id),
    onSuccess: (res) => {
      const cid = (res.data as { customer?: { id?: string } })?.customer?.id
      if (cid) setConvertedCustomerId(cid)
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('转化成功！已创建对应客户')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '转化失败'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateLead(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('状态已更新')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  if (isLoading) return <LoadingPage />
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-500">加载失败，请刷新重试</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/leads')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }
  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-slate-500">线索不存在</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/leads')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label}已复制`))
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: '线索', href: '/dashboard/leads' }, { label: lead.contactName || '未命名线索' }]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> 返回
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAssign(true)}>
            <UserPlus className="h-4 w-4" /> 分配
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4" /> 编辑
          </Button>
          {lead.status !== 'converted' && lead.status !== 'disqualified' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => convertMutation.mutate()}
              loading={convertMutation.isPending}
            >
              转化为客户
            </Button>
          )}
        </div>
      </div>

      {/* Converted Banner */}
      {(lead.status === 'converted' && (lead.customerId || convertedCustomerId)) && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700">此线索已转化为客户</span>
          <Link href={`/dashboard/customers/${lead.customerId ?? convertedCustomerId}`} className="text-sm text-primary font-medium hover:underline ml-auto flex items-center gap-1">
            查看客户 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Status Flow Progress */}
      {lead.status !== 'disqualified' && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              {STATUS_FLOW.map((step, idx) => {
                const currentIdx = STATUS_FLOW.findIndex(s => s.value === lead.status)
                const isCompleted = idx < currentIdx
                const isCurrent = idx === currentIdx
                const isClickable = idx === currentIdx + 1 && lead.status !== 'converted'
                return (
                  <div key={step.value} className="flex items-center flex-1">
                    {idx > 0 && (
                      <div className={cn('flex-1 h-1 mx-2 rounded-full transition-colors', isCompleted || isCurrent ? 'bg-primary' : 'bg-slate-200')} />
                    )}
                    <button
                      onClick={() => {
                        if (isClickable) {
                          if (step.value === 'converted') {
                            convertMutation.mutate()
                          } else {
                            statusMutation.mutate(step.value)
                          }
                        }
                      }}
                      disabled={!isClickable}
                      className={cn(
                        'flex flex-col items-center gap-1.5 group transition-all',
                        isClickable && 'cursor-pointer'
                      )}
                      title={isClickable ? `推进到 ${step.label}` : step.label}
                    >
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all',
                        isCompleted ? 'bg-primary border-primary text-white' :
                        isCurrent ? 'bg-primary/10 border-primary text-primary ring-4 ring-primary/10' :
                        isClickable ? 'bg-white border-dashed border-primary/50 text-primary/50 group-hover:border-primary group-hover:text-primary' :
                        'bg-white border-slate-300 text-slate-400'
                      )}>
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                      </div>
                      <span className={cn(
                        'text-xs font-medium whitespace-nowrap',
                        isCurrent ? 'text-primary' : isCompleted ? 'text-slate-600' : 'text-slate-400'
                      )}>
                        {step.label}
                      </span>
                      {isClickable && (
                        <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          点击推进 →
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">基本信息</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote className="h-4 w-4 mr-1" /> 跟进备注</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="h-4 w-4 mr-1" /> 活动记录</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Info */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar name={lead.contactName ?? 'L'} size="lg" />
                      <div>
                        <CardTitle className="text-xl">{lead.contactName || '未命名线索'}</CardTitle>
                        <p className="text-slate-600 mt-1">
                          {lead.companyName && `${lead.companyName} · `}
                          {sourceLabel[lead.sourcePlatform] ?? lead.sourcePlatform}
                        </p>
                      </div>
                    </div>
                    <Badge variant={statusVariant[lead.status] ?? 'default'}>
                      {statusLabel[lead.status] ?? lead.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Contact Info with copy buttons */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {lead.contactPhone && (
                      <div className="flex items-center gap-2 group">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-500 text-xs">手机号</span>
                          <p className="font-medium">{lead.contactPhone}</p>
                        </div>
                        <button onClick={() => copyToClipboard(lead.contactPhone!, '手机号')} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-primary" />
                        </button>
                      </div>
                    )}
                    {lead.contactEmail && (
                      <div className="flex items-center gap-2 group">
                        <Mail className="h-4 w-4 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-500 text-xs">邮箱</span>
                          <p className="font-medium truncate">{lead.contactEmail}</p>
                        </div>
                        <button onClick={() => copyToClipboard(lead.contactEmail!, '邮箱')} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-primary" />
                        </button>
                      </div>
                    )}
                    {lead.contactWechat && (
                      <div className="flex items-center gap-2 group">
                        <MessageSquare className="h-4 w-4 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-500 text-xs">微信</span>
                          <p className="font-medium">{lead.contactWechat}</p>
                        </div>
                        <button onClick={() => copyToClipboard(lead.contactWechat!, '微信号')} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-primary" />
                        </button>
                      </div>
                    )}
                    {lead.companyIndustry && (
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-slate-400" />
                        <div>
                          <span className="text-slate-500 text-xs">行业</span>
                          <p className="font-medium">{lead.companyIndustry}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Contact Actions */}
                  {(lead.contactPhone || lead.contactEmail) && (
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      {lead.contactPhone && (
                        <a href={`tel:${lead.contactPhone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 text-green-700 px-3 py-1.5 text-sm font-medium hover:bg-green-100 transition-colors">
                          <Phone className="h-3.5 w-3.5" /> 拨打电话
                        </a>
                      )}
                      {lead.contactEmail && (
                        <a href={`mailto:${lead.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 text-blue-700 px-3 py-1.5 text-sm font-medium hover:bg-blue-100 transition-colors">
                          <Mail className="h-3.5 w-3.5" /> 发送邮件
                        </a>
                      )}
                    </div>
                  )}

                  <hr className="border-slate-200" />
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    创建于 {new Date(lead.createdAt).toLocaleString('zh-CN')}
                    {lead.updatedAt !== lead.createdAt && (
                      <span>· 更新于 {new Date(lead.updatedAt).toLocaleString('zh-CN')}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Score Card */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">线索评分</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => rescoreMutation.mutate()}
                      loading={rescoreMutation.isPending}
                      className="text-primary h-7 text-xs"
                    >
                      <RefreshCw className="h-3 w-3" /> 重新评分
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <div className="relative">
                    <svg className="w-24 h-24" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="40" fill="none"
                        stroke={lead.score >= 80 ? '#10b981' : lead.score >= 60 ? '#f59e0b' : '#94a3b8'}
                        strokeWidth="8"
                        strokeDasharray={`${(lead.score / 100) * 251.2} 251.2`}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={cn(
                        'text-2xl font-bold',
                        lead.score >= 80 ? 'text-success' : lead.score >= 60 ? 'text-warning' : 'text-slate-500'
                      )}>
                        {lead.score}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    {lead.score >= 80 ? '高质量线索' : lead.score >= 60 ? '中等质量' : '待培育'}
                  </p>
                  {lead.scoreDetails?.aiAnalysis && (
                    <div className="mt-3 w-full rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-primary">
                        <Sparkles className="h-3 w-3" /> AI 评分分析
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{lead.scoreDetails.aiAnalysis}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Source Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">来源详情</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">平台</span>
                    <Badge variant="outline">{sourceLabel[lead.sourcePlatform] ?? lead.sourcePlatform}</Badge>
                  </div>
                  {lead.sourceDetail && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">详情</span>
                      <span>{lead.sourceDetail}</span>
                    </div>
                  )}
                  {lead.assignedTo && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">负责人</span>
                      <span className="font-medium">已分配</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Status Update */}
              {lead.status !== 'converted' && lead.status !== 'disqualified' && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">快速操作</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {lead.status === 'new' && (
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => statusMutation.mutate('contacted')}>
                        <ArrowRight className="h-3.5 w-3.5 mr-1" /> 标记为已联系
                      </Button>
                    )}
                    {lead.status === 'contacted' && (
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => statusMutation.mutate('qualified')}>
                        <ArrowRight className="h-3.5 w-3.5 mr-1" /> 标记为已筛选
                      </Button>
                    )}
                    {lead.status === 'qualified' && (
                      <Button variant="primary" size="sm" className="w-full justify-start" onClick={() => convertMutation.mutate()} loading={convertMutation.isPending}>
                        <ArrowRight className="h-3.5 w-3.5 mr-1" /> 转化为客户
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        const ok = await confirm({
                          title: '确认淘汰',
                          description: '此操作不可撤销，确定要淘汰此线索吗？',
                          confirmText: '淘汰',
                          variant: 'danger',
                        })
                        if (!ok) return
                        statusMutation.mutate('disqualified')
                      }}
                    >
                      淘汰线索
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <LeadNotesSection lead={lead} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> 活动时间线
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-0">
                <TimelineItem
                  icon={<Clock className="h-4 w-4" />}
                  title="线索创建"
                  time={lead.createdAt}
                  desc={`来源: ${sourceLabel[lead.sourcePlatform] ?? lead.sourcePlatform}${lead.contactName ? ` · 联系人: ${lead.contactName}` : ''}`}
                  isFirst
                />
                {lead.assignedTo && (
                  <TimelineItem
                    icon={<UserPlus className="h-4 w-4" />}
                    title="线索已分配"
                    time={lead.updatedAt}
                    desc="已分配给团队成员跟进"
                  />
                )}
                {(lead.status === 'contacted' || lead.status === 'qualified' || lead.status === 'converted') && (
                  <TimelineItem icon={<Phone className="h-4 w-4" />} title="已联系客户" time={lead.updatedAt} />
                )}
                {(lead.status === 'qualified' || lead.status === 'converted') && (
                  <TimelineItem icon={<CheckCircle2 className="h-4 w-4" />} title="线索已筛选通过" time={lead.updatedAt} />
                )}
                {lead.status === 'converted' && (
                  <TimelineItem
                    icon={<UserPlus className="h-4 w-4" />}
                    title="已转化为客户"
                    time={lead.updatedAt}
                    desc="线索已成功转化"
                    highlight
                  />
                )}
                {lead.status === 'disqualified' && (
                  <TimelineItem
                    icon={<Clock className="h-4 w-4" />}
                    title="线索已淘汰"
                    time={lead.updatedAt}
                  />
                )}
                {lead.notes && (
                  <TimelineItem
                    icon={<StickyNote className="h-4 w-4" />}
                    title="跟进备注已更新"
                    time={lead.updatedAt}
                    desc={lead.notes.length > 100 ? `${lead.notes.slice(0, 100)}...` : lead.notes}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditLeadDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        lead={lead}
        onSuccess={() => {
          setShowEdit(false)
          queryClient.invalidateQueries({ queryKey: ['lead', id] })
          queryClient.invalidateQueries({ queryKey: ['leads'] })
        }}
      />
      <AssignLeadDialog
        open={showAssign}
        onClose={() => setShowAssign(false)}
        leadId={id}
        currentAssignee={lead.assignedTo}
        onSuccess={() => {
          setShowAssign(false)
          queryClient.invalidateQueries({ queryKey: ['lead', id] })
          queryClient.invalidateQueries({ queryKey: ['leads'] })
        }}
      />
    </div>
  )
}

function TimelineItem({ icon, title, time, desc, isFirst, highlight }: {
  icon: React.ReactNode; title: string; time?: string; desc?: string; isFirst?: boolean; highlight?: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          'rounded-full p-2',
          highlight ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'
        )}>
          {icon}
        </div>
        <div className="w-px flex-1 bg-slate-200 mt-1" />
      </div>
      <div className="pb-6">
        <p className={cn('font-medium text-sm', highlight && 'text-green-700')}>{title}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
        {time && <p className="text-xs text-slate-400 mt-0.5">{new Date(time).toLocaleString('zh-CN')}</p>}
      </div>
    </div>
  )
}

function LeadNotesSection({ lead, onUpdate }: { lead: Lead; onUpdate: () => void }) {
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setNotes(lead.notes ?? '') }, [lead.notes])

  const mutation = useMutation({
    mutationFn: () => updateLead(lead.id, { notes }),
    onSuccess: () => { onUpdate(); setSaved(true); setTimeout(() => setSaved(false), 2000) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-primary" /> 跟进备注
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="记录跟进情况、客户需求、沟通要点...&#10;&#10;例如：&#10;- 2026/02/22 电话联系，客户对产品感兴趣&#10;- 已发送产品资料，等待回复"
          className="min-h-[200px]"
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => mutation.mutate()} loading={mutation.isPending}>
            <Save className="h-3.5 w-3.5" /> 保存备注
          </Button>
          {saved && <span className="text-sm text-success animate-pulse">已保存</span>}
          {mutation.error && <span className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : '保存失败'}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function EditLeadDialog({ open, onClose, lead, onSuccess }: { open: boolean; onClose: () => void; lead: Lead; onSuccess: () => void }) {
  const [form, setForm] = useState({
    contactName: lead.contactName ?? '',
    contactPhone: lead.contactPhone ?? '',
    contactEmail: lead.contactEmail ?? '',
    contactWechat: lead.contactWechat ?? '',
    companyName: lead.companyName ?? '',
    companyIndustry: lead.companyIndustry ?? '',
    status: lead.status,
  })

  useEffect(() => {
    if (open) {
      setForm({
        contactName: lead.contactName ?? '',
        contactPhone: lead.contactPhone ?? '',
        contactEmail: lead.contactEmail ?? '',
        contactWechat: lead.contactWechat ?? '',
        companyName: lead.companyName ?? '',
        companyIndustry: lead.companyIndustry ?? '',
        status: lead.status,
      })
    }
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: () => updateLead(lead.id, form),
    onSuccess: () => { toast.success('线索编辑成功'); onSuccess() },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose} title="编辑线索">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">联系人</label>
          <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
            <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">微信</label>
            <Input value={form.contactWechat} onChange={(e) => setForm({ ...form, contactWechat: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
            <Select
              options={[
                { value: 'new', label: '新线索' }, { value: 'contacted', label: '已联系' },
                { value: 'qualified', label: '已筛选' }, { value: 'converted', label: '已转化' },
                { value: 'disqualified', label: '已淘汰' },
              ]}
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">公司名称</label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">行业</label>
            <Input value={form.companyIndustry} onChange={(e) => setForm({ ...form, companyIndustry: e.target.value })} />
          </div>
        </div>
        {mutation.error && <p className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : '保存失败'}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>保存</Button>
        </div>
      </form>
    </Dialog>
  )
}

function AssignLeadDialog({ open, onClose, leadId, currentAssignee, onSuccess }: {
  open: boolean; onClose: () => void; leadId: string; currentAssignee?: string | null; onSuccess: () => void
}) {
  const [selectedMember, setSelectedMember] = useState(currentAssignee ?? '')

  const { data: membersRes, isLoading, isError } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => getOrgMembers(),
    enabled: open,
  })
  const members: OrgMember[] = membersRes?.data ?? []

  useEffect(() => {
    if (open) setSelectedMember(currentAssignee ?? '')
  }, [open, currentAssignee])

  const mutation = useMutation({
    mutationFn: () => assignLead(leadId, selectedMember),
    onSuccess: () => { toast.success('线索分配成功'); onSuccess() },
    onError: (e) => toast.error(e instanceof Error ? e.message : '分配失败'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose} title="分配线索">
      <form onSubmit={(e) => { e.preventDefault(); if (selectedMember) mutation.mutate() }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">选择负责人</label>
          {isLoading ? (
            <p className="text-sm text-slate-500">加载中...</p>
          ) : isError ? (
            <p className="text-sm text-red-500">加载失败</p>
          ) : members.length > 0 ? (
            <Select
              options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }))}
              value={selectedMember}
              onChange={setSelectedMember}
              placeholder="选择团队成员"
            />
          ) : (
            <p className="text-sm text-slate-500">暂无团队成员</p>
          )}
        </div>
        {mutation.error && <p className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : '分配失败'}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!selectedMember}>确认分配</Button>
        </div>
      </form>
    </Dialog>
  )
}
