import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxy: Record<string, object> = {
    '/aladin-api': {
      target: 'https://www.aladin.co.kr/ttb/api',
      changeOrigin: true,
      secure: true,
      rewrite: (requestPath: string) => requestPath.replace(/^\/aladin-api/, ''),
    },
  };

  if (env.VITE_CRAWLER_PROXY_TARGET) {
    proxy['/crawl-api'] = {
      target: env.VITE_CRAWLER_PROXY_TARGET,
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) => requestPath.replace(/^\/crawl-api/, ''),
    };
  }

  if (env.VITE_AMAZON_PROXY_TARGET) {
    proxy['/amazon-api'] = {
      target: env.VITE_AMAZON_PROXY_TARGET,
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) => requestPath.replace(/^\/amazon-api/, ''),
    };
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy,
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
