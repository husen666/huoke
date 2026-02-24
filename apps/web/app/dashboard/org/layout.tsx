'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Users, Building2, Users2, Shield, KeyRound, Landmark, CreditCard } from 'lucide-react'

const tabs = [
  { href: '/dashboard/org', label: '成员管理', icon: Users, exact: true },
  { href: '/dashboard/org/departments', label: '部门', icon: Building2 },
  { href: '/dashboard/org/teams', label: '团队', icon: Users2 },
  { href: '/dashboard/org/roles', label: '角色管理', icon: Shield },
  { href: '/dashboard/org/permissions', label: '权限管理', icon: KeyRound },
  { href: '/dashboard/org/info', label: '企业信息', icon: Landmark },
  { href: '/dashboard/org/billing', label: '套餐与用量', icon: CreditCard },
]

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-0 -m-6">
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex items-center justify-between">
          <nav className="flex gap-0">
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
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Building2 className="h-3.5 w-3.5" />
            组织架构管理
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
