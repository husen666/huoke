'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Flame, Zap, Shield, Users, BarChart3, MessageSquare, Bot, Globe,
  ChevronRight, Check, ArrowRight, Headphones, Star, Building2, Sparkles,
  MousePointerClick, Rocket, Settings2, Phone, Mail, Clock, TrendingUp,
  Quote, Play, MonitorSmartphone, Workflow, Database, Lock, ArrowUp,
} from 'lucide-react'
import { APP_VERSION } from '@/lib/utils'

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animId: number
    let running = true
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = []
    const maxDpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const connectDist = 120
    const connectDistSq = connectDist * connectDist
    function resize() {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas!.width = Math.floor(w * maxDpr)
      canvas!.height = Math.floor(h * maxDpr)
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.setTransform(maxDpr, 0, 0, maxDpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    const count = Math.min(45, Math.floor(window.innerWidth / 28))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      })
    }
    function draw() {
      if (!running) return
      const w = window.innerWidth
      const h = window.innerHeight
      ctx!.clearRect(0, 0, w, h)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(99,143,255,${p.o})`; ctx!.fill()
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const distSq = dx * dx + dy * dy
          if (distSq < connectDistSq) {
            const alpha = 0.1 * (1 - Math.sqrt(distSq) / connectDist)
            ctx!.beginPath(); ctx!.moveTo(p.x, p.y); ctx!.lineTo(q.x, q.y); ctx!.strokeStyle = `rgba(99,143,255,${alpha})`; ctx!.lineWidth = 0.5; ctx!.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(animId)
      } else if (!running) {
        running = true
        animId = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    draw()
    return () => {
      running = false
      cancelAnimationFrame(animId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-5xl mt-16 px-4">
      <div className="absolute inset-0 -top-10 bg-gradient-to-b from-violet-600/20 via-blue-600/10 to-transparent blur-3xl rounded-full" />
      <div className="relative rounded-xl border border-white/[0.08] bg-[#0d1225]/80 backdrop-blur-sm shadow-2xl shadow-violet-500/10 overflow-hidden">
        {/* Browser bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0d1225] border-b border-white/[0.06]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 mx-8 h-7 rounded-md bg-white/[0.06] border border-white/[0.06] flex items-center px-3">
            <Lock className="w-3 h-3 text-green-400/60 mr-1.5" />
            <span className="text-[11px] text-slate-500 font-mono">app.huoke.com/dashboard</span>
          </div>
        </div>
        {/* Dashboard content */}
        <div className="flex">
          {/* Sidebar */}
          <div className="w-48 border-r border-white/[0.06] bg-[#0b0f1e] p-3 hidden sm:block">
            <div className="flex items-center gap-2 mb-5 px-1">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                <Flame className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs font-semibold text-white">火客</span>
            </div>
            {['仪表盘', '在线客服', '客户管理', '线索管理', '数据分析', '工单管理'].map((item, i) => (
              <div key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] mb-0.5 ${i === 0 ? 'bg-violet-500/15 text-violet-300' : 'text-slate-500'}`}>
                <div className={`w-3.5 h-3.5 rounded ${i === 0 ? 'bg-violet-500/30' : 'bg-white/[0.06]'}`} />
                {item}
              </div>
            ))}
          </div>
          {/* Main */}
          <div className="flex-1 p-4 sm:p-5">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: '今日会话', val: '128', color: 'from-violet-500/20 to-violet-500/5', text: 'text-violet-400' },
                { label: '活跃客户', val: '2,847', color: 'from-blue-500/20 to-blue-500/5', text: 'text-blue-400' },
                { label: '新增线索', val: '56', color: 'from-emerald-500/20 to-emerald-500/5', text: 'text-emerald-400' },
                { label: '满意度', val: '96%', color: 'from-amber-500/20 to-amber-500/5', text: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className={`p-3 rounded-lg bg-gradient-to-br ${s.color} border border-white/[0.04]`}>
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                  <p className={`text-lg font-bold ${s.text} mt-0.5`}>{s.val}</p>
                </div>
              ))}
            </div>
            {/* Chart area */}
            <div className="h-28 sm:h-36 rounded-lg bg-white/[0.02] border border-white/[0.04] p-3 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-slate-400 font-medium">会话趋势</span>
                <div className="flex gap-3 text-[9px] text-slate-600">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />本周</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400/40" />上周</span>
                </div>
              </div>
              <svg viewBox="0 0 400 80" className="w-full h-16 sm:h-20">
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
                    <stop offset="100%" stopColor="rgba(139,92,246,0)" />
                  </linearGradient>
                </defs>
                <path d="M0 60 Q50 55 80 45 T160 30 T240 38 T320 20 T400 25 V80 H0Z" fill="url(#cg)" />
                <path d="M0 60 Q50 55 80 45 T160 30 T240 38 T320 20 T400 25" fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="1.5" />
                <path d="M0 65 Q50 62 80 58 T160 50 T240 52 T320 42 T400 45" fill="none" stroke="rgba(96,165,250,0.3)" strokeWidth="1" strokeDasharray="3 3" />
              </svg>
            </div>
            {/* Recent conversations */}
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.04]">
                <span className="text-[10px] text-slate-400 font-medium">最近会话</span>
              </div>
              {[
                { name: '张三', msg: '请问你们的产品支持哪些功能？', time: '2分钟前', status: 'bg-emerald-400' },
                { name: '李女士', msg: '我想了解一下定价方案', time: '5分钟前', status: 'bg-blue-400' },
                { name: '王经理', msg: '能否安排一次产品演示？', time: '12分钟前', status: 'bg-amber-400' },
              ].map(c => (
                <div key={c.name} className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.02] last:border-0">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-[9px] text-white font-medium shrink-0">{c.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-300 font-medium">{c.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.status}`} />
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{c.msg}</p>
                  </div>
                  <span className="text-[9px] text-slate-600 shrink-0">{c.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const features = [
  { icon: MessageSquare, title: '全渠道客服', desc: '网页、微信、邮件等多渠道统一接入，不遗漏每一个客户', color: 'from-violet-500 to-purple-600' },
  { icon: Bot, title: 'AI 智能助手', desc: '基于 DeepSeek 大模型，AI 辅助回复、智能分析、知识库问答', color: 'from-blue-500 to-cyan-500' },
  { icon: Users, title: 'CRM 客户管理', desc: '线索追踪、客户画像、商机管理，完整的客户生命周期管理', color: 'from-emerald-500 to-teal-500' },
  { icon: BarChart3, title: '数据洞察', desc: '实时监控、会话分析、绩效报表，数据驱动运营决策', color: 'from-amber-500 to-orange-500' },
  { icon: Shield, title: '组织架构', desc: '部门团队管理、RBAC权限控制、审计日志，企业级安全保障', color: 'from-rose-500 to-pink-500' },
  { icon: Zap, title: '自动化工作流', desc: '智能路由、自动回复、SLA规则、营销活动自动化', color: 'from-indigo-500 to-blue-600' },
]

const steps = [
  { icon: MousePointerClick, num: '01', title: '注册账号', desc: '3 分钟完成企业注册，自动创建专属工作空间' },
  { icon: Settings2, num: '02', title: '配置组件', desc: '一行代码嵌入网站，自定义客服组件外观和行为' },
  { icon: Rocket, num: '03', title: '开始使用', desc: '团队协作在线客服，AI 辅助提效，数据驱动增长' },
]

const testimonials = [
  { name: '陈总监', company: '某电商科技', role: '客户服务总监', content: '火客帮我们将首次响应时间从 5 分钟缩短到 30 秒，客户满意度从 82% 提升到 96%。AI 助手让团队效率翻倍。', avatar: '陈' },
  { name: '李经理', company: '某教育集团', role: '运营经理', content: '从 Excel 管理客户到使用火客 CRM，线索转化率提升了 40%。自动化工作流省去了大量重复操作。', avatar: '李' },
  { name: '王负责人', company: '某 SaaS 公司', role: '技术负责人', content: '多租户架构很稳定，API 对接非常方便。质检中心帮我们建立了标准化的服务评估体系。', avatar: '王' },
]

const partnerPrograms = [
  { icon: Globe, title: '渠道分销合作', desc: '面向服务商与区域伙伴，提供专属价格体系、销售支持与联合交付方案。' },
  { icon: Users, title: '实施交付合作', desc: '面向咨询公司与系统集成商，提供标准化实施方法、培训认证与项目共建支持。' },
  { icon: TrendingUp, title: '联合增长合作', desc: '面向生态平台与行业媒体，支持联合活动、内容共创与线索共享增长。' },
]

const plans = [
  {
    name: 'starter', label: '创业版', price: 0, originalPrice: 299, desc: '限时免费，适合创业团队快速起步', seats: 10, convs: '5,000', leads: '10,000', highlight: false, badge: '限时免费',
    features: ['全功能 CRM 管理', '网页客服组件', 'AI 智能助手', '团队与部门管理', '自动回复 / SLA 规则', '工作流自动化', '营销活动', '质检中心', 'Webhook / API', '自定义角色', '5 个知识库', '10GB 存储'],
  },
  {
    name: 'pro', label: '专业版', price: 799, desc: '5 倍容量，适合高速增长企业', seats: 50, convs: '25,000', leads: '50,000', highlight: true,
    features: ['所有创业版功能', '50 坐席', '25,000 对话/月', '50,000 线索', '25 个知识库', '100GB 存储空间', 'AI 数据洞察', '数据导出'],
  },
  {
    name: 'enterprise', label: '企业版', price: -1, desc: '大型企业专属定制方案', seats: '不限', convs: '不限', leads: '不限', highlight: false,
    features: ['所有专业版功能', '白标品牌定制', '专属实例部署', '优先技术支持', '定制集成开发', '专属客户成功经理'],
  },
]

const stats = [
  { value: '10,000+', label: '企业客户', icon: Building2 },
  { value: '5,000万+', label: '月处理会话', icon: MessageSquare },
  { value: '99.9%', label: '系统可用性', icon: TrendingUp },
  { value: '< 200ms', label: '平均响应延迟', icon: Zap },
]

const channels = [
  { icon: MonitorSmartphone, label: '网站组件' },
  { icon: MessageSquare, label: '微信公众号' },
  { icon: Phone, label: '电话集成' },
  { icon: Mail, label: '邮件客服' },
  { icon: Globe, label: '小程序' },
  { icon: Workflow, label: 'API 接入' },
]

const techBaselines = [
  { icon: Shield, title: '多租户隔离', desc: '组织级数据隔离 + 角色权限控制，默认最小权限。' },
  { icon: Lock, title: '传输与访问安全', desc: 'HTTPS 全链路加密，关键操作留痕可审计。' },
  { icon: Database, title: '可观测与可恢复', desc: '核心数据定时备份，支持导出与回溯。' },
  { icon: Clock, title: '服务稳定性目标', desc: '线上目标可用性 99.9%，异常场景支持降级兜底。' },
]

const landingFaqs = [
  {
    q: '你们和传统在线客服系统有什么区别？',
    a: '火客是“客服 + CRM + AI + 自动化”一体化平台，不只是聊天窗口。它把获客、接待、转化、复盘放在同一条数据链路里，减少工具切换与信息断层。',
  },
  {
    q: '部署上线需要多久？是否要技术团队配合？',
    a: '标准 SaaS 方案通常 3 分钟可上线：注册、复制脚本、完成基础配置即可。若需要 API 集成或组织权限方案，建议安排 0.5~1 天完成联调。',
  },
  {
    q: 'AI 回复会不会“乱答”，如何保证真实性？',
    a: 'AI 回复优先基于你的知识库和 FAQ；命中不足时会触发兜底提示或转人工。你也可以设置审核策略、敏感词和高风险场景规则，确保回复边界可控。',
  },
  {
    q: '是否支持后续扩展为多部门、多品牌协作？',
    a: '支持。平台提供部门/团队、角色权限、标签与流程规则，可在同一租户内按业务线拆分管理，也支持企业版专属部署。',
  },
]

function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-[160px] right-7 z-50 w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/[0.12] text-slate-300 hover:bg-violet-600 hover:text-white hover:border-violet-500 shadow-lg transition-all duration-300 flex items-center justify-center group"
      aria-label="返回顶部"
    >
      <ArrowUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
    </button>
  )
}

function PhoneConsult() {
  return (
    <a
      href="tel:13530856856"
      className="group fixed bottom-[104px] right-7 z-50 h-11 w-11 rounded-full border border-violet-400/40 bg-violet-600/90 text-white shadow-lg shadow-violet-500/25 backdrop-blur-md hover:bg-violet-500 transition-all duration-300 flex items-center justify-center"
      aria-label="电话咨询 13530856856"
      title="电话咨询 13530856856"
    >
      <Phone className="w-4 h-4" />
      <span className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-violet-300/40 bg-[#0f1530]/95 px-3 py-1.5 text-xs font-medium text-violet-100 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 transition-all duration-200">
        电话咨询：13530856856
      </span>
    </a>
  )
}

function WidgetLoader() {
  useEffect(() => {
    if (document.getElementById('huoke-widget-btn')) return
    const s = document.createElement('script')
    s.src = '/widget.js'
    s.setAttribute('data-site-token', '06a12e23-acda-45eb-92d3-071a4eaacb3b')
    s.setAttribute('data-color', '#7c3aed')
    s.setAttribute('data-title', '火客智能客服')
    s.setAttribute('data-position', 'right')
    document.body.appendChild(s)
    return () => {
      document.getElementById('huoke-widget-btn')?.remove()
      document.getElementById('huoke-widget-panel')?.remove()
      s.remove()
    }
  }, [])
  return null
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div id="home" className="min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden pt-16">
      <ParticleCanvas />

      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-white/[0.08] shadow-lg shadow-black/20' : 'border-b border-white/[0.06]'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-wide">火客 HuoKe</span>
            <span className="text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">{APP_VERSION}</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#home" className="hover:text-white transition-colors">首页</a>
            <a href="#features" className="hover:text-white transition-colors">功能</a>
            <a href="#partners" className="hover:text-white transition-colors">渠道合作</a>
            <a href="#pricing" className="hover:text-white transition-colors">定价</a>
            <a href="#testimonials" className="hover:text-white transition-colors">案例</a>
            <Link href="/tickets" className="hover:text-white transition-colors">工单中心</Link>
            <Link href="/login" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">登录</Link>
            <Link href="/register" target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium hover:opacity-90 transition-opacity">
              免费注册
            </Link>
          </div>
          <div className="md:hidden flex items-center gap-3">
            <a href="#home" className="text-sm text-slate-400">首页</a>
            <Link href="/tickets" className="text-sm text-slate-400">工单</Link>
            <a href="#partners" className="text-sm text-slate-400">合作</a>
            <Link href="/login" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400">登录</Link>
            <Link href="/register" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-violet-600 text-sm">注册</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-20 pb-8 px-4">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[150px]" />
        <div className={`max-w-4xl mx-auto text-center transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm mb-8">
            <Sparkles className="w-4 h-4" />
            SaaS 智能客服 + CRM 一体化平台
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-400">让每一次对话</span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400">都成为增长机会</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            火客智能营销获客系统，集 AI 客服、CRM 管理、数据分析于一体。
            <br className="hidden sm:block" />
            多企业入驻 SaaS 平台，开箱即用，按需扩展。
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" target="_blank" rel="noopener noreferrer" className="group px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all">
              <span className="flex items-center gap-2">
                免费开始使用
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
            <a href="#features" className="px-8 py-3.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.04] transition-all flex items-center gap-2">
              <Play className="w-4 h-4" /> 了解更多
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 目标可用性 99.9%</span>
            <span className="inline-flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-slate-500" /> 多租户数据隔离</span>
            <span className="inline-flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5 text-slate-500" /> API / Webhook 可扩展</span>
          </div>
        </div>
        {/* Product mockup */}
        <div className={`transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
          <DashboardMockup />
        </div>
      </section>

      {/* Trusted by / Stats */}
      <section className="relative z-10 py-20 border-y border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-center text-xs text-slate-600 uppercase tracking-widest mb-10">已有众多企业信赖</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map(s => (
              <div key={s.label} className="text-center group">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.06] flex items-center justify-center group-hover:border-violet-500/30 transition-colors">
                  <s.icon className="w-5 h-5 text-slate-400 group-hover:text-violet-400 transition-colors" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400">{s.value}</div>
                <div className="text-sm text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-400 font-medium mb-3">核心功能</p>
            <h2 className="text-3xl sm:text-4xl font-bold">强大的功能体系</h2>
            <p className="mt-4 text-slate-400 text-lg">从客户触达到成交转化，全流程智能化</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(f => (
              <div key={f.title} className="group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-violet-500/20 transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-400 font-medium mb-3">快速上手</p>
            <h2 className="text-3xl sm:text-4xl font-bold">三步开启智能客服</h2>
            <p className="mt-4 text-slate-400 text-lg">从注册到上线，最快只需 3 分钟</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-16 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-gradient-to-r from-violet-500/30 via-blue-500/30 to-violet-500/30" />
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center relative z-10">
                  <s.icon className="w-7 h-7 text-violet-400" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-[10px] font-bold flex items-center justify-center shadow-lg">{s.num}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Channels */}
      <section className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-400 font-medium mb-3">全渠道接入</p>
            <h2 className="text-3xl sm:text-4xl font-bold">一个平台，覆盖所有触点</h2>
            <p className="mt-4 text-slate-400 text-lg">多渠道统一管理，不遗漏任何一位客户</p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {channels.map(ch => (
              <div key={ch.label} className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-violet-500/5 hover:border-violet-500/20 transition-all cursor-default">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] group-hover:bg-violet-500/15 flex items-center justify-center transition-colors">
                  <ch.icon className="w-5 h-5 text-slate-400 group-hover:text-violet-400 transition-colors" />
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-300 text-center">{ch.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SaaS Advantages */}
      <section className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-400 font-medium mb-3">平台优势</p>
            <h2 className="text-3xl sm:text-4xl font-bold">SaaS 多企业平台</h2>
            <p className="mt-4 text-slate-400 text-lg">安全隔离、独立管理、灵活扩展</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Building2, title: '多租户架构', desc: '每个企业独立数据空间，完全隔离，安全可靠。支持企业自助注册和团队管理。', gradient: 'from-violet-500/10' },
              { icon: Database, title: '即开即用', desc: '无需部署服务器，注册即可使用。提供 Web 客服组件一键嵌入您的网站。', gradient: 'from-blue-500/10' },
              { icon: Star, title: '弹性套餐', desc: '从创业版到企业版，按需选择。席位数、会话量、存储空间灵活扩展。', gradient: 'from-emerald-500/10' },
            ].map(a => (
              <div key={a.title} className={`p-8 rounded-2xl border border-white/[0.06] bg-gradient-to-b ${a.gradient} to-transparent hover:border-white/[0.12] transition-colors`}>
                <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mb-5">
                  <a.icon className="w-7 h-7 text-violet-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{a.title}</h3>
                <p className="text-slate-400 leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech baseline */}
      <section className="relative z-10 py-24 px-4 border-t border-white/[0.06] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[760px] h-[280px] bg-violet-500/10 blur-[100px]" />
          <div className="absolute -bottom-20 right-0 w-[320px] h-[320px] bg-blue-500/10 blur-[110px]" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-300 font-medium mb-3 tracking-wide">技术与可信度</p>
            <h2 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-violet-100 to-blue-200">可验证的技术基线</h2>
            <p className="mt-4 text-slate-400 text-lg">不仅“看起来智能”，更要“可落地、可追踪、可审计”</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-200">Zero Trust 思路</span>
              <span className="px-2.5 py-1 rounded-full border border-blue-400/30 bg-blue-500/10 text-blue-200">可观测性</span>
              <span className="px-2.5 py-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">稳定性 SLO</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {techBaselines.map((item) => (
              <div key={item.title} className="group relative p-6 rounded-2xl border border-white/[0.10] bg-gradient-to-br from-[#0f1530]/80 via-[#101936]/70 to-[#0b132a]/80 backdrop-blur-sm hover:border-violet-400/40 hover:-translate-y-0.5 transition-all duration-300">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500/0 via-violet-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-violet-500/30 via-blue-400/20 to-cyan-400/20 opacity-0 group-hover:opacity-100 blur-sm -z-10 transition-opacity" />
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 border border-violet-400/30 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform">
                    <item.icon className="w-5 h-5 text-violet-200 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-slate-100">{item.title}</h3>
                    <p className="text-sm text-slate-300/90 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-500/90 text-center">
            注：页面展示数据为平台样例与公开目标值，实际效果取决于业务场景、知识库质量与接入深度。
          </p>
        </div>
      </section>

      {/* Partner */}
      <section id="partners" className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm text-violet-400 font-medium mb-3">渠道合作</p>
            <h2 className="text-3xl sm:text-4xl font-bold">携手伙伴，放大增长能力</h2>
            <p className="mt-4 text-slate-400 text-lg">开放分销、交付与联合增长合作，共建企业服务生态</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {partnerPrograms.map((item) => (
              <div key={item.title} className="group p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:border-violet-500/25 hover:bg-white/[0.04] transition-all">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5 text-violet-300 group-hover:text-violet-200 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-blue-500/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold">正在招募城市与行业渠道伙伴</p>
              <p className="text-sm text-slate-300 mt-1">提交合作意向后，我们将在 1 个工作日内联系您。</p>
            </div>
            <a href="mailto:sales@huoke.com?subject=%E7%81%AB%E5%AE%A2%E6%B8%A0%E9%81%93%E5%90%88%E4%BD%9C%E5%92%A8%E8%AF%A2" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity">
              申请合作
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-400 font-medium mb-3">定价方案</p>
            <h2 className="text-3xl sm:text-4xl font-bold">简单透明的定价</h2>
            <p className="mt-4 text-slate-400 text-lg">选择适合您团队的方案，随时升级</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {plans.map(p => (
              <div key={p.name} className={`relative rounded-2xl p-6 flex flex-col ${p.highlight
                ? 'border-2 border-violet-500/50 bg-gradient-to-b from-violet-500/10 to-transparent shadow-lg shadow-violet-500/10'
                : 'border border-white/[0.08] bg-white/[0.02]'
              }`}>
                {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 text-xs font-medium">推荐</div>}
                {(p as any).badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-medium text-white">{(p as any).badge}</div>}
                <h3 className="text-lg font-semibold">{p.label}</h3>
                <p className="text-sm text-slate-500 mt-1">{p.desc}</p>
                <div className="mt-5 mb-6">
                  {p.price === -1 ? (
                    <span className="text-3xl font-bold">联系我们</span>
                  ) : p.price === 0 ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-emerald-400">免费</span>
                      {(p as any).originalPrice && <span className="text-lg text-slate-500 line-through">¥{(p as any).originalPrice}/月</span>}
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-slate-400">¥</span>
                      <span className="text-3xl font-bold">{p.price}</span>
                      <span className="text-sm text-slate-400">/月</span>
                    </div>
                  )}
                </div>
                <div className="mb-4 space-y-1.5 text-sm text-slate-400">
                  <div className="flex justify-between"><span>席位</span><span className="text-white font-medium">{p.seats}</span></div>
                  <div className="flex justify-between"><span>会话/月</span><span className="text-white font-medium">{p.convs}</span></div>
                  <div className="flex justify-between"><span>线索</span><span className="text-white font-medium">{p.leads}</span></div>
                </div>
                <div className="h-px bg-white/[0.06] mb-4" />
                <ul className="space-y-2 text-sm text-slate-300 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <Link href={`/register?plan=${p.name}`} target="_blank" rel="noopener noreferrer"
                  className={`mt-6 block text-center py-2.5 rounded-xl font-medium transition-all text-sm ${p.highlight
                    ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                    : 'border border-white/10 text-slate-300 hover:bg-white/[0.04]'
                  }`}>
                  {p.price === -1 ? '联系销售' : '立即开始'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-violet-400 font-medium mb-3">客户评价</p>
            <h2 className="text-3xl sm:text-4xl font-bold">来自真实用户的声音</h2>
            <p className="mt-4 text-slate-400 text-lg">看看他们如何通过火客实现业务增长</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name} className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-violet-500/20 transition-colors">
                <Quote className="w-8 h-8 text-violet-500/30 mb-4" />
                <p className="text-sm text-slate-300 leading-relaxed mb-6">{t.content}</p>
                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06]">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-sm font-bold">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.company} · {t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm text-violet-400 font-medium mb-3">常见问题</p>
            <h2 className="text-3xl sm:text-4xl font-bold">决策前你最关心的四件事</h2>
          </div>
          <div className="space-y-3">
            {landingFaqs.map((item, idx) => {
              const opened = openFaq === idx
              return (
                <div key={item.q} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(opened ? -1 : idx)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-sm sm:text-base font-medium text-slate-200">{item.q}</span>
                    <ChevronRight className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${opened ? 'rotate-90' : ''}`} />
                  </button>
                  {opened && (
                    <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="px-8 py-16 sm:px-16 rounded-3xl border border-white/[0.08] bg-gradient-to-b from-violet-500/5 to-transparent relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-blue-600/10" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-violet-500/15 rounded-full blur-[80px]" />
            <div className="relative">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center">
                <Headphones className="w-8 h-8 text-violet-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">准备好提升客户体验了吗？</h2>
              <p className="text-slate-400 mb-10">加入 10,000+ 企业的选择 · 免费注册 · 3 分钟完成设置</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all group">
                  免费注册
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <a href="mailto:sales@huoke.com" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.04] hover:border-white/20 transition-all">
                  联系销售团队
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold">火客 HuoKe</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">SaaS 智能客服 + CRM 一体化平台，助力企业增长</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">产品</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#features" className="hover:text-slate-300 transition-colors">功能介绍</a></li>
                <li><a href="#partners" className="hover:text-slate-300 transition-colors">渠道合作</a></li>
                <li><a href="#pricing" className="hover:text-slate-300 transition-colors">定价方案</a></li>
                <li><Link href="/register" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">免费试用</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">支持</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="mailto:support@huoke.com" className="hover:text-slate-300 transition-colors">技术支持</a></li>
                <li><a href="mailto:sales@huoke.com" className="hover:text-slate-300 transition-colors">商务合作</a></li>
                <li><Link href="/tickets" className="hover:text-slate-300 transition-colors">工单中心</Link></li>
                <li><Link href="/login" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">控制台登录</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">法律</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-slate-300 transition-colors">服务条款</a></li>
                <li><a href="#" className="hover:text-slate-300 transition-colors">隐私政策</a></li>
                <li><a href="#" className="hover:text-slate-300 transition-colors">数据安全</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} HuoKe &middot; {APP_VERSION} &middot; 火客智能营销获客系统</p>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <a href="#" className="hover:text-slate-400 transition-colors">服务条款</a>
              <a href="#" className="hover:text-slate-400 transition-colors">隐私政策</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating widgets */}
      <PhoneConsult />
      <BackToTop />
      <WidgetLoader />
    </div>
  )
}
