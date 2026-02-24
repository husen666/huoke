'use client'

import { useState, useEffect, useMemo } from 'react'
import { adminLogin, adminGetStats, adminGetOrgs, adminUpdatePlan } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Flame, Building2, Users, BarChart3, CreditCard, Search, ChevronLeft,
  ChevronRight, Pencil, Check, X, Shield, TrendingUp, Zap, Crown,
  LogOut, Eye, RefreshCw,
} from 'lucide-react'

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  starter: { label: '创业版', color: 'bg-blue-100 text-blue-700' },
  pro: { label: '专业版', color: 'bg-violet-100 text-violet-700' },
  enterprise: { label: '企业版', color: 'bg-amber-100 text-amber-700' },
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [admin, setAdmin] = useState<{ id: string; name: string; email: string } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [stats, setStats] = useState<any>(null)
  const [orgs, setOrgs] = useState<any[]>([])
  const [orgsTotal, setOrgsTotal] = useState(0)
  const [orgsPage, setOrgsPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const [editingOrg, setEditingOrg] = useState<string | null>(null)
  const [editPlan, setEditPlan] = useState('')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') : null
    const savedAdmin = typeof window !== 'undefined' ? sessionStorage.getItem('admin_user') : null
    if (saved) {
      setToken(saved)
      if (savedAdmin) try { setAdmin(JSON.parse(savedAdmin)) } catch {}
    }
  }, [])

  useEffect(() => {
    if (!token) return
    loadStats()
    loadOrgs()
  }, [token])

  useEffect(() => {
    if (token) loadOrgs()
  }, [orgsPage, planFilter])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await adminLogin(email, password)
      if (!res.success) { setLoginError(res.error || '登录失败'); return }
      setToken(res.data.token)
      setAdmin(res.data.admin)
      sessionStorage.setItem('admin_token', res.data.token)
      sessionStorage.setItem('admin_user', JSON.stringify(res.data.admin))
    } catch (err) {
      setLoginError('网络错误')
    } finally {
      setLoginLoading(false)
    }
  }

  async function loadStats() {
    if (!token) return
    const res = await adminGetStats(token)
    if (res.success) setStats(res.data)
  }

  async function loadOrgs() {
    if (!token) return
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(orgsPage), limit: '15' }
      if (searchTerm) params.search = searchTerm
      if (planFilter) params.plan = planFilter
      const res = await adminGetOrgs(token, params)
      if (res.success) { setOrgs(res.data.orgs); setOrgsTotal(res.data.total) }
    } finally { setLoading(false) }
  }

  async function handleUpdatePlan(orgId: string) {
    if (!token || !editPlan) return
    const res = await adminUpdatePlan(token, orgId, editPlan)
    if (res.success) {
      toast.success('套餐已更新')
      setEditingOrg(null)
      loadOrgs()
      loadStats()
    } else {
      toast.error(res.error || '更新失败')
    }
  }

  function handleLogout() {
    setToken(null)
    setAdmin(null)
    sessionStorage.removeItem('admin_token')
    sessionStorage.removeItem('admin_user')
  }

  const totalPages = Math.ceil(orgsTotal / 15)

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mb-3">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-800">平台管理后台</h1>
                <p className="text-sm text-slate-500 mt-1">仅限平台管理员登录</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="管理员邮箱" type="email" required />
                <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="密码" type="password" required />
                {loginError && <p className="text-sm text-red-600">{loginError}</p>}
                <Button type="submit" className="w-full" loading={loginLoading}>登录</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
            <Flame className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-800">火客 SaaS 管理后台</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">{admin?.name}</span>
          <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '入驻企业', value: stats.totalOrgs, icon: Building2, color: 'text-violet-600 bg-violet-50' },
              { label: '用户总数', value: stats.totalUsers, icon: Users, color: 'text-blue-600 bg-blue-50' },
              { label: '30天活跃企业', value: stats.activeOrgsLast30d, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
              { label: '套餐分布', value: `${stats.planDistribution?.length || 0} 类`, icon: CreditCard, color: 'text-amber-600 bg-amber-50' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="py-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Plan distribution */}
        {stats?.planDistribution && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> 套餐分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                {stats.planDistribution.map((d: any) => {
                  const p = PLAN_LABELS[d.plan] || PLAN_LABELS.starter
                  return (
                    <div key={d.plan} className="flex items-center gap-2">
                      <Badge className={p.color}>{p.label}</Badge>
                      <span className="text-lg font-semibold text-slate-800">{d.count}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Orgs Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> 入驻企业 ({orgsTotal})</CardTitle>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setOrgsPage(1); loadOrgs() } }}
                    placeholder="搜索企业名称..." className="pl-9 w-48" />
                </div>
                <Select value={planFilter} onChange={(v) => { setPlanFilter(v === '__all__' ? '' : v); setOrgsPage(1) }}
                  options={[{ value: '__all__', label: '全部套餐' }, { value: 'starter', label: '创业版' }, { value: 'pro', label: '专业版' }, { value: 'enterprise', label: '企业版' }]} />
                <Button variant="outline" size="sm" onClick={() => { loadOrgs(); loadStats() }}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 text-left">
                    <th className="py-3 px-3 font-medium">企业名称</th>
                    <th className="py-3 px-3 font-medium">套餐</th>
                    <th className="py-3 px-3 font-medium">席位</th>
                    <th className="py-3 px-3 font-medium">行业</th>
                    <th className="py-3 px-3 font-medium">注册时间</th>
                    <th className="py-3 px-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map(o => {
                    const p = PLAN_LABELS[o.plan] || PLAN_LABELS.starter
                    return (
                      <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-medium text-slate-800">{o.name}</td>
                        <td className="py-3 px-3">
                          {editingOrg === o.id ? (
                            <div className="flex items-center gap-1">
                              <Select value={editPlan} onChange={setEditPlan}
                                options={[{ value: 'starter', label: '创业版' }, { value: 'pro', label: '专业版' }, { value: 'enterprise', label: '企业版' }]} />
                              <button onClick={() => handleUpdatePlan(o.id)} className="text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingOrg(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <Badge className={p.color}>{p.label}</Badge>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-slate-600">{o.seatUsage} / {o.maxSeats >= 9999 ? '∞' : o.maxSeats}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-500">{o.industry || '—'}</td>
                        <td className="py-3 px-3 text-slate-500">{new Date(o.createdAt).toLocaleDateString('zh-CN')}</td>
                        <td className="py-3 px-3">
                          <button onClick={() => { setEditingOrg(o.id); setEditPlan(o.plan || 'starter') }}
                            className="text-slate-400 hover:text-violet-600 transition-colors" title="修改套餐">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {orgs.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">第 {orgsPage} / {totalPages} 页</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={orgsPage <= 1} onClick={() => setOrgsPage(p => p - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={orgsPage >= totalPages} onClick={() => setOrgsPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
