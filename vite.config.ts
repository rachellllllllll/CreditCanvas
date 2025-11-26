import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'xlsx-vendor': ['xlsx']
        }
      }
    },
    commonjsOptions: {
      include: [/xlsx/, /node_modules/]
    }
  },
  optimizeDeps: {
    include: ['xlsx'],
    esbuildOptions: {
      target: 'esnext'
    }
  }
});
