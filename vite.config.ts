import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: '/pixelblaze-v2/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@monaco-editor/react', 'zustand'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright E2E specs live in e2e/ and are run by Playwright, not Vitest.
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
