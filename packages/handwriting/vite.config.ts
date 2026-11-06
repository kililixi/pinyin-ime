import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [vue(), dts({ include: ['src'], insertTypesEntry: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      // hanscribe 已从 npm 下架（2026-04-29），改为打包进产物：
      // 用户不需要也不要能装它，动态 import 会落到本包的 chunk 里
      external: ['vue'],
      output: { inlineDynamicImports: true },
    },
  },
})
