'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOrgRoles, createOrgRole, updateOrgRole, deleteOrgRole,
  getAllPermissions, seedOrgRoles,
  type Role, type Permission,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Shield, Plus, Pencil, Trash2, Lock, Users,
  ChevronDown, ChevronRight, Check, Crown, Eye,
} from 'lucide-react'

const ROLE_COLORS: Record<string, string> = {
  owner: 'from-amber-500 to-orange-500',
  admin: 'from-blue-500 to-indigo-500',
  agent: 'from-emerald-500 to-teal-500',
  viewer: 'from-slate-400 to-slate-500',
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="h-5 w-5 text-white" />,
  admin: <Shield className="h-5 w-5 text-white" />,
  agent: <Users className="h-5 w-5 text-white" />,
  viewer: <Eye className="h-5 w-5 text-white" />,
}

export default function RolesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)

  const { data: rolesRes, isLoading } = useQuery({ queryKey: ['org-roles'], queryFn: getOrgRoles })
  const rolesList: Role[] = rolesRes?.data ?? []

  const { data: permsRes } = useQuery({ queryKey: ['org-permissions'], queryFn: getAllPermissions })
  const allPerms: Permission[] = permsRes?.data ?? []

  const seedMut = useMutation({
    mutationFn: seedOrgRoles,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-roles'] }); toast.success('系统角色已初始化') },
  })

  const createMut = useMutation({
    mutationFn: createOrgRole,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-roles'] }); setShowCreate(false); toast.success('角色已创建') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateOrgRole>[1] }) => updateOrgRole(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-roles'] }); setEditRole(null); toast.success('角色已更新') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteOrgRole,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-roles'] }); toast.success('角色已删除') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const permsByModule = allPerms.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p)
    return acc
  }, {})

  if (rolesList.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Shield className="h-12 w-12 text-slate-300" />
        <p className="text-slate-500">尚未初始化角色系统</p>
        <Button variant="primary" onClick={() => seedMut.mutate()} loading={seedMut.isPending}>
          初始化系统角色
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">角色管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理组织角色及其权限配置</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建角色
        </Button>
      </div>

      {/* Role Cards */}
      <div className="grid gap-4">
        {rolesList.map(role => {
          const isExpanded = expandedRole === role.id
          const gradient = ROLE_COLORS[role.name] ?? 'from-slate-500 to-slate-600'
          const icon = ROLE_ICONS[role.name] ?? <Shield className="h-5 w-5 text-white" />
          return (
            <Card key={role.id} className="overflow-hidden">
              <div className="flex items-stretch">
                <div className={cn('w-16 flex items-center justify-center bg-gradient-to-br shrink-0', gradient)}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{{ owner: '所有者', admin: '管理员', manager: '主管', agent: '客服', viewer: '查看者' }[role.name] ?? role.name}</h3>
                        {role.isSystem && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex items-center gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> 系统
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                          等级 {role.level}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{role.description || '暂无描述'}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {role.permissions.length} 项权限
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-4">
                      <button onClick={() => setEditRole(role)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="编辑权限">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!role.isSystem && (
                        <button onClick={async () => {
                            const ok = await confirm({ title: '确认删除', description: '删除后无法恢复，确定继续吗？', confirmText: '删除', variant: 'danger' })
                            if (!ok) return
                            deleteMut.mutate(role.id)
                          }}
                          className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">权限列表</p>
                      <div className="grid gap-3">
                        {Object.entries(permsByModule).map(([module, perms]) => {
                          const activeCount = perms.filter(p => role.permissions.includes(p.key)).length
                          if (activeCount === 0) return null
                          return (
                            <div key={module}>
                              <p className="text-xs font-medium text-slate-600 mb-1">{module} ({activeCount}/{perms.length})</p>
                              <div className="flex flex-wrap gap-1.5">
                                {perms.map(p => {
                                  const active = role.permissions.includes(p.key)
                                  return (
                                    <span key={p.key} className={cn(
                                      'text-[11px] px-2 py-0.5 rounded-full border',
                                      active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                                    )}>
                                      {active && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                                      {p.label}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Create / Edit Dialog */}
      {(showCreate || editRole) && (
        <RoleFormDialog
          role={editRole}
          allPerms={allPerms}
          permsByModule={permsByModule}
          onClose={() => { setShowCreate(false); setEditRole(null) }}
          onSubmit={(data) => {
            if (editRole) {
              updateMut.mutate({ id: editRole.id, data })
            } else {
              createMut.mutate(data as Parameters<typeof createOrgRole>[0])
            }
          }}
          loading={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  )
}

function RoleFormDialog({ role, allPerms, permsByModule, onClose, onSubmit, loading }: {
  role: Role | null
  allPerms: Permission[]
  permsByModule: Record<string, Permission[]>
  onClose: () => void
  onSubmit: (data: { name: string; description?: string; level?: number; permissions: string[] }) => void
  loading: boolean
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [level, setLevel] = useState(role?.level ?? 10)
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []))

  const togglePerm = (key: string) => {
    setPerms(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleModule = (modulePerms: Permission[]) => {
    const allActive = modulePerms.every(p => perms.has(p.key))
    setPerms(prev => {
      const next = new Set(prev)
      modulePerms.forEach(p => {
        if (allActive) next.delete(p.key)
        else next.add(p.key)
      })
      return next
    })
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }} title={role ? `编辑角色 — ${role.name}` : '新建角色'}>
      <form onSubmit={e => {
        e.preventDefault()
        if (!name.trim()) { toast.error('角色名称不能为空'); return }
        if (role?.isSystem) {
          onSubmit({ name: role.name, description: description.trim() || undefined, permissions: Array.from(perms) })
        } else {
          onSubmit({ name: name.trim(), description: description.trim() || undefined, level, permissions: Array.from(perms) })
        }
      }} className="space-y-5 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">角色名称</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="如: sales_manager" required disabled={role?.isSystem} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">权限等级 (1-99)</label>
            <Input type="number" min={1} max={99} value={level} onChange={e => setLevel(Number(e.target.value))} disabled={role?.isSystem} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">描述</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="角色职责描述" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-700">权限配置</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPerms(new Set(allPerms.map(p => p.key)))}
                className="text-xs text-primary hover:underline">全选</button>
              <button type="button" onClick={() => setPerms(new Set())}
                className="text-xs text-slate-400 hover:underline">清空</button>
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
            {Object.entries(permsByModule).map(([module, modulePerms]) => {
              const activeCount = modulePerms.filter(p => perms.has(p.key)).length
              const allActive = activeCount === modulePerms.length
              return (
                <div key={module}>
                  <div className="flex items-center gap-2 mb-2">
                    <button type="button" onClick={() => toggleModule(modulePerms)}
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                        allActive ? 'bg-primary border-primary' : activeCount > 0 ? 'bg-primary/30 border-primary/50' : 'border-slate-300'
                      )}>
                      {(allActive || activeCount > 0) && <Check className="h-3 w-3 text-white" />}
                    </button>
                    <span className="text-xs font-semibold text-slate-700">{module}</span>
                    <span className="text-[10px] text-slate-400">({activeCount}/{modulePerms.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-6">
                    {modulePerms.map(p => (
                      <label key={p.key} className={cn(
                        'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all',
                        perms.has(p.key) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      )}>
                        <input type="checkbox" checked={perms.has(p.key)} onChange={() => togglePerm(p.key)} className="hidden" />
                        {perms.has(p.key) && <Check className="h-3 w-3" />}
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" type="submit" loading={loading}>
            {role ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
