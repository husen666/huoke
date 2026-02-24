'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { getConversations, type Conversation } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { LoadingPage } from '@/components/ui/loading'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { downloadCsv } from '@/lib/csv'
import { Pagination } from '@/components/pagination'
import { toast } from 'sonner'
import { History, Download } from 'lucide-react'
import { PageHeader, ErrorState, EmptyState, SearchInput, FilterBar } from '@/components/shared'

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

const channelOptions = [
  { value: '', label: '全部渠道' },
  { value: 'wecom', label: '企微' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'web', label: '网页' },
  { value: 'email', label: '邮件' },
  { value: 'sms', label: '短信' },
]

const satisfactionOptions = [
  { value: '', label: '全部满意度' },
  { value: '5', label: '5★ 非常满意' },
  { value: '4', label: '4★ 满意' },
  { value: '3', label: '3★ 一般' },
  { value: '2', label: '2★ 不满意' },
  { value: '1', label: '1★ 非常不满意' },
  { value: 'none', label: '未评价' },
]

const statusLabel: Record<string, string> = {
  active: '进行中', waiting: '等待中', resolved: '已解决', closed: '已关闭',
}
const statusVariant: Record<string, 'success' | 'warning' | 'default' | 'primary'> = {
  active: 'primary', waiting: 'warning', resolved: 'success', closed: 'default',
}
const channelLabel: Record<string, string> = {
  wecom: '企微', douyin: '抖音', xiaohongshu: '小红书', web: '网页', email: '邮件', sms: '短信',
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分`
}

export default function HistoryPage() {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [satisfaction, setSatisfaction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [exporting, setExporting] = useState(false)

  const params: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
    history: 'true',
  }
  if (status) {
    params.status = status
  } else {
    params.status = 'resolved,closed'
  }
  if (channel) params.channelType = channel
  if (search) params.search = search
  if (satisfaction && satisfaction !== 'none') params.satisfaction = satisfaction
  if (satisfaction === 'none') params.satisfactionNull = 'true'
  if (dateFrom) params.from = dateFrom
  if (dateTo) params.to = dateTo

  const { data, isLoading, isError } = useQuery({
    queryKey: ['conversation-history', params],
    queryFn: () => getConversations(params),
    staleTime: 30_000,
  })

  const rawList: Conversation[] = (data?.data as Conversation[]) ?? []
  const list = satisfaction
    ? rawList.filter(c => {
        if (satisfaction === 'none') return c.satisfactionScore == null
        return c.satisfactionScore != null && c.satisfactionScore === Number(satisfaction)
      })
    : rawList
  const total = satisfaction ? list.length : (data?.total ?? rawList.length)

  const handleExport = async () => {
    setExporting(true)
    try {
      const exportParams: Record<string, string> = { pageSize: '9999', history: 'true' }
      if (status) exportParams.status = status
      else exportParams.status = 'resolved,closed'
      if (channel) exportParams.channelType = channel
      if (search) exportParams.search = search
      if (dateFrom) exportParams.from = dateFrom
      if (dateTo) exportParams.to = dateTo
      const res = await getConversations(exportParams)
      let allConversations = (res?.data as Conversation[]) ?? []
      if (satisfaction) {
        allConversations = allConversations.filter(c => {
          if (satisfaction === 'none') return c.satisfactionScore == null
          return c.satisfactionScore != null && c.satisfactionScore === Number(satisfaction)
        })
      }
      downloadCsv(allConversations as unknown as Record<string, unknown>[], [
        { key: 'customerName', label: '客户名称', transform: (v) => String(v ?? '-') },
        { key: 'channelType', label: '渠道', transform: (v) => channelLabel[String(v)] ?? String(v ?? '') },
        { key: 'status', label: '状态', transform: (v) => statusLabel[String(v)] ?? String(v ?? '') },
        { key: 'messageCount', label: '消息数', transform: (v) => String(v ?? 0) },
        { key: 'satisfactionScore', label: '满意度', transform: (v) => v != null ? `${v}★` : '未评价' },
        { key: 'lastMessageAt', label: '最后消息时间', transform: (v) => v ? new Date(String(v)).toLocaleString('zh-CN') : '-' },
        { key: 'createdAt', label: '创建时间', transform: (v) => new Date(String(v)).toLocaleString('zh-CN') },
      ], `conversation-history-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success('导出成功')
    } catch {
      toast.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="历史对话"
        subtitle="查看已结束的对话记录和满意度"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" />
            {exporting ? '导出中...' : '导出'}
          </Button>
        }
      />

      <FilterBar>
        <Select options={statusOptions} value={status} onChange={(v) => { setStatus(v); setPage(1) }} className="w-[110px]" />
        <Select options={channelOptions} value={channel} onChange={(v) => { setChannel(v); setPage(1) }} className="w-[110px]" />
        <Select options={satisfactionOptions} value={satisfaction} onChange={(v) => { setSatisfaction(v); setPage(1) }} className="w-[120px]" />
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="w-[130px] h-10"
          />
          <span className="text-slate-400 text-xs">至</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="w-[130px] h-10"
          />
        </div>
        <SearchInput
          placeholder="搜索客户名称..."
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          className="min-w-[180px]"
        />
      </FilterBar>

      {isLoading ? <LoadingPage /> : isError ? (
        <ErrorState />
      ) : list.length === 0 ? (
        <EmptyState icon={History} message="暂无历史对话" />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客户名称</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>消息数</TableHead>
                    <TableHead>会话时长</TableHead>
                    <TableHead>满意度</TableHead>
                    <TableHead>最后消息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/inbox?conv=${c.id}`)}
                    >
                      <TableCell className="font-medium">{c.customerName ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{channelLabel[c.channelType] ?? c.channelType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[c.status] ?? 'default'}>
                          {statusLabel[c.status] ?? c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.messageCount ?? 0}</TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {c.lastMessageAt ? formatDuration(Math.floor((new Date(c.lastMessageAt).getTime() - new Date(c.createdAt).getTime()) / 1000)) : '-'}
                      </TableCell>
                      <TableCell>
                        {c.satisfactionScore != null ? (
                          <span className="text-amber-500 font-medium">{c.satisfactionScore}★</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('zh-CN') : new Date(c.createdAt).toLocaleString('zh-CN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        </>
      )}
    </div>
  )
}
