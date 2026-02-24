'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, _hydrated } = useAuthStore()

  useEffect(() => {
    if (_hydrated && !isAuthenticated) {
      router.replace('/service-login')
    }
  }, [_hydrated, isAuthenticated, router])

  if (!_hydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {children}
    </div>
  )
}
