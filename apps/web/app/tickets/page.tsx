'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ClipboardPen, Paperclip, Send, X } from 'lucide-react'

const SITE_TOKEN = '06a12e23-acda-45eb-92d3-071a4eaacb3b'
const API_PREFIX = '/api/v1/widget'

type Category = 'user_ticket' | 'platform_error'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type UploadedAttachment = {
  name: string
  url: string
  type: string
  size?: number
}
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  processing: '处理中',
  waiting_user: '待用户反馈',
  pending: '待用户反馈',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

function getTicketStatusLabel(status?: string) {
  const key = String(status || '').trim()
  return TICKET_STATUS_LABEL[key] || key || '-'
}

const TICKET_PRIORITY_LABEL: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

function getTicketPriorityLabel(priority?: string) {
  const key = String(priority || '').trim()
  return TICKET_PRIORITY_LABEL[key] || key || '-'
}

const TICKET_TYPE_LABEL: Record<string, string> = {
  user_ticket: '用户工单',
  platform_error: '平台错误上报',
  general: '常规',
  bug: '缺陷',
  feature: '功能需求',
  inquiry: '咨询',
}

function getTicketTypeLabel(type?: string) {
  const key = String(type || '').trim()
  return TICKET_TYPE_LABEL[key] || key || '-'
}

function mapTicketError(status: number, raw?: string) {
  const msg = (raw || '').toLowerCase()
  if (status === 429 || msg.includes('rate limit')) return '提交过于频繁，请稍后再试'
  if (status === 403 || msg.includes('invalid token') || msg.includes('invalid site token')) return '站点校验失败，请联系管理员检查配置'
  if (status === 404 || msg.includes('ticket not found')) return '未找到该工单，请核对工单号'
  if (msg.includes('invalid ticketno')) return '工单号格式不正确'
  if (msg.includes('missing params')) return '请填写完整查询参数'
  if (status === 400 || msg.includes('invalid params')) return '提交参数有误，请检查后重试'
  if (status >= 500 || msg.includes('server error')) return '服务暂时不可用，请稍后重试'
  if (msg.includes('blocked')) return '当前请求受限，请联系管理员'
  return raw || '提交失败，请稍后重试'
}

export default function TicketCenterPage() {
  const [category, setCategory] = useState<Category>('user_ticket')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [latestTicketNo, setLatestTicketNo] = useState('')
  const [queryTicketNo, setQueryTicketNo] = useState('')
  const [querying, setQuerying] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackAttachments, setFeedbackAttachments] = useState<UploadedAttachment[]>([])
  const [feedbackUploading, setFeedbackUploading] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackResult, setFeedbackResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [queryResult, setQueryResult] = useState<{
    ok: boolean
    text?: string
    data?: {
      ticketNo: string
      status: string
      priority: string
      type: string
      createdAt?: string
      updatedAt?: string
    }
  } | null>(null)

  const emailValid = useMemo(() => {
    const v = contactEmail.trim()
    return !v || EMAIL_RE.test(v)
  }, [contactEmail])

  const canSubmit = useMemo(
    () => title.trim().length >= 2 && description.trim().length >= 2 && emailValid && !uploading,
    [title, description, emailValid, uploading]
  )

  async function uploadAttachmentBatch(
    files: FileList | null,
    existingCount: number,
    onAppend: (items: UploadedAttachment[]) => void,
    setBusy: (v: boolean) => void,
    setMessage: (v: { ok: boolean; text: string } | null) => void
  ) {
    if (!files || files.length === 0) return
    const remain = Math.max(0, MAX_ATTACHMENTS - existingCount)
    if (remain <= 0) {
      setMessage({ ok: false, text: `最多上传 ${MAX_ATTACHMENTS} 个附件` })
      return
    }
    const picked = Array.from(files).slice(0, remain)
    setBusy(true)
    setMessage(null)
    try {
      const uploaded: UploadedAttachment[] = []
      for (const file of picked) {
        if (file.size > MAX_ATTACHMENT_SIZE) {
          throw new Error(`文件「${file.name}」超过 20MB 限制`)
        }
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`${API_PREFIX}/upload`, {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()
        if (!res.ok || !json?.success || !json?.data?.url) {
          throw new Error(mapTicketError(res.status, json?.error) || `上传失败：${file.name}`)
        }
        uploaded.push({
          name: file.name,
          url: json.data.url,
          type: file.type || 'application/octet-stream',
          size: file.size,
        })
      }
      onAppend(uploaded)
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '附件上传失败，请稍后重试' })
    } finally {
      setBusy(false)
    }
  }

  async function uploadFiles(files: FileList | null) {
    await uploadAttachmentBatch(
      files,
      attachments.length,
      (items) => setAttachments((prev) => [...prev, ...items]),
      setUploading,
      setResult
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    const payload = {
      siteToken: SITE_TOKEN,
      category,
      title: title.trim(),
      description: description.trim(),
      priority: category === 'platform_error' ? 'high' : 'medium',
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      errorCode: category === 'platform_error' ? errorCode.trim() : '',
      errorDetail: category === 'platform_error' ? errorDetail.trim() : '',
      attachments,
    }
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch(`${API_PREFIX}/public-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.ok && json?.success) {
        const ticketNo = String(json.data?.ticketNo || '').trim().toUpperCase()
        setLatestTicketNo(ticketNo)
        if (ticketNo) setQueryTicketNo(ticketNo)
        setQueryResult(null)
        setResult({ ok: true, text: `提交成功，工单号 #${ticketNo || '--'}` })
        setTitle('')
        setDescription('')
        setContactName('')
        setContactPhone('')
        setContactEmail('')
        setErrorCode('')
        setErrorDetail('')
        setAttachments([])
      } else {
        setResult({ ok: false, text: mapTicketError(res.status, json?.error) })
      }
    } catch (e) {
      const text = e instanceof Error && e.message
        ? e.message
        : '网络异常，请检查连接后重试'
      setResult({ ok: false, text })
    } finally {
      setSubmitting(false)
    }
  }

  async function copyTicketNo() {
    if (!latestTicketNo) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(latestTicketNo)
      } else if (typeof document !== 'undefined') {
        const input = document.createElement('input')
        input.value = latestTicketNo
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      setResult({ ok: true, text: `已复制工单号 #${latestTicketNo}` })
    } catch {
      setResult({ ok: false, text: '复制失败，请手动复制工单号' })
    }
  }

  async function onQueryTicket(e: React.FormEvent) {
    e.preventDefault()
    const no = queryTicketNo.trim().toUpperCase()
    if (!no) {
      setQueryResult({ ok: false, text: '请输入工单号' })
      return
    }
    await queryTicketByNo(no)
  }

  async function queryTicketByNo(no: string) {
    setQuerying(true)
    setQueryResult(null)
    setFeedbackResult(null)
    try {
      const params = new URLSearchParams({ siteToken: SITE_TOKEN, ticketNo: no })
      const res = await fetch(`${API_PREFIX}/public-ticket-status?${params.toString()}`)
      const json = await res.json()
      if (res.ok && json?.success && json?.data) {
        setQueryResult({ ok: true, data: json.data })
        setFeedbackText('')
        setFeedbackAttachments([])
      } else {
        setQueryResult({ ok: false, text: mapTicketError(res.status, json?.error) })
      }
    } catch {
      setQueryResult({ ok: false, text: '网络异常，请稍后重试' })
    } finally {
      setQuerying(false)
    }
  }

  async function uploadFeedbackFiles(files: FileList | null) {
    await uploadAttachmentBatch(
      files,
      feedbackAttachments.length,
      (items) => setFeedbackAttachments((prev) => [...prev, ...items]),
      setFeedbackUploading,
      setFeedbackResult
    )
  }

  async function submitFeedback() {
    const ticketNo = queryResult?.data?.ticketNo
    if (!ticketNo) {
      setFeedbackResult({ ok: false, text: '请先查询工单后再反馈' })
      return
    }
    if (feedbackSubmitting || feedbackUploading) return
    const content = feedbackText.trim()
    if (content.length < 2) {
      setFeedbackResult({ ok: false, text: '请填写至少 2 个字的反馈内容' })
      return
    }
    setFeedbackSubmitting(true)
    setFeedbackResult(null)
    try {
      const res = await fetch(`${API_PREFIX}/public-ticket-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteToken: SITE_TOKEN,
          ticketNo,
          content,
          attachments: feedbackAttachments,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        setFeedbackResult({ ok: false, text: mapTicketError(res.status, json?.error) })
        return
      }
      setFeedbackText('')
      setFeedbackAttachments([])
      await queryTicketByNo(ticketNo)
      setFeedbackResult({ ok: true, text: '反馈已提交，我们会尽快处理' })
    } catch {
      setFeedbackResult({ ok: false, text: '网络异常，请稍后重试' })
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-[#0f1530] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20'
  const sectionCardClass = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5'

  return (
    <main className="min-h-screen bg-[#0a0e1a] text-white px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 sm:mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工单中心</h1>
            <p className="mt-1 text-sm text-slate-400">提交问题、上传附件，平台将自动分配处理。</p>
          </div>
          <Link href="/" className="text-sm text-slate-300 hover:text-white">返回首页</Link>
        </div>

        <div className="mb-4 sm:mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          <button
            type="button"
            onClick={() => setCategory('user_ticket')}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${category === 'user_ticket' ? 'bg-violet-600 text-white shadow-lg shadow-violet-700/20' : 'text-slate-300 hover:bg-white/[0.05]'}`}
          >
            <ClipboardPen className="h-4 w-4" /> 用户工单
          </button>
          <button
            type="button"
            onClick={() => setCategory('platform_error')}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${category === 'platform_error' ? 'bg-rose-600 text-white shadow-lg shadow-rose-700/20' : 'text-slate-300 hover:bg-white/[0.05]'}`}
          >
            <AlertTriangle className="h-4 w-4" /> 平台错误上报
          </button>
        </div>

        <section className="mb-4 sm:mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">普通用户工单查询</h2>
              <p className="mt-1 text-xs text-slate-400">输入提交成功后返回的工单号（如 `A1B2C3D4`）即可查询处理进度</p>
            </div>
          </div>
          <form onSubmit={onQueryTicket} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClass}
              value={queryTicketNo}
              onChange={(e) => setQueryTicketNo(e.target.value)}
              placeholder="请输入工单号"
            />
            <button
              type="submit"
              disabled={querying}
              className="shrink-0 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              {querying ? '查询中...' : '查询工单'}
            </button>
          </form>
          {queryResult && (
            <div className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${queryResult.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>
              {queryResult.ok && queryResult.data ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p>工单号：#{queryResult.data.ticketNo}</p>
                    <p>状态：{getTicketStatusLabel(queryResult.data.status)}</p>
                    <p>优先级：{getTicketPriorityLabel(queryResult.data.priority)}</p>
                    <p>类型：{getTicketTypeLabel(queryResult.data.type)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-300/25 bg-emerald-500/5 p-3">
                    <p className="text-sm font-medium text-emerald-100">继续反馈</p>
                    <p className="mt-1 text-xs text-emerald-200/80">可补充说明和附件，提交后会同步给客服处理。</p>
                    <textarea
                      className={`${inputClass} mt-2 h-24 resize-none`}
                      placeholder="请输入补充反馈内容..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                    />
                    <div className="mt-2 rounded-xl border border-dashed border-emerald-300/25 bg-[#0f1530]/60 p-2.5">
                      <label className="text-xs text-emerald-100 inline-flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" /> 附件（最多 5 个，每个 20MB）
                      </label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          void uploadFeedbackFiles(e.target.files)
                          e.currentTarget.value = ''
                        }}
                        className="mt-2 block w-full rounded-lg border border-emerald-300/20 bg-[#0f1530] px-2.5 py-2 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-emerald-600 file:px-2.5 file:py-1 file:text-white"
                      />
                      {feedbackUploading && <p className="mt-1.5 text-[11px] text-emerald-200/80">附件上传中...</p>}
                      {feedbackAttachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {feedbackAttachments.map((f, idx) => (
                            <div key={`${f.url}-${idx}`} className="flex items-center justify-between rounded-md border border-emerald-300/20 bg-[#0f1530] px-2 py-1.5 text-[11px]">
                              <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-emerald-100 hover:text-white">{f.name}</a>
                              <button
                                type="button"
                                onClick={() => setFeedbackAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-emerald-200/70 hover:text-rose-300"
                                aria-label="删除附件"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void submitFeedback() }}
                        disabled={feedbackSubmitting || feedbackUploading}
                        className="rounded-lg border border-emerald-300/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60"
                      >
                        {feedbackSubmitting ? '提交中...' : '提交反馈'}
                      </button>
                      {feedbackResult && (
                        <span className={`text-xs ${feedbackResult.ok ? 'text-emerald-200' : 'text-rose-300'}`}>{feedbackResult.text}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                queryResult.text
              )}
            </div>
          )}
        </section>

        <form onSubmit={onSubmit} className="space-y-4">
          <section className={sectionCardClass}>
            <div className="space-y-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">工单标题</label>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === 'platform_error' ? '例如：消息发送失败 / 页面空白' : '请填写工单标题'} />
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">问题描述</label>
              <textarea className={`${inputClass} h-32 resize-none`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="请详细描述问题与期望结果" />
            </div>
          </section>

          {category === 'platform_error' && (
            <section className={sectionCardClass}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">错误码（选填）</label>
                  <input className={inputClass} value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="例如：500 / E_CONN_RESET" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">错误详情（选填）</label>
                  <textarea className={`${inputClass} h-24 resize-none`} value={errorDetail} onChange={(e) => setErrorDetail(e.target.value)} placeholder="报错堆栈 / 复现步骤（选填）" />
                </div>
              </div>
            </section>
          )}

          <section className={sectionCardClass}>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="联系人（选填）" />
              <input className={inputClass} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="联系电话（选填）" />
              <input className={inputClass} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="联系邮箱（选填）" />
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-[#0f1530]/70 p-3">
              <label className="text-sm text-slate-300 inline-flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> 附件（最多 5 个，每个 20MB）
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  void uploadFiles(e.target.files)
                  e.currentTarget.value = ''
                }}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-[#0f1530] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white"
              />
              {uploading && <p className="mt-2 text-xs text-blue-300">附件上传中...</p>}
              {attachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {attachments.map((f, idx) => (
                    <div key={`${f.url}-${idx}`} className="flex items-center justify-between rounded-md border border-white/10 bg-[#0f1530] px-2.5 py-2 text-xs">
                      <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-slate-200 hover:text-white">
                        {f.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-400"
                        aria-label="删除附件"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {!emailValid && <p className="text-sm text-rose-400">联系邮箱格式不正确</p>}

          {result && (
            <div className={`rounded-xl border px-3 py-2.5 text-sm ${result.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>
              <p>{result.text}</p>
              {result.ok && latestTicketNo && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { void copyTicketNo() }}
                    className="rounded-lg border border-emerald-300/30 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-400/10"
                  >
                    复制工单号
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryTicketNo(latestTicketNo)}
                    className="rounded-lg border border-emerald-300/30 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-400/10"
                  >
                    填入查询框
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="sticky bottom-3 z-10">
            <div className="rounded-xl border border-white/10 bg-[#0f1530]/95 p-2 backdrop-blur">
              <button
                disabled={!canSubmit || submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> {submitting ? '提交中...' : '提交工单'}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-slate-500">提交后会生成工单编号，客服将尽快处理</p>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}

