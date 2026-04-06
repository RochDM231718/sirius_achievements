import { createContext, useEffect, useState, type ReactNode } from 'react'
import { STORAGE_KEYS } from '@/utils/constants'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const previousTheme = document.documentElement.dataset.theme
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.add('theme-ready')
    localStorage.setItem(STORAGE_KEYS.THEME, theme)
    if (previousTheme && previousTheme !== theme) {
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }))
    }
  }, [theme])

  const setTheme = (value: Theme) => setThemeState(value)
  const toggleTheme = () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
