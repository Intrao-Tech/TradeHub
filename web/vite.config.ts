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
})
