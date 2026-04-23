import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import path from 'path'

import pkg from './package.json' with { type: 'json' }

function getGitTagOrSha(): string {
  try {
    return execSync('git describe --tags --always --dirty', { cwd: __dirname }).toString().trim()
  } catch {
    return 'dev'
  }
}

const buildVersion = process.env.APP_VERSION?.trim() || getGitTagOrSha()
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
