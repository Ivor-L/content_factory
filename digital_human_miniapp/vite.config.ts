import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const port = Number(env.VITE_PORT || env.PORT || 3100);
  const proxyTarget = env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://localhost:3000';
  const shouldProxy = env.VITE_DISABLE_PROXY !== 'true';
  const base = mode === 'production' ? (env.VITE_BASE_PATH || '/miniapp/') : '/';
  return {
    base,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: shouldProxy
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
