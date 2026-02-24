'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTicket, getTicketReview, runTicketReviewAction, updateTicket, addTicketComment, assignTicket, transitionTicket, escalateTicket,
  getOrgMembers, getKnowledgeBases, type Ticket, type TicketComment, type TicketReview, type OrgMember, type KnowledgeBase,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import {
  ArrowLeft, Clock, User, Tag, MessageSquare, Send, Lock, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Breadcrumb } from '@/components/breadcrumb'

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

function formatTicketNo(id?: string) {
  if (!id) return '--'
  return String(id).slice(0, 8).toUpperCase()
}

const statusTransitions: Record<string, { value: string; label: string }[]> = {
  open: [{ value: 'processing', label: '开始处理' }, { value: 'waiting_user', label: '待用户反馈' }, { value: 'closed', label: '关闭' }],
  processing: [{ value: 'waiting_user', label: '待用户反馈' }, { value: 'resolved', label: '标记已解决' }, { value: 'closed', label: '关闭' }],
  waiting_user: [{ value: 'processing', label: '继续处理' }, { value: 'resolved', label: '标记已解决' }, { value: 'closed', label: '关闭' }],
  resolved: [{ value: 'closed', label: '关闭' }, { value: 'processing', label: '重新打开' }],
  closed: [{ value: 'processing', label: '重新打开' }],
  in_progress: [{ value: 'waiting_user', label: '待用户反馈' }, { value: 'resolved', label: '标记已解决' }, { value: 'closed', label: '关闭' }],
  pending: [{ value: 'processing', label: '继续处理' }, { value: 'resolved', label: '标记已解决' }, { value: 'closed', label: '关闭' }],
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const confirm = useConfirm()
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [assigneeId, setAssigneeId] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showKbDialog, setShowKbDialog] = useState(false)
  const [selectedKbId, setSelectedKbId] = useState('')
  const [kbSearch, setKbSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id),
    enabled: !!id,
  })
  const { data: reviewRes } = useQuery({
    queryKey: ['ticket-review', id],
    queryFn: () => getTicketReview(id),
    enabled: !!id,
    staleTime: 30_000,
  })

  const ticket: Ticket | undefined = data?.data?.ticket
  const review: TicketReview | undefined = reviewRes?.data
  const comments: TicketComment[] = data?.data?.comments ?? []

  const { data: membersRes } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => getOrgMembers(),
    staleTime: 60_000,
  })
  const members: OrgMember[] = membersRes?.data ?? []
  const { data: kbRes } = useQuery({
    queryKey: ['knowledge-bases-lite'],
    queryFn: () => getKnowledgeBases(),
    staleTime: 60_000,
  })
  const kbList: KnowledgeBase[] = kbRes?.data ?? []
  const filteredKbList = kbList.filter((kb) =>
    kb.name.toLowerCase().includes(kbSearch.trim().toLowerCase())
  )

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => transitionTicket(id, newStatus),
    onSuccess: () => {
      toast.success('状态已更新')
      queryClient.invalidateQueries({ queryKey: ['ticket', id] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const commentMutation = useMutation({
    mutationFn: (data: { content: string; isInternal?: boolean }) => addTicketComment(id, data),
    onSuccess: () => {
      toast.success('评论已添加')
      setCommentText('')
      setIsInternal(false)
      queryClient.invalidateQueries({ queryKey: ['ticket', id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const assignMutation = useMutation({
    mutationFn: (aId: string) => assignTicket(id, aId),
    onSuccess: () => {
      toast.success('已指派')
      setShowAssign(false)
      queryClient.invalidateQueries({ queryKey: ['ticket', id] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const escalateMutation = useMutation({
    mutationFn: () => escalateTicket(id, '手动升级'),
    onSuccess: () => {
      toast.success('工单已升级')
      queryClient.invalidateQueries({ queryKey: ['ticket', id] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })
  const reviewImproveMutation = useMutation({
    mutationFn: () => runTicketReviewAction(id, 'create_improvement_note'),
    onSuccess: (res) => {
      toast.success(res.data?.message || '已生成改进项')
      queryClient.invalidateQueries({ queryKey: ['ticket', id] })
      queryClient.invalidateQueries({ queryKey: ['ticket-review', id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })
  const reviewKbMutation = useMutation({
    mutationFn: (kbId?: string) => runTicketReviewAction(id, 'create_kb_draft', kbId),
    onSuccess: (res) => {
      toast.success(res.data?.message || '已生成知识库草稿')
      setShowKbDialog(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    commentMutation.mutate({ content: commentText.trim(), isInternal })
  }

  if (isLoading) return <LoadingPage />
  if (isError || !ticket) {
    return (
      <div className="py-20 text-center text-slate-500">
        <p>工单加载失败或不存在</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/tickets')}>返回列表</Button>
      </div>
    )
  }

  const parsedDesc = parseTicketDescription(ticket.description)
  const directAttachments = normalizeTicketAttachments(ticket.attachments)
  const viewAttachments = directAttachments.length > 0 ? directAttachments : parsedDesc.attachments
  const ticketNo = formatTicketNo(ticket.id)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Breadcrumb items={[{ label: '工单', href: '/dashboard/tickets' }, { label: ticket.title }]} />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/tickets')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-800 truncate">{ticket.title}</h1>
          <p className="mt-1 text-xs text-slate-500">工单号：#{ticketNo}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={statusVariant[ticket.status] ?? 'default'}>
              {statusLabel[ticket.status] ?? ticket.status}
            </Badge>
            <Badge variant={priorityVariant[ticket.priority] ?? 'default'}>
              {priorityLabel[ticket.priority] ?? ticket.priority}
            </Badge>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {(statusTransitions[ticket.status] ?? []).map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant="outline"
            onClick={() => statusMutation.mutate(t.value)}
            loading={statusMutation.isPending}
          >
            {t.label}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => { setAssigneeId(ticket.assigneeId ?? ''); setShowAssign(true) }}>
          <User className="h-3.5 w-3.5" /> 指派
        </Button>
        <Button size="sm" variant="outline" onClick={() => escalateMutation.mutate()} loading={escalateMutation.isPending}>
          <AlertTriangle className="h-3.5 w-3.5" /> 升级
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
          编辑
        </Button>
      </div>

      {/* Status Progress */}
      <StatusProgressBar
        currentStatus={ticket.status}
        onStatusChange={async (newStatus) => {
          const ok = await confirm({
            title: '确认更改状态',
            description: `确定要将工单状态更改为「${statusLabel[newStatus] ?? newStatus}」吗？`,
            confirmText: '确认',
          })
          if (!ok) return
          statusMutation.mutate(newStatus)
        }}
      />

      {/* Description */}
      {ticket.description && (
        <Card>
          <CardHeader><CardTitle className="text-base">描述</CardTitle></CardHeader>
          <CardContent>
            {parsedDesc.text ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{parsedDesc.text}</p>
            ) : (
              <p className="text-sm text-slate-400">（无描述）</p>
            )}
          </CardContent>
        </Card>
      )}

      {viewAttachments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">附件信息</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {viewAttachments.map((a, idx) => (
                <a
                  key={`${a.url}-${idx}`}
                  href={resolveAttachmentUrl(a.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
                >
                  <span className="truncate text-slate-700">{a.name}</span>
                  <span className="shrink-0 text-xs text-primary">打开</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Tag className="h-4 w-4 text-slate-400" />
              <span>工单号：#{ticketNo}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Tag className="h-4 w-4 text-slate-400" />
              <span>类型：{typeLabel[ticket.type] ?? ticket.type}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <User className="h-4 w-4 text-slate-400" />
              <span>负责人：{ticket.assigneeName ?? '未指派'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <AlertTriangle className="h-4 w-4 text-slate-400" />
              <span>升级级别：L{ticket.escalationLevel ?? 0}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <User className="h-4 w-4 text-slate-400" />
              <span>创建人：{ticket.creatorName ?? '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <User className="h-4 w-4 text-slate-400" />
              <span>客户：{ticket.customerName ?? '-'}</span>
            </div>
            {(ticket.slaResolveDueAt || ticket.dueDate) && (
              <div className="sm:col-span-3">
                <SlaCountdown dueDate={ticket.slaResolveDueAt || ticket.dueDate || ticket.createdAt} createdAt={ticket.createdAt} />
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>创建：{new Date(ticket.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>更新：{new Date(ticket.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {review && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> 工单复盘
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => reviewImproveMutation.mutate()}
                loading={reviewImproveMutation.isPending}
              >
                生成改进项备注
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (kbList.length === 0) {
                    toast.error('暂无知识库，请先创建知识库')
                    return
                  }
                  setSelectedKbId(kbList[0]?.id ?? '')
                  setKbSearch('')
                  setShowKbDialog(true)
                }}
                loading={reviewKbMutation.isPending}
              >
                生成知识库草稿
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ReviewMetric label="首响时长" value={formatMinutes(review.metrics.firstResponseMinutes)} danger={review.metrics.firstResponseBreach} />
              <ReviewMetric label="解决时长" value={formatMinutes(review.metrics.resolveMinutes)} danger={review.metrics.resolveBreach} />
              <ReviewMetric label="评论数" value={String(review.metrics.commentCount)} />
              <ReviewMetric label="内部备注占比" value={`${review.metrics.internalCommentRate}%`} />
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500 mb-2">复盘建议</p>
              <ul className="space-y-1.5">
                {review.insights.map((line, idx) => (
                  <li key={idx} className="text-sm text-slate-700">- {line}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500 mb-2">关键时间线</p>
              <div className="space-y-2">
                {review.timeline.slice(-6).map((item, idx) => (
                  <div key={`${item.at}-${idx}`} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-slate-700">{item.text}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(item.at).toLocaleString('zh-CN')}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> 评论 ({comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">暂无评论</p>
          )}
          {comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg p-3 text-sm ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  {c.authorName ?? '系统'}
                  {c.isInternal && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                      <Lock className="h-3 w-3" /> 内部备注
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(c.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}

          {/* Add comment form */}
          <form onSubmit={handleComment} className="pt-2 border-t border-slate-100">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="添加评论..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <Lock className="h-3.5 w-3.5" /> 内部备注（仅团队可见）
              </label>
              <Button type="submit" variant="primary" size="sm" loading={commentMutation.isPending}>
                <Send className="h-3.5 w-3.5" /> 添加评论
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Assign Dialog */}
      <Dialog open={showAssign} onOpenChange={() => setShowAssign(false)} title="指派工单">
        <div className="space-y-4">
          <Select
            options={[{ value: '', label: '请选择负责人' }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
            value={assigneeId}
            onChange={setAssigneeId}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAssign(false)}>取消</Button>
            <Button variant="primary" onClick={() => assigneeId && assignMutation.mutate(assigneeId)} loading={assignMutation.isPending} disabled={!assigneeId}>确定</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showKbDialog} onOpenChange={() => setShowKbDialog(false)} title="选择知识库">
        <div className="space-y-4">
          <Input
            placeholder="搜索知识库名称..."
            value={kbSearch}
            onChange={(e) => setKbSearch(e.target.value)}
          />
          <Select
            options={filteredKbList.map((kb) => ({ value: kb.id, label: `${kb.name}（${kb.documentCount}）` }))}
            value={selectedKbId}
            onChange={setSelectedKbId}
          />
          {filteredKbList.length === 0 && (
            <p className="text-xs text-slate-500">未找到匹配的知识库</p>
          )}
          <p className="text-xs text-slate-500">将根据当前工单复盘建议生成一篇知识库草稿文档。</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowKbDialog(false)}>取消</Button>
            <Button
              variant="primary"
              loading={reviewKbMutation.isPending}
              disabled={!selectedKbId}
              onClick={() => reviewKbMutation.mutate(selectedKbId)}
            >
              生成草稿
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      {showEdit && ticket && (
        <TicketEditDialog ticket={ticket} onClose={() => setShowEdit(false)} onSuccess={() => {
          setShowEdit(false)
          queryClient.invalidateQueries({ queryKey: ['ticket', id] })
          queryClient.invalidateQueries({ queryKey: ['tickets'] })
        }} />
      )}
    </div>
  )
}

function TicketEditDialog({ ticket, onClose, onSuccess }: { ticket: Ticket; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: ticket.title,
    description: ticket.description ?? '',
    type: ticket.type,
    priority: ticket.priority,
    dueDate: ticket.dueDate ? ticket.dueDate.slice(0, 16) : '',
  })

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateTicket(ticket.id, data),
    onSuccess: () => {
      toast.success('工单已更新')
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
    if (form.dueDate) data.dueDate = new Date(form.dueDate).toISOString()
    mutation.mutate(data)
  }

  return (
    <Dialog open onOpenChange={onClose} title="编辑工单">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">标题 *</label>
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <Select
              options={[
                { value: 'general', label: '常规' }, { value: 'bug', label: 'Bug' },
                { value: 'feature', label: '功能需求' }, { value: 'inquiry', label: '咨询' },
              ]}
              value={form.type}
              onChange={(v) => setForm((p) => ({ ...p, type: v }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
            <Select
              options={[
                { value: 'low', label: '低' }, { value: 'medium', label: '中' },
                { value: 'high', label: '高' }, { value: 'urgent', label: '紧急' },
              ]}
              value={form.priority}
              onChange={(v) => setForm((p) => ({ ...p, priority: v }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
          <Input type="datetime-local" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>保存</Button>
        </div>
      </form>
    </Dialog>
  )
}

const STATUS_STEPS = [
  { value: 'open', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'waiting_user', label: '待用户反馈' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

function StatusProgressBar({ currentStatus, onStatusChange }: { currentStatus: string; onStatusChange: (status: string) => void }) {
  const currentIdx = STATUS_STEPS.findIndex(s => s.value === currentStatus)
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center">
          {STATUS_STEPS.map((step, idx) => {
            const isCompleted = idx < currentIdx
            const isCurrent = idx === currentIdx
            return (
              <React.Fragment key={step.value}>
                {idx > 0 && (
                  <div className={cn('flex-1 h-1 mx-1 rounded-full transition-colors', isCompleted || isCurrent ? 'bg-primary' : 'bg-slate-200')} />
                )}
                <button
                  onClick={() => {
                    if (step.value !== currentStatus) onStatusChange(step.value)
                  }}
                  className="flex flex-col items-center gap-1.5 group"
                  title={`切换到${step.label}`}
                >
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all',
                    isCompleted ? 'bg-primary border-primary text-white' :
                    isCurrent ? 'bg-primary/10 border-primary text-primary ring-4 ring-primary/10' :
                    'bg-white border-slate-300 text-slate-400 group-hover:border-primary/50 group-hover:text-primary/50'
                  )}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                  </div>
                  <span className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    isCurrent ? 'text-primary' : isCompleted ? 'text-slate-600' : 'text-slate-400'
                  )}>
                    {step.label}
                  </span>
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function SlaCountdown({ dueDate, createdAt }: { dueDate: string; createdAt: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const due = new Date(dueDate)
  const created = new Date(createdAt)
  const diffMs = due.getTime() - now.getTime()
  const totalMs = due.getTime() - created.getTime()
  const elapsedMs = now.getTime() - created.getTime()
  const progress = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 100

  const absDiff = Math.abs(diffMs)
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  const isOverdue = diffMs < 0
  const isUrgent = !isOverdue && diffMs < 24 * 60 * 60 * 1000

  return (
    <div className={cn(
      'rounded-lg border p-3',
      isOverdue ? 'border-red-200 bg-red-50' : isUrgent ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <AlertTriangle className={cn('h-4 w-4 text-red-500', 'animate-pulse')} />
          ) : (
            <Clock className={cn('h-4 w-4', isUrgent ? 'text-amber-500' : 'text-green-500')} />
          )}
          <span className={cn(
            'text-sm font-medium',
            isOverdue ? 'text-red-700' : isUrgent ? 'text-amber-700' : 'text-green-700'
          )}>
            {isOverdue
              ? `已超时 ${days > 0 ? `${days}天` : ''} ${hours}小时`
              : `剩余 ${days > 0 ? `${days}天 ` : ''}${hours}小时`}
          </span>
        </div>
        <span className="text-xs text-slate-500">截止: {due.toLocaleString('zh-CN')}</span>
      </div>
      <div className="h-2 rounded-full bg-white/60 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isOverdue ? 'bg-red-500' : isUrgent ? 'bg-amber-500' : 'bg-green-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-400">创建</span>
        <span className="text-xs text-slate-400">截止</span>
      </div>
    </div>
  )
}

function formatMinutes(mins: number | null) {
  if (mins == null) return '-'
  if (mins < 60) return `${mins}分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}小时${m > 0 ? `${m}分` : ''}`
}

function ReviewMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-base font-semibold mt-1 ${danger ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}

function parseTicketDescription(raw?: string | null): { text: string; attachments: { name: string; url: string }[] } {
  const src = (raw || '').trim()
  if (!src) return { text: '', attachments: [] }

  const lines = src.split('\n')
  const attachments: { name: string; url: string }[] = []
  const kept: string[] = []
  let inAttachmentBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^附件：?$/.test(trimmed)) {
      inAttachmentBlock = true
      continue
    }
    const match = trimmed.match(/^\d+\.\s*(.+?)\s*\(((?:https?:\/\/|\/)[^\s)]+)\)\s*$/)
    if (inAttachmentBlock && match) {
      attachments.push({ name: match[1], url: match[2] })
      continue
    }
    if (inAttachmentBlock && trimmed === '') {
      continue
    }
    // End attachment block when content no longer matches.
    if (inAttachmentBlock && trimmed && !match) {
      inAttachmentBlock = false
    }
    kept.push(line)
  }

  return { text: kept.join('\n').trim(), attachments }
}

function normalizeTicketAttachments(raw: unknown): { name: string; url: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((it) => {
      if (!it || typeof it !== 'object') return null
      const obj = it as Record<string, unknown>
      const name = String(obj.name || '').trim()
      const url = String(obj.url || '').trim()
      if (!name || !url) return null
      return { name, url }
    })
    .filter((it): it is { name: string; url: string } => !!it)
}

function resolveAttachmentUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url
  return url
}
