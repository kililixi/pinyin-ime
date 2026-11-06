/**
 * 手写模型的位置信息。
 *
 * 模型是 7.5MB 的二进制文件，不要用 import 直接引入（会进主包）。
 *
 * 浏览器 / Vite：
 *   import modelUrl from '@startsi/handwriting-model/hz.hzmodel?url'
 *
 * Electron 主进程：
 *   const file = path.join(
 *     path.dirname(require.resolve('@startsi/handwriting-model/package.json')),
 *     'hz.hzmodel'
 *   )
 */
export const MODEL_FILE = 'hz.hzmodel'
export const MODEL_SIZE = 7518294
