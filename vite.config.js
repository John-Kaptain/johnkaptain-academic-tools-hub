import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: match your repo name exactly (case sensitive)
  base: '/johnkaptain-academic-tools-hub/',
})
