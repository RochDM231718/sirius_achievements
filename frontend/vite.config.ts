import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'path'

import pkg from './package.json' with { type: 'json' }

function readVersionFile(): string | null {
  const versionPath = path.resolve(__dirname, 'VERSION')
  if (!existsSync(versionPath)) return null
  const value = readFileSync(versionPath, 'utf8').trim()
  return value || null
}

function getGitTagOrSha(): string | null {
  try {
    return execSync('git describe --tags --always --dirty', { cwd: __dirname }).toString().trim()
  } catch {
    return null
  }
}

const buildVersion =
  process.env.APP_VERSION?.trim() ||
  readVersionFile() ||
  getGitTagOrSha() ||
  `v${pkg.version}`
const buildTime = new Date().toISOString()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/static/spa/',
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../static/spa',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
