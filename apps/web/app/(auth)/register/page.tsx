'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flame, Eye, EyeOff, ArrowRight, Mail, Lock, User, CheckCircle2, Building2, Briefcase, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { APP_VERSION } from '@/lib/utils'

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animId: number
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = []
    function resize() { canvas!.width = window.innerWidth; canvas!.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const count = Math.min(80, Math.floor(window.innerWidth / 16))
    for (let i = 0; i < count; i++) {
      particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r: Math.random() * 1.5 + 0.5, o: Math.random() * 0.5 + 0.2 })
    }
    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(99,143,255,${p.o})`; ctx!.fill()
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dist = Math.hypot(p.x - q.x, p.y - q.y)
          if (dist < 140) { ctx!.beginPath(); ctx!.moveTo(p.x, p.y); ctx!.lineTo(q.x, q.y); ctx!.strokeStyle = `rgba(99,143,255,${0.12 * (1 - dist / 140)})`; ctx!.lineWidth = 0.6; ctx!.stroke() }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" />
}

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[100px] opacity-30 ${className}`} />
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '至少8位', ok: password.length >= 8 },
    { label: '包含数字', ok: /\d/.test(password) },
    { label: '包含大写字母', ok: /[A-Z]/.test(password) },
    { label: '包含小写字母', ok: /[a-z]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500']
  if (!password) return null
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500">密码强度</span>
        <span className={`text-[11px] font-medium ${score === 4 ? 'text-emerald-400' : score >= 2 ? 'text-blue-400' : 'text-amber-400'}`}>
          已满足 {score}/4 条规则
        </span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= score ? colors[score] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map(c => (
          <span key={c.label} className={`text-[11px] flex items-center gap-1 transition-colors ${c.ok ? 'text-emerald-400' : 'text-slate-600'}`}>
            <CheckCircle2 className={`w-3 h-3 ${c.ok ? 'opacity-100' : 'opacity-30'}`} />{c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

const planOptions = [
  { value: 'starter', label: '创业版', desc: '10席位 · 5000会话/月 · 全功能', price: '限时免费' },
  { value: 'pro', label: '专业版', desc: '50席位 · 25000会话/月 · 5倍容量', price: '¥799/月' },
  { value: 'enterprise', label: '企业版', desc: '专属部署 · 定制集成 · 白标', price: '联系销售' },
]

const industries = ['互联网/科技', '电商/零售', '金融/保险', '教育/培训', '医疗/健康', 'SaaS/软件', '制造业', '房地产', '旅游/酒店', '其他']

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { register, isLoading } = useAuthStore()

  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [plan, setPlan] = useState(searchParams.get('plan') || 'starter')
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  function validateNameValue(value: string) {
    return value.trim().length >= 2 ? '' : '姓名至少2个字符'
  }

  function validateEmailValue(value: string) {
    const v = value.trim()
    if (!v) return '请输入邮箱地址'
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : '请输入有效的邮箱地址'
  }

  function validatePasswordValue(value: string) {
    if (value.length < 8) return '密码至少8个字符'
    if (!/[A-Z]/.test(value)) return '密码需包含大写字母'
    if (!/[a-z]/.test(value)) return '密码需包含小写字母'
    if (!/\d/.test(value)) return '密码需包含数字'
    return ''
  }

  function validateConfirmValue(passwordValue: string, confirmValue: string) {
    if (!confirmValue) return '请再次输入密码'
    return passwordValue === confirmValue ? '' : '两次密码输入不一致'
  }

  function validateStep1() {
    const next: Record<string, string> = {}
    const nameErr = validateNameValue(name)
    const emailErr = validateEmailValue(email)
    const passwordErr = validatePasswordValue(password)
    const confirmErr = validateConfirmValue(password, confirm)
    if (nameErr) next.name = nameErr
    if (emailErr) next.email = emailErr
    if (passwordErr) next.password = passwordErr
    if (confirmErr) next.confirm = confirmErr
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const step1Valid = useMemo(() => (
    !validateNameValue(name) &&
    !validateEmailValue(email) &&
    !validatePasswordValue(password) &&
    !validateConfirmValue(password, confirm)
  ), [name, email, password, confirm])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (step === 1) {
      if (!validateStep1()) return
      setStep(2)
      return
    }
    try {
      const result = await register(email, password, name, {
        orgName: orgName || undefined,
        plan,
        industry: industry || undefined,
      })
      if (result?.isNewOrg) {
        router.replace('/onboarding')
      } else {
        router.replace('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试')
    }
  }

  const inputCls = 'pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20 hover:border-white/20 transition-colors'

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0e1a]">
      <ParticleCanvas />
      <GlowOrb className="w-[500px] h-[500px] bg-violet-600 -top-40 -right-40" />
      <GlowOrb className="w-[400px] h-[400px] bg-blue-600 -bottom-32 -left-32" />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className={`w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="relative backdrop-blur-xl bg-white/[0.05] rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/40 p-8 overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

            {/* Steps indicator */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {[1, 2].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                    step >= s ? 'bg-violet-600 text-white' : 'bg-white/10 text-slate-500'
                  }`}>{step > s ? <Check className="w-3.5 h-3.5" /> : s}</div>
                  {s < 2 && <div className={`w-12 h-0.5 rounded ${step > 1 ? 'bg-violet-600' : 'bg-white/10'}`} />}
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center mb-6">
              <div className="relative mb-3">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 blur-lg opacity-50" />
                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <Flame className="w-8 h-8 text-white" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-white">{step === 1 ? '创建账号' : '企业信息'}</h1>
              <p className="text-sm text-slate-400 mt-1">{step === 1 ? '填写您的基本信息' : '设置企业与套餐'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 1 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">姓名</label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                      <Input value={name} onChange={e => {
                        const v = e.target.value
                        setName(v)
                        setErrors(prev => ({ ...prev, name: validateNameValue(v) }))
                      }} placeholder="请输入姓名" required className={inputCls} />
                    </div>
                    {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">邮箱</label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                      <Input type="email" value={email} onChange={e => {
                        const v = e.target.value
                        setEmail(v)
                        setErrors(prev => ({ ...prev, email: validateEmailValue(v) }))
                      }} placeholder="请输入邮箱" required className={inputCls} />
                    </div>
                    {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">密码</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                      <Input type={showPwd ? 'text' : 'password'} value={password} onChange={e => {
                        const v = e.target.value
                        setPassword(v)
                        setErrors(prev => ({
                          ...prev,
                          password: validatePasswordValue(v),
                          confirm: confirm ? validateConfirmValue(v, confirm) : prev.confirm,
                        }))
                      }} placeholder="至少8位，包含大小写字母和数字" required className={`${inputCls} pr-10`} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                    {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">确认密码</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                      <Input type="password" value={confirm} onChange={e => {
                        const v = e.target.value
                        setConfirm(v)
                        setErrors(prev => ({ ...prev, confirm: validateConfirmValue(password, v) }))
                      }} placeholder="再次输入密码" required className={inputCls} />
                    </div>
                    {errors.confirm && <p className="text-xs text-red-400 mt-1">{errors.confirm}</p>}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">企业名称</label>
                    <div className="relative group">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                      <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="您的企业名称（选填）" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">所属行业</label>
                    <div className="relative group">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                      <select value={industry} onChange={e => setIndustry(e.target.value)}
                        className="w-full h-10 pl-10 pr-4 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500/50 focus:outline-none appearance-none">
                        <option value="" className="bg-slate-900">选择行业（选填）</option>
                        {industries.map(i => <option key={i} value={i} className="bg-slate-900">{i}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">选择套餐</label>
                    <div className="grid grid-cols-2 gap-2">
                      {planOptions.map(p => (
                        <button key={p.value} type="button" onClick={() => setPlan(p.value)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            plan === p.value
                              ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                          }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-white">{p.label}</span>
                            {plan === p.value && <Check className="w-3.5 h-3.5 text-violet-400" />}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{p.desc}</p>
                          <p className="text-xs text-violet-400 font-medium mt-1">{p.price}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>
              )}

              <div className="flex gap-3">
                {step === 2 && (
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 h-11 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.04] transition-all flex items-center justify-center gap-1 text-sm">
                    <ChevronLeft className="w-4 h-4" />上一步
                  </button>
                )}
                <Button type="submit"
                  className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300 group"
                  loading={isLoading}
                  disabled={step === 1 ? !step1Valid : false}>
                  <span className="flex items-center gap-2">
                    {step === 1 ? '下一步' : '创建账号'}
                    {step === 1 ? <ChevronRight className="w-4 h-4" /> : <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
                  </span>
                </Button>
              </div>
            </form>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-xs text-slate-600">OR</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <Link href="/login" className="block mt-4">
              <button type="button" className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-slate-300 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300">
                已有账号？去登录
              </button>
            </Link>

            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            &copy; {new Date().getFullYear()} 火客 HuoKe &middot; 智能营销获客系统 &middot; {APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  )
}
