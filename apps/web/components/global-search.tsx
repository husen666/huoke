'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, UserCircle, Target, Ticket, ArrowRight } from 'lucide-react'
import { getLeads, getCustomers, getDeals, getTickets } from '@/lib/api'

interface SearchResult {
  type: 'lead' | 'customer' | 'deal' | 'ticket'
  id: string
  title: string
  subtitle?: string
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setQuery('')
      setResults([])
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const [leads, customers, deals, tickets] = await Promise.all([
          getLeads({ search: query, pageSize: '3' }).catch(() => ({ data: [] })),
          getCustomers({ search: query, pageSize: '3' }).catch(() => ({ data: [] })),
          getDeals({ search: query, pageSize: '3' }).catch(() => ({ data: [] })),
          getTickets({ search: query, pageSize: '3' }).catch(() => ({ data: [] })),
        ])
        const items: SearchResult[] = [
          ...(leads.data || []).map((l: any) => ({ type: 'lead' as const, id: l.id, title: l.name, subtitle: l.company || l.email })),
          ...(customers.data || []).map((c: any) => ({ type: 'customer' as const, id: c.id, title: c.name, subtitle: c.email })),
          ...(deals.data || []).map((d: any) => ({ type: 'deal' as const, id: d.id, title: d.title, subtitle: d.stage })),
          ...(tickets.data || []).map((t: any) => ({ type: 'ticket' as const, id: t.id, title: t.title, subtitle: t.status })),
        ]
        setResults(items)
        setSelectedIndex(0)
      } catch { setResults([]) }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const navigate = useCallback((item: SearchResult) => {
    setOpen(false)
    const paths = { lead: '/dashboard/leads', customer: '/dashboard/customers', deal: '/dashboard/deals', ticket: '/dashboard/tickets' }
    router.push(`${paths[item.type]}/${item.id}`)
  }, [router])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      navigate(results[selectedIndex])
    }
  }

  const typeIcon = { lead: Users, customer: UserCircle, deal: Target, ticket: Ticket }
  const typeLabel = { lead: '线索', customer: '客户', deal: '商机', ticket: '工单' }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索线索、客户、商机、工单..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-400 bg-slate-100 rounded">ESC</kbd>
        </div>

        {loading && <div className="px-4 py-3 text-sm text-slate-500">搜索中...</div>}

        {!loading && results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.map((item, idx) => {
              const Icon = typeIcon[item.type]
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => navigate(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === selectedIndex ? 'bg-primary/5 text-primary' : 'hover:bg-slate-50'}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{typeLabel[item.type]}</span>
                  <ArrowRight className="h-3 w-3 text-slate-300 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}

        {!loading && query && results.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">未找到匹配结果</div>
        )}

        {!query && (
          <div className="px-4 py-4 text-center text-sm text-slate-400">
            输入关键词搜索线索、客户、商机或工单
          </div>
        )}
      </div>
    </div>
  )
}
