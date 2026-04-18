import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

import { LoadingSpinner } from './LoadingSpinner'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

type Props = {
  src: string
  className?: string
}

export function PdfViewer({ src, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!src) return
    setIsLoading(true)
    setError(null)

    let cancelled = false

    const renderPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(src)
        const pdf = await loadingTask.promise
        if (cancelled) return

        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) break
          const page = await pdf.getPage(pageNum)
          if (cancelled) break

          const scale = Math.min(1.5, (container.clientWidth || 800) / page.getViewport({ scale: 1 }).width)
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.cssText = `width:100%;display:block;border-radius:4px;${pageNum < pdf.numPages ? 'margin-bottom:8px' : ''}`
          container.appendChild(canvas)

          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: ctx as any, canvas, viewport }).promise
        }

        if (!cancelled) setIsLoading(false)
      } catch {
        if (!cancelled) {
          setError('Не удалось загрузить PDF. Попробуйте скачать файл.')
          setIsLoading(false)
        }
      }
    }

    void renderPdf()
    return () => { cancelled = true }
  }, [src])

  return (
    <div className={`relative overflow-auto ${className ?? 'w-full h-full bg-slate-100'}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80 z-10">
          <LoadingSpinner />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
          <div className="bg-surface rounded-xl border border-red-100 px-6 py-5 text-sm text-red-600 shadow-sm text-center">{error}</div>
        </div>
      )}
      <div ref={containerRef} className="p-3" />
    </div>
  )
}
