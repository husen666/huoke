'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOrgMembersDetail, updateOrgMember, resetMemberPassword, removeMember,
  getOrgRoles, seedOrgRoles, createInvitation, getInvitations, revokeInvitation,
  getDepartments,
  type OrgMemberDetail, type Invitation, type Role, type Department,
} from '@/lib/api'
import { PermissionGuard } from '@/components/permission-guard'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePlan, UpgradeBanner } from '@/components/plan-guard'
import {
  Search, UserPlus, Shield, MoreHorizontal, KeyRound,
  Mail, Phone, Clock, X, Copy, Trash2, ArrowUpDown,
  UserX, UserCheck, Users, Crown as CrownIcon, Eye,
} from 'lucide-react'
import { ROLE_LABELS } from '@/lib/role-config'
import { useConfirm } from '@/components/ui/confirm-dialog'

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700 border-amber-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  agent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <CrownIcon className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  agent: <Users className="h-3 w-3" />,
  viewer: <Eye className="h-3 w-3" />,
}

export default function OrgMembersPage() {
  const { user } = useAuthStore()
  const confirm = useConfirm()
  const { isAtLimit } = usePlan()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [editMember, setEditMember] = useState<OrgMemberDetail | null>(null)
  const [resetPwdMember, setResetPwdMember] = useState<OrgMemberDetail | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('agent')
  const [showActions, setShowActions] = useState<string | null>(null)
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'lastLogin' | 'createdAt'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { data: membersRes, isLoading } = useQuery({
    queryKey: ['org-members', statusFilter],
    queryFn: () => getOrgMembersDetail(statusFilter),
  })
  const members: OrgMemberDetail[] = membersRes?.data ?? []

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments })
  const deptsList: Department[] = deptsRes?.data ?? []

  const { data: rolesRes, isLoading: rolesLoading } = useQuery({ queryKey: ['org-roles'], queryFn: getOrgRoles })
  const rolesList: Role[] = rolesRes?.data ?? []

  const { data: invRes } = useQuery({ queryKey: ['org-invitations'], queryFn: getInvitations })
  const pendingInvitations: Invitation[] = (invRes?.data ?? []).filter(i => i.status === 'pending')

  const seedMut = useMutation({
    mutationFn: seedOrgRoles,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-roles'] }) },
    onError: () => {},
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateOrgMember>[1] }) => updateOrgMember(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-members'] }); setEditMember(null); toast.success('更新成功') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const resetPwdMut = useMutation({
    mutationFn: ({ id, pwd }: { id: string; pwd: string }) => resetMemberPassword(id, pwd),
    onSuccess: () => { setResetPwdMember(null); setNewPassword(''); toast.success('密码已重置') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '重置失败'),
  })

  const inviteMut = useMutation({
    mutationFn: () => createInvitation({ email: inviteEmail || undefined, role: inviteRole }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-invitations'] }); setInviteEmail(''); setShowInvite(false); toast.success('邀请已发送') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '邀请失败'),
  })

  const revokeMut = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-invitations'] }); toast.success('邀请已撤销') },
  })

  const deleteMut = useMutation({
    mutationFn: removeMember,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-members'] }); toast.success('成员已移除') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '移除失败'),
  })

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const filteredMembers = useMemo(() => members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false
    if (deptFilter !== 'all') {
      if (deptFilter === '__none__') { if (m.departmentId) return false }
      else if (m.departmentId !== deptFilter) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  }), [members, roleFilter, deptFilter, search])

  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, manager: 2, agent: 3, viewer: 4 }
  const sortedMembers = useMemo(() => [...filteredMembers].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'zh')
    else if (sortBy === 'role') cmp = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
    else if (sortBy === 'lastLogin') cmp = (new Date(b.lastLoginAt ?? 0).getTime()) - (new Date(a.lastLoginAt ?? 0).getTime())
    else if (sortBy === 'createdAt') cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return sortDir === 'desc' ? -cmp : cmp
  }), [filteredMembers, sortBy, sortDir])

  const stats = useMemo(() => ({
    total: members.length,
    active: members.filter(m => m.status === 'active').length,
    admin: members.filter(m => m.role === 'admin' || m.role === 'owner').length,
    agent: members.filter(m => m.role === 'agent').length,
  }), [members])

  const copyInviteLink = useCallback((code: string) => {
    const link = `${window.location.origin}/invite/${code}`
    navigator.clipboard.writeText(link)
    toast.success('邀请链接已复制')
  }, [])

  const seeded = useRef(false)
  useEffect(() => {
    if (rolesList.length === 0 && !rolesLoading && !seeded.current) {
      seeded.current = true
      seedMut.mutate()
    }
  }, [rolesList.length, rolesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {isAtLimit('seats') && <UpgradeBanner resource="seats" label="团队席位" />}
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '总成员', value: stats.total, icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: '活跃成员', value: stats.active, icon: UserCheck, color: 'text-emerald-600 bg-emerald-50' },
          { label: '管理员', value: stats.admin, icon: Shield, color: 'text-amber-600 bg-amber-50' },
          { label: '客服人员', value: stats.agent, icon: Users, color: 'text-violet-600 bg-violet-50' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索姓名或邮箱..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="min-w-[120px]">
          <Select
            value={statusFilter}
            onChange={v => setStatusFilter(v as 'active' | 'inactive' | 'all')}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'active', label: '活跃' },
              { value: 'inactive', label: '已禁用' },
            ]}
          />
        </div>
        <div className="min-w-[120px]">
          <Select
            value={roleFilter}
            onChange={v => setRoleFilter(v)}
            options={[
              { value: 'all', label: '全部角色' },
              { value: 'owner', label: '所有者' },
              { value: 'admin', label: '管理员' },
              { value: 'agent', label: '客服' },
              { value: 'viewer', label: '只读' },
            ]}
          />
        </div>
        {deptsList.length > 0 && (
          <div className="min-w-[120px]">
            <Select
              value={deptFilter}
              onChange={v => setDeptFilter(v)}
              options={[
                { value: 'all', label: '全部部门' },
                { value: '__none__', label: '未分配部门' },
                ...deptsList.map(d => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {pendingInvitations.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => copyInviteLink(pendingInvitations[0].code)} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              复制邀请链接
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowInvite(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            邀请成员
          </Button>
        </div>
      </div>

      {/* Members Table */}
      <Card className="overflow-visible">
        <CardContent className="p-0 overflow-visible">
          <div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('name')}>
                    <span className="inline-flex items-center gap-1">成员 {sortBy === 'name' && <ArrowUpDown className="h-3 w-3" />}</span>
                  </th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('role')}>
                    <span className="inline-flex items-center gap-1">角色 {sortBy === 'role' && <ArrowUpDown className="h-3 w-3" />}</span>
                  </th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 hidden md:table-cell">部门 / 团队</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 hidden md:table-cell">状态</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 hidden lg:table-cell cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('lastLogin')}>
                    <span className="inline-flex items-center gap-1">最后登录 {sortBy === 'lastLogin' && <ArrowUpDown className="h-3 w-3" />}</span>
                  </th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 hidden lg:table-cell cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('createdAt')}>
                    <span className="inline-flex items-center gap-1">加入时间 {sortBy === 'createdAt' && <ArrowUpDown className="h-3 w-3" />}</span>
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">加载中...</td></tr>
                ) : sortedMembers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12">
                    <Search className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">{search || roleFilter !== 'all' || deptFilter !== 'all' ? '没有匹配的成员' : '暂无成员'}</p>
                    {(search || roleFilter !== 'all' || deptFilter !== 'all') && (
                      <button onClick={() => { setSearch(''); setRoleFilter('all'); setDeptFilter('all') }} className="text-xs text-primary hover:underline mt-1">清除筛选</button>
                    )}
                  </td></tr>
                ) : sortedMembers.map(m => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                            {m.name}
                            {m.id === user?.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">我</span>}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" />{m.email}</span>
                            {m.phone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{m.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border', ROLE_COLORS[m.role] ?? ROLE_COLORS.viewer)}>
                        {ROLE_ICONS[m.role] ?? ROLE_ICONS.viewer}
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="space-y-1">
                        {m.departmentName ? (
                          <span className="inline-block text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">{m.departmentName}</span>
                        ) : (
                          <span className="text-xs text-slate-300">未分配</span>
                        )}
                        {m.teams && m.teams.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {m.teams.map(t => (
                              <span key={t.id} className="inline-block text-[10px] bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5">{t.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant={m.status === 'active' ? 'default' : 'secondary'}>
                        {m.status === 'active' ? '活跃' : '已禁用'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400">
                      {m.lastLoginAt ? (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(m.lastLoginAt).toLocaleDateString('zh-CN')}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400">
                      {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.role !== 'owner' && m.id !== user?.id && (
                        <div className="relative inline-block">
                          <button
                            onClick={() => setShowActions(showActions === m.id ? null : m.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {showActions === m.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setShowActions(null)} />
                              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1">
                                <button onClick={() => { setEditMember(m); setShowActions(null) }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
                                  <Shield className="h-3.5 w-3.5 text-slate-400" /> 编辑信息
                                </button>
                                <button onClick={() => { setResetPwdMember(m); setShowActions(null) }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
                                  <KeyRound className="h-3.5 w-3.5 text-slate-400" /> 重置密码
                                </button>
                                <div className="border-t border-slate-100 my-1" />
                                {m.status === 'active' ? (
                                  <button onClick={() => { updateMut.mutate({ id: m.id, data: { status: 'inactive' } }); setShowActions(null) }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2">
                                    <UserX className="h-3.5 w-3.5" /> 禁用账号
                                  </button>
                                ) : (
                                  <button onClick={() => { updateMut.mutate({ id: m.id, data: { status: 'active' } }); setShowActions(null) }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 text-emerald-600 flex items-center gap-2">
                                    <UserCheck className="h-3.5 w-3.5" /> 启用账号
                                  </button>
                                )}
                                <button onClick={async () => {
                                    const ok = await confirm({ title: '确认移除', description: `确定将 ${m.name} 从组织中移除？此操作不可撤销。`, confirmText: '移除', variant: 'danger' })
                                    if (!ok) return
                                    deleteMut.mutate(m.id); setShowActions(null)
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2">
                                  <Trash2 className="h-3.5 w-3.5" /> 移除成员
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              待接受的邀请 ({pendingInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {pendingInvitations.map(inv => (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-700">{inv.email || '通用邀请链接'}</p>
                      <p className="text-xs text-slate-400">角色: {ROLE_LABELS[inv.role] ?? inv.role} · 过期: {new Date(inv.expiresAt).toLocaleDateString('zh-CN')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => copyInviteLink(inv.code)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="复制链接">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => revokeMut.mutate(inv.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="撤销">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Member Dialog */}
      {editMember && (
        <EditMemberDialog
          member={editMember}
          rolesList={rolesList}
          departments={deptsList}
          loading={updateMut.isPending}
          onClose={() => setEditMember(null)}
          onSubmit={(data) => updateMut.mutate({ id: editMember.id, data })}
        />
      )}

      {/* Reset Password Dialog */}
      {resetPwdMember && (
        <Dialog open onOpenChange={(v) => { if (!v) { setResetPwdMember(null); setNewPassword('') } }} title={`重置密码 — ${resetPwdMember.name}`}>
          <form onSubmit={e => {
            e.preventDefault()
            if (newPassword.length < 6) { toast.error('密码至少6位'); return }
            resetPwdMut.mutate({ id: resetPwdMember.id, pwd: newPassword })
          }} className="space-y-4">
            <p className="text-sm text-slate-500">将为 <span className="font-medium text-slate-700">{resetPwdMember.email}</span> 设置新密码</p>
            <Input
              type="password"
              placeholder="输入新密码（至少6位）"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => { setResetPwdMember(null); setNewPassword('') }}>取消</Button>
              <Button variant="primary" size="sm" type="submit" loading={resetPwdMut.isPending}>确认重置</Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Invite Dialog */}
      {showInvite && (
        <Dialog open onOpenChange={(v) => { if (!v) setShowInvite(false) }} title="邀请新成员">
          <form onSubmit={e => { e.preventDefault(); inviteMut.mutate() }} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">邮箱（可选）</label>
              <Input type="email" placeholder="留空则生成通用邀请链接" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">角色</label>
              <Select
                value={inviteRole}
                onChange={v => setInviteRole(v)}
                options={[
                  { value: 'admin', label: '管理员' },
                  { value: 'agent', label: '客服' },
                  { value: 'viewer', label: '只读' },
                ]}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setShowInvite(false)}>取消</Button>
              <Button variant="primary" size="sm" type="submit" loading={inviteMut.isPending}>发送邀请</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

function EditMemberDialog({ member, rolesList, departments, loading, onClose, onSubmit }: {
  member: OrgMemberDetail
  rolesList: Role[]
  departments: Department[]
  loading: boolean
  onClose: () => void
  onSubmit: (data: { name: string; phone: string; role: string; departmentId: string | null }) => void
}) {
  const [name, setName] = useState(member.name)
  const [phone, setPhone] = useState(member.phone ?? '')
  const [role, setRole] = useState(member.role)
  const [departmentId, setDepartmentId] = useState<string>(member.departmentId ?? '__none__')

  const roleOptions = rolesList.length > 0
    ? rolesList.filter(r => r.name !== 'owner').map(r => ({ value: r.name, label: ROLE_LABELS[r.name] ?? r.name }))
    : [{ value: 'admin', label: '管理员' }, { value: 'agent', label: '客服' }, { value: 'viewer', label: '只读' }]

  const deptOptions = [
    { value: '__none__', label: '不分配部门' },
    ...departments.map(d => ({ value: d.id, label: d.name })),
  ]

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }} title={`编辑成员 — ${member.name}`}>
      <form onSubmit={e => {
        e.preventDefault()
        onSubmit({ name, phone, role, departmentId: departmentId === '__none__' ? null : departmentId })
      }} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">姓名</label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">手机号</label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="选填" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">角色</label>
          <Select value={role} onChange={v => setRole(v)} options={roleOptions} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">部门</label>
          <Select value={departmentId} onChange={v => setDepartmentId(v)} options={deptOptions} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" type="submit" loading={loading}>保存</Button>
        </div>
      </form>
    </Dialog>
  )
}
