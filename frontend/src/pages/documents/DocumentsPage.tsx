import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { documentsApi } from '@/api/documents'
import { moderationApi } from '@/api/moderation'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { Achievement } from '@/types/achievement'
import { getErrorMessage } from '@/utils/http'

interface SuggestionItem {
  value: string
  text: string
}

function statusLabel(status: string, moderatorId?: number, currentUserId?: number) {
  if (status === 'approved') return 'Одобрено'
  if (status === 'rejected') return 'Отклонено'
  if (status === 'revision') return 'Доработка'
  if (status === 'pending' && !moderatorId) return 'Новый'
  if (status === 'pending' && moderatorId === currentUserId) return 'В работе'
  if (status === 'pending') return 'Принято'
  return status
}

function statusClass(status: string, moderatorId?: number, currentUserId?: number) {
  if (status === 'approved') return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'revision') return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  if (status === 'pending' && !moderatorId) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  if (status === 'pending' && moderatorId === currentUserId) return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function emitPreview(item: Achievement) {
  window.dispatchEvent(
    new CustomEvent('open-preview', {
      detail: {
        src: `/sirius.achievements/documents/${item.id}/preview`,
        type: /\.pdf$/i.test(item.file_path) ? 'pdf' : 'image',
      },
    })
  )
}

export function DocumentsPage() {
  const { user: currentUser } = useAuth()
  const { pushToast } = useToast()
  const [items, setItems] = useState<Achievement[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [levels, setLevels] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [level, setLevel] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])

  const filters = useMemo(
    () => ({
      query: query || undefined,
      status: status || undefined,
      category: category || undefined,
      level: level || undefined,
      sort_by: sortBy,
    }),
    [category, level, query, sortBy, status]
  )

  const loadDocuments = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await documentsApi.list(filters)
      setItems(data.achievements)
      setStatuses(data.statuses)
      setCategories(data.categories)
      setLevels(data.levels)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить список документов.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [filters])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 1) {
      setSuggestions([])
      return
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const { data } = await documentsApi.list({ query: trimmed, sort_by: sortBy })
        setSuggestions(data.achievements.slice(0, 5).map((item) => ({ value: item.title, text: item.title })))
      } catch {
        setSuggestions([])
      }
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [query, sortBy])

  const handleDownload = async (item: Achievement) => {
    try {
      const response = await documentsApi.download(item.id)
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = item.file_path.split('/').pop() || `${item.title}.bin`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'Не удалось скачать документ.'))
    }
  }

  const handleTake = async (item: Achievement) => {
    try {
      await moderationApi.takeAchievement(item.id)
      pushToast({ title: 'Документ взят в работу', tone: 'success' })
      await loadDocuments()
    } catch (takeError) {
      setError(getErrorMessage(takeError, 'Не удалось взять документ в работу.'))
    }
  }

  const handleDelete = async (item: Achievement) => {
    if (!window.confirm(`Удалить документ «${item.title}»?`)) return

    try {
      await documentsApi.delete(item.id)
      pushToast({ title: 'Документ удалён', tone: 'success' })
      await loadDocuments()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Не удалось удалить документ.'))
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Все документы</h2>
          <p className="text-sm text-slate-500">Управление базой достижений</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/moderation/achievements" className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">Новые документы</Link>
          <Link to="/my-work?tab=achievements" className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">Мои документы</Link>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200">
        <form onSubmit={(event) => event.preventDefault()} className="flex flex-wrap gap-3 items-end">
          <div className="flex-grow min-w-[200px] relative">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Поиск</label>
            <div className="relative">
              <div className="absolute left-3 top-2.5 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => window.setTimeout(() => setSuggestions([]), 150)} placeholder="Название..." autoComplete="off" className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none text-sm text-slate-800 transition-all h-[38px]" />
            </div>
            {suggestions.length ? <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">{suggestions.map((item) => <li key={`${item.value}-${item.text}`} onMouseDown={() => { setQuery(item.value || item.text); setSuggestions([]) }} className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm border-b border-slate-100 last:border-0 text-slate-700">{item.text || item.value}</li>)}</ul> : null}
          </div>

          <div className="w-full sm:w-[130px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Статус</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все</option>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-[130px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Вид</label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все виды</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-[130px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Уровень</label>
            <select value={level} onChange={(event) => setLevel(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все уровни</option>
              {levels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-[140px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Сортировка</label>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="newest">Новые</option>
              <option value="oldest">Старые</option>
              <option value="level">По значимости</option>
              <option value="category">По виду</option>
            </select>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button type="button" onClick={() => void loadDocuments()} className="flex-1 sm:flex-none px-6 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center h-[38px]">Найти</button>
            <button type="button" onClick={() => { setQuery(''); setStatus(''); setCategory(''); setLevel(''); setSortBy('newest'); setSuggestions([]) }} className="w-[38px] flex-shrink-0 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center h-[38px]" title="Сбросить">✕</button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? <div className="py-16"><LoadingSpinner /></div> : items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-bold">Файл</th>
                  <th className="px-5 py-3 font-bold">Название</th>
                  <th className="px-5 py-3 font-bold">Студент</th>
                  <th className="px-5 py-3 font-bold">Категория</th>
                  <th className="px-5 py-3 font-bold">Статус</th>
                  <th className="px-5 py-3 font-bold">Модератор</th>
                  <th className="px-5 py-3 font-bold">Создано</th>
                  <th className="px-5 py-3 font-bold text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => emitPreview(item)} className="inline-flex w-8 h-8 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors items-center justify-center">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                    </td>
                    <td className="px-5 py-3"><div className="font-medium text-slate-800">{item.title}</div></td>
                    <td className="px-5 py-3 text-xs text-slate-600">{item.user ? <><Link to={`/users/${item.user.id}?from=documents`} className="hover:text-indigo-600 transition-colors">{item.user.first_name} {item.user.last_name}</Link><div className="text-[10px] text-slate-400">ID: {item.user.id} • {item.user.email}</div></> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-5 py-3 text-xs text-slate-600"><span className="block">{item.category}</span><span className="text-slate-400">{item.level}</span></td>
                    <td className="px-5 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${statusClass(item.status, item.moderator_id, currentUser?.id)}`}>{statusLabel(item.status, item.moderator_id, currentUser?.id)}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500">{item.status === 'pending' && item.moderator_id ? item.moderator_id === currentUser?.id ? <div className="font-medium text-slate-700">Вы</div> : <span className="text-slate-400">Другой модератор</span> : item.status === 'pending' ? <span className="text-slate-400">Свободно</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => void handleDownload(item)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Скачать">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        {item.status === 'pending' && !item.moderator_id ? <button type="button" onClick={() => void handleTake(item)} className="text-xs text-indigo-600 font-bold hover:underline">Взять</button> : null}
                        {item.status === 'pending' && item.moderator_id === currentUser?.id ? <Link to="/my-work?tab=achievements" className="text-xs text-indigo-600 font-bold hover:underline">Моя работа</Link> : null}
                        <button type="button" onClick={() => void handleDelete(item)} className="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors">Удалить</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="py-12 text-center"><div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-3 text-slate-400"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div><p className="text-sm text-slate-500">Документы не найдены</p></div>}
      </div>
    </div>
  )
}
