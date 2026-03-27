import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { supportApi } from '@/api/support'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { SupportListResponse, SupportTicket } from '@/types/support'
import { getErrorMessage } from '@/utils/http'

type SupportTab = 'new' | 'chats' | 'all'

function ticketStatusBadge(ticket: SupportTicket, tab: SupportTab) {
  const st = ticket.status
  const isArchived = Boolean(ticket.archived_at)

  if (tab === 'new') {
    if (st === 'open' && !ticket.moderator_id) {
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-50 text-yellow-700 border border-yellow-200">Новое</span>
    }
    return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">Принято</span>
  }

  if (isArchived || st === 'archived') return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">Архив</span>
  if (st === 'closed') return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">Закрыто</span>
  if (st === 'open' && !ticket.moderator_id) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-50 text-yellow-700 border border-yellow-200">Открыто</span>
  if (st === 'in_progress' || ticket.moderator_id) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">{tab === 'chats' ? 'В работе' : 'Принято'}</span>
  return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">Закрыто</span>
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}

export function ModerationSupportPage() {
  const { user: currentUser } = useAuth()
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as SupportTab) || 'new'
  const [tab, setTab] = useState<SupportTab>(initialTab)
  const [data, setData] = useState<SupportListResponse | null>(null)
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || (initialTab === 'chats' ? 'updated_at' : 'created_at'))
  const [sortOrder, setSortOrder] = useState(searchParams.get('sort_order') || 'desc')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const params = useMemo(
    () => ({
      page,
      status: status || undefined,
      query: query || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    [page, query, sortBy, sortOrder, status]
  )

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response =
        tab === 'new'
          ? await supportApi.getNewTickets(page)
          : tab === 'chats'
            ? await supportApi.getMyChats(params)
            : await supportApi.getAllTickets(params)
      setData(response.data)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить обращения.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [params, tab])

  const switchTab = (nextTab: SupportTab) => {
    setTab(nextTab)
    setPage(1)
    setQuery('')
    setStatus('')
    setSortBy(nextTab === 'chats' ? 'updated_at' : 'created_at')
    setSortOrder('desc')
  }

  const handleTake = async (ticket: SupportTicket) => {
    try {
      await supportApi.takeTicket(ticket.id)
      pushToast({ title: 'Обращение взято в работу', tone: 'success' })
      await load()
    } catch (takeError) {
      setError(getErrorMessage(takeError, 'Не удалось взять обращение в работу.'))
    }
  }

  const pages = Array.from({ length: data?.total_pages ?? 1 }, (_, i) => i + 1)
  const tickets = data?.tickets ?? []
  const total = data?.total ?? 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            {tab === 'new' ? 'Общие обращения' : tab === 'chats' ? 'Мои чаты' : 'Все обращения'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {tab === 'new' ? `${total} активных обращений в общем потоке` : tab === 'chats' ? `Закрепленные за вами обращения: ${total}` : `Всего: ${total}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tab !== 'new' ? (
            <button type="button" onClick={() => switchTab('new')} className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">
              {tab === 'all' ? 'Новые обращения' : 'Общие обращения'}
            </button>
          ) : null}
          {tab !== 'chats' ? (
            <button type="button" onClick={() => switchTab('chats')} className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">Мои чаты</button>
          ) : null}
          {tab !== 'all' ? (
            <button type="button" onClick={() => switchTab('all')} className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
              {tab === 'new' ? 'Все обращения' : 'Все обращения'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      {/* Filters for chats and all tabs */}
      {tab !== 'new' ? (
        <form onSubmit={(e) => { e.preventDefault(); setPage(1) }} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Поиск</label>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Тема, студент, email..." className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all" />
          </div>
          <div className="w-full md:w-40">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Статус</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all">
              <option value="">Все</option>
              <option value="open">Открытые</option>
              <option value="in_progress">В работе</option>
              <option value="closed">Закрытые</option>
              <option value="archived">Архив</option>
            </select>
          </div>
          <div className="w-full md:w-40">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Сортировка</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all">
              <option value="updated_at">По обновлению</option>
              <option value="created_at">По дате создания</option>
            </select>
          </div>
          <div className="w-full md:w-32">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Порядок</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all">
              <option value="desc">Новые</option>
              <option value="asc">Старые</option>
            </select>
          </div>
          <button type="submit" className="shrink-0 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">Применить</button>
        </form>
      ) : null}

      {/* Table */}
      {isLoading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : tickets.length ? (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-bold">#</th>
                    <th className="px-5 py-3 font-bold">Тема</th>
                    <th className="px-5 py-3 font-bold">Студент</th>
                    <th className="px-5 py-3 font-bold">Статус</th>
                    {tab !== 'chats' ? <th className="px-5 py-3 font-bold">Модератор</th> : null}
                    <th className="px-5 py-3 font-bold">Сообщений</th>
                    {tab === 'all' ? <th className="px-5 py-3 font-bold">Создано</th> : null}
                    <th className="px-5 py-3 font-bold">Обновлено</th>
                    <th className="px-5 py-3 font-bold text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-xs text-slate-400">{ticket.id}</td>
                      <td className="px-5 py-3">
                        <Link to={`/moderation/support/${ticket.id}?from=${tab}`} className="font-medium text-slate-800 hover:text-indigo-600 transition-colors">
                          {ticket.subject}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs">
                        {ticket.user ? (
                          <>
                            <Link to={`/users/${ticket.user.id}`} className="hover:text-indigo-600 transition-colors">
                              {ticket.user.first_name} {ticket.user.last_name}
                            </Link>
                            <div className="text-[10px] text-slate-400">ID: {ticket.user.id} · {ticket.user.email}</div>
                          </>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">{ticketStatusBadge(ticket, tab)}</td>
                      {tab !== 'chats' ? (
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {ticket.moderator ? (
                            <>
                              <div className="font-medium text-slate-700">{ticket.moderator.first_name} {ticket.moderator.last_name}</div>
                              <div className="text-[10px] text-slate-400">{ticket.moderator.email}</div>
                            </>
                          ) : (
                            <span className="text-slate-400">{tab === 'new' ? 'Еще не взято' : 'Свободно'}</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-5 py-3 text-xs text-slate-500">{ticket.messages_count ?? 0}</td>
                      {tab === 'all' ? <td className="px-5 py-3 text-xs text-slate-500">{formatDate(ticket.created_at)}</td> : null}
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(ticket.updated_at || ticket.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        {tab === 'chats' ? (
                          <Link to={`/moderation/support/${ticket.id}?from=chats`} className="text-xs text-indigo-600 font-bold hover:underline">Открыть чат</Link>
                        ) : !ticket.moderator_id ? (
                          <button type="button" onClick={() => void handleTake(ticket)} className="text-xs text-indigo-600 font-bold hover:underline">Взять в работу</button>
                        ) : ticket.moderator_id === currentUser?.id ? (
                          <Link to={`/moderation/support/${ticket.id}?from=chats`} className="text-xs text-indigo-600 font-bold hover:underline">Мой чат</Link>
                        ) : (
                          <Link to={`/moderation/support/${ticket.id}?from=${tab}`} className="text-xs text-slate-500 font-bold hover:underline">Просмотр</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(data?.total_pages ?? 1) > 1 ? (
            <div className="flex justify-center gap-1">
              {pages.map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          {tab === 'new' ? (
            <>
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-sm text-slate-500">Нет активных обращений</p>
            </>
          ) : tab === 'chats' ? (
            <p className="text-sm text-slate-500">У вас пока нет закрепленных обращений</p>
          ) : (
            <p className="text-sm text-slate-500">Обращений не найдено</p>
          )}
        </div>
      )}
    </div>
  )
}
