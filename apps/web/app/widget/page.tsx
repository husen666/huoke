'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string
  content: string
  contentType?: string
  mediaUrl?: string
  senderType: 'customer' | 'agent' | 'system'
  createdAt?: string
}

interface ProactiveRule {
  id: string
  triggerType: string
  triggerConfig: Record<string, unknown>
  message: string
  displayDelay: number
  maxShowCount: number
}

interface InitResponse {
  success: boolean
  error?: string
  data?: {
    sessionId: string
    greeting: string
    isNew: boolean
    isOnline: boolean
    offlineMessage?: string
  }
}

interface MessagesResponse {
  success: boolean
  data?: Message[]
  meta?: { status: string; rated: boolean }
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'
type ViewMode = 'prechat' | 'chat' | 'offline-form' | 'rating' | 'resolved'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_PREFIX = '/api/v1/widget'

function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  return fetch(API_PREFIX + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then((r) => r.json() as Promise<T>)
}

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shouldShowTimeDivider(prev?: string, cur?: string) {
  if (!prev || !cur) return !!cur
  return Math.abs(new Date(cur).getTime() - new Date(prev).getTime()) > 5 * 60 * 1000
}

function formatDividerTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.08
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  } catch {
    // silent
  }
}

function isImageType(ct?: string) {
  return ct === 'image'
}

function isFileType(ct?: string) {
  return ct === 'file'
}

const SESSION_KEY = 'huoke_widget_session'
const VISITOR_KEY = 'huoke_widget_visitor'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs">🤖</div>
      <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1.5 justify-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          className={`text-3xl transition-colors duration-150 ${
            (hover || value) >= s ? 'text-amber-400' : 'text-slate-300'
          } ${disabled ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          onMouseEnter={() => !disabled && setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => !disabled && onChange(s)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Widget Component
// ---------------------------------------------------------------------------

function WidgetInner() {
  const params = useSearchParams()
  const siteToken = params.get('siteToken') || ''
  const primaryColor = params.get('color') || '#2563eb'
  const headerTitle = params.get('title') || '在线客服'
  const showPreChat = params.get('preChat') === 'true'

  // State
  const [view, setView] = useState<ViewMode>(showPreChat ? 'prechat' : 'chat')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [greeting, setGreeting] = useState('您好！有什么可以帮您的吗？')
  const [isOnline, setIsOnline] = useState(true)
  const [offlineMessage, setOfflineMessage] = useState('')
  const [convStatus, setConvStatus] = useState('pending')
  const [isRated, setIsRated] = useState(false)
  const [showTyping, setShowTyping] = useState(false)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  // Pre-chat form
  const [pcName, setPcName] = useState('')
  const [pcContact, setPcContact] = useState('')
  const [pcError, setPcError] = useState('')

  // Offline form
  const [ofName, setOfName] = useState('')
  const [ofPhone, setOfPhone] = useState('')
  const [ofEmail, setOfEmail] = useState('')
  const [ofContent, setOfContent] = useState('')
  const [ofSubmitting, setOfSubmitting] = useState(false)
  const [ofDone, setOfDone] = useState(false)

  // Rating
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [ratingDone, setRatingDone] = useState(false)

  // Proactive chat
  const [proactiveRules, setProactiveRules] = useState<ProactiveRule[]>([])
  const [proactiveMessage, setProactiveMessage] = useState<string | null>(null)
  const [proactiveDismissed, setProactiveDismissed] = useState(false)
  const proactiveShownRef = useRef<Set<string>>(new Set())
  const proactiveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef(sessionId)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Restore saved visitor info for pre-chat
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VISITOR_KEY)
      if (saved) {
        const v = JSON.parse(saved)
        if (v?.name) {
          setPcName(v.name)
          setPcContact(v.email || v.phone || '')
          if (showPreChat) setView('chat')
        }
      }
    } catch {
      // ignore
    }
  }, [showPreChat])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showTyping])

  // Detect resolved/closed from polling and show appropriate view
  useEffect(() => {
    if (convStatus === 'resolved' || convStatus === 'closed') {
      if (!isRated) {
        setView('rating')
      } else {
        setView('resolved')
      }
    }
  }, [convStatus, isRated])

  // ------ API calls ------

  const initSession = useCallback(
    async (forceNew = false) => {
      if (!siteToken) return
      setConnectionStatus('connecting')
      setError('')

      const savedSession = forceNew ? null : (sessionIdRef.current || (() => { try { return localStorage.getItem(SESSION_KEY) } catch { return null } })())
      const savedVisitor = (() => { try { const v = localStorage.getItem(VISITOR_KEY); return v ? JSON.parse(v) : null } catch { return null } })()

      const payload: Record<string, unknown> = {
        siteToken,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      }
      if (savedSession) payload.sessionId = savedSession
      if (savedVisitor?.name) payload.visitorName = savedVisitor.name
      if (savedVisitor?.email) payload.visitorEmail = savedVisitor.email
      if (savedVisitor?.phone) payload.visitorPhone = savedVisitor.phone

      try {
        const res = await api<InitResponse>('/init', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (res.success && res.data) {
          setSessionId(res.data.sessionId)
          setGreeting(res.data.greeting || '您好！有什么可以帮您的吗？')
          setIsOnline(res.data.isOnline !== false)
          setOfflineMessage(res.data.offlineMessage || '')
          setConnectionStatus('connected')
          setConvStatus('active')
          setIsRated(false)
          try { localStorage.setItem(SESSION_KEY, res.data.sessionId) } catch { /* */ }
          return res.data.sessionId
        } else {
          setConnectionStatus('disconnected')
          setError(res.error || '连接失败，请刷新重试')
          return null
        }
      } catch {
        setConnectionStatus('disconnected')
        setError('网络连接失败，请检查网络后重试')
        return null
      }
    },
    [siteToken],
  )

  const loadMessages = useCallback(
    async (sid: string) => {
      if (!sid || !siteToken) return
      try {
        const res = await api<MessagesResponse>(
          `/messages/${sid}?siteToken=${encodeURIComponent(siteToken)}`,
        )
        if (res.success && res.data) {
          const newMsgs = res.data
          setMessages((prev) => {
            if (newMsgs.length > prev.length) {
              const incoming = newMsgs.slice(prev.length)
              const hasAgentMsg = incoming.some((m) => m.senderType !== 'customer')
              if (hasAgentMsg && prev.length > 0) {
                playNotificationSound()
              }
            }
            return newMsgs
          })
          if (res.meta) {
            setConvStatus(res.meta.status || 'active')
            setIsRated(!!res.meta.rated)
          }
        }
      } catch {
        // silent polling error
      }
    },
    [siteToken],
  )

  // Polling
  const startPolling = useCallback(
    (sid: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = setInterval(() => {
        loadMessages(sid)
      }, 3000)
    },
    [loadMessages],
  )

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Init on mount (or when pre-chat is done)
  useEffect(() => {
    if (view !== 'chat') return
    if (sessionId) {
      loadMessages(sessionId)
      startPolling(sessionId)
      return
    }
    initSession().then((sid) => {
      if (sid) {
        loadMessages(sid)
        startPolling(sid)
      }
    })
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch proactive rules on mount
  useEffect(() => {
    if (!siteToken) return
    api<{ success: boolean; data?: ProactiveRule[] }>(`/proactive-rules?siteToken=${encodeURIComponent(siteToken)}`)
      .then((res) => {
        if (res.success && res.data) setProactiveRules(res.data)
      })
      .catch(() => {})
  }, [siteToken])

  // Evaluate proactive rules client-side
  useEffect(() => {
    if (proactiveRules.length === 0 || proactiveDismissed) return
    const pageStartTime = Date.now()

    for (const rule of proactiveRules) {
      if (proactiveShownRef.current.has(rule.id)) continue

      if (rule.triggerType === 'time_on_page') {
        const secs = (rule.triggerConfig.seconds as number) || 30
        const totalDelay = (secs + (rule.displayDelay || 0)) * 1000
        const timer = setTimeout(() => {
          if (!proactiveShownRef.current.has(rule.id)) {
            proactiveShownRef.current.add(rule.id)
            setProactiveMessage(rule.message)
            playNotificationSound()
          }
        }, totalDelay)
        proactiveTimersRef.current.push(timer)
      } else if (rule.triggerType === 'page_url') {
        const pattern = (rule.triggerConfig.urlPattern as string) || ''
        if (pattern && window.location.href.includes(pattern)) {
          const delay = (rule.displayDelay || 0) * 1000
          const timer = setTimeout(() => {
            if (!proactiveShownRef.current.has(rule.id)) {
              proactiveShownRef.current.add(rule.id)
              setProactiveMessage(rule.message)
              playNotificationSound()
            }
          }, delay)
          proactiveTimersRef.current.push(timer)
        }
      } else if (rule.triggerType === 'scroll_depth') {
        const threshold = (rule.triggerConfig.depth as number) || 70
        const handleScroll = () => {
          const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
          if (scrollPercent >= threshold && !proactiveShownRef.current.has(rule.id)) {
            proactiveShownRef.current.add(rule.id)
            const delay = (rule.displayDelay || 0) * 1000
            setTimeout(() => {
              setProactiveMessage(rule.message)
              playNotificationSound()
            }, delay)
            window.removeEventListener('scroll', handleScroll)
          }
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        proactiveTimersRef.current.push(setTimeout(() => window.removeEventListener('scroll', handleScroll), 300000))
      }
    }

    return () => {
      proactiveTimersRef.current.forEach(clearTimeout)
      proactiveTimersRef.current = []
    }
  }, [proactiveRules, proactiveDismissed])

  const handleProactiveClick = () => {
    if (proactiveMessage) {
      setProactiveDismissed(true)
      if (view === 'prechat') setView('chat')
      setInputText(proactiveMessage)
      setProactiveMessage(null)
    }
  }

  const dismissProactive = () => {
    setProactiveMessage(null)
    setProactiveDismissed(true)
  }

  // ------ Actions ------

  const handlePreChatSubmit = () => {
    if (!pcName.trim()) {
      setPcError('请输入您的称呼')
      return
    }
    const email = pcContact.includes('@') ? pcContact.trim() : undefined
    const phone = !email && pcContact.trim() ? pcContact.trim() : undefined
    const visitor = { name: pcName.trim(), email, phone }
    try { localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor)) } catch { /* */ }
    setPcError('')
    setView('chat')
  }

  const sendTextMessage = async () => {
    const sid = sessionIdRef.current
    if (!sid || sending) return

    if (pendingFile) {
      await uploadAndSend(sid)
      return
    }

    const text = inputText.trim()
    if (!text) return

    setSending(true)
    setInputText('')
    setShowTyping(true)

    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [...prev, { id: tempId, content: text, senderType: 'customer', createdAt: new Date().toISOString() }])

    try {
      const res = await api<{
        success: boolean
        error?: string
        data?: { message: Message; aiReply?: { content: string }; transferred?: boolean; offline?: boolean }
      }>(`/messages/${sid}`, {
        method: 'POST',
        body: JSON.stringify({ content: text, siteToken }),
      })

      setShowTyping(false)

      if (res.success && res.data) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId)
          const next = [...filtered, { ...res.data!.message, createdAt: res.data!.message.createdAt || new Date().toISOString() }]
          if (res.data!.aiReply) {
            next.push({
              id: `ai-${Date.now()}`,
              content: res.data!.aiReply.content,
              senderType: res.data!.transferred ? 'system' : 'agent',
              createdAt: new Date().toISOString(),
            })
            playNotificationSound()
          }
          return next
        })
        if (res.data.offline) {
          setView('offline-form')
        }
      } else if (res.error === 'SESSION_RESOLVED') {
        handleNewSession()
      }
    } catch {
      setShowTyping(false)
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { id: `err-${Date.now()}`, content: '发送失败，请重试', senderType: 'system', createdAt: new Date().toISOString() },
      ])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const uploadAndSend = async (sid: string) => {
    if (!pendingFile) return
    setSending(true)

    const file = pendingFile
    const isImg = file.type.startsWith('image/')
    const ct = isImg ? 'image' : 'file'
    setPendingFile(null)

    try {
      const form = new FormData()
      form.append('file', file)
      const uploadRes = await fetch(`${API_PREFIX}/upload`, { method: 'POST', body: form }).then((r) => r.json())

      if (uploadRes.success && uploadRes.data) {
        const text = inputText.trim() || (isImg ? '[图片]' : `[文件] ${file.name}`)
        setInputText('')
        const tempId = `temp-${Date.now()}`
        setMessages((prev) => [...prev, { id: tempId, content: text, contentType: ct, mediaUrl: uploadRes.data.url, senderType: 'customer', createdAt: new Date().toISOString() }])

        const res = await api<{ success: boolean; data?: { message: Message; aiReply?: { content: string } } }>(`/messages/${sid}`, {
          method: 'POST',
          body: JSON.stringify({ content: text, contentType: ct, mediaUrl: uploadRes.data.url, siteToken }),
        })

        if (res.success && res.data) {
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== tempId)
            const next = [...filtered, { ...res.data!.message, createdAt: res.data!.message.createdAt || new Date().toISOString() }]
            if (res.data!.aiReply) {
              next.push({ id: `ai-${Date.now()}`, content: res.data!.aiReply.content, senderType: 'agent', createdAt: new Date().toISOString() })
              playNotificationSound()
            }
            return next
          })
        }
      } else {
        setMessages((prev) => [...prev, { id: `err-${Date.now()}`, content: '文件上传失败', senderType: 'system', createdAt: new Date().toISOString() }])
      }
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, content: '文件上传失败', senderType: 'system', createdAt: new Date().toISOString() }])
    } finally {
      setSending(false)
    }
  }

  const requestHuman = async () => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await api<{ success: boolean; error?: string; data?: { message?: Message; offline?: boolean } }>(`/request-human/${sid}`, {
        method: 'POST',
        body: JSON.stringify({ siteToken }),
      })
      if (res.success && res.data?.message) {
        setMessages((prev) => [...prev, { ...res.data!.message!, createdAt: res.data!.message!.createdAt || new Date().toISOString() }])
        if (res.data.offline) setView('offline-form')
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `sys-${Date.now()}`, content: res.error || '转接失败，请稍后再试', senderType: 'system', createdAt: new Date().toISOString() },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `sys-${Date.now()}`, content: '网络错误，请稍后重试', senderType: 'system', createdAt: new Date().toISOString() },
      ])
    }
  }

  const submitLeaveMessage = async () => {
    const sid = sessionIdRef.current
    if (!sid || !ofContent.trim()) return
    setOfSubmitting(true)
    try {
      const res = await api<{ success: boolean; data?: { message?: Message } }>(`/leave-message/${sid}`, {
        method: 'POST',
        body: JSON.stringify({ siteToken, name: ofName.trim(), phone: ofPhone.trim(), email: ofEmail.trim(), content: ofContent.trim() }),
      })
      if (res.success) {
        setOfDone(true)
        if (res.data?.message) {
          setMessages((prev) => [...prev, { ...res.data!.message!, createdAt: res.data!.message!.createdAt || new Date().toISOString() }])
        }
      }
    } catch {
      // silent
    } finally {
      setOfSubmitting(false)
    }
  }

  const submitRating = async () => {
    const sid = sessionIdRef.current
    if (!sid || ratingScore < 1) return
    setRatingSubmitting(true)
    try {
      const res = await api<{ success: boolean }>(`/rate/${sid}`, {
        method: 'POST',
        body: JSON.stringify({ siteToken, score: ratingScore, comment: ratingComment.trim() || undefined }),
      })
      if (res.success) {
        setIsRated(true)
        setRatingDone(true)
      }
    } catch {
      // silent
    } finally {
      setRatingSubmitting(false)
    }
  }

  const handleNewSession = async () => {
    setMessages([])
    setConvStatus('pending')
    setIsRated(false)
    setRatingDone(false)
    setRatingScore(0)
    setRatingComment('')
    if (pollingRef.current) clearInterval(pollingRef.current)
    try { localStorage.removeItem(SESSION_KEY) } catch { /* */ }
    setSessionId(null)
    sessionIdRef.current = null
    setView('chat')
    const sid = await initSession(true)
    if (sid) {
      loadMessages(sid)
      startPolling(sid)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setMessages((prev) => [...prev, { id: `sys-${Date.now()}`, content: '文件大小不能超过 10MB', senderType: 'system', createdAt: new Date().toISOString() }])
      return
    }
    setPendingFile(file)
    e.target.value = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendTextMessage()
    }
  }

  // ------ Missing token ------
  if (!siteToken) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-4xl mb-3">⚙️</div>
          <p className="text-slate-500 text-sm">缺少 siteToken 参数</p>
        </div>
      </div>
    )
  }

  // ------ Styles ------
  const gradientStyle = { background: `linear-gradient(135deg, ${primaryColor}, ${adjustColor(primaryColor, -30)})` }
  const btnStyle = { backgroundColor: primaryColor }

  // ------ Render ------
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* Header */}
      <header className="flex-shrink-0 px-5 py-3.5 text-white flex items-center gap-3" style={gradientStyle}>
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{headerTitle}</div>
          <div className="flex items-center gap-1.5 text-xs text-white/80 mt-0.5">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                connectionStatus === 'connected' ? (isOnline ? 'bg-green-400' : 'bg-amber-400') : connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>
              {connectionStatus === 'connecting'
                ? '连接中...'
                : connectionStatus === 'disconnected'
                  ? '连接已断开'
                  : isOnline
                    ? '在线 · 通常几分钟内回复'
                    : '非工作时间 · AI 智能客服在线'}
            </span>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 bg-red-50 text-red-600 text-xs px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button className="text-red-500 underline ml-2" onClick={() => { setError(''); initSession() }}>重试</button>
        </div>
      )}

      {/* Pre-chat form */}
      {view === 'prechat' && (
        <div className="flex-1 flex flex-col justify-center px-8 py-6 animate-fade-in">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ ...btnStyle, opacity: 0.1 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">开始咨询</h2>
            <p className="text-sm text-slate-500 mt-1">请填写以下信息，方便我们更好地为您服务</p>
          </div>
          <div className="space-y-3 max-w-xs mx-auto w-full">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                您的称呼 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pcName}
                onChange={(e) => setPcName(e.target.value)}
                placeholder="请输入您的姓名"
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onKeyDown={(e) => e.key === 'Enter' && handlePreChatSubmit()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">手机号 / 邮箱</label>
              <input
                type="text"
                value={pcContact}
                onChange={(e) => setPcContact(e.target.value)}
                placeholder="选填"
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onKeyDown={(e) => e.key === 'Enter' && handlePreChatSubmit()}
              />
            </div>
            {pcError && <p className="text-red-500 text-xs">{pcError}</p>}
            <button
              onClick={handlePreChatSubmit}
              className="w-full text-white rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={btnStyle}
            >
              开始对话
            </button>
          </div>
        </div>
      )}

      {/* Chat view */}
      {view === 'chat' && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scroll-smooth" id="msg-container">
            {/* Greeting */}
            <div className="flex items-start gap-2 animate-fade-in mb-2">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs">🤖</div>
              <div className="bg-slate-100 text-slate-700 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm max-w-[80%]">
                {greeting}
              </div>
            </div>

            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1]
              const showDivider = shouldShowTimeDivider(prevMsg?.createdAt, msg.createdAt)

              return (
                <div key={msg.id}>
                  {showDivider && msg.createdAt && (
                    <div className="text-center text-[11px] text-slate-400 py-2">{formatDividerTime(msg.createdAt)}</div>
                  )}

                  {msg.senderType === 'system' ? (
                    <div className="flex justify-center animate-fade-in">
                      <div className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-1.5 max-w-[85%] text-center">
                        {msg.content}
                      </div>
                    </div>
                  ) : msg.senderType === 'customer' ? (
                    <div className="flex justify-end animate-fade-in">
                      <div className="max-w-[80%]">
                        {isImageType(msg.contentType) && msg.mediaUrl && (
                          <img
                            src={msg.mediaUrl}
                            alt="图片"
                            className="max-w-full rounded-xl mb-1 cursor-pointer"
                            onClick={() => window.open(msg.mediaUrl, '_blank')}
                          />
                        )}
                        {isFileType(msg.contentType) && msg.mediaUrl && (
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/90 underline text-sm mb-1">
                            📎 {msg.content || '附件'}
                          </a>
                        )}
                        <div
                          className="text-white rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm"
                          style={btnStyle}
                        >
                          {(!isImageType(msg.contentType) && !isFileType(msg.contentType)) && msg.content}
                          {isFileType(msg.contentType) && !msg.mediaUrl && msg.content}
                          <div className="text-[11px] text-white/60 mt-1 text-right">{formatTime(msg.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 animate-fade-in">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs">🤖</div>
                      <div className="max-w-[80%]">
                        {isImageType(msg.contentType) && msg.mediaUrl && (
                          <img
                            src={msg.mediaUrl}
                            alt="图片"
                            className="max-w-full rounded-xl mb-1 cursor-pointer"
                            onClick={() => window.open(msg.mediaUrl, '_blank')}
                          />
                        )}
                        {isFileType(msg.contentType) && msg.mediaUrl && (
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 underline text-sm mb-1">
                            📎 {msg.content || '附件'}
                          </a>
                        )}
                        <div className="bg-slate-100 text-slate-700 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm">
                          {(!isImageType(msg.contentType) && !isFileType(msg.contentType)) && msg.content}
                          {isFileType(msg.contentType) && !msg.mediaUrl && msg.content}
                          <div className="text-[11px] text-slate-400 mt-1">{formatTime(msg.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {showTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Toolbar */}
          <div className="flex-shrink-0 px-3 pb-1 flex gap-1.5">
            <button
              onClick={requestHuman}
              className="text-xs bg-slate-50 text-slate-500 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-100 transition-colors"
            >
              👤 转人工客服
            </button>
          </div>

          {/* File preview */}
          {pendingFile && (
            <div className="flex-shrink-0 mx-3 mb-1 px-3 py-2 bg-slate-50 rounded-lg flex items-center gap-2 text-sm text-slate-600">
              <span>{pendingFile.type.startsWith('image/') ? '📷' : '📎'}</span>
              <span className="flex-1 truncate">{pendingFile.name}</span>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setPendingFile(null)}>✕</button>
            </div>
          )}

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-slate-100 px-3 py-2.5 bg-white">
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 flex-shrink-0 mb-0.5"
                title="发送文件"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                rows={1}
                className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-50 max-h-24"
                style={{ minHeight: 38 }}
              />
              <button
                onClick={sendTextMessage}
                disabled={sending || (!inputText.trim() && !pendingFile)}
                className="text-white rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                style={btnStyle}
              >
                发送
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xlsx,.csv,.txt,.zip"
              onChange={handleFileSelect}
            />
          </div>
        </>
      )}

      {/* Offline leave-message form */}
      {view === 'offline-form' && (
        <div className="flex-1 overflow-y-auto px-6 py-6 animate-fade-in">
          {ofDone ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-green-600 font-medium">已收到您的咨询信息</p>
              <p className="text-slate-500 text-sm mt-1">我们将在工作时间内尽快与您联系</p>
              <button onClick={() => setView('chat')} className="mt-4 text-sm underline" style={{ color: primaryColor }}>返回聊天</button>
            </div>
          ) : (
            <>
              <div className="text-center mb-5">
                <div className="text-2xl mb-1">📋</div>
                <h3 className="font-semibold text-slate-800">留下咨询信息</h3>
                <p className="text-sm text-slate-500 mt-1">{offlineMessage || '当前为非工作时间，请留下联系方式'}</p>
              </div>
              <div className="space-y-3 max-w-xs mx-auto">
                <input value={ofName} onChange={(e) => setOfName(e.target.value)} placeholder="您的称呼" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-blue-400" />
                <input value={ofPhone} onChange={(e) => setOfPhone(e.target.value)} placeholder="手机号" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-blue-400" />
                <input value={ofEmail} onChange={(e) => setOfEmail(e.target.value)} placeholder="邮箱（选填）" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-blue-400" />
                <textarea value={ofContent} onChange={(e) => setOfContent(e.target.value)} placeholder="请描述您的咨询内容..." rows={4} className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-blue-400 resize-none" />
                <button
                  onClick={submitLeaveMessage}
                  disabled={ofSubmitting || !ofContent.trim()}
                  className="w-full text-white rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={btnStyle}
                >
                  {ofSubmitting ? '提交中...' : '提交咨询'}
                </button>
                <button onClick={() => setView('chat')} className="w-full text-slate-500 text-sm py-1 hover:underline">返回聊天</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Rating view */}
      {view === 'rating' && (
        <div className="flex-1 flex flex-col">
          {/* Show messages scroll area above rating */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {messages.slice(-5).map((msg) => (
              <div key={msg.id} className={`flex ${msg.senderType === 'customer' ? 'justify-end' : msg.senderType === 'system' ? 'justify-center' : 'items-start gap-2'} animate-fade-in`}>
                {msg.senderType === 'agent' && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs">🤖</div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.senderType === 'customer'
                      ? 'text-white rounded-br-sm'
                      : msg.senderType === 'system'
                        ? 'text-slate-400 bg-slate-50 border border-dashed border-slate-200 text-xs'
                        : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                  }`}
                  style={msg.senderType === 'customer' ? btnStyle : undefined}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
          <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-5 animate-fade-in">
            {ratingDone ? (
              <div className="text-center">
                <p className="text-green-600 font-medium">✓ 感谢您的评价！</p>
                <button onClick={handleNewSession} className="mt-3 text-sm font-medium text-white px-5 py-2 rounded-lg" style={btnStyle}>开始新会话</button>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600 text-center mb-3">会话已结束，请为本次服务评分</p>
                <StarRating value={ratingScore} onChange={setRatingScore} disabled={ratingSubmitting} />
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="留下您的评价（选填）"
                  rows={2}
                  className="w-full mt-3 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:border-blue-400"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={submitRating}
                    disabled={ratingScore < 1 || ratingSubmitting}
                    className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                    style={btnStyle}
                  >
                    {ratingSubmitting ? '提交中...' : '提交评价'}
                  </button>
                  <button onClick={handleNewSession} className="px-4 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100">跳过</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Resolved view */}
      {view === 'resolved' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-600 font-medium mb-1">本次会话已结束</p>
          <p className="text-slate-500 text-sm mb-5">感谢您的咨询</p>
          <button onClick={handleNewSession} className="text-white rounded-lg px-6 py-2.5 text-sm font-medium" style={btnStyle}>
            开始新会话
          </button>
        </div>
      )}

      {/* Proactive chat popup */}
      {proactiveMessage && !proactiveDismissed && (
        <div className="flex-shrink-0 mx-3 mb-2 animate-fade-in">
          <div className="relative rounded-xl border border-slate-200 bg-white shadow-lg p-3.5">
            <button
              onClick={dismissProactive}
              className="absolute top-1.5 right-1.5 text-slate-400 hover:text-slate-600 text-sm leading-none w-5 h-5 flex items-center justify-center"
            >
              ✕
            </button>
            <button
              onClick={handleProactiveClick}
              className="text-left w-full text-sm text-slate-700 pr-5 hover:text-slate-900"
            >
              {proactiveMessage}
            </button>
          </div>
        </div>
      )}

      {/* Powered by footer */}
      <div className="flex-shrink-0 text-center py-1.5 border-t border-slate-50">
        <a
          href="https://aineoo.com"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-slate-300 hover:text-slate-400 transition-colors"
        >
          Powered by 火客
        </a>
      </div>

      {/* Global animation styles */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}

function adjustColor(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export default function WidgetPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">加载中...</span>
        </div>
      </div>
    }>
      <WidgetInner />
    </Suspense>
  )
}
