'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getOrgInfo, updateOrgInfo, type OrgInfo } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Building2, Globe, Phone, Mail, MapPin, FileText, Save,
  Briefcase, Users, Calendar, CreditCard, Pencil, X,
} from 'lucide-react'

const INDUSTRY_OPTIONS = [
  { value: '', label: '请选择行业' },
  { value: '互联网/IT', label: '互联网/IT' },
  { value: '电子商务', label: '电子商务' },
  { value: '金融', label: '金融' },
  { value: '教育', label: '教育' },
  { value: '医疗健康', label: '医疗健康' },
  { value: '房地产', label: '房地产' },
  { value: '制造业', label: '制造业' },
  { value: '零售', label: '零售' },
  { value: '餐饮', label: '餐饮' },
  { value: '物流', label: '物流' },
  { value: '广告传媒', label: '广告传媒' },
  { value: '法律', label: '法律' },
  { value: '咨询', label: '咨询' },
  { value: '其他', label: '其他' },
]

const SCALE_OPTIONS = [
  { value: '', label: '请选择规模' },
  { value: '1-10人', label: '1-10人' },
  { value: '11-50人', label: '11-50人' },
  { value: '51-200人', label: '51-200人' },
  { value: '201-500人', label: '201-500人' },
  { value: '501-1000人', label: '501-1000人' },
  { value: '1000人以上', label: '1000人以上' },
]

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  starter: { label: '创业版', color: 'bg-blue-100 text-blue-700' },
  pro: { label: '专业版', color: 'bg-violet-100 text-violet-700' },
  enterprise: { label: '企业版', color: 'bg-amber-100 text-amber-700' },
}

export default function OrgInfoPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: orgRes, isLoading } = useQuery({ queryKey: ['org-info'], queryFn: getOrgInfo })
  const org: OrgInfo | null = orgRes?.data ?? null

  const [form, setForm] = useState({
    name: '', industry: '', scale: '', phone: '', email: '',
    website: '', address: '', description: '',
  })

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name ?? '',
        industry: org.industry ?? '',
        scale: org.scale ?? '',
        phone: org.phone ?? '',
        email: org.email ?? '',
        website: org.website ?? '',
        address: org.address ?? '',
        description: org.description ?? '',
      })
    }
  }, [org])

  const updateMut = useMutation({
    mutationFn: () => updateOrgInfo(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-info'] })
      setEditing(false)
      toast.success('企业信息已更新')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <Building2 className="h-12 w-12" />
        <p>无法获取企业信息</p>
      </div>
    )
  }

  const planInfo = PLAN_LABELS[org.plan ?? 'starter'] ?? PLAN_LABELS.starter

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">企业信息</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理企业基本信息和联系方式</p>
        </div>
        {!editing ? (
          <Button variant="primary" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil className="h-4 w-4" />
            编辑信息
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); if (org) setForm({ name: org.name ?? '', industry: org.industry ?? '', scale: org.scale ?? '', phone: org.phone ?? '', email: org.email ?? '', website: org.website ?? '', address: org.address ?? '', description: org.description ?? '' }) }} className="gap-1.5">
              <X className="h-4 w-4" />
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={() => updateMut.mutate()} loading={updateMut.isPending} className="gap-1.5">
              <Save className="h-4 w-4" />
              保存
            </Button>
          </div>
        )}
      </div>

      {/* Overview Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
              {(org.name ?? '').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-slate-900">{org.name}</h3>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${planInfo.color}`}>
                  {planInfo.label}
                </span>
                {org.industry && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{org.industry}</span>
                )}
                {org.scale && (
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{org.scale}</span>
                )}
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />创建于 {new Date(org.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              {org.description && (
                <p className="text-sm text-slate-500 mt-2">{org.description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              基本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField icon={Building2} label="企业名称" editing={editing}
              value={form.name} displayValue={org.name}
              onChange={v => setField('name', v)} required />
            <div>
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
                <Briefcase className="h-3.5 w-3.5" /> 所属行业
              </label>
              {editing ? (
                <Select value={form.industry} onChange={v => setField('industry', v)} options={INDUSTRY_OPTIONS} />
              ) : (
                <p className="text-sm text-slate-900 py-2">{org.industry || <span className="text-slate-400">未设置</span>}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
                <Users className="h-3.5 w-3.5" /> 企业规模
              </label>
              {editing ? (
                <Select value={form.scale} onChange={v => setField('scale', v)} options={SCALE_OPTIONS} />
              ) : (
                <p className="text-sm text-slate-900 py-2">{org.scale || <span className="text-slate-400">未设置</span>}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
                <FileText className="h-3.5 w-3.5" /> 企业简介
              </label>
              {editing ? (
                <textarea
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="简要描述您的企业..."
                  rows={3}
                  className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              ) : (
                <p className="text-sm text-slate-900 py-2">{org.description || <span className="text-slate-400">未设置</span>}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              联系信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField icon={Phone} label="联系电话" editing={editing}
              value={form.phone} displayValue={org.phone}
              onChange={v => setField('phone', v)} placeholder="如: 400-xxx-xxxx" />
            <FormField icon={Mail} label="企业邮箱" editing={editing}
              value={form.email} displayValue={org.email} type="email"
              onChange={v => setField('email', v)} placeholder="如: contact@company.com" />
            <FormField icon={Globe} label="企业网站" editing={editing}
              value={form.website} displayValue={org.website}
              onChange={v => setField('website', v)} placeholder="如: https://www.company.com"
              link />
            <FormField icon={MapPin} label="企业地址" editing={editing}
              value={form.address} displayValue={org.address}
              onChange={v => setField('address', v)} placeholder="详细地址" />
          </CardContent>
        </Card>
      </div>

      {/* Subscription Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            订阅信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">当前套餐</p>
              <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${planInfo.color}`}>
                {planInfo.label}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">组织 ID</p>
              <p className="text-xs font-mono text-slate-700 break-all">{org.id}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">创建时间</p>
              <p className="text-sm font-medium text-slate-700">{new Date(org.createdAt).toLocaleDateString('zh-CN')}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">最后更新</p>
              <p className="text-sm font-medium text-slate-700">{new Date(org.updatedAt).toLocaleDateString('zh-CN')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FormField({ icon: Icon, label, editing, value, displayValue, onChange, placeholder, required, type, link }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  editing: boolean
  value: string
  displayValue?: string | null
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  link?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </label>
      {editing ? (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} type={type} />
      ) : (
        <p className="text-sm text-slate-900 py-2">
          {displayValue ? (
            link ? <a href={displayValue} target="_blank" rel="noreferrer" className="text-primary hover:underline">{displayValue}</a> : displayValue
          ) : (
            <span className="text-slate-400">未设置</span>
          )}
        </p>
      )}
    </div>
  )
}
