import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const port = process.env.PORT || 40000;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${port}`,
        changeOrigin: true
      },
      '/ws': {
        target: `ws://127.0.0.1:${port}`,
        ws: true
      }
    }
  }
})
