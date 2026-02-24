'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelStats,
  getMe,
  type Channel,
} from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import {
  Globe,
  MessageSquare,
  Video,
  BookOpen,
  Phone,
  Mail,
  Search,
  Settings2,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Channel definitions
// ---------------------------------------------------------------------------

interface ChannelDef {
  platform: string
  label: string
  icon: React.ElementType
  color: string
  bgColor: string
  fields: { key: string; label: string; type?: string }[]
}

const CHANNEL_DEFS: ChannelDef[] = [
  {
    platform: 'web_widget',
    label: '网站Widget',
    icon: Globe,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    fields: [],
  },
  {
    platform: 'wecom',
    label: '企业微信',
    icon: MessageSquare,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    fields: [
      { key: 'corpId', label: 'Corp ID' },
      { key: 'agentId', label: 'Agent ID' },
      { key: 'secret', label: 'Secret', type: 'password' },
    ],
  },
  {
    platform: 'douyin',
    label: '抖音',
    icon: Video,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    fields: [
      { key: 'clientKey', label: 'Client Key' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    ],
  },
  {
    platform: 'xiaohongshu',
    label: '小红书',
    icon: BookOpen,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    fields: [
      { key: 'appId', label: 'App ID' },
      { key: 'appSecret', label: 'App Secret', type: 'password' },
    ],
  },
  {
    platform: 'phone',
    label: '电话',
    icon: Phone,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    fields: [
      { key: 'provider', label: '服务商' },
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
  },
  {
    platform: 'email',
    label: '邮件',
    icon: Mail,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    fields: [
      { key: 'smtpHost', label: 'SMTP Host' },
      { key: 'smtpPort', label: 'SMTP Port' },
      { key: 'smtpUser', label: '用户名' },
      { key: 'smtpPass', label: '密码', type: 'password' },
    ],
  },
  {
    platform: 'baidu',
    label: '百度推广',
    icon: Search,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    fields: [
      { key: 'token', label: '推广Token' },
      { key: 'accountId', label: '账户 ID' },
    ],
  },
]

const CHANNEL_MAP = Object.fromEntries(CHANNEL_DEFS.map((d) => [d.platform, d]))

const POSITION_OPTIONS = [
  { value: 'br', label: '右下角' },
  { value: 'bl', label: '左下角' },
]

// ---------------------------------------------------------------------------
// Widget config dialog
// ---------------------------------------------------------------------------

function WidgetConfigDialog({
  open,
  onOpenChange,
  channel,
  orgId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  channel: Channel | null
  orgId: string
}) {
  const queryClient = useQueryClient()
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const config = (channel?.config ?? {}) as Record<string, string>
  const [color, setColor] = useState(config.color || '#2563eb')
  const [title, setTitle] = useState(config.title || '在线客服')
  const [position, setPosition] = useState(config.position || 'br')
  const [preChat, setPreChat] = useState(config.preChat === 'true')
  const [copied, setCopied] = useState(false)

  const embedCode = `<script src="${appUrl}/widget-loader.js" \n  data-site-token="${orgId}"\n  data-color="${color}"\n  data-title="${title}"\n  data-position="${position}"\n  data-pre-chat="${preChat}">\n</script>`

  const previewUrl = `${appUrl}/widget?siteToken=${orgId}&color=${encodeURIComponent(color)}&title=${encodeURIComponent(title)}&position=${position}&preChat=${preChat}`

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { config: { color, title, position, preChat: String(preChat) }, status: 'active' }
      return channel
        ? updateChannel(channel.id, payload)
        : createChannel({ platform: 'web_widget', name: '网站Widget', ...payload })
    },
    onSuccess: () => {
      toast.success('Widget 配置已保存')
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const copyCode = () => {
    navigator.clipboard.writeText(embedCode).catch(() => {})
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="网站Widget 配置" className="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">主题色</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 rounded-lg border border-slate-300 cursor-pointer p-1"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <Input label="窗口标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="位置"
            options={POSITION_OPTIONS}
            value={position}
            onChange={setPosition}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">对话前表单</label>
            <button
              type="button"
              onClick={() => setPreChat(!preChat)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                preChat ? 'bg-primary' : 'bg-slate-300'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  preChat ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
            <span className="ml-2 text-sm text-slate-600">{preChat ? '已开启' : '已关闭'}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-700">嵌入代码</label>
            <Button variant="ghost" size="sm" onClick={copyCode} className="gap-1.5 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
          <pre className="rounded-lg bg-slate-900 text-slate-100 p-4 text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
            {embedCode}
          </pre>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ExternalLink className="h-4 w-4" />
          <span>预览链接：</span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline truncate max-w-md"
          >
            {previewUrl}
          </a>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            保存配置
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Generic channel config dialog
// ---------------------------------------------------------------------------

function ChannelConfigDialog({
  open,
  onOpenChange,
  def,
  channel,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  def: ChannelDef
  channel: Channel | null
}) {
  const queryClient = useQueryClient()
  const config = (channel?.config ?? {}) as Record<string, string>
  const [formData, setFormData] = useState<Record<string, string>>(
    Object.fromEntries(def.fields.map((f) => [f.key, config[f.key] ?? '']))
  )

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { config: formData, status: 'active' }
      return channel
        ? updateChannel(channel.id, payload)
        : createChannel({ platform: def.platform, name: def.label, ...payload })
    },
    onSuccess: () => {
      toast.success(`${def.label} 配置已保存`)
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: () => { if (!channel) throw new Error('无效渠道'); return deleteChannel(channel.id) },
    onSuccess: () => {
      toast.success('渠道已删除')
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`${def.label} 配置`}>
      <div className="space-y-4">
        {def.fields.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            type={f.type ?? 'text'}
            value={formData[f.key] ?? ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
            placeholder={`请输入${f.label}`}
          />
        ))}
        {channel?.webhookUrl && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Webhook URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 truncate">
                {channel.webhookUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(channel.webhookUrl ?? '').catch(() => {})
                  toast.success('已复制 Webhook URL')
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {channel ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              loading={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除渠道
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button variant="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ChannelsPage() {
  const queryClient = useQueryClient()
  const [configPlatform, setConfigPlatform] = useState<string | null>(null)

  const { data: channelsRes, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => getChannels(),
  })

  const { data: statsRes } = useQuery({
    queryKey: ['channel-stats'],
    queryFn: () => getChannelStats(),
  })

  const { data: meRes } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
    staleTime: 1000 * 60 * 5,
  })

  const channels: Channel[] = channelsRes?.data ?? []
  const orgId = meRes?.data?.orgId ?? ''

  const channelByPlatform = useMemo(() => {
    const map: Record<string, Channel> = {}
    channels.forEach((c) => {
      map[c.platform] = c
    })
    return map
  }, [channels])

  const statsByPlatform = useMemo(() => {
    const map: Record<string, { conversations: number; messages: number }> = {}
    ;(statsRes?.data?.byPlatform ?? []).forEach((s) => {
      map[s.platform] = { conversations: s.conversations, messages: s.messages }
    })
    return map
  }, [statsRes])

  const activeDef = configPlatform ? CHANNEL_MAP[configPlatform] : null
  const activeChannel = configPlatform ? channelByPlatform[configPlatform] ?? null : null

  if (isLoading) return <LoadingPage />

  const activeCount = channels.filter((c) => c.status === 'active').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">渠道管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            管理全渠道接入配置，已启用 {activeCount} 个渠道
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['channels'] })
            queryClient.invalidateQueries({ queryKey: ['channel-stats'] })
          }}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CHANNEL_DEFS.map((def) => {
          const ch = channelByPlatform[def.platform]
          const stats = statsByPlatform[def.platform]
          const isActive = ch?.status === 'active'
          const Icon = def.icon

          return (
            <Card
              key={def.platform}
              className={cn(
                'group hover:shadow-md cursor-pointer transition-all duration-200',
                isActive && 'ring-1 ring-primary/20'
              )}
              onClick={() => setConfigPlatform(def.platform)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={cn('rounded-xl p-2.5', def.bgColor)}>
                    <Icon className={cn('h-6 w-6', def.color)} />
                  </div>
                  <Badge variant={isActive ? 'success' : 'default'}>
                    {isActive ? '已启用' : '未配置'}
                  </Badge>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">{def.label}</h3>
                <p className="text-xs text-slate-500 mb-3">{def.platform}</p>
                {stats ? (
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {stats.conversations} 对话
                    </span>
                    <span>{stats.messages} 消息</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">暂无数据</div>
                )}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1.5 text-slate-600 group-hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfigPlatform(def.platform)
                    }}
                  >
                    <Settings2 className="h-4 w-4" />
                    配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Channel Stats Table */}
      {channels.length > 0 && (
        <Card>
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              渠道概览
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">渠道名称</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">平台</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">对话数</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">消息数</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">创建时间</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => {
                  const def = CHANNEL_MAP[ch.platform]
                  const stats = statsByPlatform[ch.platform]
                  const Icon = def?.icon ?? Radio
                  return (
                    <tr key={ch.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn('rounded-lg p-1.5', def?.bgColor ?? 'bg-slate-100')}>
                            <Icon className={cn('h-4 w-4', def?.color ?? 'text-slate-500')} />
                          </div>
                          <span className="font-medium text-slate-800">{ch.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{CHANNEL_MAP[ch.platform]?.label ?? ch.platform}</td>
                      <td className="px-5 py-3">
                        <Badge variant={ch.status === 'active' ? 'success' : 'default'}>
                          {{ active: '已启用', inactive: '已停用', error: '异常', disabled: '已禁用' }[ch.status] ?? ch.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{stats?.conversations ?? 0}</td>
                      <td className="px-5 py-3 text-slate-600">{stats?.messages ?? 0}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(ch.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => setConfigPlatform(ch.platform)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          配置
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Widget Config Dialog */}
      {configPlatform === 'web_widget' && (
        <WidgetConfigDialog
          open
          onOpenChange={(v) => { if (!v) setConfigPlatform(null) }}
          channel={activeChannel}
          orgId={orgId}
        />
      )}

      {/* Generic Channel Config Dialog */}
      {configPlatform && configPlatform !== 'web_widget' && activeDef && (
        <ChannelConfigDialog
          open
          onOpenChange={(v) => { if (!v) setConfigPlatform(null) }}
          def={activeDef}
          channel={activeChannel}
        />
      )}
    </div>
  )
}
