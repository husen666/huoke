'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCampaign, executeCampaign, deleteCampaign, updateCampaign, type Campaign } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { ArrowLeft, Play, Trash2, Send, Users, Eye, MessageSquare, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'

const statusLabel: Record<string, string> = {
  draft: '草稿', scheduled: '已排期', running: '执行中', paused: '已暂停', ended: '已结束', completed: '已完成', cancelled: '已取消',
}
const statusVariant: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'> = {
  draft: 'secondary', scheduled: 'outline', running: 'primary', paused: 'warning', ended: 'default', completed: 'success', cancelled: 'danger',
}
const typeLabel: Record<string, string> = {
  mass_message: '群发消息', nurture_sequence: '培育序列', drip: '培育序列', event_invite: '活动邀请', event: '活动邀请', ab_test: 'A/B 测试', recall: '客户召回',
}
const channelLabel: Record<string, string> = {
  wecom: '企业微信', wechat: '微信', sms: '短信', email: '邮件', douyin: '抖音', xiaohongshu: '小红书',
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string

  const confirm = useConfirm()
  const [showEdit, setShowEdit] = useState(false)

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => getCampaign(id),
  })

  const campaign = res?.data as Campaign | undefined

  const execMutation = useMutation({
    mutationFn: () => executeCampaign(id),
    onSuccess: () => {
      toast.success('活动已开始执行')
      queryClient.invalidateQueries({ queryKey: ['campaign', id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '执行失败'),
  })

  const delMutation = useMutation({
    mutationFn: () => deleteCampaign(id),
    onSuccess: () => {
      toast.success('活动已删除')
      router.push('/dashboard/campaigns')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-500">加载失败，请重试</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/campaigns')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-slate-500">活动不存在</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/campaigns')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
        </Button>
      </div>
    )
  }

  const stats = campaign.stats ?? {}
  const sentCount = stats.sentCount ?? 0
  const openedCount = stats.openedCount ?? 0
  const repliedCount = stats.repliedCount ?? 0
  const openRate = sentCount > 0 ? ((openedCount / sentCount) * 100).toFixed(1) : '0'
  const replyRate = sentCount > 0 ? ((repliedCount / sentCount) * 100).toFixed(1) : '0'
  const contentBody = (campaign.contentTemplate as Record<string, string> | null)?.body

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/campaigns')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <Badge variant={statusVariant[campaign.status] ?? 'secondary'}>
            {statusLabel[campaign.status] ?? campaign.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <>
              <Button variant="outline" onClick={() => setShowEdit(true)}>
                <Pencil className="h-4 w-4 mr-1" /> 编辑
              </Button>
              <Button onClick={() => execMutation.mutate()} disabled={execMutation.isPending}>
                <Play className="h-4 w-4 mr-1" /> 执行
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="text-red-500 hover:text-red-600"
            onClick={async () => {
              const ok = await confirm({ title: '确认删除', description: '删除后无法恢复，确定继续吗？', confirmText: '删除', variant: 'danger' })
              if (!ok) return
              delMutation.mutate()
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> 删除
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Send} label="发送量" value={sentCount} />
        <StatCard icon={Eye} label="打开量" value={openedCount} sub={`打开率 ${openRate}%`} />
        <StatCard icon={MessageSquare} label="回复量" value={repliedCount} sub={`回复率 ${replyRate}%`} />
        <StatCard icon={Users} label="目标人数" value={campaign.targetCount ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Content preview */}
          <Card>
            <CardHeader><CardTitle>内容预览</CardTitle></CardHeader>
            <CardContent>
              {contentBody ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <pre className="whitespace-pre-wrap text-sm font-sans text-slate-700 leading-relaxed">{contentBody}</pre>
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">暂无内容</p>
              )}
            </CardContent>
          </Card>

          {campaign.description && (
            <Card>
              <CardHeader><CardTitle>活动描述</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 leading-relaxed">{campaign.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>活动信息</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="类型" value={typeLabel[campaign.type] ?? campaign.type} />
              <InfoRow label="渠道" value={channelLabel[campaign.channelType ?? ''] ?? campaign.channelType ?? '-'} />
              {campaign.scheduledAt && <InfoRow label="排期时间" value={new Date(campaign.scheduledAt).toLocaleString('zh-CN')} />}
              {campaign.startedAt && <InfoRow label="开始时间" value={new Date(campaign.startedAt).toLocaleString('zh-CN')} />}
              {campaign.completedAt && <InfoRow label="完成时间" value={new Date(campaign.completedAt).toLocaleString('zh-CN')} />}
              <InfoRow label="创建时间" value={new Date(campaign.createdAt).toLocaleString('zh-CN')} />
            </CardContent>
          </Card>
        </div>
      </div>

      {campaign && (
        <EditCampaignDialog
          open={showEdit}
          campaign={campaign}
          onClose={() => setShowEdit(false)}
          onSuccess={() => { setShowEdit(false); queryClient.invalidateQueries({ queryKey: ['campaign', id] }) }}
        />
      )}
    </div>
  )
}

function EditCampaignDialog({ open, campaign, onClose, onSuccess }: { open: boolean; campaign: Campaign; onClose: () => void; onSuccess: () => void }) {
  const contentBody = (campaign.contentTemplate as Record<string, string> | null)?.body ?? ''
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description ?? '',
    content: contentBody,
    targetCount: campaign.targetCount ?? 0,
  })

  useEffect(() => {
    if (open) {
      const body = (campaign.contentTemplate as Record<string, string> | null)?.body ?? ''
      setForm({ name: campaign.name, description: campaign.description ?? '', content: body, targetCount: campaign.targetCount ?? 0 })
    }
  }, [open, campaign])

  const mutation = useMutation({
    mutationFn: () => updateCampaign(campaign.id, {
      name: form.name,
      description: form.description || undefined,
      contentTemplate: form.content ? { body: form.content } : undefined,
      targetCount: form.targetCount,
    }),
    onSuccess,
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose} title="编辑活动">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">活动名称</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">活动描述</label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">内容正文</label>
          <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} placeholder="输入营销内容..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">目标人数</label>
          <Input type="number" value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: parseInt(e.target.value) || 0 })} min={0} />
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

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{label}</p>
            {sub && <p className="text-xs text-slate-400">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  )
}
