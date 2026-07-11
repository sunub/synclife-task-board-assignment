/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포 시: 저장소 이름으로 base 를 지정하세요.
//   예) VITE_BASE=/my-repo/ npm run build
// (service worker 등록 경로가 import.meta.env.BASE_URL 를 따라갑니다)
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    minify: "esbuild",
    chunkSizeWarningLimit: 2500,
    assetsDir: "assets",
    modulePreload: {
      polyfill: true,
    },
    cssMinify: true,
    cssCodeSplit: true,
  },
})
