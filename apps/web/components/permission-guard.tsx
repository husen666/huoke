'use client'

import { usePermissions } from '@/hooks/use-permissions'

interface PermissionGuardProps {
  permissions?: string[]
  anyPermissions?: string[]
  minRole?: 'owner' | 'admin' | 'manager' | 'agent' | 'viewer'
  fallback?: React.ReactNode
  children: React.ReactNode
}

const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  agent: 40,
  viewer: 10,
}

export function PermissionGuard({ permissions, anyPermissions, minRole, fallback = null, children }: PermissionGuardProps) {
  const { role, hasPermission, hasAnyPermission } = usePermissions()

  if (minRole) {
    const userLevel = ROLE_LEVELS[role] ?? 0
    const requiredLevel = ROLE_LEVELS[minRole] ?? 0
    if (userLevel < requiredLevel) return <>{fallback}</>
  }

  if (permissions && !hasPermission(...permissions)) return <>{fallback}</>
  if (anyPermissions && !hasAnyPermission(...anyPermissions)) return <>{fallback}</>

  return <>{children}</>
}
