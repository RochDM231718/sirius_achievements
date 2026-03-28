import { useEffect, useState } from 'react'

import { documentsApi } from '@/api/documents'
import { cn } from '@/utils/cn'

interface DocumentPreviewImageProps {
  documentId: number
  alt: string
  className?: string
  fallbackClassName?: string
}

export function DocumentPreviewImage({
  documentId,
  alt,
  className,
  fallbackClassName,
}: DocumentPreviewImageProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let isDisposed = false
    let objectUrl: string | null = null

    setSrc(null)

    void documentsApi.preview(documentId)
      .then(({ data }) => {
        const blob = data instanceof Blob ? data : new Blob([data])
        objectUrl = URL.createObjectURL(blob)

        if (isDisposed) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        setSrc(objectUrl)
      })
      .catch(() => {
        if (!isDisposed) {
          setSrc(null)
        }
      })

    return () => {
      isDisposed = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [documentId])

  if (src) {
    return <img src={src} className={className} alt={alt} loading="lazy" />
  }

  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-slate-100 text-slate-300', fallbackClassName)}>
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  )
}
