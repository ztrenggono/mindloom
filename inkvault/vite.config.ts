import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The sync API lives in ../backend.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
