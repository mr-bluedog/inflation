/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, /api est relayé vers le backend FastAPI (uvicorn --port 8000).
export default defineConfig({
  plugins: [react()],
  build: {
    // ECharts (≈ 600 ko) et les dépendances dans leurs propres fichiers : mis en cache indépendamment du code
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'echarts', test: /node_modules[/\\](echarts|zrender)[/\\]/ },
            // socle React seulement : les dépendances propres à une vue (Markdown…) restent dans son fichier
            {
              name: 'react',
              test: /node_modules[/\\](react|react-dom|react-router|react-router-dom|scheduler|@tanstack|zustand)[/\\]/,
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
