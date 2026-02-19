import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxy: Record<string, object> = {
    '/aladin-api': {
      // Some environments intermittently fail TLS handshakes to Aladin over proxy.
      // HTTP target is stable here and still reaches the same API endpoint.
      target: 'http://www.aladin.co.kr/ttb/api',
      changeOrigin: true,
      secure: false,
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
      // ⬇️ 아래 설정을 추가해줘
      allowedHosts: [
        'brynn-unprovident-noncaptiously.ngrok-free.dev', // 에러 메시지에 뜬 주소 직접 입력
        '.ngrok-free.dev',                               // 모든 ngrok-free.dev 서브도메인 허용
        '.ngrok-free.app'                                // 기존 설정도 유지
      ], 
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
