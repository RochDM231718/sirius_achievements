import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { supportApi } from '@/api/support'
import { useToast } from '@/hooks/useToast'
import { type SupportTicket } from '@/types/support'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

const MAX_FILE_SIZE = 5 * 1024 * 1024

function statusPill(ticket: SupportTicket) {
  if (ticket.archived_at || ticket.status === 'closed') {
    return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200'
  }
  if (ticket.status === 'open') {
    return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-50 text-yellow-700 border border-yellow-200'
  }
  if (ticket.status === 'in_progress') {
    return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200'
  }
  return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200'
}

function statusLabel(ticket: SupportTicket) {
  if (ticket.archived_at || ticket.status === 'closed') return 'Архив'
  if (ticket.status === 'open') return 'Открыто'
  if (ticket.status === 'in_progress') return 'В работе'
  return 'Закрыто'
}

export function SupportPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushToast } = useToast()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const view = searchParams.get('view') === 'archived' ? 'archived' : 'active'

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await supportApi.list(view)
        setTickets(response.data.tickets)
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Не удалось загрузить обращения.'))
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [view])

  useEffect(() => {
    if (!isModalOpen) return

    document.body.classList.add('overflow-hidden')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModalOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('overflow-hidden')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isModalOpen])

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const setListView = (nextView: 'active' | 'archived') => {
    const next = new URLSearchParams(searchParams)
    next.set('view', nextView)
    setSearchParams(next)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSubject('')
    setMessage('')
    setFile(null)
    setSizeError(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setSizeError(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    if (!nextFile) {
      setFile(null)
      return
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setSizeError(`Файл слишком большой (${(nextFile.size / 1024 / 1024).toFixed(1)} МБ). Макс. 5 МБ`)
      event.target.value = ''
      setFile(null)
      return
    }
    setFile(nextFile)
    if (nextFile.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(nextFile))
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (file && file.size > MAX_FILE_SIZE) {
      setSizeError(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Макс. 5 МБ`)
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('subject', subject)
      formData.append('message', message)
      if (file) {
        formData.append('file', file)
      }
      const response = await supportApi.create(formData)
      pushToast({ title: 'Обращение отправлено', message: 'Чат поддержки открыт.', tone: 'success' })
      const ticketId = response.data.ticket.id
      closeModal()
      navigate(`/support/${ticketId}`)
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Не удалось создать обращение.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Поддержка</h2>
            <p className="text-sm text-slate-500 mt-1">Создайте обращение или продолжите диалог</p>
          </div>
          <button
            type="button"
            data-open-ticket-modal
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            Новое обращение
          </button>
        </div>

        <div className="bg-surface rounded-xl border border-slate-200 p-2 inline-flex gap-1">
          <a href="?view=active" onClick={(event) => { event.preventDefault(); setListView('active') }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view !== 'archived' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            Активные
          </a>
          <a href="?view=archived" onClick={(event) => { event.preventDefault(); setListView('archived') }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'archived' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            Архив
          </a>
        </div>

        {error ? <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {isLoading ? (
          <div className="bg-surface rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">Загрузка обращений…</div>
        ) : tickets.length ? (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link key={ticket.id} to={`/support/${ticket.id}`} className="block bg-surface rounded-xl border border-slate-200 p-4 hover:border-indigo-200 hover:shadow-sm transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{ticket.subject}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span>#{ticket.id}</span>
                      <span>{formatDateTime(ticket.created_at)}</span>
                      <span>{ticket.messages_count ?? ticket.messages?.length ?? 0} сообщений</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className={statusPill(ticket)}>{statusLabel(ticket)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            </div>
            <p className="text-sm text-slate-500 mb-4">У вас пока нет обращений</p>
            <button type="button" data-open-ticket-modal onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
              Создать обращение
            </button>
          </div>
        )}
      </div>

      <div
        id="newTicketModal"
        className={`${isModalOpen ? 'fixed' : 'hidden'} inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeModal()
          }
        }}
      >
        <div className="bg-surface rounded-xl shadow-lg w-full max-w-md overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800">Новое обращение</h3>
            <button type="button" data-close-ticket-modal onClick={closeModal} className="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <form id="newTicketForm" onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Тема обращения</label>
              <input
                type="text"
                name="subject"
                required
                maxLength={255}
                placeholder="Опишите проблему кратко..."
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-surface focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Сообщение</label>
              <textarea
                name="message"
                required
                rows={4}
                placeholder="Подробно опишите вашу проблему..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-surface focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all resize-none"
              ></textarea>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Прикрепить фото (необязательно)</label>
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
              />
              <p className="text-[10px] text-slate-400 mt-1">JPG, PNG, WEBP. Макс. 5 МБ</p>
              {sizeError ? <p className="text-xs text-red-600 mt-1 font-medium">{sizeError}</p> : null}

              {previewUrl ? (
                <div className="mt-3 space-y-2">
                  <div className="bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: 300 }}>
                    <img src={previewUrl} className="max-w-full max-h-[300px] object-contain rounded-lg" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewUrl) URL.revokeObjectURL(previewUrl)
                      setPreviewUrl(null)
                      setFile(null)
                      setSizeError(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Удалить
                  </button>
                </div>
              ) : null}
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-70">
              {isSubmitting ? 'Отправляем…' : 'Отправить'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
