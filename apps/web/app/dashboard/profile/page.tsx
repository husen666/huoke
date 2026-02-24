'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { getMe, updateProfile, uploadAvatar, changePassword, type AuthUser } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  User, Mail, Phone, Shield, Camera, Save, Lock, Eye, EyeOff,
  Calendar, Clock, CheckCircle2, PenLine, Briefcase, AtSign,
} from 'lucide-react'
import { ROLE_LABELS } from '@/lib/role-config'

const ROLE_COLORS: Record<string, 'primary' | 'warning' | 'success' | 'default' | 'danger'> = {
  owner: 'danger',
  admin: 'warning',
  manager: 'primary',
  agent: 'success',
  viewer: 'default',
}

const STATUS_LABELS: Record<string, string> = {
  online: '在线',
  away: '离开',
  busy: '忙碌',
  offline: '离线',
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  busy: 'bg-red-500',
  offline: 'bg-slate-400',
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function ProfileCompleteness({ user }: { user: AuthUser }) {
  const fields = [
    { label: '姓名', done: !!user.name },
    { label: '邮箱', done: !!user.email },
    { label: '手机', done: !!user.phone },
    { label: '头像', done: !!user.avatarUrl },
    { label: '简介', done: !!user.bio },
  ]
  const done = fields.filter(f => f.done).length
  const pct = Math.round((done / fields.length) * 100)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-slate-600">资料完善度</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-primary' : 'bg-amber-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={cn(
            'text-sm font-bold',
            pct === 100 ? 'text-green-600' : pct >= 60 ? 'text-primary' : 'text-amber-600'
          )}>{pct}%</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {fields.map(f => (
            <div key={f.label} className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs',
                f.done ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
              )}>
                {f.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : '—'}
              </div>
              <span className={cn('text-[10px]', f.done ? 'text-slate-600' : 'text-slate-400')}>{f.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProfilePage() {
  const { user: storeUser, updateUser } = useAuthStore()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: meRes } = useQuery({
    queryKey: ['profile-me'],
    queryFn: getMe,
    staleTime: 10_000,
  })
  const user = meRes?.data ?? storeUser

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', bio: '' })
  const [avatarUploading, setAvatarUploading] = useState(false)

  const [pwOpen, setPwOpen] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const startEdit = useCallback(() => {
    if (!user) return
    setForm({ name: user.name || '', phone: user.phone || '', bio: user.bio || '' })
    setEditing(true)
  }, [user])

  const profileMut = useMutation({
    mutationFn: (data: { name?: string; phone?: string; bio?: string }) => updateProfile(data),
    onSuccess: (res) => {
      if (res.data) {
        updateUser(res.data)
        queryClient.invalidateQueries({ queryKey: ['profile-me'] })
      }
      toast.success('资料更新成功')
      setEditing(false)
    },
    onError: (e) => toast.error(e.message || '更新失败'),
  })

  const avatarMut = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onMutate: () => setAvatarUploading(true),
    onSuccess: (res) => {
      if (res.data) {
        updateUser({ avatarUrl: res.data.avatarUrl })
        queryClient.invalidateQueries({ queryKey: ['profile-me'] })
      }
      toast.success('头像更新成功')
    },
    onError: (e) => toast.error(e.message || '上传失败'),
    onSettled: () => setAvatarUploading(false),
  })

  const pwMut = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => changePassword(data),
    onSuccess: () => {
      toast.success('密码修改成功')
      setPwOpen(false)
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    },
    onError: (e) => toast.error(e.message || '修改失败'),
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('图片大小不能超过 2MB')
      return
    }
    avatarMut.mutate(file)
    e.target.value = ''
  }

  const handleSaveProfile = () => {
    if (!form.name.trim()) {
      toast.error('姓名不能为空')
      return
    }
    profileMut.mutate({
      name: form.name.trim(),
      phone: form.phone.trim(),
      bio: form.bio.trim(),
    })
  }

  const handleChangePassword = () => {
    if (!pwForm.currentPassword) { toast.error('请输入当前密码'); return }
    if (!pwForm.newPassword) { toast.error('请输入新密码'); return }
    if (pwForm.newPassword.length < 8) { toast.error('新密码至少 8 位'); return }
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error('两次输入的密码不一致'); return }
    pwMut.mutate({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
  }

  if (!user) return null

  const onlineStatus = user.onlineStatus ?? 'offline'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile Header Card */}
      <Card className="overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-primary/80 via-primary/60 to-secondary/50" />
        <div className="px-6 pb-6 -mt-16">
          <div className="flex items-end gap-5">
            {/* Avatar */}
            <div className="relative group">
              <div className={cn(
                'w-28 h-28 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-slate-200 flex items-center justify-center',
                avatarUploading && 'opacity-50'
              )}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-slate-400">
                    {user.name?.slice(0, 1).toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Camera className="h-6 w-6 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <div className={cn(
                'absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white',
                STATUS_COLORS[onlineStatus]
              )} />
            </div>

            {/* Name & Meta */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800 truncate">{user.name}</h1>
                <Badge variant={ROLE_COLORS[user.role] ?? 'default'}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </Badge>
                <span className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                  onlineStatus === 'online' ? 'bg-green-100 text-green-700' :
                  onlineStatus === 'busy' ? 'bg-red-100 text-red-700' :
                  onlineStatus === 'away' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-500'
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[onlineStatus])} />
                  {STATUS_LABELS[onlineStatus]}
                </span>
              </div>
              {user.bio && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{user.bio}</p>}
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
                {user.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />加入于 {formatDate(user.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pb-1 shrink-0">
              {!editing ? (
                <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                  <PenLine className="h-3.5 w-3.5" /> 编辑资料
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
                  <Button size="sm" variant="primary" onClick={handleSaveProfile} loading={profileMut.isPending} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> 保存
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left - Profile Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4.5 w-4.5 text-primary" /> 基本信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">姓名 <span className="text-red-500">*</span></label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="请输入姓名"
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">手机号码</label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="请输入手机号码"
                      maxLength={30}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">个人简介</label>
                    <textarea
                      value={form.bio}
                      onChange={(e) => setForm(p => ({ ...p, bio: e.target.value }))}
                      placeholder="介绍一下自己..."
                      maxLength={200}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 text-right">{form.bio.length}/200</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <InfoRow icon={User} label="姓名" value={user.name} />
                  <InfoRow icon={Mail} label="邮箱" value={user.email} />
                  <InfoRow icon={Phone} label="手机" value={user.phone || '未设置'} muted={!user.phone} />
                  <InfoRow icon={AtSign} label="简介" value={user.bio || '未设置'} muted={!user.bio} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4.5 w-4.5 text-primary" /> 安全设置
                </CardTitle>
                {!pwOpen && (
                  <Button size="sm" variant="outline" onClick={() => setPwOpen(true)} className="gap-1.5 text-xs">
                    <Lock className="h-3.5 w-3.5" /> 修改密码
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pwOpen ? (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">当前密码</label>
                    <div className="relative">
                      <Input
                        type={showCurrent ? 'text' : 'password'}
                        value={pwForm.currentPassword}
                        onChange={(e) => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                        placeholder="请输入当前密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">新密码</label>
                    <div className="relative">
                      <Input
                        type={showNew ? 'text' : 'password'}
                        value={pwForm.newPassword}
                        onChange={(e) => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                        placeholder="至少 8 位，包含字母和数字"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={pwForm.newPassword} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">确认新密码</label>
                    <Input
                      type="password"
                      value={pwForm.confirmPassword}
                      onChange={(e) => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="再次输入新密码"
                    />
                    {pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
                      <p className="text-xs text-red-500 mt-1">两次输入的密码不一致</p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => { setPwOpen(false); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }) }}>
                      取消
                    </Button>
                    <Button size="sm" variant="primary" onClick={handleChangePassword} loading={pwMut.isPending} className="gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> 确认修改
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span>密码安全，上次登录：{formatDate(user.lastLoginAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right - Sidebar */}
        <div className="space-y-6">
          <ProfileCompleteness user={user} />

          {/* Account Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">账号信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />角色</span>
                <Badge variant={ROLE_COLORS[user.role] ?? 'default'} className="text-[10px]">
                  {ROLE_LABELS[user.role] ?? user.role}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />注册时间</span>
                <span className="text-slate-700 text-xs">{formatDate(user.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />最后登录</span>
                <span className="text-slate-700 text-xs">{formatDate(user.lastLoginAt)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" />用户ID</span>
                <span className="text-slate-400 text-[10px] font-mono">{user.id.slice(0, 8)}...</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Tips */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">提示</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  点击头像即可上传新头像，支持 JPG/PNG/GIF 格式
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  建议完善手机号码，方便找回密码
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  定期修改密码，确保账号安全
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, muted }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; muted?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className={cn('text-sm', muted ? 'text-slate-400 italic' : 'text-slate-700')}>{value}</p>
      </div>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [
    { label: '至少 8 位', ok: password.length >= 8 },
    { label: '包含字母', ok: /[a-zA-Z]/.test(password) },
    { label: '包含数字', ok: /\d/.test(password) },
    { label: '包含特殊字符', ok: /[^a-zA-Z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const color = score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-amber-500' : score === 3 ? 'bg-blue-500' : 'bg-green-500'
  const text = score <= 1 ? '弱' : score === 2 ? '一般' : score === 3 ? '强' : '非常强'

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cn('flex-1 rounded-full transition-colors', i < score ? color : 'bg-slate-100')} />
          ))}
        </div>
        <span className={cn('text-[10px] font-medium', score <= 1 ? 'text-red-500' : score === 2 ? 'text-amber-500' : score === 3 ? 'text-blue-500' : 'text-green-500')}>{text}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map(c => (
          <span key={c.label} className={cn('text-[10px]', c.ok ? 'text-green-600' : 'text-slate-400')}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
