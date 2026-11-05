import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        lm: resolve(__dirname, 'src/lm.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    rollupOptions: {
      // 语言模型单独成 chunk，宿主可以动态 import
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  plugins: [dts({ include: ['src'], insertTypesEntry: true })],
})
