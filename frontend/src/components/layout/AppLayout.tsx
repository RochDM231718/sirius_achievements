import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { documentsApi } from '@/api/documents'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'

type PreviewState = {
  show: boolean
  src: string
  type: 'image' | 'pdf'
  documentId: number | null
  isLoading: boolean
  error: string | null
}

type DeleteState = {
  open: boolean
  title: string
  desc: string
  onConfirm: null | (() => void | Promise<void>)
}

export function AppLayout() {
  const { user } = useAuth()
  const [preview, setPreview] = useState<PreviewState>({
    show: false,
    src: '',
    type: 'image',
    documentId: null,
    isLoading: false,
    error: null,
  })
  const [deleteState, setDeleteState] = useState<DeleteState>({
    open: false,
    title: '',
    desc: '',
    onConfirm: null,
  })
  const previewObjectUrlRef = useRef<string | null>(null)
  const previewRequestIdRef = useRef(0)

  const revokePreviewObjectUrl = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
  }

  useEffect(() => {
    const previousClassName = document.body.className
    document.body.className = 'theme-shell bg-slate-50 text-slate-800 antialiased font-sans overflow-hidden'

    return () => {
      document.body.className = previousClassName
    }
  }, [])

  useEffect(() => {
    const loadDocumentPreview = async (documentId: number, type: 'image' | 'pdf') => {
      const requestId = ++previewRequestIdRef.current

      try {
        const response = await documentsApi.preview(documentId)
        const blob = response.data instanceof Blob ? response.data : new Blob([response.data])
        const objectUrl = URL.createObjectURL(blob)

        if (requestId !== previewRequestIdRef.current) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        revokePreviewObjectUrl()
        previewObjectUrlRef.current = objectUrl

        setPreview({
          show: true,
          src: objectUrl,
          type,
          documentId,
          isLoading: false,
          error: null,
        })
      } catch {
        if (requestId !== previewRequestIdRef.current) {
          return
        }

        setPreview((current) => ({
          ...current,
          src: '',
          isLoading: false,
          error: 'Не удалось загрузить документ.',
        }))
      }
    }

    const openPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ src?: string; type?: 'image' | 'pdf'; documentId?: number }>).detail
      const type = detail?.type === 'pdf' ? 'pdf' : 'image'
      const documentId = typeof detail?.documentId === 'number' ? detail.documentId : null

      previewRequestIdRef.current += 1
      revokePreviewObjectUrl()

      setPreview({
        show: true,
        src: detail?.src ?? '',
        type,
        documentId,
        isLoading: Boolean(documentId && !detail?.src),
        error: null,
      })

      if (documentId && !detail?.src) {
        void loadDocumentPreview(documentId, type)
      }
    }

    const confirmDelete = (event: Event) => {
      const detail = (event as CustomEvent<{
        title?: string
        desc?: string
        onConfirm?: () => void | Promise<void>
      }>).detail

      setDeleteState({
        open: true,
        title: detail?.title ?? 'Вы уверены?',
        desc: detail?.desc ?? 'Это действие нельзя отменить.',
        onConfirm: detail?.onConfirm ?? null,
      })
    }

    window.addEventListener('open-preview', openPreview as EventListener)
    window.addEventListener('confirm-delete', confirmDelete as EventListener)

    return () => {
      previewRequestIdRef.current += 1
      revokePreviewObjectUrl()
      window.removeEventListener('open-preview', openPreview as EventListener)
      window.removeEventListener('confirm-delete', confirmDelete as EventListener)
    }
  }, [])

  const confirmDeleteAction = async () => {
    if (deleteState.onConfirm) {
      await deleteState.onConfirm()
    }

    setDeleteState({ open: false, title: '', desc: '', onConfirm: null })
  }

  const closePreview = () => {
    previewRequestIdRef.current += 1
    revokePreviewObjectUrl()
    setPreview({
      show: false,
      src: '',
      type: 'image',
      documentId: null,
      isLoading: false,
      error: null,
    })
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar user={user} />

      <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:pb-8 lg:p-8 bg-slate-50 scroll-smooth-ios w-full">
          <Outlet />
        </main>
      </div>

      <MobileNav user={user} />

      {preview.show ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm">
          <div className="relative bg-white rounded-xl w-full max-w-4xl h-[85dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Просмотр документа</h3>
              <button
                type="button"
                onClick={closePreview}
                className="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden p-2 md:p-6">
              {preview.isLoading ? (
                <div className="w-full max-w-sm">
                  <LoadingSpinner />
                </div>
              ) : preview.error ? (
                <div className="rounded-xl border border-red-100 bg-white px-6 py-5 text-sm text-red-600 shadow-sm">
                  {preview.error}
                </div>
              ) : preview.type === 'image' ? (
                <img src={preview.src} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
              ) : (
                <iframe src={preview.src} className="w-full h-full border-none rounded-lg bg-white shadow-sm" />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {deleteState.open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden">
            <div className="p-5 md:p-6 text-center md:text-left">
              <h3 className="text-lg font-bold text-slate-800 mb-1.5">{deleteState.title || 'Вы уверены?'}</h3>
              <p className="text-sm text-slate-500">{deleteState.desc || 'Это действие нельзя отменить.'}</p>
            </div>
            <div className="px-5 py-4 bg-slate-50 flex flex-col md:flex-row gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteState({ open: false, title: '', desc: '', onConfirm: null })}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors order-2 md:order-1"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteAction()}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 transition-colors flex-1 order-1 md:order-2"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
