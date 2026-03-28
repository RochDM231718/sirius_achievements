import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { documentsApi } from '@/api/documents'
import { moderationApi } from '@/api/moderation'
import { DocumentPreviewImage } from '@/components/ui/DocumentPreviewImage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { Achievement } from '@/types/achievement'
import { isImageFile, isPdfFile, openDocumentPreview } from '@/utils/documentPreview'
import { getErrorMessage } from '@/utils/http'

export function ModerationAchievementsPage() {
  const { user: currentUser } = useAuth()
  const { pushToast } = useToast()
  const [items, setItems] = useState<Achievement[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalPending, setTotalPending] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await moderationApi.getAchievements(page)
      setItems(data.achievements)
      setTotalPending(data.stats.total_pending)
      setTotalPages(data.total_pages)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить очередь достижений.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [page])

  const handleTake = async (item: Achievement) => {
    try {
      await moderationApi.takeAchievement(item.id)
      pushToast({ title: 'Документ взят в работу', tone: 'success' })
      await load()
    } catch (takeError) {
      setError(getErrorMessage(takeError, 'Не удалось взять документ в работу.'))
    }
  }

  const handleDownload = async (item: Achievement) => {
    try {
      const response = await documentsApi.download(item.id)
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = item.file_path?.split('/').pop() || `${item.title}.bin`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'Не удалось скачать документ.'))
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Новые документы</h2>
          <p className="text-sm text-slate-500 mt-1">{totalPending} документов ожидают проверки</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/moderation/achievements" className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
            Новые документы
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link to="/documents" className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">
            Все документы
          </Link>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      {isLoading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : items.length ? (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-bold">Превью</th>
                    <th className="px-5 py-3 font-bold">Документ</th>
                    <th className="px-5 py-3 font-bold">Студент</th>
                    <th className="px-5 py-3 font-bold">Категория</th>
                    <th className="px-5 py-3 font-bold">Дата</th>
                    <th className="px-5 py-3 font-bold">Статус</th>
                    <th className="px-5 py-3 font-bold">Модератор</th>
                    <th className="px-5 py-3 font-bold text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div
                          className="w-12 h-14 shrink-0 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center cursor-pointer group"
                          onClick={() => openDocumentPreview(item.id, item.file_path)}
                        >
                          {item.file_path && isImageFile(item.file_path) ? (
                            <DocumentPreviewImage documentId={item.id} alt={item.title} className="w-full h-full object-cover" />
                          ) : item.file_path && isPdfFile(item.file_path) ? (
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          ) : (
                            <span className="text-[8px] text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="max-w-[200px]">
                          <div className="text-sm font-medium text-slate-800 truncate" title={item.title}>{item.title}</div>
                          {item.description ? <div className="text-[10px] text-slate-400 truncate mt-0.5" title={item.description}>{item.description}</div> : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">
                        {item.user ? (
                          <>
                            <Link to={`/users/${item.user.id}`} className="hover:text-indigo-600 transition-colors">
                              {item.user.first_name} {item.user.last_name}
                            </Link>
                            <div className="text-[10px] text-slate-400">{item.user.email}</div>
                          </>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100/50 w-fit">
                            {item.category || '—'}
                          </span>
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/50 w-fit">
                            {item.level || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {!item.moderator_id ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-50 text-yellow-700 border border-yellow-200">Новый</span>
                        ) : item.moderator_id === currentUser?.id ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">В работе</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">Занят</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {item.moderator_id === currentUser?.id ? (
                          <div className="font-medium text-slate-700">Вы</div>
                        ) : item.moderator_id ? (
                          <span className="text-slate-400">Другой модератор</span>
                        ) : (
                          <span className="text-slate-400">Ещё не взято</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button type="button" onClick={() => void handleDownload(item)} className="text-xs text-slate-500 hover:text-slate-700 transition-colors" title="Скачать">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </button>
                          {!item.moderator_id ? (
                            <button type="button" onClick={() => void handleTake(item)} className="text-xs text-indigo-600 font-bold hover:underline">Взять в работу</button>
                          ) : item.moderator_id === currentUser?.id ? (
                            <Link to="/my-work?tab=achievements" className="text-xs text-indigo-600 font-bold hover:underline">Моя работа</Link>
                          ) : (
                            <span className="text-xs text-slate-400">Занят</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-sm text-slate-500">Нет новых документов для модерации</p>
        </div>
      )}
    </div>
  )
}
