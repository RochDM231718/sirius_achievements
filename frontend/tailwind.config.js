/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--color-surface)',
          soft: 'var(--color-surface-soft)',
          muted: 'var(--color-surface-muted)',
          strong: 'var(--color-surface-strong)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          soft: 'var(--color-border-soft)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          soft: 'var(--color-text-soft)',
          muted: 'var(--color-text-muted)',
          faint: 'var(--color-text-faint)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          strong: 'var(--color-accent-strong)',
          soft: 'var(--color-accent-soft)',
          'soft-strong': 'var(--color-accent-soft-strong)',
        },
      },
    },
  },
  plugins: [],
}
