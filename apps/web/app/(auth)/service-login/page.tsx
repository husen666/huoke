'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Headphones, Eye, EyeOff, ArrowRight, Mail, Lock, Wifi, WifiOff, Flame } from 'lucide-react'
import { APP_VERSION } from '@/lib/utils'

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

    const count = Math.min(60, Math.floor(window.innerWidth / 20))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.4 + 0.15,
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
        ctx!.fillStyle = `rgba(56, 189, 248, ${p.o})`
        ctx!.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 130) {
            ctx!.beginPath()
            ctx!.moveTo(p.x, p.y)
            ctx!.lineTo(q.x, q.y)
            ctx!.strokeStyle = `rgba(56, 189, 248, ${0.1 * (1 - dist / 130)})`
            ctx!.lineWidth = 0.5
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
  return <div className={`absolute rounded-full blur-[100px] opacity-25 ${className}`} />
}

function StatusPulse() {
  return (
    <div className="flex items-center gap-2 justify-center text-xs text-emerald-400/80 mb-6">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      系统运行正常
    </div>
  )
}

export default function ServiceLoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState('')

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

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
      router.replace('/service')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试')
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#060a14]">
      <ParticleCanvas />
      <GlowOrb className="w-[450px] h-[450px] bg-cyan-600 -top-40 -right-40" />
      <GlowOrb className="w-[350px] h-[350px] bg-blue-700 -bottom-28 -left-28" />
      <GlowOrb className="w-[200px] h-[200px] bg-teal-500 top-1/2 left-1/3" />

      {/* HUD-style corners */}
      <div className="fixed top-6 left-6 text-xs text-cyan-500/40 font-mono z-20">
        <div className="flex items-center gap-2"><Wifi className="w-3 h-3" /> HUOKE-SERVICE {APP_VERSION}</div>
      </div>
      <div className="fixed top-6 right-6 text-xs text-cyan-500/40 font-mono z-20 text-right">
        <div>{time}</div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className={`w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="relative backdrop-blur-xl bg-white/[0.04] rounded-3xl border border-cyan-500/10 shadow-2xl shadow-black/50 p-8 overflow-hidden">
            {/* Scan line animation */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-[scan_4s_ease-in-out_infinite]" />
            </div>
            <style>{`@keyframes scan { 0%,100% { top: 0 } 50% { top: 100% } }`}</style>

            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

            {/* Logo */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 blur-lg opacity-40" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/90 to-blue-600 flex items-center justify-center shadow-lg ring-1 ring-cyan-400/20">
                  <Headphones className="w-9 h-9 text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
                客服工作台
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-400/20 tracking-normal">{APP_VERSION}</span>
              </h1>
              <p className="text-sm text-slate-500 mt-1">火客智能客服系统</p>
            </div>

            <StatusPulse />

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">工号 / 邮箱</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                  <Input
                    type="email"
                    placeholder="请输入邮箱"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: '' })) }}
                    required
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20 hover:border-white/20 transition-colors"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">密码</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors(prev => ({ ...prev, password: '' })) }}
                    required
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20 hover:border-white/20 transition-colors"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 transition-all duration-300 group"
                loading={isLoading}
              >
                <span className="flex items-center gap-2">
                  进入工作台
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Button>
            </form>

            <div className="mt-6 flex flex-col items-center gap-3">
              <Link href="/login" className="w-full">
                <button type="button"
                  className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-slate-400 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-2">
                  <Flame className="w-4 h-4" /> 管理后台登录
                </button>
              </Link>
              <p className="text-xs text-slate-600">登录即表示您已阅读并同意相关服务条款</p>
            </div>

            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />
          </div>

          <p className="text-center text-xs text-slate-700 mt-6 font-mono">
            &copy; {new Date().getFullYear()} HuoKe Service Console &middot; {APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  )
}
