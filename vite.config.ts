import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  /**
   * 相对路径：产物会被放进 Spring Boot 的 static/ 里，从 '/' 提供。
   * 用 './' 而不是 '/'，这样即使以后部署到子路径（/app/）也不用改。
   */
  base: './',
  plugins: [
    vue(),
    vueDevTools(),
    // Element Plus 按需引入：全量引入实测 +917.6 kB JS / +364 kB CSS（计划 §2.6.3）
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: 'css' })],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // 直接产出到后端仓库的静态资源目录：单端口部署，不需要再复制
    // 前端是独立仓库（D:\Project\myproject\financial-ai-web），后端在 ../financial-ai-project
    outDir: '../financial-ai-project/src/main/resources/static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // 开发模式把 /api 转给 Spring Boot：前端不需要知道后端端口，后端也不需要开 CORS
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
})
