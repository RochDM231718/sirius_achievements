import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Chart from 'chart.js/auto'

import { publicApi, PublicStudentResponse } from '@/api/public'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { getErrorMessage } from '@/utils/http'

function buildStaticUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
  return `/static/${path.replace(/^\/+/, '')}`
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

const CAT_COLORS = ['#6d5ef3', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#059669', '#7c3aed', '#0284c7']

export function StudentProfilePage() {
  const { id } = useParams<{ id: string }>()
  const studentId = Number(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const progressChartRef = useRef<HTMLCanvasElement>(null)
  const categoryChartRef = useRef<HTMLCanvasElement>(null)
  const progressInstanceRef = useRef<Chart | null>(null)
  const categoryInstanceRef = useRef<Chart | null>(null)
  const [data, setData] = useState<PublicStudentResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!Number.isFinite(studentId)) {
        setError('Некорректный идентификатор студента.')
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const response = await publicApi.getStudent(studentId)
        setData(response.data)
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Не удалось загрузить публичный профиль.'))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [studentId])

  useEffect(() => {
    if (!data) return

    // Progress chart
    if (progressChartRef.current && data.chart_labels?.length) {
      progressInstanceRef.current?.destroy()
      const font = { family: "'Inter', system-ui, sans-serif", size: 10 }
      progressInstanceRef.current = new Chart(progressChartRef.current, {
        type: 'line',
        data: {
          labels: data.chart_labels,
          datasets: [
            {
              label: 'Баллы (накопительно)',
              data: data.chart_cumulative,
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.06)',
              fill: true,
              borderWidth: 2,
              tension: 0.35,
              pointBackgroundColor: '#fff',
              pointBorderColor: '#6366f1',
              pointBorderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              yAxisID: 'y',
            },
            {
              label: 'Баллы за месяц',
              data: data.chart_points,
              borderColor: '#a78bfa',
              backgroundColor: 'rgba(167, 139, 250, 0.06)',
              fill: true,
              borderWidth: 1.5,
              borderDash: [5, 3],
              tension: 0.35,
              pointBackgroundColor: '#fff',
              pointBorderColor: '#a78bfa',
              pointBorderWidth: 1.5,
              pointRadius: 2.5,
              pointHoverRadius: 5,
              yAxisID: 'y',
            },
            {
              label: 'Загрузки',
              data: data.chart_uploads,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.06)',
              fill: true,
              borderWidth: 1.5,
              tension: 0.35,
              pointBackgroundColor: '#fff',
              pointBorderColor: '#10b981',
              pointBorderWidth: 1.5,
              pointRadius: 2.5,
              pointHoverRadius: 5,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { font, usePointStyle: true, pointStyle: 'circle', padding: 16, boxWidth: 8, boxHeight: 8 } },
            tooltip: { backgroundColor: '#1e293b', titleFont: { ...font, weight: 'bold' }, bodyFont: font, padding: 10, cornerRadius: 8, boxPadding: 4 },
          },
          scales: {
            y: { beginAtZero: true, position: 'left', grid: { color: '#f1f5f9' }, ticks: { font, color: '#94a3b8' }, title: { display: true, text: 'Баллы', font: { ...font, size: 9 }, color: '#94a3b8' } },
            y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { font, color: '#10b981', stepSize: 1 }, title: { display: true, text: 'Документы', font: { ...font, size: 9 }, color: '#10b981' } },
            x: { grid: { display: false }, ticks: { font, color: '#64748b' } },
          },
        },
      })
    }

    // Category doughnut chart
    if (categoryChartRef.current && data.category_breakdown?.length) {
      categoryInstanceRef.current?.destroy()
      const font = { family: "'Inter', system-ui, sans-serif", size: 10 }
      categoryInstanceRef.current = new Chart(categoryChartRef.current, {
        type: 'doughnut',
        data: {
          labels: data.category_breakdown.map((c) => c.category),
          datasets: [{
            data: data.category_breakdown.map((c) => c.count),
            backgroundColor: CAT_COLORS.slice(0, data.category_breakdown.length),
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          cutout: '60%',
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#1e293b', titleFont: { ...font, weight: 'bold' }, bodyFont: font, padding: 10, cornerRadius: 8, boxPadding: 4 },
          },
        },
      })
    }

    return () => {
      progressInstanceRef.current?.destroy()
      progressInstanceRef.current = null
      categoryInstanceRef.current?.destroy()
      categoryInstanceRef.current = null
    }
  }, [data])

  const handleBack = () => {
    if (document.referrer && document.referrer.indexOf(location.hostname) !== -1) {
      navigate(-1)
    } else {
      navigate('/dashboard')
    }
  }

  if (isLoading) return <div className="py-16"><LoadingSpinner /></div>
  if (!data) return null

  const hasChartData = Boolean(data.chart_labels?.length)
  const catStats = data.category_breakdown ?? []

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button type="button" onClick={handleBack} className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          Назад
        </button>
        <span className="text-xs text-slate-400">Публичный профиль</span>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="flex-shrink-0">
            {data.student.avatar_path ? (
              <img src={buildStaticUrl(data.student.avatar_path)} alt="Аватар" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                {data.student.first_name[0]}{data.student.last_name[0]}
              </div>
            )}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-slate-800">{data.student.first_name} {data.student.last_name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {data.student.education_level ? `${data.student.education_level}${data.student.course ? `, ${data.student.course} курс` : ''}` : ''}
            </p>
          </div>

          <div className="flex gap-4 sm:gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-indigo-600">{data.total_points}</div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">Баллов</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-700">{data.total_docs}</div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">Достижений</div>
            </div>
            {data.student.session_gpa ? (
              <div>
                <div className="text-2xl font-bold text-slate-700">{data.student.session_gpa}</div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">Оценка</div>
              </div>
            ) : null}
            {data.rank ? (
              <div>
                <div className="text-2xl font-bold text-amber-500">#{data.rank}</div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">Рейтинг</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {data.student.session_gpa ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Оценка модератора</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">Средний балл сессии</div>
                  <div className="mt-1 text-3xl font-bold text-slate-800">{data.student.session_gpa}</div>
                </div>
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-indigo-400">Бонус в рейтинг</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-700">+{data.gpa_bonus}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {hasChartData ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Динамика достижений</h3>
              <canvas ref={progressChartRef} height="160" />
            </div>
          ) : null}

          {catStats.length ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">По категориям</h3>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-48 h-48 flex-shrink-0">
                  <canvas ref={categoryChartRef} />
                </div>
                <div className="flex-1 space-y-2">
                  {catStats.map((item) => (
                    <div key={item.category} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{item.category}</span>
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Достижения ({data.total_docs})</h3>
            {data.achievements.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.achievements.map((a) => (
                  <div key={a.id} className="group block bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all overflow-hidden">
                    <div className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800 min-h-[2.5rem]" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</p>
                        <div className="inline-flex items-center rounded-full bg-green-500 text-white text-[10px] font-bold px-2 py-1 shadow-sm shrink-0">
                          +{a.points || 0}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.category ? <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">{a.category}</span> : null}
                        {a.result ? <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">{a.result}</span> : null}
                        {a.level ? <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{a.level}</span> : null}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">{formatDate(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">Нет одобренных достижений</p>
            )}
          </div>
        </div>
      </div>

      {data.student.resume_text ? (
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">AI-сводка профиля</h3>
          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{data.student.resume_text}</div>
        </div>
      ) : null}

      <p className="text-center text-xs text-slate-400 mt-8">Sirius.Achievements &copy; 2026</p>
    </div>
  )
}
