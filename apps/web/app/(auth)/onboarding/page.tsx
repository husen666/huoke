'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { completeOnboarding, getOrgInfo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flame, Building2, Users, MessageSquare, Rocket, Check, ArrowRight, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const steps = [
  { icon: Building2, title: '企业设置', desc: '完善您的企业基本信息' },
  { icon: Users, title: '团队', desc: '了解如何邀请团队成员' },
  { icon: MessageSquare, title: '渠道', desc: '选择客户接入渠道' },
  { icon: Rocket, title: '开始使用', desc: '一切就绪，开始服务客户' },
]

const scales = ['1-10人', '11-50人', '51-200人', '201-500人', '500人以上']
const industries = ['互联网/科技', '电商/零售', '金融/保险', '教育/培训', '医疗/健康', 'SaaS/软件', '制造业', '房地产', '旅游/酒店', '其他']

export default function OnboardingPage() {
  const router = useRouter()
  const { user, fetchUser } = useAuthStore()
  const [step, setStep] = useState(0)
  const [orgName, setOrgName] = useState('')
  const [industry, setIndustry] = useState('')
  const [scale, setScale] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [prefilled, setPrefilled] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await getOrgInfo()
        if (!active || !res?.success || !res.data) return
        const org = res.data
        setOrgName((prev) => prev || org.name || '')
        setIndustry((prev) => prev || org.industry || '')
        setScale((prev) => prev || org.scale || '')
        setPhone((prev) => prev || org.phone || '')
        setPrefilled(!!(org.name || org.industry || org.scale || org.phone))
      } catch {
        // silent: onboarding should remain usable even if prefill fails
      }
    })()
    return () => { active = false }
  }, [])

  async function handleFinish() {
    setLoading(true)
    try {
      await completeOnboarding({
        orgName: orgName || undefined,
        industry: industry || undefined,
        scale: scale || undefined,
        phone: phone || undefined,
      })
      await fetchUser()
      toast.success('设置完成，欢迎使用火客！')
      router.replace('/dashboard')
    } catch {
      toast.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  function handleSkip() {
    handleFinish()
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-[150px]" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className={`text-center mb-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/25 mb-4">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">欢迎使用火客</h1>
          <p className="text-slate-400 mt-1">完成以下设置，快速开始</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-1 mb-10">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs transition-all ${
                i <= step ? 'bg-violet-600 text-white' : 'bg-white/10 text-slate-500'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 sm:w-16 h-0.5 mx-1 rounded ${i < step ? 'bg-violet-600' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="backdrop-blur-xl bg-white/[0.05] rounded-2xl border border-white/[0.08] p-8">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">企业信息</h2>
                <p className="text-sm text-slate-400">这些信息帮助我们为您提供更好的服务</p>
                {prefilled && (
                  <p className="text-xs text-emerald-400 mt-1">已自动带入注册时填写的信息，可直接下一步</p>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1.5 block">企业名称</label>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="您的企业或团队名称"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1.5 block">所属行业</label>
                <select value={industry} onChange={e => setIndustry(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none appearance-none">
                  <option value="" className="bg-slate-900">请选择</option>
                  {industries.map(i => <option key={i} value={i} className="bg-slate-900">{i}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1.5 block">团队规模</label>
                <div className="flex flex-wrap gap-2">
                  {scales.map(s => (
                    <button key={s} type="button" onClick={() => setScale(s)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${scale === s ? 'bg-violet-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:border-white/20'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1.5 block">联系电话（选填）</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="方便我们联系您"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">邀请团队成员</h2>
                <p className="text-sm text-slate-400">您可以随时在设置中邀请更多成员</p>
              </div>
              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">通过邀请链接添加成员</h3>
                    <p className="text-sm text-slate-400 mt-0.5">进入 组织架构 → 成员管理，点击"邀请成员"生成邀请链接</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">创建部门和团队</h3>
                    <p className="text-sm text-slate-400 mt-0.5">在 组织架构 中设置部门结构和客服团队分组</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">选择接入渠道</h2>
                <p className="text-sm text-slate-400">将客服组件嵌入您的网站，开始接待客户</p>
              </div>
              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">网页在线客服</h3>
                    <p className="text-sm text-slate-400 mt-0.5">只需一行代码，将聊天窗口嵌入您的网站。进入 客服中心 → 渠道管理 获取代码。</p>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
                <p className="text-sm text-violet-300">嵌入代码示例：</p>
                <code className="block mt-2 text-xs text-slate-400 bg-black/20 rounded-lg p-3 font-mono break-all">
                  {'<script src="https://your-domain.com/widget.js" data-org-id="YOUR_ORG_ID"></script>'}
                </code>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center mb-6">
                <Rocket className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">一切就绪！</h2>
              <p className="text-slate-400 mb-2">您的企业账号已设置完成</p>
              <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-left space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-300"><Check className="w-4 h-4 text-emerald-400" /> 企业组织已创建</div>
                <div className="flex items-center gap-2 text-sm text-slate-300"><Check className="w-4 h-4 text-emerald-400" /> 您已被设为组织管理员</div>
                <div className="flex items-center gap-2 text-sm text-slate-300"><Check className="w-4 h-4 text-emerald-400" /> 可在设置中随时调整配置</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-8">
            {step > 0 && step < 3 && (
              <button type="button" onClick={() => setStep(step - 1)}
                className="flex-1 h-11 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.04] transition-all text-sm">
                上一步
              </button>
            )}
            {step < 3 ? (
              <>
                <button type="button" onClick={() => setStep(step + 1)}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium transition-all text-sm flex items-center justify-center gap-1">
                  下一步 <ChevronRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <Button onClick={handleFinish} loading={loading}
                className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-blue-600 text-white border-0 font-medium">
                <span className="flex items-center gap-2">进入系统 <ArrowRight className="w-4 h-4" /></span>
              </Button>
            )}
          </div>

          {step < 3 && (
            <button type="button" onClick={handleSkip} className="w-full text-center text-xs text-slate-500 hover:text-slate-400 mt-4 transition-colors">
              跳过设置，直接进入系统
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
