import { useState } from 'react'

import { cn } from '@/utils/cn'

export interface SearchSuggestionItem {
  value: string
  text: string
}

interface SearchAutocompleteInputProps {
  label?: string
  value: string
  placeholder: string
  suggestions: SearchSuggestionItem[]
  onChange: (value: string) => void
  onSelectSuggestion: (item: SearchSuggestionItem) => void
  className?: string
}

export function SearchAutocompleteInput({
  label = 'Поиск',
  value,
  placeholder,
  suggestions,
  onChange,
  onSelectSuggestion,
  className,
}: SearchAutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const showSuggestions = isFocused && suggestions.length > 0

  return (
    <div className={cn('relative', className)}>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
          onChange={(event) => onChange(event.target.value)}
          className="h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-600 focus:bg-surface focus:ring-2 focus:ring-indigo-600/20"
        />
      </div>

      {showSuggestions ? (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-surface shadow-lg">
          {suggestions.map((item) => (
            <li
              key={`${item.value}-${item.text}`}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelectSuggestion(item)
                setIsFocused(false)
              }}
              className="cursor-pointer border-b border-slate-100 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 last:border-b-0"
            >
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
