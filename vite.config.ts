import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'buffer'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL || 'https://zjxlpmbdxcplqesxgwbf.supabase.co'
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY || ''
    ),
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
      stream: 'stream-browserify',
    }
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'xlsx-vendor': ['xlsx']
        }
      }
    },
    commonjsOptions: {
      include: [/xlsx/, /node_modules/],
      transformMixedEsModules: true
    }
  },
  optimizeDeps: {
    include: ['xlsx', 'buffer', 'process'],
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis'
      },
    }
  }
});
