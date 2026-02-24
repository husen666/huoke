'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConversations, getConversation, sendMessage as sendMessageApi, uploadMessageFile,
  resolveConversation, reopenConversation, transferConversation,
  getCustomer, getOrgMembers, getAnalyticsOverview,
  getCannedResponses, addConversationNote,
  getKnowledgeBases, queryKnowledge, updateConversationTags,
  getTickets, markConversationRead,
  getAiSuggestion, updateAgentStatus, getMyTeams, getTeams,
  inviteRating, saveConversationSummary, getColleagueConversations,
  fetchApi,
  type Conversation, type Message, type Customer, type OrgMember, type CannedResponse, type Ticket, type Team,
} from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { connectSocket } from '@/lib/socket'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Send, Search, CheckCircle, Clock, User, Phone, Mail, Building,
  Star, ArrowRightLeft, RotateCcw, Zap, Headphones, Bot,
  X, StickyNote, BookOpen, Copy, Hash, ChevronLeft, ChevronDown,
  LogOut, MessageSquare, ExternalLink, Sparkles, ZoomIn,
  Paperclip, Image as ImageIcon, Film, FileText, Loader2,
  AlertCircle, History, Smile, CheckCheck, Download,
  ThumbsUp, FileSearch2, Users2, PenLine,
} from 'lucide-react'
import dynamic from 'next/dynamic'
const EmojiPicker = dynamic(() => import('@/components/emoji-picker').then(m => ({ default: m.EmojiPicker })), { ssr: false })
import { playNotificationSound, sendDesktopNotification } from '@/lib/notifications'
import { ROLE_LABELS } from '@/lib/role-config'

// ─── Constants ─────────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, { label: string; color: string; dot: string; sort: number }> = {
  urgent: { label: '紧急', color: 'text-red-600 bg-red-50', dot: 'bg-red-500', sort: 0 },
  high:   { label: '高', color: 'text-orange-600 bg-orange-50', dot: 'bg-orange-500', sort: 1 },
  normal: { label: '中', color: 'text-blue-600 bg-blue-50', dot: 'bg-blue-500', sort: 2 },
  medium: { label: '中', color: 'text-blue-600 bg-blue-50', dot: 'bg-blue-500', sort: 2 },
  low:    { label: '低', color: 'text-slate-500 bg-slate-50', dot: 'bg-slate-400', sort: 3 },
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '待接入', color: 'bg-amber-500' },
  active:   { label: '服务中', color: 'bg-emerald-500' },
  resolved: { label: '已解决', color: 'bg-slate-400' },
  closed:   { label: '已关闭', color: 'bg-slate-300' },
}

const QUICK_REPLIES_DEFAULT = [
  { id: '1', title: '问候', content: '您好！我是您的专属客服，请问有什么可以帮到您？' },
  { id: '2', title: '稍等', content: '请您稍等，我正在为您查询相关信息。' },
  { id: '3', title: '感谢', content: '感谢您的耐心等待，问题已为您处理。' },
  { id: '4', title: '结束', content: '如果没有其他问题，祝您生活愉快！' },
]

const STATUS_OPTIONS = [
  { value: 'online', label: '在线', color: 'bg-green-500' },
  { value: 'away', label: '离开', color: 'bg-amber-500' },
  { value: 'busy', label: '忙碌', color: 'bg-red-500' },
  { value: 'offline', label: '离线', color: 'bg-slate-400' },
] as const

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ServiceWorkbenchPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>}>
      <ServiceWorkbench />
    </Suspense>
  )
}

function ServiceWorkbench() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout, updateUser } = useAuthStore()
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('conv'))
  const [agentStatus, setAgentStatus] = useState<string>(user?.onlineStatus ?? 'online')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const initialFilter = searchParams.get('conv') ? 'all' as const : 'mine' as const
  const [queueFilter, setQueueFilter] = useState<'mine' | 'team' | 'pending' | 'all' | 'colleague'>(initialFilter)
  const [searchText, setSearchText] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [noteMode, setNoteMode] = useState(false)
  const [showQuickReply, setShowQuickReply] = useState(false)
  const [showKbSearch, setShowKbSearch] = useState(false)
  const [kbQuery, setKbQuery] = useState('')
  const [kbAnswer, setKbAnswer] = useState<string | null>(null)
  const [kbSearching, setKbSearching] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showContext, setShowContext] = useState(true)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [isCustomerTyping, setIsCustomerTyping] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [showAiSuggestion, setShowAiSuggestion] = useState(false)
  const [aiSuggestionText, setAiSuggestionText] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showResolveConfirm, setShowResolveConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const lastReadMsgRef = useRef<string | null>(null)

  const statusMut = useMutation({
    mutationFn: (status: string) => updateAgentStatus(status),
    onSuccess: (_, status) => {
      setAgentStatus(status)
      updateUser({ onlineStatus: status })
      toast.success(`状态已切换为${STATUS_OPTIONS.find(o => o.value === status)?.label}`)
    },
    onError: () => toast.error('状态切换失败'),
  })

  // ─── Data ──────────────────────────────────────────────────────────────

  const { data: overviewRes } = useQuery({
    queryKey: ['svc-overview'],
    queryFn: getAnalyticsOverview,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const { data: myTeamsRes } = useQuery({
    queryKey: ['my-teams'],
    queryFn: getMyTeams,
    staleTime: 60000,
  })
  const myTeammateIds = useMemo(() => myTeamsRes?.data?.teammateIds ?? [], [myTeamsRes])
  const hasTeam = myTeammateIds.length > 0

  const { data: teamsListRes } = useQuery({ queryKey: ['teams'], queryFn: getTeams, staleTime: 60000 })
  const allTeams: Team[] = teamsListRes?.data ?? []

  const { data: allForCountRes } = useQuery({
    queryKey: ['svc-conversations', '__count__'],
    queryFn: () => getConversations({ pageSize: '100' }),
    refetchInterval: 45000,
    staleTime: 30000,
  })
  const allForCount: Conversation[] = allForCountRes?.data ?? []
  const myCount = useMemo(() => allForCount.filter(c => c.agentId === user?.id && c.status === 'active').length, [allForCount, user])
  const teamCount = useMemo(() => hasTeam ? allForCount.filter(c => c.agentId && myTeammateIds.includes(c.agentId) && (c.status === 'active' || c.status === 'pending')).length : 0, [allForCount, myTeammateIds, hasTeam])
  const pendingCount = useMemo(() => allForCount.filter(c => c.status === 'pending').length, [allForCount])

  // Filtered query for the visible list
  const { data: filteredConvsRes, isLoading: convsLoading } = useQuery({
    queryKey: ['svc-conversations', queueFilter],
    queryFn: () => {
      if (queueFilter === 'colleague') return getColleagueConversations({ pageSize: '100' })
      const p: Record<string, string> = { pageSize: '100' }
      if (queueFilter === 'mine' && user?.id) p.agentId = user.id
      if (queueFilter === 'team') {
        // Team filter: fetch all, then client-filter to teammates
      }
      if (queueFilter === 'pending') p.status = 'pending'
      return getConversations(p)
    },
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const conversations = useMemo(() => {
    const raw: Conversation[] = filteredConvsRes?.data ?? []
    let list = raw
    if (queueFilter === 'team' && myTeammateIds.length > 0) {
      list = list.filter(c => c.agentId && myTeammateIds.includes(c.agentId))
    }
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(c =>
        (c.customerName ?? '').toLowerCase().includes(q) ||
        (c.lastMessagePreview ?? '').toLowerCase().includes(q) ||
        c.id.includes(q)
      )
    }
    return list.sort((a, b) => {
      const pa = PRIORITY_MAP[a.priority]?.sort ?? 9
      const pb = PRIORITY_MAP[b.priority]?.sort ?? 9
      if (pa !== pb) return pa - pb
      return new Date(b.lastMessageAt ?? b.createdAt).getTime() - new Date(a.lastMessageAt ?? a.createdAt).getTime()
    })
  }, [filteredConvsRes, searchText, queueFilter, myTeammateIds])

  const { data: convDetailRes } = useQuery({
    queryKey: ['svc-conv', selectedId],
    queryFn: () => getConversation(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 30000,
    staleTime: 15000,
  })
  const currentConv = convDetailRes?.data as (Conversation & { messages: Message[] }) | undefined
  const messages = currentConv?.messages ?? []

  const { data: customerRes } = useQuery({
    queryKey: ['svc-customer', currentConv?.customerId],
    queryFn: () => getCustomer(currentConv!.customerId),
    enabled: !!currentConv?.customerId,
  })
  const customer = customerRes?.data as Customer | undefined

  const { data: cannedRes } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: () => getCannedResponses(),
    staleTime: 5 * 60_000,
  })
  const cannedResponses: CannedResponse[] = cannedRes?.data ?? []

  const { data: kbListRes } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: getKnowledgeBases,
    staleTime: 5 * 60_000,
  })
  const kbList = (kbListRes?.data ?? []) as { id: string; name: string }[]

  const { data: membersRes } = useQuery({
    queryKey: ['org-members'],
    queryFn: getOrgMembers,
    staleTime: 5 * 60_000,
  })
  const members: OrgMember[] = membersRes?.data ?? []

  const { data: ticketsRes } = useQuery({
    queryKey: ['svc-tickets', currentConv?.customerId],
    queryFn: () => getTickets({ customerId: currentConv!.customerId, pageSize: '3' }),
    enabled: !!currentConv?.customerId,
    staleTime: 60_000,
  })
  const recentTickets: Ticket[] = ticketsRes?.data ?? []

  const { data: historyConvsRes } = useQuery({
    queryKey: ['svc-history-convs', currentConv?.customerId],
    queryFn: () => getConversations({ customerId: currentConv!.customerId, pageSize: '100' }),
    enabled: !!currentConv?.customerId,
    staleTime: 60_000,
  })
  const historyConvCount = (historyConvsRes?.data ?? []).length

  // ─── File preview URLs (prevent createObjectURL leak) ─────────────────

  const previewUrls = useMemo(() =>
    pendingFiles.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : null),
    [pendingFiles]
  )
  useEffect(() => {
    return () => { previewUrls.forEach(url => { if (url) URL.revokeObjectURL(url) }) }
  }, [previewUrls])

  // ─── Scroll ────────────────────────────────────────────────────────────

  const lastMsgId = messages[messages.length - 1]?.id
  const handleChatScroll = useCallback(() => {
    const el = chatAreaRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setIsAtBottom(atBottom)
    if (atBottom) setNewMsgCount(0)
  }, [])

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setNewMsgCount(0)
    } else {
      setNewMsgCount(c => c + 1)
    }
  }, [lastMsgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
    setNewMsgCount(0)
  }, [])

  // ─── Socket ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedId) return
    const socket = connectSocket()
    socket.emit('join:conversation', selectedId)
    const onMsg = (data?: { conversationId?: string; content?: string; customerName?: string; senderType?: string; senderId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
      if (data?.senderType !== 'agent' && data?.senderId !== user?.id) {
        playNotificationSound()
        sendDesktopNotification(
          data?.customerName ?? '新消息',
          data?.content ?? '您收到一条新消息',
          () => window.focus(),
        )
      }
    }
    socket.on('message:new', onMsg)
    const onTyping = (data: { conversationId: string; isTyping: boolean }) => {
      if (data.conversationId === selectedId) {
        setIsCustomerTyping(data.isTyping)
      }
    }
    socket.on('typing', onTyping)
    return () => {
      socket.off('message:new', onMsg)
      socket.off('typing', onTyping)
      socket.emit('leave:conversation', selectedId)
      setIsCustomerTyping(false)
    }
  }, [selectedId, queryClient])

  // ─── Auto-mark messages as read ──────────────────────────────────────

  useEffect(() => {
    if (!selectedId || messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.id === lastReadMsgRef.current) return
    lastReadMsgRef.current = lastMsg.id
    markConversationRead(selectedId, lastMsg.id).catch(() => {})
    const socket = connectSocket()
    socket.emit('message:read', { conversationId: selectedId, lastReadMessageId: lastMsg.id })
  }, [selectedId, messages])

  // ─── Focus input on conv select ────────────────────────────────────────

  useEffect(() => {
    if (selectedId) setTimeout(() => inputRef.current?.focus(), 100)
  }, [selectedId])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────

  const navigateConversation = useCallback((dir: -1 | 1) => {
    if (conversations.length === 0) return
    if (!selectedId) { setSelectedId(conversations[0].id); return }
    const idx = conversations.findIndex(c => c.id === selectedId)
    const next = idx + dir
    if (next >= 0 && next < conversations.length) setSelectedId(conversations[next].id)
  }, [conversations, selectedId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (ctrl && e.key === 'k') { e.preventDefault(); setShowQuickReply(v => !v); setShowKbSearch(false) }
      if (ctrl && e.key === 'b') { e.preventDefault(); setShowKbSearch(v => !v); setShowQuickReply(false) }
      if (ctrl && e.key === 'n') { e.preventDefault(); setNoteMode(v => !v) }
      if (e.key === 'Escape') {
        if (lightboxUrl) { setLightboxUrl(null); return }
        setShowQuickReply(false)
        setShowKbSearch(false)
        setKbAnswer(null)
        setKbQuery('')
        setNoteMode(false)
      }
      if (isInput) return
      if (ctrl && e.key === '/') { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'ArrowUp') navigateConversation(-1)
      if (e.key === 'ArrowDown') navigateConversation(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigateConversation, lightboxUrl])

  // ─── Mutations ─────────────────────────────────────────────────────────

  const sendMut = useMutation({
    mutationFn: (data: { content: string; contentType?: string; mediaUrl?: string }) =>
      sendMessageApi(selectedId!, data.content, false, data.contentType || data.mediaUrl ? { contentType: data.contentType, mediaUrl: data.mediaUrl } : undefined),
    onSuccess: () => {
      setInputValue('')
      setPendingFiles([])
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['svc-conversations'] })
    },
    onError: () => toast.error('发送失败'),
  })

  const noteMut = useMutation({
    mutationFn: (content: string) => addConversationNote(selectedId!, content),
    onSuccess: () => {
      setInputValue('')
      setNoteMode(false)
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
      toast.success('备注已添加')
    },
    onError: () => toast.error('备注失败'),
  })

  const assignMut = useMutation({
    mutationFn: ({ convId, agentId }: { convId: string; agentId: string }) =>
      fetchApi(`/conversations/${convId}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
    onSuccess: () => {
      toast.success('已接入会话')
      queryClient.invalidateQueries({ queryKey: ['svc-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
    },
    onError: () => toast.error('接入失败'),
  })

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolveConversation(id),
    onSuccess: () => {
      toast.success('会话已解决')
      queryClient.invalidateQueries({ queryKey: ['svc-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
    },
  })

  const reopenMut = useMutation({
    mutationFn: (id: string) => reopenConversation(id),
    onSuccess: () => {
      toast.success('会话已重新打开')
      queryClient.invalidateQueries({ queryKey: ['svc-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
    },
  })

  const inviteRateMut = useMutation({
    mutationFn: (id: string) => inviteRating(id),
    onSuccess: () => {
      toast.success('评价邀请已发送')
      queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
    },
    onError: () => toast.error('发送失败'),
  })

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!selectedId) return
    const text = inputValue.trim()

    if (noteMode) {
      if (!text) return
      noteMut.mutate(text)
      return
    }

    if (pendingFiles.length > 0) {
      setUploading(true)
      try {
        for (const file of pendingFiles) {
          const { url, name } = await uploadMessageFile(file)
          const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name) || file.type.startsWith('image/')
          const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(name) || file.type.startsWith('video/')
          const contentType = isImage ? 'image' : isVideo ? 'video' : 'file'
          const caption = text || name
          await sendMut.mutateAsync({ content: caption, contentType, mediaUrl: url })
        }
      } catch {
        toast.error('文件上传失败')
      } finally {
        setUploading(false)
        setPendingFiles([])
        setInputValue('')
        queryClient.invalidateQueries({ queryKey: ['svc-conv', selectedId] })
        queryClient.invalidateQueries({ queryKey: ['svc-conversations'] })
      }
      return
    }

    if (!text) return
    sendMut.mutate({ content: text })
  }, [inputValue, selectedId, noteMode, sendMut, noteMut, pendingFiles, queryClient])

  const handleQuickSend = useCallback((text: string) => {
    if (!selectedId) return
    sendMut.mutate({ content: text })
  }, [selectedId, sendMut])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.size <= 20 * 1024 * 1024)
    if (arr.length < files.length) toast.error('单个文件不能超过 20MB')
    setPendingFiles(prev => [...prev, ...arr])
  }, [])

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }, [addFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleEmojiSelect = useCallback((emoji: string) => {
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart ?? inputValue.length
      const end = input.selectionEnd ?? inputValue.length
      const newVal = inputValue.slice(0, start) + emoji + inputValue.slice(end)
      setInputValue(newVal)
      setTimeout(() => {
        input.focus()
        const cursor = start + emoji.length
        input.setSelectionRange(cursor, cursor)
      }, 0)
    } else {
      setInputValue(prev => prev + emoji)
    }
    setShowEmojiPicker(false)
  }, [inputValue])

  const handleKbSearch = useCallback(async () => {
    if (!kbQuery.trim() || kbList.length === 0) return
    setKbSearching(true)
    setKbAnswer(null)
    try {
      const res = await queryKnowledge(kbList[0].id, kbQuery.trim())
      setKbAnswer(res?.data?.answer ?? '未找到相关结果')
    } catch {
      setKbAnswer('查询失败')
    } finally {
      setKbSearching(false)
    }
  }, [kbQuery, kbList])

  const handleAiSuggest = useCallback(async () => {
    if (!selectedId || aiSuggesting) return
    setAiSuggesting(true)
    setShowAiSuggestion(true)
    setAiSuggestionText('')
    try {
      const res = await getAiSuggestion(selectedId)
      setAiSuggestionText(res?.data?.suggestion ?? '无法生成建议')
    } catch {
      setAiSuggestionText('AI 建议生成失败，请稍后重试')
    } finally {
      setAiSuggesting(false)
    }
  }, [selectedId, aiSuggesting])

  const handleLogout = () => {
    logout()
    router.replace('/service-login')
  }

  const ov = overviewRes?.data as Record<string, number> | undefined

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* ═══ Top Bar ═══ */}
      <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Headphones className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-800">客服工作台</span>
          </div>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>服务中 <strong className="text-slate-800">{myCount}</strong></span>
            <span>排队 <strong className={pendingCount > 0 ? 'text-amber-600' : 'text-slate-800'}>{pendingCount}</strong></span>
            {ov && <span>今日会话 <strong className="text-slate-800">{ov.conversationCount ?? 0}</strong></span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Agent Status */}
          <div className="relative">
            <button
              onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 text-xs font-medium text-slate-600 transition-colors"
              aria-label="切换状态"
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_OPTIONS.find(o => o.value === agentStatus)?.color ?? 'bg-slate-400')} />
              {STATUS_OPTIONS.find(o => o.value === agentStatus)?.label ?? '离线'}
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {statusMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { statusMut.mutate(opt.value); setStatusMenuOpen(false) }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50',
                        agentStatus === opt.value ? 'text-primary font-medium' : 'text-slate-700'
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', opt.color)} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Avatar name={user?.name ?? ''} size="sm" />
            <span className="font-medium text-slate-700">{user?.name}</span>
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="退出">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ═══ Main 3-Panel Layout ═══ */}
      <div className="flex-1 flex min-h-0">

        {/* ─── Left: Queue ─── */}
        <div className={cn('w-[280px] flex-shrink-0 flex flex-col bg-white border-r border-slate-200', selectedId ? 'hidden md:flex' : 'flex w-full md:w-[280px]')}>
          {/* Queue tabs */}
          <div className="flex border-b border-slate-100">
            {([
              ['mine', '我的', myCount],
              ...(hasTeam ? [['team', '团队', teamCount]] : []),
              ['colleague', '同事', null],
              ['pending', '排队', pendingCount],
              ['all', '全部', null],
            ] as [string, string, number | null][]).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setQueueFilter(key as typeof queueFilter)}
                className={cn('flex-1 py-2.5 text-xs font-medium transition-colors relative',
                  queueFilter === key ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {label}
                {count != null && count > 0 && (
                  <span className={cn('ml-1 inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10px] font-bold',
                    key === 'pending' && count > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
                  )}>{count}</span>
                )}
                {queueFilter === key && <div className="absolute bottom-0 inset-x-4 h-0.5 bg-primary rounded-full" />}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索会话..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Conv list */}
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">暂无会话</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <ConversationListItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === selectedId}
                  onSelect={setSelectedId}
                  onAssign={assignMut.mutate}
                  userId={user?.id ?? ''}
                />
              ))
            )}
          </div>
        </div>

        {/* ─── Center: Chat ─── */}
        <div className={cn('flex-1 flex flex-col min-w-0 bg-white', selectedId ? 'flex' : 'hidden md:flex')}>
          {selectedId && currentConv ? (
            <>
              {/* Chat Header */}
              <div className="h-12 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setSelectedId(null)} className="md:hidden p-1 rounded hover:bg-slate-100 text-slate-400">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <Avatar name={currentConv.customerName ?? '访客'} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 truncate">{currentConv.customerName || '网站访客'}</span>
                      <Badge variant={STATUS_MAP[currentConv.status] ? 'primary' : 'default'} className="text-[10px] px-1.5">
                        {STATUS_MAP[currentConv.status]?.label ?? currentConv.status}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-400">{{ web_widget: '网页咨询', wecom: '企业微信', wechat: '微信', douyin: '抖音', xiaohongshu: '小红书', sms: '短信', email: '邮件', internal: '内部会话' }[currentConv.channelType] ?? currentConv.channelType} · #{currentConv.id.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {currentConv.status === 'resolved' ? (
                    <Button size="sm" variant="outline" onClick={() => reopenMut.mutate(selectedId)} loading={reopenMut.isPending} className="h-7 text-xs">
                      <RotateCcw className="h-3 w-3" /> 重开
                    </Button>
                  ) : (
                    <>
                      {currentConv.status === 'pending' && (
                        <Button size="sm" variant="primary" onClick={() => assignMut.mutate({ convId: selectedId, agentId: user?.id ?? '' })} loading={assignMut.isPending} className="h-7 text-xs">
                          <Headphones className="h-3 w-3" /> 接入会话
                        </Button>
                      )}
                      {currentConv.status === 'active' && (
                        <Button size="sm" variant="ghost" onClick={() => inviteRateMut.mutate(selectedId)} loading={inviteRateMut.isPending} className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50">
                          <Star className="h-3 w-3" /> 邀请评价
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setShowTransfer(true)} className="h-7 text-xs text-slate-500">
                        <ArrowRightLeft className="h-3 w-3" /> 转接
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowResolveConfirm(true)} loading={resolveMut.isPending} className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                        <CheckCircle className="h-3 w-3" /> 解决
                      </Button>
                    </>
                  )}
                  <button
                    onClick={() => setShowContext(!showContext)}
                    className={cn('p-1.5 rounded-lg transition-colors', showContext ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100')}
                    title="客户信息 (Ctrl+/)"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={chatAreaRef}
                role="log"
                aria-label="会话消息"
                aria-live="polite"
                className={cn('flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50 relative', dragOver && 'ring-2 ring-primary/40 ring-inset bg-primary/5')}
                onScroll={handleChatScroll}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {dragOver && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/5 z-10 pointer-events-none">
                    <div className="flex flex-col items-center gap-2 text-primary">
                      <Paperclip className="h-8 w-8" />
                      <span className="text-sm font-medium">拖放文件到此处</span>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const prevMsg = i > 0 ? messages[i - 1] : null
                  const showDateSep = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString()
                  const dateSep = showDateSep ? (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-slate-400 font-medium">{new Date(msg.createdAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  ) : null
                  const isAgent = msg.senderType === 'agent'
                  const isBot = msg.senderType === 'bot'
                  const isNote = msg.senderType === 'note'
                  const isSystem = msg.senderType === 'system'
                  const ct = msg.contentType

                  if (isSystem) return (
                    <Fragment key={msg.id}>{dateSep}<div className="text-center text-[10px] text-slate-400 py-1">{msg.content}</div></Fragment>
                  )

                  if (isNote) return (
                    <Fragment key={msg.id}>{dateSep}<div className="flex justify-center">
                      <div className="max-w-[80%] rounded-lg px-3 py-2 bg-amber-50 border border-amber-200/60 text-xs text-amber-800">
                        <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1 mb-0.5"><StickyNote className="h-2.5 w-2.5" /> 备注</span>
                        {msg.content}
                      </div>
                    </div></Fragment>
                  )

                  const renderMedia = () => {
                    if (!msg.mediaUrl) return null
                    const url = msg.mediaUrl
                    const isImage = ct === 'image' || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url)
                    const isVideo = ct === 'video' || /\.(mp4|webm|mov)$/i.test(url)
                    if (isImage) return (
                      <button onClick={() => setLightboxUrl(url)} className="block mt-1.5 group relative">
                        <img src={url} alt="图片消息" className="max-w-56 max-h-56 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" loading="lazy" />
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                          <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                        </span>
                      </button>
                    )
                    if (isVideo) return (
                      <video src={url} controls className="max-w-64 max-h-48 rounded-lg mt-1.5" preload="metadata" />
                    )
                    return (
                      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 transition-colors text-xs">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{url.split('/').pop() || '附件'}</span>
                      </a>
                    )
                  }

                  const hasTextContent = ct !== 'image' && ct !== 'video' && ct !== 'file'

                  return (
                    <Fragment key={msg.id}>{dateSep}<div className={cn('flex gap-2', isAgent || isBot ? 'justify-end' : 'justify-start')}>
                      {!isAgent && !isBot && <Avatar name={currentConv.customerName ?? '访客'} size="sm" />}
                      <div className={cn('max-w-[70%]')}>
                        {isBot && <span className="text-[10px] text-primary/60 flex items-center gap-0.5 mb-0.5 justify-end"><Bot className="h-2.5 w-2.5" /> AI</span>}
                        <div className={cn('rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                          isAgent ? 'bg-primary text-white rounded-br-md' :
                          isBot ? 'bg-primary/10 text-slate-800 rounded-br-md' :
                          'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
                        )}>
                          {hasTextContent && msg.content}
                          {renderMedia()}
                        </div>
                        <div className={cn('flex items-center gap-1 mt-0.5', (isAgent || isBot) ? 'justify-end' : '')}>
                          <p className="text-[10px] text-slate-400">{new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</p>
                          {(() => {
                            const readBy = msg.readBy;
                            if (isAgent || isBot || !readBy || Object.keys(readBy).length === 0) return null;
                            return <span className="text-[10px] text-emerald-500 flex items-center gap-0.5"><CheckCheck className="h-2.5 w-2.5" />已读</span>;
                          })()}
                        </div>
                      </div>
                      {(isAgent || isBot) && <Avatar name={isBot ? 'AI' : user?.name ?? ''} size="sm" />}
                    </div></Fragment>
                  )
                })}
                <div ref={messagesEndRef} />
                {!isAtBottom && (
                  <button
                    onClick={scrollToBottom}
                    className="sticky bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-lg border border-slate-200 hover:bg-slate-50 transition-all"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    {newMsgCount > 0 ? `${newMsgCount} 条新消息` : '回到底部'}
                  </button>
                )}
              </div>

              {isCustomerTyping && (
                <div className="px-4 py-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    对方正在输入...
                  </div>
                </div>
              )}

              {/* Input Area */}
              {currentConv.status !== 'resolved' && currentConv.status !== 'closed' ? (
                <div className="border-t border-slate-200 bg-white">
                  {/* Quick Reply / KB Panel */}
                  {showQuickReply && (
                    <div className="px-3 pt-2 pb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-medium text-slate-400">快捷回复</p>
                        <button onClick={() => setShowQuickReply(false)} className="text-slate-300 hover:text-slate-500"><X className="h-3 w-3" /></button>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                        {(cannedResponses.length > 0 ? cannedResponses : QUICK_REPLIES_DEFAULT).map((qr) => (
                          <button
                            key={qr.id}
                            onClick={() => { setInputValue(qr.content); setShowQuickReply(false); inputRef.current?.focus() }}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors"
                            title={qr.content}
                          >
                            {qr.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {showKbSearch && (
                    <div className="px-3 pt-2 pb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-medium text-emerald-600 flex items-center gap-1"><BookOpen className="h-3 w-3" /> 知识库搜索</p>
                        <button onClick={() => { setShowKbSearch(false); setKbAnswer(null); setKbQuery('') }} className="text-slate-300 hover:text-slate-500"><X className="h-3 w-3" /></button>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text" value={kbQuery}
                          onChange={(e) => setKbQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleKbSearch() }}
                          placeholder="搜索知识库..."
                          className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-300"
                        />
                        <Button size="sm" variant="default" onClick={handleKbSearch} loading={kbSearching} disabled={!kbQuery.trim()} className="h-7 text-xs"><Search className="h-3 w-3" /></Button>
                      </div>
                      {kbAnswer && (
                        <div className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-slate-700 max-h-24 overflow-y-auto">
                          <p className="whitespace-pre-wrap leading-relaxed">{kbAnswer}</p>
                          <button onClick={() => { setInputValue(kbAnswer); setShowKbSearch(false); setKbAnswer(null); setKbQuery('') }}
                            className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700 font-medium">
                            <Copy className="h-2.5 w-2.5" /> 引用到回复
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {showAiSuggestion && aiSuggestionText && (
                    <div className="px-3 pt-2 pb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-medium text-violet-600 flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI 建议回复</p>
                        <button onClick={() => { setShowAiSuggestion(false); setAiSuggestionText('') }} className="text-slate-300 hover:text-slate-500"><X className="h-3 w-3" /></button>
                      </div>
                      <div className="rounded-lg bg-violet-50 border border-violet-200 p-2 text-[11px] text-slate-700 max-h-24 overflow-y-auto">
                        <p className="whitespace-pre-wrap leading-relaxed">{aiSuggestionText}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button onClick={() => { setInputValue(aiSuggestionText); setShowAiSuggestion(false) }}
                            className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700 font-medium">
                            <Copy className="h-2.5 w-2.5" /> 使用此回复
                          </button>
                          <button onClick={handleAiSuggest} disabled={aiSuggesting}
                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-600 font-medium">
                            {aiSuggesting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />} 重新生成
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {noteMode && (
                    <div className="px-3 pt-2">
                      <div className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-0.5">
                        <StickyNote className="h-2.5 w-2.5" /> 备注模式 — 仅团队可见
                      </div>
                    </div>
                  )}
                  {/* Pending Files Preview */}
                  {pendingFiles.length > 0 && (
                    <div className="px-3 pt-2 flex flex-wrap gap-2">
                      {pendingFiles.map((file, idx) => {
                        const isImg = file.type.startsWith('image/')
                        const isVid = file.type.startsWith('video/')
                        return (
                          <div key={idx} className="relative group">
                            {isImg && previewUrls[idx] ? (
                              <img src={previewUrls[idx]!} alt="预览" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
                            ) : isVid ? (
                              <div className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                                <Film className="h-5 w-5 text-slate-400" />
                              </div>
                            ) : (
                              <div className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-100 flex flex-col items-center justify-center p-1">
                                <FileText className="h-4 w-4 text-slate-400" />
                                <span className="text-[8px] text-slate-400 truncate w-full text-center mt-0.5">{file.name.split('.').pop()}</span>
                              </div>
                            )}
                            <button
                              onClick={() => removePendingFile(idx)}
                              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center truncate rounded-b-lg px-0.5">{file.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Toolbar + Input */}
                  <div className="px-3 py-2 flex items-center gap-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
                      className="hidden"
                      onChange={(e) => { if (e.target.files) { addFiles(e.target.files); e.target.value = '' } }}
                    />
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="上传文件 (可直接粘贴图片)">
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { const input = fileInputRef.current; if (input) { input.accept = 'image/*'; input.click(); input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt' } }}
                        className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="上传图片">
                        <ImageIcon className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { const input = fileInputRef.current; if (input) { input.accept = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'; input.click(); input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt' } }}
                        className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="上传视频">
                        <Film className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setShowQuickReply(!showQuickReply); setShowKbSearch(false) }}
                        className={cn('p-1.5 rounded-lg transition-colors', showQuickReply ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100')} title="快捷回复 (Ctrl+K)">
                        <Zap className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setNoteMode(!noteMode)}
                        className={cn('p-1.5 rounded-lg transition-colors', noteMode ? 'bg-amber-100 text-amber-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100')} title="备注 (Ctrl+N)">
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                      {kbList.length > 0 && (
                        <button onClick={() => { setShowKbSearch(!showKbSearch); setShowQuickReply(false) }}
                          className={cn('p-1.5 rounded-lg transition-colors', showKbSearch ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100')} title="知识库搜索 (Ctrl+B)">
                          <BookOpen className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={handleAiSuggest} disabled={aiSuggesting}
                        className={cn('p-1.5 rounded-lg transition-colors', showAiSuggestion ? 'bg-violet-100 text-violet-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100')} title="AI 建议回复">
                        {aiSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </button>
                      <div className="relative">
                        <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className={cn('p-1.5 rounded-lg transition-colors', showEmojiPicker ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100')} title="表情">
                          <Smile className="h-3.5 w-3.5" />
                        </button>
                        {showEmojiPicker && (
                          <EmojiPicker
                            onSelect={handleEmojiSelect}
                            onClose={() => setShowEmojiPicker(false)}
                          />
                        )}
                      </div>
                    </div>
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => { setInputValue(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      onPaste={handlePaste}
                      rows={1}
                      placeholder={noteMode ? '输入备注...' : pendingFiles.length > 0 ? '添加说明 (可选)...' : '输入回复... (Enter 发送, Shift+Enter 换行)'}
                      className={cn('flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 transition-all resize-none',
                        noteMode ? 'bg-amber-50/50 border-amber-200 focus:ring-amber-300/40' : 'bg-slate-50 border-slate-200 focus:ring-primary/30 focus:border-primary'
                      )}
                      style={{ maxHeight: '120px' }}
                    />
                    <Button
                      variant={noteMode ? 'default' : 'primary'}
                      size="sm"
                      onClick={handleSend}
                      loading={sendMut.isPending || noteMut.isPending || uploading}
                      disabled={!inputValue.trim() && pendingFiles.length === 0}
                      className="h-9 px-4"
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-200 bg-slate-50 py-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5" /> 会话已结束
                  <Button size="sm" variant="ghost" onClick={() => reopenMut.mutate(selectedId)} className="h-6 text-[11px] text-primary">重新打开</Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <Headphones className="h-16 w-16 mb-3 text-slate-200" />
              <p className="text-sm text-slate-400 font-medium">选择会话开始服务</p>
              <p className="text-xs text-slate-300 mt-1">从左侧列表选择或等待新的客户咨询</p>
            </div>
          )}
        </div>

        {/* ─── Right: Context Panel ─── */}
        {selectedId && currentConv && showContext && (
          <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setShowContext(false)} />
          <div className={cn('flex flex-col bg-white border-l border-slate-200 overflow-y-auto',
            'fixed right-0 top-12 bottom-0 z-50 w-[280px] shadow-xl lg:shadow-none',
            'lg:relative lg:top-auto lg:bottom-auto lg:z-auto lg:w-[260px] lg:flex-shrink-0'
          )}>
            {/* Customer */}
            <div className="p-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 mb-3">
                <Avatar name={customer?.name ?? '访客'} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{customer?.name ?? '网站访客'}</p>
                  <p className="text-[10px] text-slate-400">{customer?.type === 'company' || customer?.type === 'enterprise' ? '企业客户' : '个人客户'}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {customer?.phone && <InfoRow icon={Phone} label={customer.phone} />}
                {customer?.email && <InfoRow icon={Mail} label={customer.email} />}
                {customer?.companyName && <InfoRow icon={Building} label={customer.companyName} />}
              </div>
            </div>

            {/* Conversation Meta */}
            <div className="p-3 border-b border-slate-100 space-y-1.5">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">会话信息</p>
              <InfoRow icon={Hash} label={`#${currentConv.id.slice(0, 8)}`} />
              <InfoRow icon={MessageSquare} label={`${currentConv.messageCount} 条消息`} />
              <InfoRow icon={Clock} label={`等待 ${formatRelativeTime(currentConv.createdAt)}`} />
            </div>

            {/* Tags */}
            <ConvTagsSection conversationId={currentConv.id} tags={currentConv.tags ?? []} />

            {/* SLA */}
            {(currentConv.slaRespondBy || currentConv.slaResolveBy) && (
              <div className="p-3 border-b border-slate-100 space-y-1.5">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">SLA</p>
                {currentConv.slaRespondBy && <SlaBar label="响应" deadline={currentConv.slaRespondBy} done={!!currentConv.slaFirstResponseAt} />}
                {currentConv.slaResolveBy && <SlaBar label="解决" deadline={currentConv.slaResolveBy} done={!!currentConv.slaResolvedAt} />}
              </div>
            )}

            {/* Satisfaction */}
            {currentConv.satisfactionScore != null && (
              <div className="p-3 border-b border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">评价</p>
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map(s => <Star key={s} className={cn('h-3.5 w-3.5', s <= (currentConv.satisfactionScore ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200')} />)}
                  <span className="text-xs text-slate-600 ml-1">{currentConv.satisfactionScore}/5</span>
                </div>
                {currentConv.satisfactionComment && <p className="text-[11px] text-slate-500 mt-1 bg-slate-50 rounded p-1.5">"{currentConv.satisfactionComment}"</p>}
              </div>
            )}

            {/* AI Summary */}
            {currentConv.aiSummary && (
              <div className="p-3 border-b border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Bot className="h-3 w-3" /> AI 摘要</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{currentConv.aiSummary}</p>
              </div>
            )}

            {/* Conversation Grade & Lead */}
            {(currentConv.grade || currentConv.hasLead) && (
              <div className="p-3 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {currentConv.grade && (
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', {
                      'bg-slate-100 text-slate-500': currentConv.grade === '无效',
                      'bg-blue-100 text-blue-600': currentConv.grade === '简单',
                      'bg-green-100 text-green-600': currentConv.grade === '普通',
                      'bg-amber-100 text-amber-600': currentConv.grade === '深度',
                      'bg-red-100 text-red-600': currentConv.grade === '重要',
                    })}>{currentConv.grade}</span>
                  )}
                  {currentConv.hasLead && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600 flex items-center gap-0.5">
                      <FileSearch2 className="h-2.5 w-2.5" /> 有线索
                    </span>
                  )}
                  {currentConv.isInvalid && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-400">无效对话</span>
                  )}
                </div>
                {currentConv.detectedContact && (
                  <div className="mt-2 space-y-1">
                    {currentConv.detectedContact.phone && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600"><Phone className="h-3 w-3 text-slate-400" />{currentConv.detectedContact.phone}</div>
                    )}
                    {currentConv.detectedContact.email && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600"><Mail className="h-3 w-3 text-slate-400" />{currentConv.detectedContact.email}</div>
                    )}
                    {currentConv.detectedContact.wechat && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600"><MessageSquare className="h-3 w-3 text-slate-400" />{currentConv.detectedContact.wechat}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Agent Summary (对话小结) */}
            <ConversationSummaryPanel conversationId={selectedId} summary={currentConv.summary ?? ''} status={currentConv.status} />

            {/* Recent Tickets */}
            {recentTickets.length > 0 && (
              <div className="p-3 border-b border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> 最近工单</p>
                <div className="space-y-1.5">
                  {recentTickets.map(ticket => {
                    const statusColors: Record<string, string> = {
                      open: 'bg-blue-100 text-blue-700',
                      in_progress: 'bg-amber-100 text-amber-700',
                      resolved: 'bg-emerald-100 text-emerald-700',
                      closed: 'bg-slate-100 text-slate-500',
                    }
                    const statusLabels: Record<string, string> = {
                      open: '待处理', in_progress: '处理中', pending: '挂起', resolved: '已解决', closed: '已关闭',
                    }
                    return (
                      <a key={ticket.id} href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer"
                        className="block rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] text-slate-700 truncate group-hover:text-primary transition-colors">{ticket.title}</span>
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0', statusColors[ticket.status] ?? 'bg-slate-100 text-slate-500')}>
                            {statusLabels[ticket.status] ?? ticket.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{new Date(ticket.createdAt).toLocaleDateString('zh-CN')}</p>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Conversation History */}
            {historyConvCount > 1 && (
              <div className="p-3 border-b border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><History className="h-3 w-3" /> 历史会话</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-600">共 <strong>{historyConvCount}</strong> 次会话</span>
                  <a href="/dashboard/history" className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors">查看历史 →</a>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="p-3">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">快捷操作</p>
              <div className="space-y-1">
                {customer?.id && (
                  <a href={`/dashboard/customers/${customer.id}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 transition-colors">
                    <ExternalLink className="h-3 w-3" /> 客户详情
                  </a>
                )}
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Transfer Dialog */}
      <TransferDialog
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        conversationId={selectedId ?? ''}
        members={members.filter(m => m.id !== currentConv?.agentId)}
        onSuccess={() => {
          setShowTransfer(false)
          queryClient.invalidateQueries({ queryKey: ['svc-conversations'] })
        }}
      />

      {/* Resolve Confirm */}
      {showResolveConfirm && selectedId && (
        <Dialog open onOpenChange={() => setShowResolveConfirm(false)} title="确认解决会话">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">确认将此会话标记为已解决？客户将收到满意度调查邀请。</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowResolveConfirm(false)}>取消</Button>
              <Button variant="primary" size="sm" onClick={() => { resolveMut.mutate(selectedId); setShowResolveConfirm(false) }} loading={resolveMut.isPending}>确认解决</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="图片预览" className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain shadow-2xl" />
            <div className="absolute -top-10 right-0 flex gap-2">
              <a href={lightboxUrl} download className="flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-1 text-xs text-white transition-colors backdrop-blur-sm">
                <Download className="h-3.5 w-3.5" /> 下载
              </a>
              <button onClick={() => setLightboxUrl(null)} className="flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-1 text-xs text-white transition-colors backdrop-blur-sm">
                <X className="h-3.5 w-3.5" /> 关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Sub Components ──────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-600">
      <Icon className="h-3 w-3 text-slate-400 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}

function SlaBar({ label, deadline, done }: { label: string; deadline: string; done: boolean }) {
  const remaining = new Date(deadline).getTime() - Date.now()
  const overdue = !done && remaining < 0
  const warning = !done && remaining > 0 && remaining < 30 * 60 * 1000
  const fmt = () => {
    if (done) return '✓'
    const m = Math.abs(Math.floor(remaining / 60000))
    const txt = m < 60 ? `${m}分钟` : `${Math.floor(m / 60)}时`
    return remaining < 0 ? `超${txt}` : txt
  }
  return (
    <div className={cn('flex items-center justify-between rounded px-2 py-1 text-[10px]',
      done ? 'bg-emerald-50 text-emerald-700' : overdue ? 'bg-red-50 text-red-600' : warning ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
    )}>
      <span>{label}</span>
      <span className="font-medium">{fmt()}</span>
    </div>
  )
}

function ConvTagsSection({ conversationId, tags }: { conversationId: string; tags: string[] }) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const mut = useMutation({
    mutationFn: (newTags: string[]) => updateConversationTags(conversationId, newTags),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['svc-conv', conversationId] }),
  })

  return (
    <div className="p-3 border-b border-slate-100">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">标签</p>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px]">
            {t}
            <button onClick={() => mut.mutate(tags.filter(x => x !== t))} className="hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
      </div>
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) { mut.mutate([...tags, input.trim()]); setInput('') } }}
        placeholder="添加标签..."
        className="w-full rounded border border-slate-200 px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}

function TransferDialog({ open, onClose, conversationId, members, onSuccess }: {
  open: boolean; onClose: () => void; conversationId: string; members: OrgMember[]; onSuccess: () => void
}) {
  const [targetId, setTargetId] = useState('')
  const [reason, setReason] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const mut = useMutation({
    mutationFn: () => transferConversation(conversationId, targetId, reason || undefined),
    onSuccess: () => { toast.success('转接成功'); onSuccess() },
    onError: (e) => toast.error(e instanceof Error ? e.message : '转接失败'),
  })

  const filteredMembers = searchTerm
    ? members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase()))
    : members

  return (
    <Dialog open={open} onOpenChange={onClose} title="转接会话">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">选择转接客服</label>
          {members.length > 5 && (
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜索客服..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
          )}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {filteredMembers.map(m => (
              <button
                key={m.id}
                onClick={() => setTargetId(m.id)}
                className={cn('w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                  targetId === m.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-slate-50'
                )}
              >
                <Avatar name={m.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                  <p className="text-[10px] text-slate-400">{ROLE_LABELS[m.role] ?? m.role}</p>
                </div>
                {targetId === m.id && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
            {filteredMembers.length === 0 && <p className="text-xs text-slate-400 text-center py-4">{searchTerm ? '未找到匹配的客服' : '暂无可转接客服'}</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">转接原因 <span className="text-slate-400 font-normal">(可选)</span></label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="如：客户问题需技术支持..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => mut.mutate()} loading={mut.isPending} disabled={!targetId}>确认转接</Button>
        </div>
      </div>
    </Dialog>
  )
}

function ConversationSummaryPanel({ conversationId, summary, status }: { conversationId: string; summary: string; status: string }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(summary)
  const queryClient = useQueryClient()

  useEffect(() => { setText(summary) }, [summary])

  const saveMut = useMutation({
    mutationFn: () => saveConversationSummary(conversationId, text),
    onSuccess: () => {
      toast.success('小结已保存')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['svc-conv', conversationId] })
    },
    onError: () => toast.error('保存失败'),
  })

  return (
    <div className="p-3 border-b border-slate-100">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <PenLine className="h-3 w-3" /> 对话小结
        </p>
        {!editing && (status === 'resolved' || status === 'closed' || summary) && (
          <button onClick={() => setEditing(true)} className="text-[10px] text-primary hover:underline">编辑</button>
        )}
        {!editing && !summary && status !== 'resolved' && status !== 'closed' && (
          <button onClick={() => setEditing(true)} className="text-[10px] text-primary hover:underline">添加</button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            placeholder="总结本次对话内容..."
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(summary) }} className="h-6 text-[10px]">取消</Button>
            <Button size="sm" variant="primary" onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!text.trim()} className="h-6 text-[10px]">保存</Button>
          </div>
        </div>
      ) : summary ? (
        <p className="text-[11px] text-slate-600 leading-relaxed">{summary}</p>
      ) : (
        <p className="text-[11px] text-slate-400 italic">暂无小结</p>
      )}
    </div>
  )
}

const ConversationListItem = React.memo(function ConversationListItem({
  conv, isActive, onSelect, onAssign, userId,
}: {
  conv: Conversation
  isActive: boolean
  onSelect: (id: string) => void
  onAssign: (params: { convId: string; agentId: string }) => void
  userId: string
}) {
  const priority = PRIORITY_MAP[conv.priority]
  const status = STATUS_MAP[conv.status]
  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors',
        isActive ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-slate-50 border-l-2 border-l-transparent'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative mt-0.5">
          <Avatar name={conv.customerName ?? '访客'} size="sm" />
          {status && <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white', status.color)} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 truncate">{conv.customerName || '网站访客'}</span>
            <span className="text-[10px] text-slate-400 shrink-0 ml-1">{formatRelativeTime(conv.lastMessageAt ?? conv.createdAt)}</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-snug">{conv.lastMessagePreview || '暂无消息'}</p>
          <div className="flex items-center gap-1 mt-1">
            {priority && priority.sort <= 1 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', priority.color)}>{priority.label}</span>
            )}
            {conv.status === 'pending' && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium hover:bg-primary hover:text-white transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onAssign({ convId: conv.id, agentId: userId }) }}
              >
                接入
              </span>
            )}
            {conv.unreadCount != null && conv.unreadCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1">
                {conv.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
})
