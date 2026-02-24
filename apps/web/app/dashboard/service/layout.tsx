'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, BarChart3, Users, Settings, ExternalLink, Headphones, MessageSquareOff, ClipboardCheck } from 'lucide-react'

const tabs = [
  { href: '/dashboard/service', label: '总览', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/service/agents', label: '客服管理', icon: Users },
  { href: '/dashboard/service/consultations', label: '离线咨询', icon: MessageSquareOff },
  { href: '/dashboard/service/inspections', label: '质检中心', icon: ClipboardCheck },
  { href: '/dashboard/service/stats', label: '客服统计', icon: BarChart3 },
  { href: '/dashboard/service/settings', label: '客服设置', icon: Settings },
]

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-0 -m-6">
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex items-center justify-between">
          <nav className="flex gap-0 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href)
              const Icon = tab.icon
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              )
            })}
          </nav>
          <Link href="/service" target="_blank" className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
            <Headphones className="h-3.5 w-3.5" />
            打开客服工作台
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
