'use client'
import { useState, useEffect, useRef, createContext, useContext, useCallback, type ReactNode } from 'react'
import { AlertTriangle, Trash2, Info } from 'lucide-react'
import { Button } from './button'

type ConfirmVariant = 'danger' | 'warning' | 'info'

interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: ((value: boolean) => void) | null
  }>({ open: false, options: { title: '' }, resolve: null })
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      previousFocusRef.current = document.activeElement as HTMLElement
      setState({ open: true, options, resolve })
    })
  }, [])

  const handleClose = useCallback((result: boolean) => {
    state.resolve?.(result)
    setState(prev => ({ ...prev, open: false, resolve: null }))
    previousFocusRef.current?.focus()
  }, [state.resolve])

  useEffect(() => {
    if (state.open) {
      requestAnimationFrame(() => confirmBtnRef.current?.focus())
    }
  }, [state.open])

  useEffect(() => {
    if (!state.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state.open, handleClose])

  const variantConfig = {
    danger: { icon: Trash2, iconBg: 'bg-red-50', iconColor: 'text-red-500', btnVariant: 'danger' as const },
    warning: { icon: AlertTriangle, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', btnVariant: 'warning' as const },
    info: { icon: Info, iconBg: 'bg-blue-50', iconColor: 'text-blue-500', btnVariant: 'primary' as const },
  }

  const config = variantConfig[state.options.variant || 'danger']
  const Icon = config.icon

  const btnClasses: Record<string, string> = {
    danger: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-600 text-white',
    primary: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600 text-white',
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby={state.options.description ? 'confirm-dialog-desc' : undefined}
          onClick={() => handleClose(false)}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className={`rounded-full p-3 mb-4 ${config.iconBg}`} aria-hidden="true">
                <Icon className={`h-6 w-6 ${config.iconColor}`} />
              </div>
              <h3 id="confirm-dialog-title" className="text-lg font-semibold text-slate-800 mb-1">{state.options.title}</h3>
              {state.options.description && (
                <p id="confirm-dialog-desc" className="text-sm text-slate-500 mb-5">{state.options.description}</p>
              )}
              <div className="flex gap-3 w-full">
                <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                  {state.options.cancelText || '取消'}
                </Button>
                <button
                  ref={confirmBtnRef}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${btnClasses[config.btnVariant]}`}
                  onClick={() => handleClose(true)}
                >
                  {state.options.confirmText || '确定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
