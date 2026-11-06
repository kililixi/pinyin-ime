import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 页面需要放开 worker 与 wasm，否则手写识别跑不起来
  server: {
    headers: {
      'Content-Security-Policy':
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:;",
    },
  },
})
