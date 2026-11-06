/**
 * 把模型从 packages/model 复制到 playground/public，避免 7.5MB 文件在仓库里存两份。
 * 由 playground 的 predev / prebuild 调用。
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'packages/model/hz.hzmodel')
const destDir = join(root, 'playground/public/hw')
const dest = join(destDir, 'hz.hzmodel')

if (!existsSync(src)) {
  console.error('缺少模型文件:', src)
  console.error(
    '下载：curl -sSL -o packages/model/hz.hzmodel ' +
      'https://cdn.jsdelivr.net/gh/peterolson/hanscribe@v0.1.1/test/test.hzmodel'
  )
  process.exit(1)
}
mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log('模型已就位:', dest)
