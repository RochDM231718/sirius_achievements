import { useToast } from '@/hooks/useToast'

export function ToastViewport() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.tone || 'info'}`}
          onClick={() => removeToast(toast.id)}
        >
          <span className="toast__dot" aria-hidden="true" />
          <div className="toast__content">
            <p className="toast__title">{toast.title}</p>
            {toast.message ? <p className="toast__body">{toast.message}</p> : null}
          </div>
        </button>
      ))}
    </div>
  )
}
