export function LoadingSpinner({ fullscreen = false }: { fullscreen?: boolean }) {
  const content = <div className="spinner" role="status" aria-label="Загрузка" />

  if (fullscreen) {
    return <div className="loading-screen">{content}</div>
  }

  return <div className="loading-indicator">{content}</div>
}
