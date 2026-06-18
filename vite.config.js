import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Local dev: /api → Python backend on 8000
      '/api': 'http://localhost:8000'
    }
  }
})
