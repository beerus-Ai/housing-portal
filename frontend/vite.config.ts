/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_TARGET points the dev proxy at a backend: Node on 3000 (default) or the Java backend on 8080.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_API_TARGET || 'http://localhost:3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // changeOrigin stays false: the backend's CSRF check compares Origin to Host, so Host must remain the dev server's.
      proxy: { '/api': { target, changeOrigin: false } },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
