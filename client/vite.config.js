import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/EVENT-PROJECT-/' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:5001',
    },
  },
}))
