import Chart from 'chart.js/auto'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { dashboardApi, type DashboardStats } from '@/api/dashboard'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

const PERIODS = ['day', 'week', 'month', 'all'] as const
const EDUCATION_LEVELS = ['Колледж', 'Бакалавриат', 'Специалитет', 'Магистратура', 'Аспирантура']
const REPORT_DESCRIPTIONS: Record<string, string> = {
  moderation: 'Документы, ожидающие проверки модератором',
  categories: 'Сводка по категориям и уровням достижений',
  leaderboard: 'Рейтинг студентов с баллами и количеством документов',
  users: 'Полный список студентов с контактными данными',
}

function normalizePeriod(value: string | null) {
  return PERIODS.includes((value ?? '') as (typeof PERIODS)[number]) ? (value as (typeof PERIODS)[number]) : 'all'
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
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart | null>(null)

  const period = normalizePeriod(searchParams.get('period'))
  const isStaff = user?.role === 'MODERATOR' || user?.role === 'SUPER_ADMIN'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await dashboardApi.getStats(period)
        setStats(response.data)
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Не удалось загрузить дашборд.'))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [period])

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

  if (isLoading && !stats) {
    return <div className="max-w-6xl mx-auto bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500 shadow-sm">Загрузка данных…</div>
  }

  if (error && !stats) {
    return <div className="max-w-6xl mx-auto bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700 shadow-sm">{error}</div>
  }

  if (stats?.pending_review) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-4">
          <div className="bg-white p-8 rounded-xl border border-yellow-200 max-w-md w-full shadow-sm">
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
    setSearchParams(next)
  }

  const reportParams = new URLSearchParams()
  if (reportPeriod !== 'all') reportParams.set('period', reportPeriod)
  if (reportEducationLevel !== 'all') reportParams.set('education_level', reportEducationLevel)
  if (reportCourse !== '0') reportParams.set('course', reportCourse)
  const reportUrl = `${reportType === 'users' && !isSuperAdmin ? 'moderation' : reportType}${reportParams.toString() ? `?${reportParams.toString()}` : ''}`
  const staffCards = [
    { label: 'Новых студентов', value: `+${stats?.new_users_count ?? 0}` },
    { label: 'Всего загружено док.', value: `${stats?.total_achievements ?? 0}` },
    { label: 'Одобрено модерацией', value: `${stats?.approved_achievements ?? 0}` },
  ]
  const studentCards = [
    { label: 'Баллы за период', value: `${stats?.my_points ?? 0}`, accent: true },
    { label: 'Место в лиге', value: (stats?.my_rank ?? 0) > 0 ? `#${stats?.my_rank}` : '-' },
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

        <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex text-xs font-medium inline-flex min-w-max">
            {PERIODS.map((item) => (
              <a key={item} href={`?period=${item}`} onClick={(event) => { event.preventDefault(); setPeriod(item) }} className={`px-3 py-1.5 rounded-md transition-colors ${period === item ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {{ day: 'День', week: 'Неделя', month: 'Месяц', all: 'Всё время' }[item]}
              </a>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {isStaff ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {staffCards.map((card) => (
              <div key={card.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">{card.label}</p></div>
                <p className="text-3xl font-semibold text-slate-800">{card.value}</p>
              </div>
            ))}
            <div className="bg-indigo-600 p-5 rounded-xl shadow-sm flex flex-col justify-between text-white relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9V5a1 1 0 012 0v4h2.5a.5.5 0 010 1h-3A1.5 1.5 0 019 9z"></path></svg></div>
              <div className="flex items-center gap-2 mb-2 relative z-10"><div className="w-2 h-2 rounded-full bg-white/60"></div><p className="text-[10px] text-white/90 uppercase font-bold tracking-wider">Ожидают проверки</p></div>
              <p className="text-3xl font-bold text-white relative z-10">{stats?.pending_achievements ?? 0}</p>
              {(stats?.pending_achievements ?? 0) > 0 ? <Link to="/moderation/achievements" className="absolute bottom-4 right-4 text-[10px] bg-white text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-50 transition-colors z-10">Проверить →</Link> : null}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold text-slate-800">Экспорт отчётов (CSV)</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Тип отчёта</label><select value={reportType} onChange={(event) => setReportType(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none transition-all"><option value="moderation">Очередь модерации</option><option value="categories">Статистика по категориям</option><option value="leaderboard">Рейтинг студентов</option>{isSuperAdmin ? <option value="users">Список студентов</option> : null}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Период</label><select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none transition-all"><option value="all">Всё время</option><option value="day">Последние 24 часа</option><option value="week">Последние 7 дней</option><option value="month">Последние 30 дней</option></select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Уровень обучения</label><select value={reportEducationLevel} onChange={(event) => setReportEducationLevel(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none transition-all"><option value="all">Все направления</option>{EDUCATION_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Курс</label><select value={reportCourse} onChange={(event) => setReportCourse(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none transition-all"><option value="0">Все курсы</option><option value="1">1 курс</option><option value="2">2 курс</option><option value="3">3 курс</option><option value="4">4 курс</option><option value="5">5 курс</option><option value="6">6 курс</option></select></div>
            </div>
            <div className="flex items-center gap-3"><a href={`/sirius.achievements/reports/${reportUrl}`} className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow-sm"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Скачать CSV</a><p className="text-[10px] text-slate-400">{REPORT_DESCRIPTIONS[reportType]}</p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><h3 className="text-sm font-semibold text-slate-800 mb-4">Динамика загрузки достижений</h3><div className="h-64 w-full"><canvas ref={chartCanvasRef}></canvas></div></div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col"><h3 className="text-sm font-semibold text-slate-800 mb-4">Лидеры периода</h3><div className="overflow-y-auto flex-1 pr-2 scrollbar-hide"><div className="space-y-4">{stats?.top_students?.length ? stats.top_students.map((row, index) => <div key={row.id} className="flex items-center justify-between group"><div className="flex items-center"><div className={`w-8 h-8 rounded-full ${index === 0 ? 'bg-yellow-100 text-yellow-600' : index === 1 ? 'bg-slate-200 text-slate-600' : index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center text-xs font-bold mr-3`}>{index + 1}</div><div><Link to={`/users/${row.id}`} className="text-sm font-medium text-slate-800 hover:text-indigo-600 transition-colors">{row.first_name} {row.last_name.slice(0, 1)}.</Link><div className="text-[10px] text-slate-400">{row.education_level || '—'}</div></div></div><div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">+{row.points}</div></div>) : <div className="text-center text-slate-400 text-xs py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">Нет начисленных баллов за период</div>}</div></div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col"><h3 className="text-sm font-semibold text-slate-800 mb-4">Активность по потокам</h3><div className="space-y-5">{stats?.cohorts?.length ? stats.cohorts.map((cohort) => { const total = cohort.total ?? cohort.count ?? 0; const pending = cohort.pending ?? 0; const approvedPercent = total > 0 ? 100 - Math.round((pending / total) * 100) : 0; const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0; return <div key={cohort.education_level}><div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5"><span>{cohort.education_level}</span><span className="text-slate-500">{total} док.</span></div><div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">{total > 0 ? <><div className="bg-indigo-500 h-2" style={{ width: `${approvedPercent}%` }}></div><div className="bg-yellow-400 h-2" style={{ width: `${pendingPercent}%` }}></div></> : null}</div>{pending > 0 ? <div className="text-[9px] text-yellow-600 font-medium mt-1 text-right">{pending} ожидают проверки</div> : null}</div> }) : <div className="text-center text-slate-400 text-xs py-8">Нет данных по направлениям</div>}</div></div>
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"><div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0"><h3 className="text-sm font-semibold text-slate-700">Последние загрузки</h3><Link to="/documents" className="text-[10px] text-indigo-600 font-bold uppercase hover:underline flex items-center">Все документы <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg></Link></div><div className="overflow-x-auto flex-1"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-white text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider"><tr><th className="px-5 py-3 font-bold">Название</th><th className="px-5 py-3 font-bold">Студент</th><th className="px-5 py-3 font-bold">Категория</th><th className="px-5 py-3 font-bold text-right">Статус</th></tr></thead><tbody className="divide-y divide-slate-50">{stats?.recent_achievements?.length ? stats.recent_achievements.map((doc) => <tr key={doc.id} className="hover:bg-slate-50 transition-colors"><td className="px-5 py-3"><div className="font-medium text-slate-800">{doc.title}</div><div className="text-[10px] text-slate-400">{formatDateTime(doc.created_at)}</div></td><td className="px-5 py-3 text-slate-600 text-xs">{doc.user ? `${doc.user.first_name} ${doc.user.last_name}` : '—'}</td><td className="px-5 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">{doc.category || '—'}</span></td><td className="px-5 py-3 text-right"><span className={statusClass(doc.status)}>{statusLabel(doc.status)}</span></td></tr>) : <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-xs bg-slate-50/50">Новых документов пока нет</td></tr>}</tbody></table></div></div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {studentCards.map((card) => (
              <div key={card.label} className={`${card.accent ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 shadow-sm'} p-5 rounded-xl flex flex-col justify-between relative overflow-hidden`}>
                {card.accent ? <div className="absolute -right-4 -bottom-4 opacity-10"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A12.014 12.014 0 0010 1c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-1.12 14.86a.75.75 0 01-1.36 0l-1.8-4.2a2.25 2.25 0 00-1.24-1.24l-4.2-1.8a.75.75 0 010-1.36l4.2-1.8a2.25 2.25 0 001.24-1.24l1.8-4.2a.75.75 0 011.36 0l1.8 4.2a2.25 2.25 0 001.24 1.24l4.2 1.8a.75.75 0 010 1.36l-4.2 1.8a2.25 2.25 0 00-1.24 1.24l-1.8 4.2z" clipRule="evenodd"></path></svg></div> : null}
                <p className={`text-[10px] uppercase font-bold tracking-wider ${card.accent ? 'text-indigo-200 relative z-10' : 'text-slate-500'}`}>{card.label}</p>
                <p className={`text-4xl font-bold mt-2 ${card.accent ? 'text-white relative z-10' : 'text-slate-800'}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><h3 className="text-sm font-semibold text-slate-800 mb-4">Структура баллов</h3><div className="h-48 w-full flex items-center justify-center">{(stats?.my_points ?? 0) > 0 && stats?.category_breakdown?.length ? <canvas ref={chartCanvasRef}></canvas> : <div className="text-center text-slate-400"><p className="text-xs">Нет баллов за период</p>{period === 'all' ? <Link to="/achievements" className="inline-flex mt-3 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-100 transition-colors">Загрузить достижение</Link> : null}</div>}</div></div>
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"><div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0"><h3 className="text-sm font-semibold text-slate-700">Последняя активность</h3><Link to="/achievements" className="text-[10px] text-indigo-600 font-bold uppercase hover:underline flex items-center">Все записи <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg></Link></div><div className="overflow-x-auto flex-1"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-white text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider"><tr><th className="px-5 py-3 font-bold">Название</th><th className="px-5 py-3 font-bold">Категория</th><th className="px-5 py-3 font-bold text-right">Баллы</th><th className="px-5 py-3 font-bold text-right">Статус</th></tr></thead><tbody className="divide-y divide-slate-50">{stats?.my_recent_docs?.length ? stats.my_recent_docs.map((doc) => <tr key={doc.id} className="hover:bg-slate-50 transition-colors"><td className="px-5 py-3"><div className="font-medium text-slate-800">{doc.title}</div><div className="text-[10px] text-slate-400">{new Date(doc.created_at).toLocaleDateString('ru-RU')}</div></td><td className="px-5 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">{doc.category || '—'}</span></td><td className="px-5 py-3 text-right font-bold text-xs">{(doc.points ?? 0) > 0 ? <span className="text-indigo-600">+{doc.points}</span> : <span className="text-slate-300">—</span>}</td><td className="px-5 py-3 text-right"><span className={statusClass(doc.status)}>{statusLabel(doc.status)}</span></td></tr>) : <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-xs bg-slate-50/50">У вас пока нет загруженных документов.</td></tr>}</tbody></table></div></div>
          </div>
        </>
      )}
    </div>
  )
}
