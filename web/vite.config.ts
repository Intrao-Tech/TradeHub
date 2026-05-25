/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Bind 0.0.0.0 so internal.localhost:3000 also resolves (per AUTH-016-006).
    // Modern browsers map *.localhost → 127.0.0.1 (RFC 6761) but Vite's default
    // `server.host: 'localhost'` rejects non-localhost requests.
    host: true,
  },
  preview: {
    port: 3000,
    host: true,
    // Vite preview defaults to a strict Host-header allowlist (403 on miss).
    // For Railway-default *.up.railway.app hostnames we don't know the host
    // at build time, so allow all.
    allowedHosts: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Co-located *.test.ts(x) under src/. e2e lives under web/e2e/ and is
    // owned by Playwright, not Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    // The jsdom suite runs ~56 files across parallel forks; on a loaded
    // machine a single render + userEvent interaction can exceed the 5s
    // default. Give correct-but-slow tests headroom so they don't flake.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
