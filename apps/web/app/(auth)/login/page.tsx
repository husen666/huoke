'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flame, Eye, EyeOff, ArrowRight, Mail, Lock, KeyRound, ShieldCheck, Headphones } from 'lucide-react'
import { forgotPassword, resetPassword } from '@/lib/api'
import { APP_VERSION } from '@/lib/utils'

type ForgotStep = 'login' | 'email' | 'code' | 'done'

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = []

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const count = Math.min(80, Math.floor(window.innerWidth / 16))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.5 + 0.2,
      })
    }

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(99, 143, 255, ${p.o})`
        ctx!.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            ctx!.beginPath()
            ctx!.moveTo(p.x, p.y)
            ctx!.lineTo(q.x, q.y)
            ctx!.strokeStyle = `rgba(99, 143, 255, ${0.12 * (1 - dist / 140)})`
            ctx!.lineWidth = 0.6
            ctx!.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" />
}

function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[100px] opacity-30 ${className}`} />
}

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [forgotStep, setForgotStep] = useState<ForgotStep>('login')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const next: Record<string, string> = {}
    if (!email.includes('@')) next.email = '请输入有效的邮箱地址'
    if (password.length < 6) next.password = '密码至少6位'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      await login(email, password)
      const u = useAuthStore.getState().user
      if (u?.role === 'owner' && u?.org?.onboardingCompleted === false) {
        router.replace('/onboarding')
      } else {
        router.replace('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试')
    }
  }

  async function handleForgotEmail(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.includes('@')) { setErrors({ email: '请输入有效的邮箱地址' }); return }
    setForgotLoading(true)
    try {
      await forgotPassword(email)
      setForgotStep('code')
      setErrors({})
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败，请重试')
    } finally { setForgotLoading(false) }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const next: Record<string, string> = {}
    if (resetCode.length !== 6) next.code = '请输入6位验证码'
    if (newPassword.length < 6) next.newPassword = '新密码至少6位'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setForgotLoading(true)
    try {
      await resetPassword(email, resetCode, newPassword)
      setForgotStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败，请重试')
    } finally { setForgotLoading(false) }
  }

  const forgotContent = () => {
    if (forgotStep === 'email') return (
      <form onSubmit={handleForgotEmail} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">邮箱</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input type="email" placeholder="请输入注册邮箱" value={email} onChange={(e) => setEmail(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
          </div>
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
        </div>
        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-blue-500/25" loading={forgotLoading}>
          发送验证码
        </Button>
        <button type="button" onClick={() => { setForgotStep('login'); setError(''); setErrors({}) }}
          className="w-full text-sm text-slate-400 hover:text-white transition-colors">返回登录</button>
      </form>
    )
    if (forgotStep === 'code') return (
      <form onSubmit={handleResetPassword} className="space-y-5">
        <p className="text-sm text-slate-400">验证码已发送至 <span className="text-blue-400">{email}</span></p>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">验证码</label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input placeholder="6位数字" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 tracking-[0.3em] text-center" />
          </div>
          {errors.code && <p className="text-xs text-red-400 mt-1">{errors.code}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">新密码</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input type="password" placeholder="至少6位" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50" />
          </div>
          {errors.newPassword && <p className="text-xs text-red-400 mt-1">{errors.newPassword}</p>}
        </div>
        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-blue-500/25" loading={forgotLoading}>
          重置密码
        </Button>
        <button type="button" onClick={() => { setForgotStep('email'); setError(''); setResetCode(''); setNewPassword(''); setErrors({}) }}
          className="w-full text-sm text-slate-400 hover:text-white transition-colors">重新发送验证码</button>
      </form>
    )
    return (
      <div className="space-y-5 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-slate-300">密码已重置，请使用新密码登录</p>
        <Link href="/login">
          <Button type="button" className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white border-0">
            返回登录
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0e1a]">
      <ParticleCanvas />
      <GlowOrb className="w-[500px] h-[500px] bg-blue-600 -top-40 -left-40" />
      <GlowOrb className="w-[400px] h-[400px] bg-violet-600 -bottom-32 -right-32" />
      <GlowOrb className="w-[300px] h-[300px] bg-cyan-500 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className={`w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Glass Card */}
          <div className="relative backdrop-blur-xl bg-white/[0.05] rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/40 p-8 overflow-hidden">
            {/* Top shimmer line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />

            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 blur-lg opacity-50" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg">
                  <Flame className="w-9 h-9 text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
                {forgotStep !== 'login' ? '找回密码' : '火客'}
                {forgotStep === 'login' && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500/20 to-violet-500/20 text-blue-300 border border-blue-400/20 tracking-normal">{APP_VERSION}</span>
                )}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {forgotStep !== 'login' ? '重置您的账户密码' : '智能营销获客系统'}
              </p>
            </div>

            {forgotStep !== 'login' ? forgotContent() : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">邮箱</label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <Input
                      type="email"
                      placeholder="请输入邮箱"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: '' })) }}
                      required
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20 hover:border-white/20 transition-colors"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400" />{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">密码</label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors(prev => ({ ...prev, password: '' })) }}
                      required
                      className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20 hover:border-white/20 transition-colors"
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400" />{errors.password}</p>}
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 group"
                  loading={isLoading}
                >
                  <span className="flex items-center gap-2">
                    登录
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Button>
              </form>
            )}

            {forgotStep === 'login' && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <button type="button" onClick={() => setForgotStep('email')}
                  className="text-sm text-slate-500 hover:text-blue-400 transition-colors">
                  忘记密码？
                </button>
                <div className="w-full flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-xs text-slate-600">OR</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                <Link href="/register" className="w-full">
                  <button type="button"
                    className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-slate-300 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300">
                    还没有账号？立即注册
                  </button>
                </Link>
                <Link href="/service-login" className="w-full">
                  <button type="button"
                    className="w-full h-10 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] text-sm text-cyan-400/80 hover:bg-cyan-500/[0.08] hover:border-cyan-500/25 transition-all duration-300 flex items-center justify-center gap-2">
                    <Headphones className="w-4 h-4" /> 客服工作台入口
                  </button>
                </Link>
              </div>
            )}

            {/* Bottom shimmer */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-6">
            &copy; {new Date().getFullYear()} 火客 HuoKe &middot; 智能营销获客系统 &middot; {APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  )
}
