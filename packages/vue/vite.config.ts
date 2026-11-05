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
      // 用函数匹配，子路径（如 @startsi/pinyin-core/lm）也要算外部依赖，
      // 否则 773KB 的语言模型会被打进本包
      external: (id) =>
        id === 'vue' ||
        id === 'hanscribe' ||
        id.startsWith('@startsi/')
    },
  },
})
