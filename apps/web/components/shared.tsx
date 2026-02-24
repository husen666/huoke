'use client'

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { AlertTriangle, Search, ArrowUpDown, CheckSquare, X } from 'lucide-react'
import { downloadCsv } from '@/lib/csv'
import { toast } from 'sonner'

// ─── PageHeader ───

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── ErrorState ───

export function ErrorState({ message = '加载数据失败' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <AlertTriangle className="h-10 w-10 mb-3 text-amber-400" />
      <p className="text-lg font-medium text-slate-600">{message}</p>
      <p className="text-sm mt-1">请检查网络连接后刷新页面重试</p>
    </div>
  )
}

// ─── EmptyState ───

export function EmptyState({
  icon: Icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>
  message: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="py-16 text-center">
      <Icon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

// ─── SearchInput ───

export function SearchInput({
  value,
  onChange,
  placeholder = '搜索...',
  className = '',
  onSearch,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  onSearch?: () => void
}) {
  return (
    <div className={`relative flex-1 min-w-[200px] ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onSearch ? (e) => { if (e.key === 'Enter') onSearch() } : undefined}
        className="pl-9"
      />
    </div>
  )
}

// ─── SortToggle ───

export function SortToggle({
  sortOrder,
  onToggle,
}: {
  sortOrder: 'desc' | 'asc'
  onToggle: () => void
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-10 px-3"
      onClick={onToggle}
    >
      <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
      {sortOrder === 'desc' ? '降序' : '升序'}
    </Button>
  )
}

// ─── FilterBar ───

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
    </div>
  )
}

// ─── BatchActionBar ───

export function BatchActionBar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 mb-4">
      <CheckSquare className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-primary">已选择 {count} 条</span>
      <div className="flex gap-2 ml-auto">
        {children}
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> 取消选择
        </Button>
      </div>
    </div>
  )
}

// ─── DeleteConfirmDialog ───

export function DeleteConfirmDialog({
  open,
  onClose,
  entityLabel,
  entityName,
  onConfirm,
  loading,
}: {
  open: boolean
  onClose: () => void
  entityLabel: string
  entityName?: string
  onConfirm: () => void
  loading?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onClose} title="确认删除">
      <p className="text-sm text-slate-600 mb-4">
        确定要删除{entityLabel}
        {entityName ? `「${entityName}」` : ''}
        吗？此操作不可恢复。
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>删除</Button>
      </div>
    </Dialog>
  )
}

// ─── Hooks ───

export function useListParams(defaults?: {
  pageSize?: number
  sortBy?: string
  sortOrder?: 'desc' | 'asc'
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaults?.pageSize ?? 20)
  const [sortBy, setSortBy] = useState(defaults?.sortBy ?? 'updatedAt')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>(defaults?.sortOrder ?? 'desc')

  const resetPage = useCallback(() => setPage(1), [])

  const toggleSortOrder = useCallback(() => {
    setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
  }, [])

  const setPageSizeAndReset = useCallback((size: number) => {
    setPageSize(size)
    setPage(1)
  }, [])

  const params = useMemo(() => ({
    page: String(page),
    pageSize: String(pageSize),
    sortBy,
    sortOrder,
  }), [page, pageSize, sortBy, sortOrder])

  return {
    page, setPage, pageSize, setPageSize: setPageSizeAndReset,
    sortBy, setSortBy, sortOrder, setSortOrder, toggleSortOrder,
    resetPage, params,
  }
}

export function useRowSelection<T extends { id: string }>(list: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const listIds = useMemo(() => list.map(r => r.id).join(','), [list])
  useEffect(() => { setSelectedIds(new Set()) }, [listIds])

  const isAllSelected = list.length > 0 && list.every((r) => selectedIds.has(r.id))

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = list.every((r) => prev.has(r.id))
      return allSelected ? new Set() : new Set(list.map((r) => r.id))
    })
  }, [list])

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  return { selectedIds, isAllSelected, toggleAll, toggleOne, clearSelection, setSelectedIds }
}

export function useExport<T>(
  fetchFn: () => Promise<{ data?: T[] }>,
  columns: { key: string; label: string; transform?: (v: unknown) => string }[],
  filenamePrefix: string,
) {
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const res = await fetchFn()
      const rows = (res.data || []) as unknown as Record<string, unknown>[]
      downloadCsv(rows, columns, `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`)
      toast.success('导出成功')
    } catch {
      toast.error('导出失败')
    }
    setExporting(false)
  }, [fetchFn, columns, filenamePrefix])

  return { exporting, handleExport }
}
