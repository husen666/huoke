'use client'

import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export function LoadingSpinner({ className, ...props }: React.SVGAttributes<SVGElement>) {
  return (
    <Loader2
      className={cn('h-8 w-8 animate-spin text-primary', className)}
      {...props}
    />
  )
}

export function LoadingPage() {
  return (
    <div className="flex min-h-[400px] items-center justify-center animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner />
        <p className="text-sm text-slate-400">加载中...</p>
      </div>
    </div>
  )
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200', className)}
      {...props}
    />
  )
}
