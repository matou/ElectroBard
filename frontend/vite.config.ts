/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The generated client calls the API with same-origin relative URLs (`/api/...`),
// so the dev server proxies `/api` to the backend. This keeps the browser on one
// origin (no CORS) and mirrors the single-origin shape we'll deploy behind later.
//
// Proxy target: `VITE_API_PROXY_TARGET` when set (compose points it at the `backend`
// service over the compose network), else the local backend. It runs server-side in
// the dev server, so it uses the compose service name, not the browser-facing host.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Component tests need a DOM; jsdom gives us one without a real browser.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
