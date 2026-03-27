import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Chart from 'chart.js/auto'

import { documentsApi } from '@/api/documents'
import { usersApi } from '@/api/users'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { AchievementStatus } from '@/types/enums'
import { UserDetailResponse } from '@/types/user'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

function achievementStatusLabel(status: string) {
  switch (status) {
    case AchievementStatus.APPROVED:
      return 'Одобрено'
    case AchievementStatus.PENDING:
      return 'На проверке'
    case AchievementStatus.REJECTED:
      return 'Отклонено'
    case AchievementStatus.REVISION:
      return 'На доработке'
    default:
      return status
  }
}

function statusClass(status: string) {
  if (status === 'approved') return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'pending') return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  if (status === 'revision') return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function buildStaticUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
  return `/static/${path.replace(/^\/+/, '')}`
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const userId = Number(id)
  const { user: currentUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const chartRef = useRef<HTMLCanvasElement | null>(null)
  const chartInstanceRef = useRef<Chart | null>(null)
  const [detail, setDetail] = useState<UserDetailResponse | null>(null)
  const [resumeText, setResumeText] = useState('')
  const [canGenerateResume, setCanGenerateResume] = useState(false)
  const [resumeReason, setResumeReason] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [educationLevel, setEducationLevel] = useState('')
  const [gpa, setGpa] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingRole, setIsSavingRole] = useState(false)
  const [isSavingGpa, setIsSavingGpa] = useState(false)
  const [isGeneratingResume, setIsGeneratingResume] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backUrl = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const from = params.get('from')
    if (from === 'documents') return '/documents'
    if (from === 'moderation') return '/moderation/users'
    if (from === 'leaderboard') return '/leaderboard'
    if (from === 'support') {
      const ticketId = params.get('ticket_id')
      return ticketId ? `/moderation/support/${ticketId}` : '/moderation/support'
    }
    return '/users'
  }, [location.search])

  const isGuestOrPending = detail ? detail.user.role === 'GUEST' || detail.user.status === 'pending' : false
  const isAdminViewer = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'MODERATOR'

  const load = async () => {
    if (!Number.isFinite(userId)) {
      setError('Некорректный идентификатор пользователя.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [detailResponse, resumeResponse] = await Promise.all([usersApi.get(userId), usersApi.checkResume(userId)])
      setDetail(detailResponse.data)
      setRole(detailResponse.data.user.role)
      setEducationLevel(detailResponse.data.user.education_level ?? '')
      setGpa(detailResponse.data.user.session_gpa ?? '')
      setResumeText(resumeResponse.data.resume ?? detailResponse.data.user.resume_text ?? '')
      setCanGenerateResume(resumeResponse.data.can_generate)
      setResumeReason(resumeResponse.data.reason ?? null)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить карточку пользователя.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [userId])

  useEffect(() => {
    if (!detail || !chartRef.current || !detail.chart_labels.length) return

    chartInstanceRef.current?.destroy()
    chartInstanceRef.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: detail.chart_labels,
        datasets: [
          {
            label: 'Баллы',
            data: detail.chart_points,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#4f46e5',
            pointRadius: 3,
            pointHoverRadius: 6,
          },
          {
            label: 'Документов',
            data: detail.chart_counts,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.06)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#10b981',
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { size: 11 }, usePointStyle: true, padding: 16 } }, tooltip: { padding: 10, cornerRadius: 8 } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, color: '#94a3b8', stepSize: 1 } },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
        },
      },
    })

    return () => {
      chartInstanceRef.current?.destroy()
      chartInstanceRef.current = null
    }
  }, [detail])

  const handleRoleSave = async () => {
    setIsSavingRole(true)
    setError(null)
    try {
      const { data } = await usersApi.updateRole(userId, role, educationLevel || undefined)
      setDetail((current) => (current ? { ...current, user: data.user } : current))
      pushToast({ title: 'Роль обновлена', tone: 'success' })
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Не удалось обновить роль пользователя.'))
    } finally {
      setIsSavingRole(false)
    }
  }

  const handleGpaSave = async () => {
    setIsSavingGpa(true)
    setError(null)
    try {
      const { data } = await usersApi.setGpa(userId, gpa)
      setDetail((current) => current ? { ...current, user: data.user, gpa_bonus: data.bonus } : current)
      setGpa(data.gpa)
      pushToast({ title: 'Средний балл обновлён', tone: 'success' })
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Не удалось сохранить GPA.'))
    } finally {
      setIsSavingGpa(false)
    }
  }

  const handleGenerateResume = async () => {
    setIsGeneratingResume(true)
    setError(null)
    try {
      const { data } = await usersApi.generateResume(userId)
      const generatedUser = data.user
      if (generatedUser) {
        setDetail((current) => current ? { ...current, user: generatedUser } : current)
      }
      setResumeText(data.resume ?? '')
      setCanGenerateResume(data.can_generate)
      setResumeReason(data.reason ?? null)
      pushToast({ title: 'AI-сводка обновлена', tone: 'success' })
    } catch (generationError) {
      setError(getErrorMessage(generationError, 'Не удалось сгенерировать сводку.'))
    } finally {
      setIsGeneratingResume(false)
    }
  }

  const handleExportPdf = async () => {
    setIsExportingPdf(true)
    try {
      const response = await usersApi.exportPdf(userId)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = `report_${detail?.user.last_name || 'user'}_${detail?.user.first_name || userId}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (exportError) {
      setError(getErrorMessage(exportError, 'Не удалось выгрузить PDF.'))
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!detail || !window.confirm(`Удалить пользователя ${detail.user.first_name} ${detail.user.last_name}?`)) return
    try {
      await usersApi.delete(userId)
      pushToast({ title: 'Пользователь удалён', tone: 'success' })
      navigate('/users')
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Не удалось удалить пользователя.'))
    }
  }

  const handleDeleteDocument = async (documentId: number, title: string) => {
    if (!window.confirm(`Удалить документ «${title}»?`)) return
    try {
      await documentsApi.delete(documentId)
      pushToast({ title: 'Документ удалён', tone: 'success' })
      await load()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Не удалось удалить документ.'))
    }
  }

  if (isLoading) return <div className="py-16"><LoadingSpinner /></div>
  if (!detail) return null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Карточка пользователя</h2>
        <div className="flex items-center gap-3">
          {detail.user.role === 'STUDENT' && detail.user.status === 'active' ? <Link to={`/students/${detail.user.id}`} className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg">Публичный профиль</Link> : null}
          <button type="button" onClick={() => void handleExportPdf()} className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg">{isExportingPdf ? 'PDF...' : 'PDF'}</button>
          <Link to={backUrl} className="text-sm text-slate-500 hover:text-indigo-600 flex items-center transition-colors">Назад</Link>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      <div className={`grid grid-cols-1 ${!isGuestOrPending || isAdminViewer ? 'lg:grid-cols-3' : ''} gap-6`}>
        <div className={`space-y-6 ${isGuestOrPending && !isAdminViewer ? 'max-w-xl mx-auto w-full' : ''}`}>
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center flex flex-col items-center shadow-sm">
            <div className="h-28 w-28 mb-4 relative">
              {detail.user.avatar_path ? <img className="h-28 w-28 rounded-full object-cover border border-slate-200" src={buildStaticUrl(detail.user.avatar_path)} alt="Avatar" /> : <div className="h-28 w-28 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-3xl font-bold">{detail.user.first_name.slice(0, 1)}{detail.user.last_name.slice(0, 1)}</div>}
            </div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{detail.user.first_name} {detail.user.last_name}</h1>
            <p className="text-[10px] text-slate-400 mb-1">ID: {detail.user.id}</p>
            <p className="text-xs text-slate-500 mb-4">{detail.user.email}</p>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded bg-slate-100 text-slate-600 border border-slate-200">{detail.user.role}</span>
              <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${detail.user.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>{detail.user.status}</span>
            </div>

            {currentUser?.role === 'SUPER_ADMIN' && currentUser.id !== detail.user.id ? (
              <div className="w-full pt-4 border-t border-slate-100">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5 text-left">Изменить роль</label>
                <div className="flex gap-2">
                  <select value={role} onChange={(event) => setRole(event.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all">
                    {detail.roles.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <button type="button" onClick={() => void handleRoleSave()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors" disabled={isSavingRole}>OK</button>
                </div>
                {role === 'MODERATOR' ? <div className="mt-3 text-left bg-indigo-50/50 p-3 rounded-lg border border-indigo-100"><label className="text-[10px] text-indigo-800 font-bold uppercase tracking-wider block mb-1.5">Зона проверки модератора</label><select value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"><option value="">Глобальный (Все направления)</option>{detail.education_levels.map((item) => <option key={item} value={item}>Только {item}</option>)}</select></div> : null}
              </div>
            ) : null}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><h3 className="text-sm font-bold text-slate-700">Информация</h3></div>
            <div className="p-5 space-y-3 text-sm">
              {detail.user.education_level ? <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-slate-500 text-xs">Обучение / Зона</span><span className="font-medium text-slate-800">{detail.user.education_level}</span></div> : null}
              <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-slate-500 text-xs">Курс</span><span className="font-medium text-slate-800">{detail.user.course ? `${detail.user.course} курс` : 'Не указан'}</span></div>
              {detail.user.study_group ? <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-slate-500 text-xs">Группа</span><span className="font-medium text-slate-800">{detail.user.study_group}</span></div> : null}
              <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-slate-500 text-xs">Телефон</span><span className="font-medium text-slate-800">{detail.user.phone_number || 'Не указан'}</span></div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-slate-500 text-xs">Регистрация</span><span className="font-medium text-slate-800">{detail.user.created_at ? new Date(detail.user.created_at).toLocaleDateString('ru-RU') : 'Дата не указана'}</span></div>
            </div>
          </div>

          {isAdminViewer && detail.user.role === 'STUDENT' ? <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"><div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><h3 className="text-sm font-bold text-slate-700">Средний балл сессии</h3></div><div className="p-5"><div className="flex gap-2"><input type="text" value={gpa} onChange={(event) => setGpa(event.target.value)} placeholder="4.5" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all" /><button type="button" onClick={() => void handleGpaSave()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors" disabled={isSavingGpa}>Сохранить</button></div><p className="text-[10px] text-slate-400 mt-1.5">Оценка от 2.0 до 5.0, конвертируется в бонусные баллы рейтинга</p></div></div> : null}
        </div>

        {!isGuestOrPending || isAdminViewer ? <div className="lg:col-span-2 space-y-6">
          {!isGuestOrPending ? <div className="grid grid-cols-2 gap-4"><div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Документов в текущем сезоне</div><div className="text-2xl font-semibold text-slate-800 mt-1">{detail.total_docs}</div></div>{detail.rank ? <div className="bg-white p-5 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm"><div><div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Текущее место</div><div className="text-2xl font-bold text-indigo-600 mt-1">#{detail.rank}</div></div><div className="w-px h-8 bg-slate-200" /><div className="text-right"><div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Баллы</div><div className="text-2xl font-bold text-indigo-600 mt-1">{detail.total_points}</div></div></div> : null}</div> : null}

          <div className="bg-indigo-50/60 p-5 sm:p-6 rounded-xl border border-indigo-100 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div><h3 className="text-base font-bold text-indigo-900">AI-сводка профиля</h3><p className="text-xs text-indigo-700/70 mt-1">Быстрый анализ всех подтверждённых достижений для удобства проверяющего.</p></div>
              <button type="button" onClick={() => void handleGenerateResume()} disabled={isGeneratingResume || !canGenerateResume} className="shrink-0 px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm whitespace-nowrap">{isGeneratingResume ? 'Генерация...' : resumeText ? 'Обновить сводку' : 'Сгенерировать сводку'}</button>
            </div>
            {!canGenerateResume && resumeReason ? <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{resumeReason}</p> : null}
            {resumeText ? <div className="bg-white border border-indigo-100/80 rounded-lg p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow-sm">{resumeText}</div> : <div className="text-center py-6 bg-white/50 border border-indigo-100 border-dashed rounded-lg text-indigo-400 text-xs mt-2">Сводка ещё не сгенерирована. Нажмите кнопку, чтобы ИИ проанализировал грамоты этого студента.</div>}
          </div>

          {detail.season_history.length ? <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden text-white shadow-md relative"><div className="px-5 py-3 border-b border-slate-700/50 flex justify-between items-center relative z-10"><h3 className="text-sm font-bold text-white">Зал славы (Архив сезонов)</h3></div><div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">{detail.season_history.map((item) => <div key={item.id} className="bg-white/10 rounded-lg p-4 flex justify-between items-center border border-white/5 hover:bg-white/20 transition-colors"><div><div className="text-xs font-bold text-slate-200">{item.season_name}</div><div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">Место: <span className="text-white text-sm">#{item.rank}</span></div></div><div className="text-xl font-black text-yellow-400">{item.points} <span className="text-[10px] font-normal text-slate-400">б.</span></div></div>)}</div></div> : null}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h3 className="text-sm font-bold text-slate-700">Документы текущего сезона</h3><button type="button" onClick={() => void handleDeleteUser()} className="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors">Удалить пользователя</button></div>
            {detail.achievements.length ? <ul className="divide-y divide-slate-100">{detail.achievements.map((item) => <li key={item.id} className="p-4 hover:bg-slate-50 flex items-center justify-between transition-colors"><div className="flex items-center flex-1 min-w-0 pr-4"><div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mr-4 shrink-0 border border-indigo-100"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-preview', { detail: { src: `/sirius.achievements/documents/${item.id}/preview`, type: /\.pdf$/i.test(item.file_path) ? 'pdf' : 'image' } }))}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button></div><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800 truncate">{item.title}</p><p className="text-xs text-slate-500 mt-0.5 flex items-center"><span className="mr-2">{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : 'Дата не указана'}</span>{item.rejection_reason ? <span className="text-red-500 truncate max-w-[200px]">• {item.rejection_reason}</span> : null}</p></div></div><div className="flex items-center gap-3 shrink-0"><span className={`hidden sm:inline-flex px-2 py-0.5 text-[10px] rounded font-medium border ${statusClass(item.status)}`}>{achievementStatusLabel(item.status)}</span><button type="button" onClick={() => void handleDeleteDocument(item.id, item.title)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Удалить"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></li>)}</ul> : <div className="p-10 text-center flex flex-col items-center"><p className="text-sm text-slate-500">Достижений пока нет.</p></div>}
          </div>

          {detail.user.role === 'STUDENT' ? <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="text-sm font-semibold text-slate-700 mb-4">Динамика достижений</h3>{detail.chart_labels.length ? <div className="h-48"><canvas ref={chartRef} /></div> : <div className="text-center py-8 text-sm text-slate-400">Нет одобренных достижений для отображения графика</div>}</div> : null}
        </div> : null}
      </div>
    </div>
  )
}
