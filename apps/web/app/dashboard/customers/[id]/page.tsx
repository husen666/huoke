'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomer, updateCustomer, getCustomerTimeline, getConversations,
  getDeals, updateCustomerTags, getTags, getTickets, createConversation,
  type Customer, type Conversation, type Deal, type Tag, type Ticket,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { Avatar } from '@/components/ui/avatar'
import { ArrowLeft, Phone, Mail, MessageSquare, Building, Pencil, Activity, Handshake, DollarSign, Tag as TagIcon, Plus, X, ClipboardList, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/breadcrumb'

const stageLabel: Record<string, string> = {
  potential: '潜在客户', active: '活跃客户', inactive: '不活跃', churned: '已流失',
  lead: '线索', opportunity: '商机', negotiation: '谈判', won: '成交', lost: '流失',
}
const stageVariant: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  potential: 'default', active: 'primary', inactive: 'warning', churned: 'default',
  lead: 'default', opportunity: 'primary', negotiation: 'warning', won: 'success',
}
const stageOptions = [
  { value: 'potential', label: '潜在客户' }, { value: 'active', label: '活跃客户' },
  { value: 'inactive', label: '不活跃' }, { value: 'churned', label: '已流失' },
  { value: 'lead', label: '线索' }, { value: 'opportunity', label: '商机' },
  { value: 'negotiation', label: '谈判' }, { value: 'won', label: '成交' }, { value: 'lost', label: '流失' },
]

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string
  const [showEdit, setShowEdit] = useState(false)

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id),
  })
  const customer = res?.data as Customer | undefined

  const { data: timelineRes, isError: timelineError } = useQuery({
    queryKey: ['customer-timeline', id],
    queryFn: () => getCustomerTimeline(id),
    enabled: !!customer,
  })
  const timeline = (timelineRes?.data ?? []) as { type: string; id: string; updatedAt?: string; createdAt: string; status?: string }[]

  if (isLoading) return <LoadingPage />
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-500">加载失败，请刷新重试</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/customers')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-slate-500">客户不存在</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/customers')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: '客户', href: '/dashboard/customers' }, { label: customer.name }]} />
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> 返回
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4" /> 编辑
          </Button>
          <Button variant="outline" onClick={async () => {
            try {
              const res = await createConversation({ customerId: id, channelType: 'internal' })
              if (res.data?.id) {
                toast.success('会话已创建')
                router.push(`/dashboard/service`)
              }
            } catch { toast.error('创建会话失败') }
          }}>
            <MessageSquare className="h-4 w-4" /> 创建会话
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={customer.name} size="lg" />
                <div>
                  <CardTitle className="text-lg">{customer.name}</CardTitle>
                  <p className="text-xs text-slate-500">{customer.type === 'enterprise' ? '企业客户' : '个人客户'}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant={stageVariant[customer.stage] ?? 'default'}>{stageLabel[customer.stage] ?? customer.stage}</Badge>
                {customer.tags?.map((t) => <Badge key={t.id} variant="secondary" className="text-xs">{t.name}</Badge>)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {customer.phone && (
                <div className="flex items-center gap-2 text-slate-600 group">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <span className="flex-1">{customer.phone}</span>
                  <button onClick={() => { navigator.clipboard.writeText(customer.phone ?? '').catch(() => {}); toast.success('已复制') }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Copy className="h-3 w-3 text-slate-400 hover:text-primary" />
                  </button>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2 text-slate-600 group">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="flex-1 truncate">{customer.email}</span>
                  <button onClick={() => { navigator.clipboard.writeText(customer.email ?? '').catch(() => {}); toast.success('已复制') }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Copy className="h-3 w-3 text-slate-400 hover:text-primary" />
                  </button>
                </div>
              )}
              {customer.wechatId && (
                <div className="flex items-center gap-2 text-slate-600 group">
                  <MessageSquare className="h-4 w-4 text-slate-400" />
                  <span className="flex-1">微信: {customer.wechatId}</span>
                  <button onClick={() => { navigator.clipboard.writeText(customer.wechatId ?? '').catch(() => {}); toast.success('已复制') }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Copy className="h-3 w-3 text-slate-400 hover:text-primary" />
                  </button>
                </div>
              )}
              {customer.companyName && <div className="flex items-center gap-2 text-slate-600"><Building className="h-4 w-4 text-slate-400" />{customer.companyName}</div>}
              {(customer.phone || customer.email) && (
                <div className="flex gap-2 pt-1">
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-green-50 text-green-700 py-1.5 text-xs font-medium hover:bg-green-100 transition-colors">
                      <Phone className="h-3 w-3" /> 拨打
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-blue-50 text-blue-700 py-1.5 text-xs font-medium hover:bg-blue-100 transition-colors">
                      <Mail className="h-3 w-3" /> 邮件
                    </a>
                  )}
                </div>
              )}
              <hr className="border-slate-200" />
              <div className="flex justify-between"><span className="text-slate-500">评分</span><span className="font-bold text-lg">{customer.score}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">行业</span><span>{customer.companyIndustry ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">创建时间</span><span className="text-xs">{new Date(customer.createdAt).toLocaleDateString('zh-CN')}</span></div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="conversations"><MessageSquare className="h-4 w-4 mr-1" /> 会话</TabsTrigger>
              <TabsTrigger value="deals"><Handshake className="h-4 w-4 mr-1" /> 商机</TabsTrigger>
              <TabsTrigger value="tickets"><ClipboardList className="h-4 w-4 mr-1" /> 工单</TabsTrigger>
              <TabsTrigger value="tags"><TagIcon className="h-4 w-4 mr-1" /> 标签</TabsTrigger>
              <TabsTrigger value="timeline"><Activity className="h-4 w-4 mr-1" /> 时间线</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <CustomerOverviewSection customerId={id} customer={customer} />
            </TabsContent>
            <TabsContent value="conversations" className="mt-4">
              <CustomerConversations customerId={id} />
            </TabsContent>
            <TabsContent value="deals" className="mt-4">
              <CustomerDeals customerId={id} />
            </TabsContent>
            <TabsContent value="tickets" className="mt-4">
              <CustomerTickets customerId={id} />
            </TabsContent>
            <TabsContent value="tags" className="mt-4">
              <CustomerTagManager customerId={id} currentTags={customer.tags ?? []} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['customer', id] })} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> 活动时间线</CardTitle></CardHeader>
                <CardContent>
                  {timelineError ? (
                    <p className="text-center text-red-500 py-8">加载活动记录失败</p>
                  ) : timeline.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">暂无活动记录</p>
                  ) : (
                    <ul className="space-y-4">
                      {timeline.map((item) => {
                        const typeLabel: Record<string, string> = { conversation: '会话', deal: '商机', ticket: '工单', campaign: '营销活动', note: '备注' }
                        const tlStatusLabel: Record<string, string> = { active: '进行中', pending: '待处理', resolved: '已解决', closed: '已关闭', open: '待处理', in_progress: '处理中', won: '赢单', lost: '丢单', draft: '草稿', running: '执行中', completed: '已完成' }
                        return (
                        <li key={`${item.type}-${item.id}`} className="flex gap-4 border-l-2 border-slate-200 pl-4">
                          <div>
                            <p className="text-sm font-medium">
                              {typeLabel[item.type] ?? item.type}
                              {item.status && <Badge variant="secondary" className="ml-2 text-xs">{tlStatusLabel[item.status] ?? item.status}</Badge>}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {new Date(item.updatedAt ?? item.createdAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </li>
                      )})}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EditCustomerDialog
        open={showEdit}
        customer={customer}
        onClose={() => setShowEdit(false)}
        onSuccess={() => { setShowEdit(false); queryClient.invalidateQueries({ queryKey: ['customer', id] }) }}
      />
    </div>
  )
}

function CustomerOverviewSection({ customerId, customer }: { customerId: string; customer: Customer }) {
  const { data: dealsRes } = useQuery({
    queryKey: ['deals', 'customer', customerId],
    queryFn: () => getDeals({ customerId }),
    staleTime: 30_000,
  })
  const deals = (dealsRes?.data ?? []) as Deal[]
  const { data: convsRes } = useQuery({
    queryKey: ['conversations', 'customer', customerId],
    queryFn: () => getConversations({ customerId }),
    staleTime: 30_000,
  })
  const convs = (convsRes?.data ?? []) as Conversation[]
  const { data: ticketsRes } = useQuery({
    queryKey: ['tickets', 'customer', customerId],
    queryFn: () => getTickets({ customerId }),
    staleTime: 30_000,
  })
  const tickets = (ticketsRes?.data ?? []) as Ticket[]

  const totalDealAmount = deals.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
  const wonDeals = deals.filter(d => d.stage === 'won')
  const wonAmount = wonDeals.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
  const activeDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
  const openTickets = tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className={cn(
              'text-3xl font-bold',
              (customer.score ?? 0) >= 80 ? 'text-green-500' : (customer.score ?? 0) >= 60 ? 'text-amber-500' : 'text-slate-500'
            )}>
              {customer.score ?? '-'}
            </p>
            <p className="text-xs text-slate-500 mt-1">客户评分</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-primary">{deals.length}</p>
            <p className="text-xs text-slate-500 mt-1">关联商机</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-slate-800">¥{wonAmount.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">成交金额</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-slate-800">{convs.length}</p>
            <p className="text-xs text-slate-500 mt-1">会话次数</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">客户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">阶段</span><Badge variant={stageVariant[customer.stage] ?? 'default'}>{stageLabel[customer.stage] ?? customer.stage}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-500">类型</span><span>{customer.type === 'enterprise' ? '企业客户' : '个人客户'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">标签</span><span>{customer.tags?.length ?? 0} 个</span></div>
            <div className="flex justify-between"><span className="text-slate-500">行业</span><span>{customer.companyIndustry ?? '-'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">创建时间</span><span>{new Date(customer.createdAt).toLocaleDateString('zh-CN')}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">待办提醒</CardTitle>
          </CardHeader>
          <CardContent>
            {activeDeals.length === 0 && openTickets.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">暂无待办</p>
            ) : (
              <ul className="space-y-2">
                {activeDeals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dashboard/deals/${d.id}`} className="flex items-center gap-2 text-sm hover:bg-slate-50 rounded p-1.5 -mx-1.5 transition-colors">
                      <Handshake className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate flex-1">{d.title}</span>
                      <span className="text-xs text-slate-400">¥{(parseFloat(d.amount) || 0).toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
                {openTickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/dashboard/tickets/${t.id}`} className="flex items-center gap-2 text-sm hover:bg-slate-50 rounded p-1.5 -mx-1.5 transition-colors">
                      <ClipboardList className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="truncate flex-1">{t.title}</span>
                      <Badge variant="warning" className="text-xs shrink-0">{{ low: '低', medium: '中', high: '高', urgent: '紧急' }[t.priority] ?? t.priority}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CustomerConversations({ customerId }: { customerId: string }) {
  const { data: convsRes, isLoading, isError } = useQuery({
    queryKey: ['conversations', 'customer', customerId],
    queryFn: () => getConversations({ customerId }),
  })
  const convs = (convsRes?.data ?? []) as Conversation[]

  const statusLabel: Record<string, string> = { active: '进行中', pending: '待处理', resolved: '已解决', closed: '已关闭' }
  const channelLabel: Record<string, string> = { web_widget: '网页咨询', wecom: '企业微信', wechat: '微信', douyin: '抖音', xiaohongshu: '小红书', sms: '短信', email: '邮件', internal: '内部会话' }

  if (isLoading) return <Card><CardContent className="py-8"><LoadingPage /></CardContent></Card>

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> 会话记录</CardTitle>
          <Link href="/dashboard/inbox" className="text-sm text-primary hover:underline">查看全部</Link>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-red-500 py-4">加载会话失败</p>
        ) : convs.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p>暂无会话记录</p>
            <Link href="/dashboard/inbox" className="text-sm text-primary hover:underline mt-2 inline-block">前往消息中心创建</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {convs.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/dashboard/inbox?conv=${conv.id}`}
                  className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                >
                  <MessageSquare className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{conv.lastMessagePreview || '新会话'}</p>
                    <p className="text-xs text-slate-500">
                      {channelLabel[conv.channelType] ?? conv.channelType} · {conv.messageCount} 条消息
                      {conv.lastMessageAt && ` · ${new Date(conv.lastMessageAt).toLocaleString('zh-CN')}`}
                    </p>
                  </div>
                  <Badge variant={conv.status === 'resolved' ? 'success' : conv.status === 'active' ? 'primary' : 'default'}>
                    {statusLabel[conv.status] ?? conv.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const DEAL_STAGE_LABEL: Record<string, string> = {
  initial: '初步接触', qualified: '需求确认', proposal: '方案报价',
  negotiation: '商务谈判', won: '赢单', lost: '丢单',
}

function CustomerDeals({ customerId }: { customerId: string }) {
  const { data: dealsRes, isLoading, isError } = useQuery({
    queryKey: ['deals', 'customer', customerId],
    queryFn: () => getDeals({ customerId }),
  })
  const deals = (dealsRes?.data ?? []) as Deal[]

  if (isLoading) return <Card><CardContent className="py-8"><LoadingPage /></CardContent></Card>

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Handshake className="h-5 w-5" /> 关联商机</CardTitle>
          <Link href="/dashboard/deals" className="text-sm text-primary hover:underline">查看全部</Link>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-red-500 py-4">加载商机失败</p>
        ) : deals.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <Handshake className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p>暂无关联商机</p>
            <Link href="/dashboard/deals" className="text-sm text-primary hover:underline mt-2 inline-block">前往商机管理创建</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {deals.map((deal) => (
              <Link key={deal.id} href={`/dashboard/deals/${deal.id}`} className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors">
                <DollarSign className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{deal.title}</p>
                  <p className="text-xs text-slate-500">
                    ¥{(parseFloat(deal.amount) || 0).toLocaleString()} · {DEAL_STAGE_LABEL[deal.stage] ?? deal.stage}
                    {deal.expectedCloseDate && ` · 预计 ${new Date(deal.expectedCloseDate).toLocaleDateString('zh-CN')}`}
                  </p>
                </div>
                <Badge variant={deal.stage === 'won' ? 'success' : deal.stage === 'lost' ? 'default' : 'primary'}>
                  {DEAL_STAGE_LABEL[deal.stage] ?? deal.stage}
                </Badge>
              </Link>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: '待处理', in_progress: '处理中', pending: '挂起', resolved: '已解决', closed: '已关闭',
}
const TICKET_STATUS_VARIANT: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  open: 'default', in_progress: 'primary', pending: 'warning', resolved: 'success', closed: 'default',
}
const TICKET_PRIORITY_LABEL: Record<string, string> = {
  low: '低', medium: '中', high: '高', urgent: '紧急',
}
const TICKET_PRIORITY_VARIANT: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  low: 'default', medium: 'primary', high: 'warning', urgent: 'warning',
}

function CustomerTickets({ customerId }: { customerId: string }) {
  const router = useRouter()
  const { data: ticketsRes, isLoading, isError } = useQuery({
    queryKey: ['tickets', 'customer', customerId],
    queryFn: () => getTickets({ customerId }),
  })
  const tickets = (ticketsRes?.data ?? []) as Ticket[]

  if (isLoading) return <Card><CardContent className="py-8"><LoadingPage /></CardContent></Card>

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> 关联工单</CardTitle>
          <Link href="/dashboard/tickets" className="text-sm text-primary hover:underline">查看全部</Link>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-red-500 py-4">加载工单失败</p>
        ) : tickets.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p>暂无关联工单</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>负责人</TableHead>
                  <TableHead>创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)}
                  >
                    <TableCell className="font-medium">{ticket.title}</TableCell>
                    <TableCell>
                      <Badge variant={TICKET_STATUS_VARIANT[ticket.status] ?? 'default'}>
                        {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={TICKET_PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
                        {TICKET_PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{ticket.assigneeName ?? '-'}</TableCell>
                    <TableCell className="text-slate-600">
                      {new Date(ticket.createdAt).toLocaleString('zh-CN')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CustomerTagManager({ customerId, currentTags, onUpdate }: { customerId: string; currentTags: { id: string; name: string; color?: string | null }[]; onUpdate: () => void }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: allTagsRes, isError: tagsError } = useQuery({
    queryKey: ['tags'],
    queryFn: () => getTags(),
    enabled: showAdd,
  })
  const allTags = (allTagsRes?.data ?? []) as Tag[]
  const currentTagIds = new Set(currentTags.map((t) => t.id))
  const availableTags = allTags.filter((t) => !currentTagIds.has(t.id))

  const addMut = useMutation({
    mutationFn: (tagId: string) => updateCustomerTags(customerId, { addTagIds: [tagId] }),
    onSuccess: () => { onUpdate(); queryClient.invalidateQueries({ queryKey: ['customer', customerId] }) },
    onError: () => toast.error('操作失败'),
  })

  const removeMut = useMutation({
    mutationFn: (tagId: string) => updateCustomerTags(customerId, { removeTagIds: [tagId] }),
    onSuccess: () => { onUpdate(); queryClient.invalidateQueries({ queryKey: ['customer', customerId] }) },
    onError: () => toast.error('操作失败'),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><TagIcon className="h-5 w-5" /> 客户标签</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5" /> 添加标签
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentTags.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">暂无标签</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {currentTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: `${tag.color ?? '#3b82f6'}20`, color: tag.color ?? '#3b82f6' }}
              >
                {tag.name}
                <button onClick={() => removeMut.mutate(tag.id)} className="ml-0.5 hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {showAdd && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500 mb-2">点击添加标签</p>
            {tagsError ? (
              <p className="text-xs text-red-500">加载标签失败</p>
            ) : availableTags.length === 0 ? (
              <p className="text-xs text-slate-400">没有可添加的标签，请先在设置中创建标签</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => addMut.mutate(tag.id)}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: `${tag.color ?? '#3b82f6'}15`, color: tag.color ?? '#3b82f6', border: `1px dashed ${tag.color ?? '#3b82f6'}40` }}
                  >
                    <Plus className="h-3 w-3" /> {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EditCustomerDialog({ open, customer, onClose, onSuccess }: { open: boolean; customer: Customer; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    wechatId: customer.wechatId ?? '',
    companyName: customer.companyName ?? '',
    companyIndustry: customer.companyIndustry ?? '',
    stage: customer.stage,
  })

  useEffect(() => {
    if (open) {
      setForm({
        name: customer.name,
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        wechatId: customer.wechatId ?? '',
        companyName: customer.companyName ?? '',
        companyIndustry: customer.companyIndustry ?? '',
        stage: customer.stage,
      })
    }
  }, [open, customer])

  const mutation = useMutation({
    mutationFn: () => {
      const data: Record<string, string> = { name: form.name, stage: form.stage }
      if (form.phone) data.phone = form.phone
      if (form.email) data.email = form.email
      if (form.wechatId) data.wechatId = form.wechatId
      if (form.companyName) data.companyName = form.companyName
      if (form.companyIndustry) data.companyIndustry = form.companyIndustry
      return updateCustomer(customer.id, data)
    },
    onSuccess,
  })

  return (
    <Dialog open={open} onOpenChange={onClose} title="编辑客户">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">阶段</label>
            <Select options={stageOptions} value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">微信</label>
            <Input value={form.wechatId} onChange={(e) => setForm({ ...form, wechatId: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">公司</label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">行业</label>
            <Input value={form.companyIndustry} onChange={(e) => setForm({ ...form, companyIndustry: e.target.value })} placeholder="例如：互联网、教育、金融" />
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
