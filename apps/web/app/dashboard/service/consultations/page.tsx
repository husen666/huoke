'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getOfflineConsultations, updateOfflineConsultation, type OfflineConsultation } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import { Pagination } from '@/components/pagination'
import {
  MessageSquareOff, Clock, User, Phone, Mail,
  FileText, CheckCircle, XCircle, Loader2, Eye, Filter,
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: '待处理', variant: 'warning' },
  processing: { label: '处理中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'danger' },
}

const STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function OfflineConsultationsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detail, setDetail] = useState<OfflineConsultation | null>(null)
  const [remark, setRemark] = useState('')

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['offline-consultations', statusFilter, page],
    queryFn: () => {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
      if (statusFilter !== 'all') params.status = statusFilter
      return getOfflineConsultations(params)
    },
  })
  const items = res?.data?.items ?? []
  const total = res?.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; remark?: string } }) =>
      updateOfflineConsultation(id, data),
    onSuccess: () => {
      toast.success('更新成功')
      queryClient.invalidateQueries({ queryKey: ['offline-consultations'] })
      setDetail(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  function handleProcess(item: OfflineConsultation) {
    setDetail(item)
    setRemark(item.remark ?? '')
  }

  if (isLoading) return <LoadingPage />
  if (isError) return (
    <div className="py-16 text-center">
      <XCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
      <p className="text-sm text-slate-500">加载失败，请刷新重试</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">离线咨询</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            非工作时间访客留下的咨询信息，共 {total} 条记录
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['pending', 'processing', 'completed', 'cancelled'].map(st => {
          const count = statusFilter === 'all'
            ? items.filter(i => i.status === st).length
            : (statusFilter === st ? items.length : 0)
          const info = STATUS_MAP[st]
          return (
            <Card key={st} className={`cursor-pointer transition-all ${statusFilter === st ? 'ring-2 ring-primary/30' : 'hover:shadow-md'}`}
              onClick={() => { setStatusFilter(st === statusFilter ? 'all' : st); setPage(1) }}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  st === 'pending' ? 'bg-amber-50 text-amber-600' :
                  st === 'processing' ? 'bg-blue-50 text-blue-600' :
                  st === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                  'bg-slate-50 text-slate-500'
                }`}>
                  {st === 'pending' ? <Clock className="h-5 w-5" /> :
                   st === 'processing' ? <Loader2 className="h-5 w-5" /> :
                   st === 'completed' ? <CheckCircle className="h-5 w-5" /> :
                   <XCircle className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{count}</p>
                  <p className="text-xs text-slate-500">{info.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquareOff className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">暂无{statusFilter !== 'all' ? STATUS_MAP[statusFilter]?.label : ''}咨询记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const st = STATUS_MAP[item.status] ?? STATUS_MAP.pending
            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        <span className="text-xs text-slate-400">{formatTime(item.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-800 line-clamp-2">{item.content}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        {item.name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />{item.name}
                          </span>
                        )}
                        {item.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />{item.phone}
                          </span>
                        )}
                        {item.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />{item.email}
                          </span>
                        )}
                      </div>
                      {item.remark && (
                        <p className="text-xs text-slate-400 bg-slate-50 rounded-md px-2 py-1 mt-1">
                          <FileText className="h-3 w-3 inline mr-1" />备注: {item.remark}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleProcess(item)}>
                        <Eye className="h-4 w-4 mr-1" />处理
                      </Button>
                      {item.status === 'pending' && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={updateMut.isPending}
                          onClick={() => updateMut.mutate({ id: item.id, data: { status: 'processing' } })}
                        >
                          接手
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      />

      {/* Detail Dialog */}
      {detail && (
        <Dialog open onOpenChange={(v) => { if (!v) setDetail(null) }} title="咨询详情">
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_MAP[detail.status]?.variant ?? 'default'}>
                  {STATUS_MAP[detail.status]?.label ?? detail.status}
                </Badge>
                <span className="text-xs text-slate-400">{new Date(detail.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-sm text-slate-800">{detail.content}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <User className="h-4 w-4 text-slate-400" />
                <span>{detail.name || '未填写'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" />
                <span>{detail.phone || '未填写'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 col-span-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <span>{detail.email || '未填写'}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">处理备注</label>
              <textarea
                value={remark}
                onChange={e => setRemark(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="记录处理结果..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {detail.status !== 'cancelled' && detail.status !== 'completed' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateMut.mutate({ id: detail.id, data: { status: 'cancelled', remark } })}
                    loading={updateMut.isPending}
                  >
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => updateMut.mutate({ id: detail.id, data: { status: 'completed', remark } })}
                    loading={updateMut.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />标记完成
                  </Button>
                </>
              )}
              {(detail.status === 'cancelled' || detail.status === 'completed') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (remark !== (detail.remark ?? '')) {
                      updateMut.mutate({ id: detail.id, data: { remark } })
                    } else {
                      setDetail(null)
                    }
                  }}
                  loading={updateMut.isPending}
                >
                  {remark !== (detail.remark ?? '') ? '保存备注' : '关闭'}
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
