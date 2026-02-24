'use client'

import { useQuery } from '@tanstack/react-query'
import { getUsage, getPlans, requestUpgrade, type UsageInfo, type PlanInfo } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useState } from 'react'
import {
  CreditCard, Users, MessageSquare, Database, FolderOpen, Zap, TrendingUp,
  Check, ArrowUpRight, AlertTriangle, Crown, Shield, Sparkles,
} from 'lucide-react'

const PLAN_COLORS: Record<string, string> = {
  starter: 'from-blue-500 to-blue-600',
  pro: 'from-violet-500 to-purple-600',
  enterprise: 'from-amber-500 to-orange-600',
}

const PLAN_ICONS: Record<string, typeof Shield> = {
  starter: TrendingUp,
  pro: Crown,
  enterprise: Sparkles,
}

function UsageBar({ used, limit, label, icon: Icon }: { used: number; limit: number; label: string; icon: typeof Users }) {
  const unlimited = limit >= 999999 || limit === -1
  const pct = unlimited ? 5 : Math.min((used / limit) * 100, 100)
  const isWarning = !unlimited && pct >= 80
  const isDanger = !unlimited && pct >= 95

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-slate-600">
          <Icon className="w-4 h-4" />{label}
        </span>
        <span className={`font-medium ${isDanger ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-800'}`}>
          {used.toLocaleString()} / {unlimited ? '不限' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function BillingPage() {
  const [upgrading, setUpgrading] = useState('')

  const { data: usage } = useQuery<UsageInfo>({
    queryKey: ['platform-usage'],
    queryFn: async () => { const r = await getUsage(); return r.data! },
  })

  const { data: plans } = useQuery<PlanInfo[]>({
    queryKey: ['platform-plans'],
    queryFn: async () => { const r = await getPlans(); return r.data! },
  })

  async function handleUpgrade(planName: string) {
    setUpgrading(planName)
    try {
      await requestUpgrade(planName)
      toast.success('升级请求已提交，销售团队将在1个工作日内联系您')
    } catch {
      toast.error('提交失败，请稍后重试')
    } finally {
      setUpgrading('')
    }
  }

  if (!usage) {
    return <div className="p-8 text-center text-slate-400">加载中...</div>
  }

  const currentPlanIndex = plans?.findIndex(p => p.name === usage.plan) ?? 0
  const PlanIcon = PLAN_ICONS[usage.plan] ?? Zap

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <Card className="overflow-hidden">
        <div className={`p-6 bg-gradient-to-r ${PLAN_COLORS[usage.plan] || PLAN_COLORS.starter} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PlanIcon className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">{usage.planLabel}</h2>
                <p className="text-white/70 text-sm">当前套餐</p>
              </div>
            </div>
            {usage.trialEndsAt && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                <AlertTriangle className="w-3 h-3 mr-1" />
                试用到期：{new Date(usage.trialEndsAt).toLocaleDateString('zh-CN')}
              </Badge>
            )}
            {usage.planExpiresAt && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                到期：{new Date(usage.planExpiresAt).toLocaleDateString('zh-CN')}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Usage Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4" /> 资源用量
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <UsageBar used={usage.usage.seats} limit={usage.limits.seats} label="团队席位" icon={Users} />
          <UsageBar used={usage.usage.conversationsThisMonth} limit={usage.limits.conversationsPerMonth} label="本月会话" icon={MessageSquare} />
          <UsageBar used={usage.usage.leads} limit={usage.limits.leads} label="线索总数" icon={TrendingUp} />
          <UsageBar used={usage.usage.knowledgeBases} limit={usage.limits.knowledgeBases} label="知识库" icon={FolderOpen} />
        </CardContent>
      </Card>

      {/* Plans Comparison */}
      {plans && plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-4 h-4" /> 套餐对比
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {plans.map((p, i) => {
                const isCurrent = p.name === usage.plan
                const isHigher = i > currentPlanIndex
                const PIcon = PLAN_ICONS[p.name] ?? Zap
                const isEnterprise = p.name === 'enterprise'
                const isStarter = p.name === 'starter'

                return (
                  <div key={p.name} className={`relative rounded-xl border p-5 flex flex-col ${isCurrent
                    ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    {isCurrent && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-medium">
                        当前
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <PIcon className={`w-5 h-5 ${isCurrent ? 'text-violet-600' : 'text-slate-400'}`} />
                      <span className="font-semibold text-slate-800">{p.label}</span>
                    </div>
                    <div className="mb-4">
                      {isEnterprise ? (
                        <span className="text-2xl font-bold text-slate-800">联系销售</span>
                      ) : isStarter && p.price === 0 ? (
                        <div>
                          <span className="text-2xl font-bold text-emerald-600">限时免费</span>
                          <span className="ml-2 text-sm text-slate-400 line-through">¥299/月</span>
                        </div>
                      ) : p.price === 0 ? (
                        <span className="text-2xl font-bold text-slate-800">免费</span>
                      ) : (
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm text-slate-400">¥</span>
                          <span className="text-2xl font-bold text-slate-800">{p.price}</span>
                          <span className="text-sm text-slate-400">/月</span>
                        </div>
                      )}
                    </div>
                    <ul className="text-sm space-y-1.5 text-slate-600 flex-1">
                      <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{p.seats === -1 ? '不限' : p.seats} 席位</li>
                      <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{p.conversationsPerMonth === -1 ? '不限' : p.conversationsPerMonth.toLocaleString()} 会话/月</li>
                      <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{p.leads === -1 ? '不限' : p.leads.toLocaleString()} 线索</li>
                      <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{p.knowledgeBases === -1 ? '不限' : p.knowledgeBases} 知识库</li>
                      {p.storageMb > 0 && p.storageMb !== -1 && (
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{p.storageMb >= 1024 ? `${Math.round(p.storageMb / 1024)}GB` : `${p.storageMb}MB`} 存储</li>
                      )}
                      {isEnterprise && (
                        <>
                          <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />专属部署</li>
                          <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />优先技术支持</li>
                        </>
                      )}
                    </ul>
                    {isCurrent ? (
                      <div className="mt-4 text-center py-2 rounded-lg bg-violet-100 text-violet-600 text-sm font-medium">当前套餐</div>
                    ) : isHigher ? (
                      <Button onClick={() => handleUpgrade(p.name)} loading={upgrading === p.name}
                        className="mt-4 w-full bg-violet-600 hover:bg-violet-700 text-white" size="sm">
                        <span className="flex items-center gap-1">{isEnterprise ? '联系我们' : '升级'} <ArrowUpRight className="w-3.5 h-3.5" /></span>
                      </Button>
                    ) : (
                      <div className="mt-4 text-center py-2 rounded-lg bg-slate-50 text-slate-400 text-sm">—</div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
