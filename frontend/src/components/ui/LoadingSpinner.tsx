export function LoadingSpinner({ fullscreen = false }: { fullscreen?: boolean }) {
  const content = <div className="spinner" aria-label="Загрузка" />

  if (fullscreen) {
    return <div className="loading-screen">{content}</div>
  }

  return content
}
