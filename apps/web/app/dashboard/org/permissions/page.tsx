'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getOrgRoles, getAllPermissions, type Role, type Permission } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Check, X, Shield, Crown, Users, Eye, KeyRound, Lock } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/role-config'

const ROLE_HEADER_COLORS: Record<string, string> = {
  owner: 'bg-amber-50 text-amber-700',
  admin: 'bg-blue-50 text-blue-700',
  agent: 'bg-emerald-50 text-emerald-700',
  viewer: 'bg-slate-50 text-slate-600',
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="h-4 w-4" />,
  admin: <Shield className="h-4 w-4" />,
  agent: <Users className="h-4 w-4" />,
  viewer: <Eye className="h-4 w-4" />,
}

export default function PermissionsPage() {
  const { data: rolesRes, isLoading: rolesLoading } = useQuery({ queryKey: ['org-roles'], queryFn: getOrgRoles })
  const rolesList: Role[] = rolesRes?.data ?? []

  const { data: permsRes, isLoading: permsLoading } = useQuery({ queryKey: ['org-permissions'], queryFn: getAllPermissions })
  const allPerms: Permission[] = permsRes?.data ?? []

  const permsByModule = useMemo(() => allPerms.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p)
    return acc
  }, {}), [allPerms])

  const sortedRoles = useMemo(() => [...rolesList].sort((a, b) => b.level - a.level), [rolesList])

  if (rolesLoading || permsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (rolesList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <KeyRound className="h-12 w-12" />
        <p>请先在「角色管理」中初始化系统角色</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">权限矩阵</h2>
        <p className="text-sm text-slate-500 mt-0.5">查看各角色的权限分配情况，可在「角色管理」中编辑</p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center"><Check className="h-3 w-3 text-emerald-600" /></span> 已授权</span>
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center"><X className="h-3 w-3 text-slate-300" /></span> 未授权</span>
        <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-slate-400" /> 系统角色（不可修改）</span>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-700 px-5 py-3 sticky left-0 bg-white z-10 min-w-[200px]">
                  权限
                </th>
                {sortedRoles.map(role => (
                  <th key={role.id} className="text-center px-4 py-3 whitespace-nowrap">
                    <div className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg', ROLE_HEADER_COLORS[role.name] ?? 'bg-slate-50 text-slate-600')}>
                      {ROLE_ICONS[role.name] ?? <Shield className="h-4 w-4" />}
                      {ROLE_LABELS[role.name] ?? role.name}
                      {role.isSystem && <Lock className="h-3 w-3 opacity-50" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(permsByModule).map(([module, perms]) => (
                <>
                  <tr key={`module-${module}`} className="bg-slate-50/80">
                    <td colSpan={sortedRoles.length + 1} className="px-5 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                      {module}
                    </td>
                  </tr>
                  {perms.map(perm => (
                    <tr key={perm.key} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                      <td className="px-5 py-2.5 sticky left-0 bg-white z-10">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-slate-700 whitespace-nowrap">{perm.label}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{perm.key}</span>
                        </div>
                      </td>
                      {sortedRoles.map(role => {
                        const has = role.permissions.includes(perm.key)
                        return (
                          <td key={role.id} className="text-center px-4 py-2.5">
                            <span className={cn(
                              'inline-flex items-center justify-center w-7 h-7 rounded-lg',
                              has ? 'bg-emerald-50' : 'bg-slate-50'
                            )}>
                              {has
                                ? <Check className="h-4 w-4 text-emerald-500" />
                                : <X className="h-3.5 w-3.5 text-slate-300" />
                              }
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {sortedRoles.map(role => {
          const count = role.permissions.length
          const total = allPerms.length
          const pct = total > 0 ? Math.round(count / total * 100) : 0
          return (
            <Card key={role.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br text-white',
                    role.name === 'owner' ? 'from-amber-500 to-orange-500' :
                    role.name === 'admin' ? 'from-blue-500 to-indigo-500' :
                    role.name === 'agent' ? 'from-emerald-500 to-teal-500' : 'from-slate-400 to-slate-500'
                  )}>
                    {ROLE_ICONS[role.name] ?? <Shield className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 capitalize">{ROLE_LABELS[role.name] ?? role.name}</p>
                    <p className="text-[10px] text-slate-400">等级 {role.level}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500">{count}/{total} 项权限</span>
                    <span className="font-semibold text-slate-700">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
