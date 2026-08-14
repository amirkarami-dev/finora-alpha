import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
const API_PROXY = {
  '/api': { target: process.env.FINORA_API ?? 'http://localhost:5080', changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Same-origin in development, same-origin in production (traefik routes /api on the same
  // host). Cookies and CSRF then behave identically in both, and there is no CORS to configure
  // in the happy path. The backend's Kestrel port is 5080 — see backend/README.
  //
  // `preview` needs its own copy: it does NOT inherit `server.proxy`, and `npm run smoke` runs
  // against preview and has to be able to sign in.
  server: {
    port: 5173,
    host: true,
    proxy: API_PROXY,
  },
  preview: {
    port: 4173,
    proxy: API_PROXY,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          charts: ['recharts'],
        },
      },
    },
  },
});
