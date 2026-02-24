'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMyPermissions } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

export function usePermissions() {
  const { user } = useAuthStore()

  const { data } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: getMyPermissions,
    staleTime: 5 * 60_000,
    enabled: !!user,
  })

  const role = data?.data?.role ?? user?.role ?? 'viewer'
  const permissions = useMemo(() => data?.data?.permissions ?? [], [data])
  const isAdmin = role === 'owner' || role === 'admin'

  const hasPermission = useCallback((...keys: string[]) => {
    if (isAdmin) return true
    if (permissions.includes('*')) return true
    return keys.every(k => permissions.includes(k))
  }, [isAdmin, permissions])

  const hasAnyPermission = useCallback((...keys: string[]) => {
    if (isAdmin) return true
    if (permissions.includes('*')) return true
    return keys.some(k => permissions.includes(k))
  }, [isAdmin, permissions])

  return { role, permissions, isAdmin, hasPermission, hasAnyPermission }
}
