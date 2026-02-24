import dotenv from 'dotenv'

dotenv.config({ path: '../../.env' })

const API_BASE = process.env.SELFTEST_WIDGET_API_BASE || 'http://localhost:4000/api/v1/widget'
const SITE_TOKEN = process.env.SELFTEST_SITE_TOKEN || '06a12e23-acda-45eb-92d3-071a4eaacb3b'

type JsonResult = {
  status: number
  body: any
}

async function postJson(path: string, payload: Record<string, unknown>): Promise<JsonResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function getJson(pathWithQuery: string): Promise<JsonResult> {
  const res = await fetch(`${API_BASE}${pathWithQuery}`)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  const init = await postJson('/init', {
    siteToken: SITE_TOKEN,
    visitorName: 'selftest-module-user',
    visitorPhone: '13800138000',
  })
  assert(init.status === 200 && init.body?.success, `init failed: ${JSON.stringify(init)}`)
  const sessionId = String(init.body?.data?.sessionId || '')
  assert(sessionId, `init missing sessionId: ${JSON.stringify(init)}`)

  const sendText = await postJson(`/messages/${sessionId}`, {
    siteToken: SITE_TOKEN,
    content: 'selftest text message',
    contentType: 'text',
  })
  assert(sendText.status === 200 && sendText.body?.success, `send text failed: ${JSON.stringify(sendText)}`)

  const sendVideo = await postJson(`/messages/${sessionId}`, {
    siteToken: SITE_TOKEN,
    content: '[video]',
    contentType: 'video',
    mediaUrl: '/uploads/messages/selftest-video.mp4',
    thumbnailUrl: '/uploads/messages/selftest-video.jpg',
  })
  assert(sendVideo.status === 200 && sendVideo.body?.success, `send video failed: ${JSON.stringify(sendVideo)}`)

  const requestHuman = await postJson(`/request-human/${sessionId}`, { siteToken: SITE_TOKEN })
  const humanOk = requestHuman.status === 200 && requestHuman.body?.success
  const humanBusy = requestHuman.status === 503 && !requestHuman.body?.success
  assert(humanOk || humanBusy, `request-human unexpected: ${JSON.stringify(requestHuman)}`)

  const rate = await postJson(`/rate/${sessionId}`, {
    siteToken: SITE_TOKEN,
    score: 5,
    comment: 'selftest rate',
  })
  assert(rate.status === 200 && rate.body?.success, `rate failed: ${JSON.stringify(rate)}`)

  const publicTicket = await postJson('/public-ticket', {
    siteToken: SITE_TOKEN,
    category: 'user_ticket',
    title: 'selftest-widget-modules',
    description: 'selftest public ticket for widget modules',
    contactEmail: '',
  })
  assert(publicTicket.status === 200 && publicTicket.body?.success, `public-ticket failed: ${JSON.stringify(publicTicket)}`)
  const ticketNo = String(publicTicket.body?.data?.ticketNo || '')
  assert(ticketNo, `public-ticket missing ticketNo: ${JSON.stringify(publicTicket)}`)

  const query1 = await getJson(`/public-ticket-status?siteToken=${encodeURIComponent(SITE_TOKEN)}&ticketNo=${encodeURIComponent(ticketNo)}`)
  assert(query1.status === 200 && query1.body?.success, `public-ticket-status failed: ${JSON.stringify(query1)}`)

  const feedback = await postJson('/public-ticket-feedback', {
    siteToken: SITE_TOKEN,
    ticketNo,
    content: 'selftest feedback append',
  })
  assert(feedback.status === 200 && feedback.body?.success, `public-ticket-feedback failed: ${JSON.stringify(feedback)}`)

  const query2 = await getJson(`/public-ticket-status?siteToken=${encodeURIComponent(SITE_TOKEN)}&ticketNo=${encodeURIComponent(ticketNo)}`)
  assert(query2.status === 200 && query2.body?.success, `public-ticket-status(after feedback) failed: ${JSON.stringify(query2)}`)

  console.log(
    'SELFTEST_PASS',
    JSON.stringify({
      sessionId,
      ticketNo,
      videoReply: sendVideo.body?.data?.aiReply?.content || '',
      requestHumanStatus: requestHuman.status,
      ticketStatus: query2.body?.data?.status || '',
    })
  )
}

main().catch((err) => {
  console.error('SELFTEST_FAIL', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
