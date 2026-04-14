import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/johnkaptain-academic-tools-hub/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/intasend': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})