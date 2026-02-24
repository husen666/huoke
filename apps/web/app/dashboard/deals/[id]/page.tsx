'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDeal, updateDeal, deleteDeal, getCustomer, type Deal, type Customer } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { ArrowLeft, Pencil, Trash2, Save, DollarSign, User, Calendar, TrendingUp, X, CheckCircle2, Clock, FileText, Target, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'
import Link from 'next/link'
import { Breadcrumb } from '@/components/breadcrumb'

const STAGES = [
  { value: 'initial', label: '初步接触', color: '#6366f1' },
  { value: 'qualified', label: '需求确认', color: '#3b82f6' },
  { value: 'proposal', label: '方案报价', color: '#f59e0b' },
  { value: 'negotiation', label: '商务谈判', color: '#f97316' },
  { value: 'won', label: '赢单', color: '#10b981' },
  { value: 'lost', label: '丢单', color: '#ef4444' },
]
const stageLabel: Record<string, string> = Object.fromEntries(STAGES.map(s => [s.value, s.label]))
const stageBgMap: Record<string, string> = {
  initial: 'bg-indigo-100 text-indigo-700', qualified: 'bg-blue-100 text-blue-700',
  proposal: 'bg-amber-100 text-amber-700', negotiation: 'bg-orange-100 text-orange-700',
  won: 'bg-green-100 text-green-700', lost: 'bg-red-100 text-red-700',
}

export default function DealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const id = params.id as string
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', amount: '', stage: '', probability: '', expectedCloseDate: '', notes: '' })

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['deal', id],
    queryFn: () => getDeal(id),
  })

  const deal = res?.data as Deal | undefined

  const { data: custRes } = useQuery({
    queryKey: ['customer', deal?.customerId],
    queryFn: () => getCustomer(deal!.customerId),
    enabled: !!deal?.customerId,
  })
  const customer = custRes?.data as Customer | undefined

  const startEdit = () => {
    if (!deal) return
    setForm({
      title: deal.title,
      amount: deal.amount,
      stage: deal.stage,
      probability: String(deal.probability ?? ''),
      expectedCloseDate: deal.expectedCloseDate?.slice(0, 10) ?? '',
      notes: deal.notes ?? '',
    })
    setEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const data: Record<string, unknown> = {
        title: form.title,
        amount: parseFloat(form.amount) || 0,
        stage: form.stage,
      }
      if (form.probability) data.probability = parseInt(form.probability, 10)
      if (form.expectedCloseDate) data.expectedCloseDate = form.expectedCloseDate
      if (form.notes) data.notes = form.notes
      return updateDeal(id, data)
    },
    onSuccess: () => {
      toast.success('商机更新成功')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['deal', id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteDeal(id),
    onSuccess: () => {
      toast.success('商机已删除')
      router.push('/dashboard/deals')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-500">加载失败，请重试</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/deals')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-slate-500">商机不存在</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/deals')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: '商机', href: '/dashboard/deals' }, { label: deal.title }]} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/deals')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{deal.title}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${stageBgMap[deal.stage] ?? 'bg-slate-100 text-slate-700'}`}>
            {stageLabel[deal.stage] ?? deal.stage}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4 mr-1" /> 编辑
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-600"
                onClick={async () => {
                  const ok = await confirm({
                    title: '确认删除',
                    description: '此操作不可撤销，确定要删除此商机吗？',
                    confirmText: '删除',
                    variant: 'danger',
                  })
                  if (!ok) return
                  deleteMutation.mutate()
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> 删除
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-1" /> 取消
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>商机信息</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">标题</label>
                      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">金额 (¥)</label>
                      <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">阶段</label>
                        <Select
                        options={STAGES.map(s => ({ value: s.value, label: s.label }))}
                        value={form.stage}
                        onChange={(v) => setForm({ ...form, stage: v })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">概率 (%)</label>
                      <Input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">预计成交日期</label>
                      <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">备注</label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} />
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <InfoItem icon={DollarSign} label="金额" value={`¥${Number(deal.amount).toLocaleString()}`} />
                  <InfoItem icon={TrendingUp} label="概率" value={deal.probability != null ? `${deal.probability}%` : '-'} />
                  <InfoItem icon={Calendar} label="预计成交" value={deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString('zh-CN') : '-'} />
                  <InfoItem icon={Calendar} label="实际成交" value={deal.actualCloseDate ? new Date(deal.actualCloseDate).toLocaleDateString('zh-CN') : '-'} />
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500 mb-1">备注</p>
                    <p className="text-sm text-slate-700">{deal.notes || '暂无备注'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>关联客户</CardTitle></CardHeader>
            <CardContent>
              {customer ? (
                <Link
                  href={`/dashboard/customers/${customer.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{customer.name}</p>
                    <p className="text-xs text-slate-500">{customer.companyName ?? customer.email ?? '-'}</p>
                  </div>
                </Link>
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">未关联客户</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>时间线</CardTitle></CardHeader>
            <CardContent>
              <DealTimeline deal={deal} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-slate-600" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  )
}

function DealTimeline({ deal }: { deal: Deal }) {
  const stageIndex = STAGES.findIndex(s => s.value === deal.stage)
  const now = new Date()

  interface TimelineItem {
    date: Date
    label: string
    detail: string
    icon: React.ReactNode
    color: string
    isFuture?: boolean
  }

  const items: TimelineItem[] = [
    {
      date: new Date(deal.createdAt),
      label: '商机创建',
      detail: `创建了商机「${deal.title}」`,
      icon: <Circle className="h-3.5 w-3.5" />,
      color: 'text-blue-500',
    },
  ]

  if (stageIndex > 0) {
    for (let i = 1; i <= Math.min(stageIndex, STAGES.length - 1); i++) {
      const stg = STAGES[i]
      if (stg.value === 'won' || stg.value === 'lost') continue
      items.push({
        date: new Date(deal.updatedAt),
        label: `进入「${stg.label}」阶段`,
        detail: `商机推进到${stg.label}阶段`,
        icon: <Target className="h-3.5 w-3.5" />,
        color: 'text-indigo-500',
      })
    }
  }

  if (deal.notes) {
    items.push({
      date: new Date(deal.updatedAt),
      label: '备注',
      detail: deal.notes,
      icon: <FileText className="h-3.5 w-3.5" />,
      color: 'text-slate-500',
    })
  }

  if (deal.expectedCloseDate) {
    const expectedDate = new Date(deal.expectedCloseDate)
    const isFuture = expectedDate > now
    items.push({
      date: expectedDate,
      label: isFuture ? '预计成交' : '预计成交日期已过',
      detail: `预计成交日期: ${expectedDate.toLocaleDateString('zh-CN')}`,
      icon: <Calendar className="h-3.5 w-3.5" />,
      color: isFuture ? 'text-amber-500' : 'text-red-400',
      isFuture,
    })
  }

  if (deal.stage === 'won') {
    items.push({
      date: deal.actualCloseDate ? new Date(deal.actualCloseDate) : new Date(deal.updatedAt),
      label: '赢单',
      detail: `商机成功赢单，金额 ¥${Number(deal.amount).toLocaleString()}`,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      color: 'text-green-500',
    })
  }

  if (deal.stage === 'lost') {
    items.push({
      date: deal.actualCloseDate ? new Date(deal.actualCloseDate) : new Date(deal.updatedAt),
      label: '丢单',
      detail: '商机已丢失',
      icon: <X className="h-3.5 w-3.5" />,
      color: 'text-red-500',
    })
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <div className="relative">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
              item.isFuture ? 'border-dashed border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
            } ${item.color}`}>
              {item.icon}
            </div>
            {idx < items.length - 1 && (
              <div className={`w-px flex-1 mt-1 ${item.isFuture ? 'border-l-2 border-dashed border-slate-200' : 'bg-slate-200'}`} style={{ minHeight: '20px' }} />
            )}
          </div>
          <div className="pt-0.5 min-w-0 flex-1">
            <p className={`text-sm font-medium ${item.isFuture ? 'text-amber-600' : 'text-slate-700'}`}>{item.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              <Clock className="inline h-3 w-3 mr-0.5" />
              {item.date.toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
