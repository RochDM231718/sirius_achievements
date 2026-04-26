import Chart from 'chart.js/auto'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { dashboardApi, type DashboardStats } from '@/api/dashboard'
import { reportsApi } from '@/api/reports'
import { usersApi } from '@/api/users'
import { PointsGuide } from '@/components/points/PointsGuide'
import { SearchAutocompleteInput, type SearchSuggestionItem } from '@/components/staff/SearchAutocompleteInput'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'
import { coursesForEducationLevel, groupsForEducationLevel } from '@/utils/labels'

const PERIODS = ['day', 'week', 'month', 'all'] as const
const EDUCATION_LEVELS = ['Специалитет']
const REPORT_DESCRIPTIONS: Record<string, string> = {
  moderation: 'Документы, ожидающие проверки модератором',
  documents: 'Полный реестр документов с фильтрами по статусам',
  categories: 'Сводка по категориям и уровням достижений',
  leaderboard: 'Рейтинг студентов с баллами и количеством документов',
  students: 'Выгрузка по студентам, курсам и группам',
  groups: 'Агрегированная статистика по группам',
  streams: 'Агрегированная статистика по потокам',
  aggregate: 'Сводная статистика по группам и направлениям',
  support: 'Обращения поддержки за выбранный период',
}

function normalizePeriod(value: string | null) {
  return PERIODS.includes((value ?? '') as (typeof PERIODS)[number]) ? (value as (typeof PERIODS)[number]) : 'day'
}

function periodDescription(period: string) {
  if (period === 'day') return 'Данные за последние 24 часа'
  if (period === 'week') return 'Данные за последние 7 дней'
  if (period === 'month') return 'Данные за последние 30 дней'
  return 'Сводная информация за всё время'
}

function statusLabel(status: string) {
  if (status === 'approved') return 'Одобрено'
  if (status === 'rejected') return 'Отклонено'
  if (status === 'revision') return 'На доработке'
  return 'Проверка'
}

function statusClass(status: string) {
  if (status === 'approved') return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200'
  if (status === 'rejected') return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200'
  if (status === 'revision') return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-100 text-yellow-800 border border-yellow-300'
  return 'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200'
}

export function DashboardPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportType, setReportType] = useState('moderation')
  const [reportPeriod, setReportPeriod] = useState('all')
  const [reportEducationLevel, setReportEducationLevel] = useState('all')
  const [reportCourse, setReportCourse] = useState('0')
  const [reportGroup, setReportGroup] = useState('all')
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')
  const [reportStudentQuery, setReportStudentQuery] = useState('')
  const [reportStudents, setReportStudents] = useState<Array<{ id: number; label: string }>>([])
  const [reportStudentSuggestions, setReportStudentSuggestions] = useState<SearchSuggestionItem[]>([])
  const [isExportingReport, setIsExportingReport] = useState(false)
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart | null>(null)

  const period = normalizePeriod(searchParams.get('period'))
  const dateFrom = searchParams.get('date_from') ?? ''
  const dateTo = searchParams.get('date_to') ?? ''
  const isStaff = user?.role === 'MODERATOR' || user?.role === 'SUPER_ADMIN'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isDeletedAccount = user?.status === 'deleted'

  useEffect(() => {
    if (isDeletedAccount) {
      setStats(null)
      setError(null)
      setIsLoading(false)
      return
    }

    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await dashboardApi.getStats(period, dateFrom, dateTo)
        setStats(response.data)
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Не удалось загрузить дашборд.'))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [dateFrom, dateTo, isDeletedAccount, period])

  useEffect(() => {
    const trimmed = reportStudentQuery.trim()
    if (!trimmed) {
      setReportStudentSuggestions([])
      return
    }
    const selectedIds = new Set(reportStudents.map((s) => s.id))
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await usersApi.search(trimmed)
        setReportStudentSuggestions(
          (response.data ?? []).filter((item) => item.id == null || !selectedIds.has(item.id)),
        )
      } catch {
        setReportStudentSuggestions([])
      }
    }, 200)
    return () => window.clearTimeout(timeoutId)
  }, [reportStudentQuery, reportStudents])

  useEffect(() => {
    const canvas = chartCanvasRef.current
    if (!canvas || !stats) return

    const root = document.documentElement
    const cssVar = (name: string, fallback: string) => getComputedStyle(root).getPropertyValue(name).trim() || fallback
    const dark = () => root.dataset.theme === 'dark'

    const destroy = () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }

    const renderChart = () => {
      destroy()
      if (isStaff && stats.chart_data?.labels?.length && stats.chart_data.counts?.length) {
        chartRef.current = new Chart(canvas.getContext('2d')!, {
          type: 'line',
          data: {
            labels: stats.chart_data.labels,
            datasets: [{
              label: 'Загружено документов',
              data: stats.chart_data.counts,
              borderColor: cssVar('--theme-accent', '#6d5ef3'),
              backgroundColor: dark() ? 'rgba(159, 131, 255, 0.16)' : 'rgba(109, 94, 243, 0.08)',
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointBackgroundColor: cssVar('--theme-surface', '#ffffff'),
              pointBorderColor: cssVar('--theme-accent-strong', '#5f4ee6'),
              pointRadius: 3,
              pointHoverRadius: 6,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                padding: 10,
                cornerRadius: 8,
                backgroundColor: dark() ? 'rgba(26, 23, 37, 0.96)' : 'rgba(15, 23, 42, 0.9)',
              },
            },
            scales: {
              y: { beginAtZero: true, grid: { color: cssVar('--theme-border-soft', '#ebeff6') }, ticks: { color: cssVar('--theme-text-faint', '#94a3b8'), stepSize: 1, font: { size: 11 } } },
              x: { grid: { display: false }, ticks: { color: cssVar('--theme-text-muted', '#64748b'), font: { size: 11 } } },
            },
          },
        })
        return
      }
      if (!isStaff && (stats.my_points ?? 0) > 0 && stats.category_breakdown?.length) {
        chartRef.current = new Chart(canvas.getContext('2d')!, {
          type: 'doughnut',
          data: {
            labels: stats.category_breakdown.map((item) => item.category),
            datasets: [{
              data: stats.category_breakdown.map((item) => item.points),
              backgroundColor: dark() ? ['#9f83ff', '#f97316', '#22d3ee', '#facc15', '#f472b6', '#34d399'] : ['#6d5ef3', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#059669'],
              borderWidth: 2,
              borderColor: cssVar('--theme-surface', '#ffffff'),
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
              legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, color: cssVar('--theme-text-soft', '#556074'), font: { size: 11 } } },
              tooltip: { padding: 12, cornerRadius: 8, backgroundColor: dark() ? 'rgba(26, 23, 37, 0.96)' : 'rgba(15, 23, 42, 0.9)' },
            },
          },
        })
      }
    }

    renderChart()
    const onTheme = () => renderChart()
    document.addEventListener('themechange', onTheme)
    return () => {
      document.removeEventListener('themechange', onTheme)
      destroy()
    }
  }, [isStaff, stats])

  if (isDeletedAccount || stats?.deleted_account) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-4">
          <div className="bg-surface p-8 rounded-xl border border-red-200 max-w-md w-full shadow-sm">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M5.07 19h13.86A2 2 0 0020.66 16L13.73 4a2 2 0 00-3.46 0L3.34 16A2 2 0 005.07 19z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Аккаунт удалён</h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Доступ к функциям ограничен. Напишите в поддержку, если нужно восстановить данные или уточнить статус аккаунта.
            </p>
            <Link
              to="/support"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Написать в поддержку
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && !stats) {
    return <div className="max-w-6xl mx-auto bg-surface rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500 shadow-sm">Загрузка данных…</div>
  }

  if (error && !stats) {
    return <div className="max-w-6xl mx-auto bg-surface rounded-xl border border-red-200 p-6 text-sm text-red-700 shadow-sm">{error}</div>
  }

  if (stats?.pending_review) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-4">
          <div className="bg-surface p-8 rounded-xl border border-yellow-200 max-w-md w-full shadow-sm">
            <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Аккаунт на проверке</h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">Спасибо за регистрацию! Ваша учетная запись проходит модерацию. Пожалуйста, подождите одобрения администратором.</p>
            <div className="bg-yellow-50 text-yellow-800 px-4 py-3 rounded-lg text-xs font-medium border border-yellow-100">Доступ к функциям временно ограничен</div>
          </div>
        </div>
      </div>
    )
  }

  const setPeriod = (nextPeriod: (typeof PERIODS)[number]) => {
    const next = new URLSearchParams(searchParams)
    next.set('period', nextPeriod)
    next.delete('date_from')
    next.delete('date_to')
    setSearchParams(next)
  }

  const setDashboardDate = (key: 'date_from' | 'date_to', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (value) next.set('period', 'all')
    setSearchParams(next)
  }

  const reportParams = new URLSearchParams()
  if (reportPeriod !== 'all') reportParams.set('period', reportPeriod)
  if (reportEducationLevel !== 'all') reportParams.set('education_level', reportEducationLevel)
  if (reportCourse !== '0') reportParams.set('course', reportCourse)
  if (reportGroup !== 'all') reportParams.set('group', reportGroup)
  if (reportDateFrom) reportParams.set('date_from', reportDateFrom)
  if (reportDateTo) reportParams.set('date_to', reportDateTo)
  reportStudents.forEach((s) => reportParams.append('student_ids', String(s.id)))
  const reportCourseOptions = reportEducationLevel !== 'all' ? coursesForEducationLevel(reportEducationLevel) : []
  const reportGroupOptions = reportEducationLevel !== 'all'
    ? reportCourse !== '0'
      ? groupsForEducationLevel(reportEducationLevel, reportCourse)
      : groupsForEducationLevel(reportEducationLevel)
    : []
  const handleReportDownload = async () => {
    setIsExportingReport(true)
    setError(null)
    try {
      const response = await reportsApi.exportCsv(reportType, reportParams)
      const href = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href = href
      link.download = `${reportType}_report.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'Не удалось выгрузить CSV.'))
    } finally {
      setIsExportingReport(false)
    }
  }
  const staffCards = [
    { label: 'Новых студентов', value: `+${stats?.new_users_count ?? 0}` },
    { label: 'Всего загружено док.', value: `${stats?.total_achievements ?? 0}` },
    { label: 'Одобрено модерацией', value: `${stats?.approved_achievements ?? 0}` },
  ]
  const studentCards = [
    { label: 'Баллы за период', value: `${stats?.my_points ?? 0}`, accent: true },
    { label: 'Место в потоке', value: (stats?.my_rank ?? 0) > 0 ? `#${stats?.my_rank}` : '-' },
    { label: 'Загружено документов', value: `${stats?.my_docs ?? 0}` },
    { label: 'На проверке', value: `${stats?.pending_achievements ?? 0}` },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{isStaff ? 'Обзор статистики' : 'Мой прогресс'}</h2>
          <p className="text-sm text-slate-500 mt-1">{periodDescription(period)}</p>
        </div>

        <div className="w-full lg:max-w-[720px] space-y-2">
          <div className="grid min-h-[46px] grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-surface p-1 text-sm font-medium shadow-sm">
              {PERIODS.map((item) => (
                <a key={item} href={`?period=${item}`} onClick={(event) => { event.preventDefault(); setPeriod(item) }} className={`flex-1 rounded-lg px-3 py-2 text-center transition-colors ${period === item && !dateFrom && !dateTo ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {{ day: 'День', week: 'Неделя', month: 'Месяц', all: 'Всё время' }[item]}
                </a>
              ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
              <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
              </svg>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">С</span>
              <input type="date" value={dateFrom} onChange={(event) => setDashboardDate('date_from', event.target.value)} className="w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-slate-700 outline-none" />
            </label>
            <label className="flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
              <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
              </svg>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">По</span>
              <input type="date" value={dateTo} onChange={(event) => setDashboardDate('date_to', event.target.value)} className="w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-slate-700 outline-none" />
            </label>
          </div>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <PointsGuide />

      {isStaff ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {staffCards.map((card) => (
              <div key={card.label} className="bg-surface p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">{card.label}</p></div>
                <p className="text-3xl font-semibold text-slate-800">{card.value}</p>
              </div>
            ))}
            <div className="bg-indigo-600 p-5 rounded-xl shadow-sm flex flex-col text-white relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9V5a1 1 0 012 0v4h2.5a.5.5 0 010 1h-3A1.5 1.5 0 019 9z"></path></svg></div>
              <div className="flex items-center gap-2 mb-2 relative z-10"><div className="w-2 h-2 rounded-full bg-surface/60"></div><p className="text-[10px] text-white/90 uppercase font-bold tracking-wider">Ожидают проверки</p></div>
              <div className="flex items-end justify-between gap-3 relative z-10 mt-auto">
                <p className="text-3xl font-bold text-white leading-none">{stats?.pending_achievements ?? 0}</p>
                {(stats?.pending_achievements ?? 0) > 0 ? (
                  <Link to="/moderation/achievements" className="shrink-0 text-[11px] bg-white text-indigo-700 px-2.5 py-1 rounded font-bold hover:bg-indigo-50 transition-colors shadow-sm">
                    Проверить →
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Пользователи',
                items: [
                  ['Всего', stats?.users_stats?.total],
                  ['Активные', stats?.users_stats?.active],
                  ['Ожидают проверки', stats?.users_stats?.pending],
                  ['Удалены', stats?.users_stats?.deleted],
                  ['Студенты', stats?.users_stats?.students],
                  ['Модераторы', stats?.users_stats?.moderators],
                ],
              },
              {
                title: 'Документы',
                items: [
                  ['Всего', stats?.documents_stats?.total],
                  ['На проверке', stats?.documents_stats?.pending],
                  ['Одобрено', stats?.documents_stats?.approved],
                  ['Отклонено', stats?.documents_stats?.rejected],
                  ['На доработке', stats?.documents_stats?.revision],
                  ['Со ссылкой', stats?.documents_stats?.with_link],
                ],
              },
              {
                title: 'Обращения',
                items: [
                  ['Всего за период', stats?.support_stats?.total],
                  ['Открытые', stats?.support_stats?.open],
                  ['В работе', stats?.support_stats?.in_progress],
                  ['Закрытые', stats?.support_stats?.closed],
                ],
              },
            ].map((group) => (
              <div key={group.title} className="bg-surface rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">{group.title}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {group.items.map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
                      <div className="mt-1 text-xl font-semibold text-slate-800">{value ?? 0}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {stats?.recommendations?.length ? (
            <div className="bg-surface rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Рекомендации по направлениям</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {stats.recommendations.map((item) => (
                  <div key={item.title} className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-400/30 dark:bg-indigo-500/15">
                    <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-indigo-800/75 dark:text-indigo-100/85">{item.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="bg-surface p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold text-slate-800">Экспорт отчётов (CSV)</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Тип отчёта</label><select value={reportType} onChange={(event) => setReportType(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all"><option value="moderation">Очередь модерации</option><option value="documents">Документы</option><option value="categories">По направлениям</option><option value="leaderboard">Рейтинг</option><option value="students">По студентам</option><option value="groups">По группам</option><option value="streams">По потокам</option><option value="aggregate">Агрегированная</option><option value="support">Обращения</option></select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Период</label><select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all"><option value="all">Всё время</option><option value="day">Последние 24 часа</option><option value="week">Последние 7 дней</option><option value="month">Последние 30 дней</option></select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Уровень обучения</label><select value={reportEducationLevel} onChange={(event) => setReportEducationLevel(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all"><option value="all">Все направления</option>{EDUCATION_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Курс</label><select value={reportCourse} onChange={(event) => { setReportCourse(event.target.value); setReportGroup('all') }} disabled={reportEducationLevel === 'all'} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all disabled:opacity-50"><option value="0">Все курсы</option>{reportCourseOptions.map((item) => <option key={item} value={item}>{item} курс</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Группа</label><select value={reportGroup} onChange={(event) => setReportGroup(event.target.value)} disabled={reportEducationLevel === 'all'} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all disabled:opacity-50"><option value="all">Все группы</option>{reportGroupOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Дата с</label><input type="date" value={reportDateFrom} onChange={(event) => setReportDateFrom(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Дата по</label><input type="date" value={reportDateTo} onChange={(event) => setReportDateTo(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-surface focus:border-indigo-600 outline-none transition-all" /></div>
              <div className="md:col-span-2 lg:col-span-3">
                <SearchAutocompleteInput
                  label="Студенты"
                  value={reportStudentQuery}
                  placeholder="Имя, фамилия или email…"
                  suggestions={reportStudentSuggestions}
                  onChange={setReportStudentQuery}
                  onSelectSuggestion={(item) => {
                    if (item.id == null) return
                    setReportStudents((current) =>
                      current.some((s) => s.id === item.id)
                        ? current
                        : [...current, { id: item.id!, label: item.text }],
                    )
                    setReportStudentQuery('')
                    setReportStudentSuggestions([])
                  }}
                />
                {reportStudents.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reportStudents.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700"
                      >
                        {s.label}
                        <button
                          type="button"
                          onClick={() => setReportStudents((current) => current.filter((item) => item.id !== s.id))}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-indigo-500 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
                          aria-label="Убрать"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3"><button type="button" onClick={() => void handleReportDownload()} disabled={isExportingReport} className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-60"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>{isExportingReport ? 'Готовим...' : 'Скачать CSV'}</button><p className="text-[10px] text-slate-400">{REPORT_DESCRIPTIONS[reportType]}</p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface p-5 rounded-xl border border-slate-200 shadow-sm"><h3 className="text-sm font-semibold text-slate-800 mb-4">Динамика загрузки достижений</h3><div className="h-64 w-full"><canvas ref={chartCanvasRef}></canvas></div></div>
            <div className="bg-surface p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col"><h3 className="text-sm font-semibold text-slate-800 mb-4">Лидеры периода</h3><div className="overflow-y-auto flex-1 pr-2 scrollbar-hide"><div className="space-y-4">{stats?.top_students?.length ? stats.top_students.map((row, index) => <div key={row.id} className="flex items-center justify-between group"><div className="flex items-center"><div className={`w-8 h-8 rounded-full ${index === 0 ? 'bg-yellow-100 text-yellow-600' : index === 1 ? 'bg-slate-200 text-slate-600' : index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center text-xs font-bold mr-3`}>{index + 1}</div><div><Link to={`/users/${row.id}`} className="text-sm font-medium text-slate-800 hover:text-indigo-600 transition-colors">{row.first_name} {row.last_name.slice(0, 1)}.</Link><div className="text-[10px] text-slate-400">{[row.course ? `${row.course} курс` : null, row.study_group || null].filter(Boolean).join(' • ') || row.education_level || '—'}</div></div></div><div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">+{row.points}</div></div>) : <div className="text-center text-slate-400 text-xs py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">Нет начисленных баллов за период</div>}</div></div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="bg-surface p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Активность по категориям</h3>
              <div className="space-y-3 mb-5">
                {stats?.category_activity?.length ? (() => {
                  const max = Math.max(...stats.category_activity.map((c) => c.count))
                  return stats.category_activity.map((cat) => (
                    <div key={cat.category}>
                      <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                        <span>{cat.category}</span>
                        <span className="text-slate-500">{cat.count} док.{cat.points ? ` · ${cat.points} б.` : ''}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-indigo-500 h-2" style={{ width: `${max > 0 ? (cat.count / max) * 100 : 0}%` }}></div>
                      </div>
                    </div>
                  ))
                })() : <div className="text-center text-slate-400 text-xs py-6">Нет активности за период</div>}
              </div>
            </div>
            <div className="bg-surface p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Активность по курсам и группам</h3>
              {(() => {
                const allCourses = coursesForEducationLevel('Специалитет')
                const cohorts = stats?.cohorts ?? []
                const courseList = allCourses.map((courseNumber) => {
                  const fromBackend = cohorts.find((c) => c.kind === 'course' && parseInt(c.education_level, 10) === courseNumber)
                  return fromBackend ?? { education_level: `${courseNumber} курс`, kind: 'course' as const, count: 0, total: 0, pending: 0 }
                })
                return courseList.length ? (
                <div className="space-y-4">
                  {courseList.map((course) => {
                    const courseNumber = parseInt(course.education_level, 10)
                    const courseTotal = course.total ?? course.count ?? 0
                    const coursePending = course.pending ?? 0
                    const backendGroups = cohorts.filter((c) => c.kind === 'group' && c.parent_course === courseNumber)
                    const configuredGroupNames = groupsForEducationLevel('Специалитет', courseNumber)
                    const groupNamesSet = new Set<string>(configuredGroupNames)
                    backendGroups.forEach((g) => groupNamesSet.add(g.education_level))
                    const groupChildren = Array.from(groupNamesSet).map((name) => {
                      const fromBackend = backendGroups.find((g) => g.education_level === name)
                      return fromBackend ?? { education_level: name, kind: 'group' as const, parent_course: courseNumber, count: 0, total: 0, pending: 0 }
                    })
                    return (
                      <div key={`course-${course.education_level}`} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex justify-between text-xs font-semibold text-slate-800 mb-1.5">
                          <span>{course.education_level}</span>
                          <span className="text-slate-500 font-normal">
                            {courseTotal} док.{coursePending > 0 ? ` · ${coursePending} ожидает` : ''}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex mb-3">
                          {courseTotal > 0 ? (
                            <>
                              <div className="bg-indigo-500 h-2" style={{ width: `${100 - Math.round((coursePending / courseTotal) * 100)}%` }} />
                              <div className="bg-yellow-400 h-2" style={{ width: `${Math.round((coursePending / courseTotal) * 100)}%` }} />
                            </>
                          ) : null}
                        </div>
                        {groupChildren.length ? (
                          <div className="space-y-2 pl-3 border-l-2 border-slate-100">
                            {groupChildren.map((group) => {
                              const total = group.total ?? group.count ?? 0
                              const pending = group.pending ?? 0
                              const approvedPercent = total > 0 ? 100 - Math.round((pending / total) * 100) : 0
                              const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0
                              return (
                                <div key={`group-${group.education_level}`}>
                                  <div className="flex justify-between text-[11px] font-medium text-slate-700 mb-1">
                                    <span>{group.education_level}</span>
                                    <span className="text-slate-500">
                                      {total} док.{pending > 0 ? ` · ${pending} ожидает` : ''}
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden flex">
                                    {total > 0 ? (
                                      <>
                                        <div className="bg-indigo-400 h-1.5" style={{ width: `${approvedPercent}%` }} />
                                        <div className="bg-yellow-300 h-1.5" style={{ width: `${pendingPercent}%` }} />
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                ) : (
                  <div className="text-center text-slate-400 text-xs py-8">Нет данных по курсам и группам</div>
                )
              })()}
            </div>
            <div className="lg:col-span-2 bg-surface rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"><div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0"><h3 className="text-sm font-semibold text-slate-700">Последние загрузки</h3><Link to="/documents" className="text-[10px] text-indigo-600 font-bold uppercase hover:underline flex items-center">Все документы <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg></Link></div><div className="overflow-x-auto flex-1"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-surface text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider"><tr><th className="px-5 py-3 font-bold">Название</th><th className="px-5 py-3 font-bold">Студент</th><th className="px-5 py-3 font-bold">Категория</th><th className="px-5 py-3 font-bold text-right">Статус</th></tr></thead><tbody className="divide-y divide-slate-50">{stats?.recent_achievements?.length ? stats.recent_achievements.map((doc) => <tr key={doc.id} className="hover:bg-slate-50 transition-colors"><td className="px-5 py-3"><div className="font-medium text-slate-800">{doc.title}</div><div className="text-[10px] text-slate-400">{formatDateTime(doc.created_at)}</div></td><td className="px-5 py-3 text-slate-600 text-xs">{doc.user ? `${doc.user.first_name} ${doc.user.last_name}` : '—'}</td><td className="px-5 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">{doc.category || '—'}</span></td><td className="px-5 py-3 text-right"><span className={statusClass(doc.status)}>{statusLabel(doc.status)}</span></td></tr>) : <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-xs bg-slate-50/50">Новых документов пока нет</td></tr>}</tbody></table></div></div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {studentCards.map((card) => (
              <div key={card.label} className={`${card.accent ? 'bg-indigo-600 text-white shadow-md' : 'bg-surface border border-slate-200 shadow-sm'} p-5 rounded-xl flex flex-col justify-between relative overflow-hidden`}>
                {card.accent ? <div className="absolute -right-4 -bottom-4 opacity-10"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A12.014 12.014 0 0010 1c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-1.12 14.86a.75.75 0 01-1.36 0l-1.8-4.2a2.25 2.25 0 00-1.24-1.24l-4.2-1.8a.75.75 0 010-1.36l4.2-1.8a2.25 2.25 0 001.24-1.24l1.8-4.2a.75.75 0 011.36 0l1.8 4.2a2.25 2.25 0 001.24 1.24l4.2 1.8a.75.75 0 010 1.36l-4.2 1.8a2.25 2.25 0 00-1.24 1.24l-1.8 4.2z" clipRule="evenodd"></path></svg></div> : null}
                <p className={`text-[10px] uppercase font-bold tracking-wider ${card.accent ? 'text-indigo-200 relative z-10' : 'text-slate-500'}`}>{card.label}</p>
                <p className={`text-4xl font-bold mt-2 ${card.accent ? 'text-white relative z-10' : 'text-slate-800'}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {stats?.recommendations?.length ? (
            <div className="bg-surface rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Рекомендации по направлениям</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {stats.recommendations.map((item) => (
                  <div key={item.title} className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-400/30 dark:bg-indigo-500/15">
                    <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-indigo-800/75 dark:text-indigo-100/85">{item.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-surface p-5 rounded-xl border border-slate-200 shadow-sm"><h3 className="text-sm font-semibold text-slate-800 mb-4">Структура баллов</h3><div className="h-48 w-full flex items-center justify-center">{(stats?.my_points ?? 0) > 0 && stats?.category_breakdown?.length ? <canvas ref={chartCanvasRef}></canvas> : <div className="text-center text-slate-400"><p className="text-xs">Нет баллов за период</p>{period === 'all' ? <Link to="/achievements" className="inline-flex mt-3 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-100 transition-colors">Загрузить достижение</Link> : null}</div>}</div></div>
            <div className="lg:col-span-2 bg-surface rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"><div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0"><h3 className="text-sm font-semibold text-slate-700">Последняя активность</h3><Link to="/achievements" className="text-[10px] text-indigo-600 font-bold uppercase hover:underline flex items-center">Все записи <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg></Link></div><div className="overflow-x-auto flex-1"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-surface text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider"><tr><th className="px-5 py-3 font-bold">Название</th><th className="px-5 py-3 font-bold">Категория</th><th className="px-5 py-3 font-bold text-right">Баллы</th><th className="px-5 py-3 font-bold text-right">Статус</th></tr></thead><tbody className="divide-y divide-slate-50">{stats?.my_recent_docs?.length ? stats.my_recent_docs.map((doc) => <tr key={doc.id} className="hover:bg-slate-50 transition-colors"><td className="px-5 py-3"><div className="font-medium text-slate-800">{doc.title}</div><div className="text-[10px] text-slate-400">{new Date(doc.created_at).toLocaleDateString('ru-RU')}</div></td><td className="px-5 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">{doc.category || '—'}</span></td><td className="px-5 py-3 text-right font-bold text-xs">{(doc.points ?? 0) > 0 ? <span className="text-indigo-600">+{doc.points}</span> : <span className="text-slate-300">—</span>}</td><td className="px-5 py-3 text-right"><span className={statusClass(doc.status)}>{statusLabel(doc.status)}</span></td></tr>) : <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-xs bg-slate-50/50">У вас пока нет загруженных документов.</td></tr>}</tbody></table></div></div>
          </div>
        </>
      )}
    </div>
  )
}
