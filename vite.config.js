import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { CATEGORIES } from './src/data.js'

// The shop's prices for the JK Turnitin Bot service, which runs the checkout:
// published as /shop-products.json from src/data.js, so prices are edited in one
// place. (Turnitin reports have their own checkout and prices.)
function shopProducts() {
  return {
    name: 'jk-shop-products',
    generateBundle() {
      const list = CATEGORIES.flatMap(c => c.items)
        .filter(i => i.id !== 'turnitin-reports' && Number(i.price) > 0)
        .map(i => ({ id: i.id, name: i.name, price: Number(i.price) }))
      this.emitFile({ type: 'asset', fileName: 'shop-products.json', source: JSON.stringify(list) })
    },
  }
}

export default defineConfig({
  plugins: [react(), shopProducts()],
  // Served at the root of the custom domain (public/CNAME).
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})