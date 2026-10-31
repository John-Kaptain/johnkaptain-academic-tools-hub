import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Served at the root of the custom domain (public/CNAME).
  base: '/',
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