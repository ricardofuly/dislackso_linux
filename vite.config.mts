import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Um app, dois alvos de build.
 *
 *   modo `web`     -> dist/web,     base '/',  servido pelo Express.
 *   modo `desktop` -> dist/desktop, base './', carregado pelo Electron via file://
 *                     (por isso os caminhos precisam ser relativos).
 *
 * O código é o mesmo nos dois; o que muda é como ele é empacotado e quais
 * recursos da ponte `window.desktop` existem em tempo de execução.
 */
export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';

  return {
    base: isDesktop ? './' : '/',
    publicDir: 'static',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    define: {
      __DESKTOP_BUILD__: JSON.stringify(isDesktop),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '4.0.0'),
    },
    build: {
      outDir: isDesktop ? 'dist/desktop' : 'dist/web',
      emptyOutDir: true,
      // O Electron embarca um Chromium conhecido; o navegador não.
      target: isDesktop ? 'chrome130' : 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
      // Em desenvolvimento o front roda no Vite e a API no `npm run server`.
      proxy: {
        '/api': 'http://localhost:3000',
        '/uploads': 'http://localhost:3000',
        '/socket.io': { target: 'http://localhost:3000', ws: true },
      },
    },
  };
});
