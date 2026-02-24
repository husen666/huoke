import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '../../.env' })

const SITE_TOKEN = '06a12e23-acda-45eb-92d3-071a4eaacb3b'
const API_BASE = 'http://localhost:4000/api/v1/widget'

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing')
  }

  const sql = postgres(process.env.DATABASE_URL)
  try {
    const uploadForm = new FormData()
    uploadForm.append(
      'file',
      new Blob(['self-test attachment content'], { type: 'text/plain' }),
      'selftest-attachment.txt'
    )

    const uploadRes = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: uploadForm,
    })
    const uploadJson = await uploadRes.json()
    if (!uploadRes.ok || !uploadJson?.success || !uploadJson?.data?.url) {
      throw new Error(`upload failed: ${JSON.stringify(uploadJson)}`)
    }

    const payload = {
      siteToken: SITE_TOKEN,
      category: 'user_ticket',
      title: 'selftest-ticket-attachments',
      description: 'selftest ticket with attachment',
      contactEmail: '',
      attachments: [
        {
          name: 'selftest-attachment.txt',
          url: String(uploadJson.data.url),
          type: 'text/plain',
          size: 28,
        },
      ],
    }

    const ticketRes = await fetch(`${API_BASE}/public-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const ticketJson = await ticketRes.json()
    if (!ticketRes.ok || !ticketJson?.success || !ticketJson?.data?.ticketId) {
      throw new Error(`public-ticket failed: ${JSON.stringify(ticketJson)}`)
    }

    const ticketId = String(ticketJson.data.ticketId)
    const rows = await sql.unsafe(
      `select id, title, attachments from tickets where id = '${ticketId}' limit 1`
    )
    const row = rows[0]
    if (!row) throw new Error(`ticket not found in db: ${ticketId}`)
    const ok =
      Array.isArray(row.attachments) &&
      row.attachments.length > 0 &&
      row.attachments[0] &&
      row.attachments[0].url
    if (!ok) throw new Error(`attachments not persisted: ${JSON.stringify(row)}`)

    console.log(
      'SELFTEST_PASS',
      JSON.stringify({
        ticketId,
        attachmentUrl: row.attachments[0].url,
      })
    )
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error('SELFTEST_FAIL', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
