<!--
  手写板

  识别用 HanScribe（MIT，4 层 BiLSTM，12361 字，纯离线）。
  模型文件不在包里——由宿主提供：
    · loadModel：返回 ArrayBuffer/Blob 的函数（Electron 走 IPC、桌面走 fs）
    · modelUrl：直接给一个 URL（浏览器默认 fetch）
  两者都不给时用内置默认 CDN 地址，仅适合 demo。
-->
<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue'
  import type { HanScribeInstance, HanScribeResult } from 'hanscribe'

  export interface Props {
    /** 画布边长（px） */
    size?: number
    /** 候选个数 */
    topK?: number
    /** 笔画颜色 */
    strokeColor?: string
    /** 笔画粗细 */
    strokeWidth?: number
    /** 自定义模型字节来源（优先于 modelUrl） */
    loadModel?: () => Promise<ArrayBuffer | Blob>
    /** 模型文件地址 */
    modelUrl?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    size: 320,
    topK: 10,
    strokeColor: '#1c1e21',
    strokeWidth: 8,
    loadModel: undefined,
    modelUrl: undefined,
  })

  const emit = defineEmits<{
    /** 选中一个字 */
    (e: 'pick', char: string): void
    /** 点「拼音键盘」 */
    (e: 'back'): void
    (e: 'error', message: string): void
  }>()

  const host = ref<HTMLDivElement>()
  const matches = ref<string[]>([])
  const loading = ref(true)
  const failed = ref('')

  let pad: HanScribeInstance | null = null
  let objectUrl: string | null = null

  const resolveModelUrl = async (): Promise<string> => {
    if (props.loadModel) {
      const data = await props.loadModel()
      const blob = data instanceof Blob ? data : new Blob([data])
      objectUrl = URL.createObjectURL(blob)
      return objectUrl
    }
    if (props.modelUrl) return props.modelUrl
    throw new Error('需要提供 loadModel 或 modelUrl')
  }

  const blobToDataUrl = (url: string): Promise<string> =>
    fetch(url)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
      )

  const createPad = async (
    HanScribe: typeof import('hanscribe').HanScribe,
    url: string
  ) => {
    if (!host.value) throw new Error('手写板容器未挂载')
    return HanScribe.create({
      element: host.value,
      modelUrl: url,
      strokeColor: props.strokeColor,
      strokeWidth: props.strokeWidth,
      topK: props.topK,
      debounceMs: 120,
      onRecognize: (list: HanScribeResult[]) => {
        matches.value = list.map((x) => x.char)
      },
    })
  }

  onMounted(async () => {
    try {
      const { HanScribe } = await import('hanscribe')
      const url = await resolveModelUrl()
      try {
        pad = await createPad(HanScribe, url)
      } catch {
        // file:// 下 blob worker 可能取不到模型，退回 data URL
        pad = await createPad(HanScribe, await blobToDataUrl(url))
      }
      // 画布尺寸异步设置，等两帧并预热一次推理，避免「第一笔没反应」
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await Promise.race([
        pad.recognize().catch(() => null),
        new Promise((r) => setTimeout(r, 800)),
      ])
      loading.value = false
    } catch (err) {
      failed.value = err instanceof Error ? err.message : String(err)
      loading.value = false
      emit('error', failed.value)
    }
  })

  onBeforeUnmount(() => {
    pad?.detach()
    pad = null
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
  })

  const pick = (char: string) => {
    emit('pick', char)
    pad?.clear()
    matches.value = []
  }

  const undo = () => pad?.undo()
  const clear = () => {
    pad?.clear()
    matches.value = []
  }
</script>

<template>
  <div class="hw-pad">
    <div class="hw-canvas" :style="{ width: size + 'px', height: size + 'px' }">
      <div ref="host" class="hw-host" />
      <div v-if="loading" class="hw-mask">手写识别加载中…</div>
      <div v-else-if="failed" class="hw-mask">手写识别加载失败：{{ failed }}</div>
    </div>

    <div class="hw-side">
      <div class="hw-actions">
        <button type="button" class="hw-btn" @click="undo">撤销</button>
        <button type="button" class="hw-btn" @click="clear">清空</button>
        <button type="button" class="hw-btn hw-btn-primary" @click="emit('back')">
          拼音键盘
        </button>
      </div>
      <div class="hw-matches">
        <button
          v-for="(ch, i) in matches"
          :key="ch + i"
          type="button"
          class="hw-match"
          @click="pick(ch)"
        >
          {{ ch }}
        </button>
        <div v-if="!matches.length && !loading" class="hw-empty">
          写完一笔就会出现候选
        </div>
      </div>
    </div>
  </div>
</template>

<style>
  .hw-pad {
    display: flex;
    gap: 16px;
  }

  .hw-canvas {
    border: 2px solid #b5c5d2;
    border-radius: 6px;
    box-sizing: border-box;
    flex: 0 0 auto;
    overflow: hidden;
    position: relative;
  }

  .hw-host {
    height: 100%;
    width: 100%;
  }

  .hw-mask {
    align-items: center;
    background: rgba(255, 255, 255, 0.92);
    color: #8ba0b6;
    display: flex;
    font-size: 15px;
    inset: 0;
    justify-content: center;
    padding: 12px;
    position: absolute;
    text-align: center;
  }

  .hw-side {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .hw-actions {
    display: flex;
    gap: 10px;
  }

  .hw-btn {
    background: #f2f5f9;
    border: 1px solid #d6e2ee;
    border-radius: 6px;
    color: #1c1e21;
    cursor: pointer;
    font-size: 18px;
    min-height: 56px;
    padding: 0 18px;
  }

  .hw-btn:active {
    background: #cfe3ff;
  }

  .hw-btn-primary {
    color: #0057c2;
    margin-left: auto;
  }

  .hw-matches {
    align-content: start;
    display: grid;
    flex: 1 1 auto;
    gap: 10px;
    grid-template-columns: repeat(5, 1fr);
    margin-top: 12px;
    overflow-y: auto;
  }

  .hw-match {
    background: #f5f8fc;
    border: 1px solid #d6e2ee;
    border-radius: 6px;
    color: #1c1e21;
    cursor: pointer;
    font-size: 32px;
    height: 76px;
  }

  .hw-match:active {
    background: #cfe3ff;
    border-color: #0057c2;
  }

  .hw-empty {
    color: #a8b6c5;
    font-size: 15px;
    grid-column: 1 / -1;
  }
</style>
