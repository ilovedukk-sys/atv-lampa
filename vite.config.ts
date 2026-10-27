import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import legacy from '@vitejs/plugin-legacy';
import { readFileSync } from 'node:fs';

// Версия приложения — одна на всё: из appinfo.json (её же видит webOS)
const appinfo = JSON.parse(readFileSync('public/appinfo.json', 'utf8'));

/**
 * На телевизоре приложение открывается с диска (file://).
 * Скрипты с атрибутом crossorigin браузер там блокирует — убираем его.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(=["'][^"']*["'])?/g, '');
    },
  };
}

export default defineConfig({
  // Относительные пути: на телевизоре приложение открывается как file://
  base: './',
  plugins: [
    preact(),
    // webOS 4 = Chromium 53. Собираем только «старую» версию кода,
    // она работает и на webOS 5–6, и при открытии через file://
    legacy({
      targets: ['chrome >= 53'],
      renderModernChunks: false,
    }),
    stripCrossorigin(),
  ],
  server: { port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(appinfo.version) },
  // PROFILE=1 — сборка без сжатия, чтобы в профиле (scripts/profile.mjs) были видны имена функций
  build: process.env.PROFILE ? { minify: false } : {},
});
