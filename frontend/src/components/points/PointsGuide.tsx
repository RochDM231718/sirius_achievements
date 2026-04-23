import { useEffect, useMemo, useState } from 'react'

import { pointsApi, type PointsRulesResponse } from '@/api/points'

function multiplierLabel(percent: number) {
  return `${percent}%`
}

export function PointsGuide() {
  const [rules, setRules] = useState<PointsRulesResponse | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const response = await pointsApi.getRules()
        if (mounted) {
          setRules(response.data)
        }
      } catch {
        if (mounted) {
          setRules(null)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  const resultLabels = useMemo(() => rules?.result_multipliers.map((item) => item.result) ?? [], [rules])

  if (!rules) {
    return null
  }

  return (
    <section className="rounded-xl border border-indigo-100 bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-indigo-50/40"
      >
        <div>
          <h3 className="text-sm font-bold text-slate-800">Как начисляются баллы</h3>
          <p className="mt-1 text-xs text-slate-500">
            {rules.formula}. Категории распределяют баланс по направлениям.
          </p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen ? (
        <div className="border-t border-indigo-50 px-5 py-4">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.9fr)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="pb-2 font-bold">Уровень</th>
                    <th className="pb-2 text-right font-bold">База</th>
                    {resultLabels.map((result) => (
                      <th key={result} className="pb-2 text-right font-bold">
                        {result}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.matrix.map((row) => (
                    <tr key={row.level}>
                      <td className="py-2 font-medium text-slate-700">{row.level}</td>
                      <td className="py-2 text-right font-semibold text-slate-500">{row.base_points}</td>
                      {resultLabels.map((result) => (
                        <td key={result} className="py-2 text-right font-bold text-indigo-600">
                          {row.scores[result] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Коэффициенты результата</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {rules.result_multipliers.map((item) => (
                    <span
                      key={item.result}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                    >
                      <span className="font-medium">{item.result}</span>
                      <span className="text-slate-400">{multiplierLabel(item.percent)}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Баланс</h4>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{rules.balance_note}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{rules.status_note}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{rules.category_note}</p>
              </div>

              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Бонус за средний балл</h4>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {rules.gpa_rules.map((item) => (
                    <div key={item.range} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-700">{item.range}</span>
                        <span className="text-xs font-bold text-indigo-600">{item.points} б.</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.note}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs font-medium text-slate-600">
                  Ваш текущий бонус за сессию: <span className="text-indigo-600">{rules.my_gpa_bonus} б.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
