import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  // Vite automatically loads .env files
  // Prefix with VITE_ to expose them to the browser
})
