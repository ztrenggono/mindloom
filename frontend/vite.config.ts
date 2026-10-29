import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The sync API lives in ../backend; ws carries the live-collaboration socket at /api/collab.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
})
