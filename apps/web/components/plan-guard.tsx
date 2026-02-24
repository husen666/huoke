'use client'

import { useQuery } from '@tanstack/react-query'
import { getUsage, PlanLimitError, type UsageInfo } from '@/lib/api'
import Link from 'next/link'
import { Crown, Lock, ArrowUpRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export function usePlan() {
  const { data: usage, isLoading } = useQuery<UsageInfo>({
    queryKey: ['platform-usage'],
    queryFn: async () => { const r = await getUsage(); return r.data! },
    staleTime: 60_000,
    retry: 1,
  })

  const plan = usage?.plan ?? 'starter'
  const features = usage?.features ?? []

  function hasFeature(feature: string): boolean {
    return features.includes(feature)
  }

  function isAtLimit(resource: 'seats' | 'leads' | 'conversationsPerMonth' | 'knowledgeBases'): boolean {
    if (!usage) return false
    const limit = usage.limits[resource]
    if (limit >= 999999) return false
    const usageMap: Record<string, number> = {
      seats: usage.usage.seats,
      leads: usage.usage.leads,
      conversationsPerMonth: usage.usage.conversationsThisMonth,
      knowledgeBases: usage.usage.knowledgeBases,
    }
    return usageMap[resource] >= limit
  }

  return { plan, features, usage, isLoading, hasFeature, isAtLimit }
}

export function PlanGuard({
  feature,
  children,
  fallback,
}: {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { hasFeature, isLoading } = usePlan()

  if (isLoading) return <>{children}</>
  if (hasFeature(feature)) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-violet-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">此功能需要升级套餐</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-md">
        当前套餐不包含此功能，升级到更高版本以解锁全部功能
      </p>
      <Link href="/dashboard/org/billing"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors">
        <Crown className="w-4 h-4" /> 升级套餐 <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

export function UpgradeBanner({ resource, label }: { resource: string; label: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <Crown className="w-4 h-4" />
        <span>{label} 已达上限</span>
      </div>
      <Link href="/dashboard/org/billing" className="text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1">
        升级套餐 <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

export function TrialBanner({ trialEndsAt, planExpiresAt }: { trialEndsAt?: string | null; planExpiresAt?: string | null }) {
  const now = Date.now()

  if (planExpiresAt) {
    const expDays = Math.ceil((new Date(planExpiresAt).getTime() - now) / 86_400_000)
    if (expDays <= 0) {
      return (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-200 text-sm">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span>套餐已过期，功能可能受限，请续费或升级</span>
          </div>
          <Link href="/dashboard/org/billing" className="text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 whitespace-nowrap">
            立即续费 <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )
    }
    if (expDays <= 14) {
      return (
        <div className={`flex items-center justify-between px-4 py-2.5 border-b text-sm ${expDays <= 7 ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className={`flex items-center gap-2 ${expDays <= 7 ? 'text-amber-800' : 'text-blue-700'}`}>
            <AlertTriangle className="w-4 h-4" />
            <span>套餐将在 {expDays} 天后到期</span>
          </div>
          <Link href="/dashboard/org/billing" className="text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 whitespace-nowrap">
            续费套餐 <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )
    }
  }

  if (trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / 86_400_000))
    if (daysLeft <= 0) {
      return (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-200 text-sm">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span>试用期已结束，部分功能已受限</span>
          </div>
          <Link href="/dashboard/org/billing" className="text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 whitespace-nowrap">
            升级套餐 <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )
    }
    if (daysLeft <= 14) {
      return (
        <div className={`flex items-center justify-between px-4 py-2.5 border-b text-sm ${daysLeft <= 7 ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className={`flex items-center gap-2 ${daysLeft <= 7 ? 'text-amber-800' : 'text-blue-700'}`}>
            <AlertTriangle className="w-4 h-4" />
            <span>试用期还剩 {daysLeft} 天，到期后部分功能可能受限</span>
          </div>
          <Link href="/dashboard/org/billing" className="text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 whitespace-nowrap">
            升级套餐 <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )
    }
  }

  return null
}

export function handlePlanError(err: unknown): boolean {
  if (err instanceof PlanLimitError) {
    const messages: Record<string, string> = {
      PLAN_LIMIT: '当前套餐不支持此功能，请升级套餐',
      SEAT_LIMIT: '团队席位已达上限，请升级套餐',
      LEAD_LIMIT: '线索数量已达上限，请升级套餐',
      CONVERSATION_LIMIT: '本月会话数已达上限，请升级套餐',
      KB_LIMIT: '知识库数量已达上限，请升级套餐',
      TRIAL_EXPIRED: '试用期已结束，请升级套餐以继续使用',
    }
    toast.error(messages[err.code] || err.message, {
      action: { label: '升级套餐', onClick: () => { window.location.href = '/dashboard/org/billing' } },
      duration: 6000,
    })
    return true
  }
  return false
}
