import { createContext, useEffect, useState, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  title: string
  message?: string
  tone?: ToastTone
}

interface ToastContextValue {
  toasts: ToastItem[]
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const pushToast = (toast: Omit<ToastItem, 'id'>) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
    setToasts((current) => [...current, { ...toast, id }])
  }

  const removeToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  useEffect(() => {
    if (!toasts.length) {
      return
    }

    const timeout = window.setTimeout(() => {
      setToasts((current) => current.slice(1))
    }, 4500)

    return () => window.clearTimeout(timeout)
  }, [toasts])

  return (
    <ToastContext.Provider value={{ toasts, pushToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}
