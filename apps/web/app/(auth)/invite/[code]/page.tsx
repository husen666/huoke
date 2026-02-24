'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { verifyInvitation, acceptInvitation } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingPage } from '@/components/ui/loading'
import { toast } from 'sonner'
import { Users, Eye, EyeOff, Shield, Building, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react'

const roleLabel: Record<string, string> = { admin: '管理员', agent: '客服', viewer: '只读' }

export default function InviteAcceptPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const [status, setStatus] = useState<'loading' | 'valid' | 'error' | 'success'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [inviteData, setInviteData] = useState<{ email?: string | null; role: string; orgName: string; orgId: string } | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!code) return
    verifyInvitation(code).then((res) => {
      if (res.success && res.data) {
        setInviteData(res.data)
        if (res.data.email) setEmail(res.data.email)
        setStatus('valid')
      } else {
        setErrorMsg((res as { error?: string }).error ?? '邀请无效')
        setStatus('error')
      }
    }).catch((e) => {
      setErrorMsg(e instanceof Error ? e.message : '验证邀请失败')
      setStatus('error')
    })
  }, [code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password || !name) {
      toast.error('请填写所有必填项')
      return
    }
    if (password.length < 6) {
      toast.error('密码至少6位')
      return
    }

    setSubmitting(true)
    try {
      const res = await acceptInvitation(code, { email, password, name })
      if (res.success && res.data) {
        const invUser = { ...res.data.user, org: res.data.org }
        setAuth({
          user: invUser,
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
        })
        setStatus('success')
        toast.success('注册成功，正在跳转...')
        setTimeout(() => router.replace('/dashboard'), 1500)
      } else {
        toast.error((res as { error?: string }).error ?? '注册失败')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') return <LoadingPage />

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {status === 'error' && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-lg p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-800 mb-2">邀请无效</h1>
            <p className="text-sm text-slate-600 mb-6">{errorMsg}</p>
            <div className="flex flex-col gap-2">
              <Link href="/login">
                <Button variant="primary" className="w-full">前往登录</Button>
              </Link>
              <Link href="/register">
                <Button variant="outline" className="w-full">注册新账号</Button>
              </Link>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-lg p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-800 mb-2">加入成功</h1>
            <p className="text-sm text-slate-600">正在跳转到工作台...</p>
          </div>
        )}

        {status === 'valid' && inviteData && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-slate-800">加入团队</h1>
              <p className="text-sm text-slate-600 mt-1">您被邀请加入以下组织</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{inviteData.orgName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="primary" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />{roleLabel[inviteData.role] ?? inviteData.role}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="请输入您的姓名" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">邮箱 *</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  required
                  disabled={!!inviteData.email}
                />
                {inviteData.email && <p className="text-xs text-slate-500 mt-1">邀请指定了此邮箱，无法修改</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">设置密码 *</label>
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少6位密码"
                    required
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" variant="primary" className="w-full h-11 mt-2" loading={submitting}>
                <span className="flex items-center gap-2">
                  加入团队 <ArrowRight className="h-4 w-4" />
                </span>
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500 mt-4">
              已有账号？ <Link href="/login" className="text-primary hover:underline">直接登录</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
