'use client'
import { memo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

function getPageNumbers(page: number, totalPages: number): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)

  if (start > 2) pages.push('ellipsis-start')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < totalPages - 1) pages.push('ellipsis-end')
  pages.push(totalPages)

  return pages
}

export const Pagination = memo(function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100] }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const isFirst = safePage <= 1;
  const isLast = safePage >= totalPages;
  const pages = getPageNumbers(safePage, totalPages);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)

  return (
    <nav aria-label="分页导航" className="flex flex-wrap items-center justify-between gap-4 py-3 mt-4 border-t border-slate-200/60">
      {/* Left: total & page size */}
      <div className="flex items-center gap-3 text-[13px] text-slate-500">
        <span>
          显示 <span className="font-medium text-slate-700">{from}-{to}</span> 条，共 <span className="font-medium text-slate-700">{total}</span> 条
        </span>
        {onPageSizeChange && (
          <div className="relative">
            <select
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="appearance-none h-8 pl-3 pr-7 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-600 outline-none hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors cursor-pointer"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={String(size)}>{size} 条/页</option>
              ))}
            </select>
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none rotate-90" />
          </div>
        )}
      </div>

      {/* Right: page buttons */}
      <div className="flex items-center gap-1">
        <button
          disabled={isFirst}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="上一页"
          className={cn(
            'inline-flex items-center justify-center h-8 w-8 rounded-lg text-sm transition-colors',
            isFirst
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map(p =>
          typeof p === 'string' ? (
            <span key={p} aria-hidden="true" className="w-8 h-8 flex items-center justify-center text-xs text-slate-300 select-none">···</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`第 ${p} 页`}
              aria-current={p === safePage ? 'page' : undefined}
              className={cn(
                'w-8 h-8 rounded-lg text-[13px] font-medium transition-all',
                p === safePage
                  ? 'bg-primary text-white shadow-sm shadow-primary/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          disabled={isLast}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="下一页"
          className={cn(
            'inline-flex items-center justify-center h-8 w-8 rounded-lg text-sm transition-colors',
            isLast
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  )
})
