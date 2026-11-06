<!--
  中文拼音输入控件

  · 不依赖任何 UI 框架：触发器、弹层、键盘、候选条全部自绘
  · 键盘两种形态：九宫格（默认，键大）/ 全键盘，按机器记忆
  · 手写：内置手写板（@startsi/vue-handwriting），也可交给外部程序
  · 语言模型按需加载，不影响首屏
-->
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import {
    PinyinEngine,
    UserFreqStore,
    preloadLexicon,
    preloadT9,
  } from '@startsi/pinyin-core'
  import type { Candidate, KeyInput } from '@startsi/pinyin-core'
  import { HandwritingPad } from '@startsi/vue-handwriting'
  import CandidateBar from './CandidateBar.vue'
  import VirtualKeyboard from './VirtualKeyboard.vue'
  import type { LayoutName } from './types'

  export interface Props {
    modelValue: string
    title?: string
    placeholder?: string
    /** 纯数字字段：身份证/电话/邮编等 */
    numeric?: boolean
    /** 强制开启/关闭姓名候选；默认按标题判断 */
    nameMode?: boolean
    /**
     * 候选区布局：
     * auto  —— 九宫格分栏、全键盘上下（默认）
     * split —— 强制左右分栏
     * stack —— 强制上下
     */
    layout?: 'auto' | 'split' | 'stack'
    maxLength?: number
    disabled?: boolean
    /** 键盘形态记忆的存储键 */
    storageKey?: string
    /** 手写模型字节来源（Electron 走 IPC） */
    loadModel?: () => Promise<ArrayBuffer | Blob>
    /** 手写模型地址（浏览器直接给它） */
    modelUrl?: string
    /** 交给外部手写程序处理，传了就不显示内置手写板 */
    onExternalHandwriting?: (open: boolean) => void
    /** 是否加载 bigram 语言模型 */
    useLm?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '',
    placeholder: '请输入',
    numeric: undefined,
    nameMode: undefined,
    layout: 'auto',
    maxLength: 64,
    disabled: false,
    storageKey: 'pinyin-ime:keyboard',
    loadModel: undefined,
    modelUrl: undefined,
    onExternalHandwriting: undefined,
    useLm: true,
  })

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
    (e: 'confirm'): void
    (e: 'commit', text: string): void
    (e: 'error', message: string): void
  }>()

  type InputMode = 'zh' | 'en' | 'EN'
  type KeyboardMode = 't9' | 'qwerty'

  // ---------------------------------------------------------------- 状态
  const value = ref(props.modelValue)
  const cursor = ref(props.modelValue.length)
  const visible = ref(false)
  const mode = ref<'keyboard' | 'hand'>('keyboard')
  const inputMode = ref<InputMode>('zh')

  const preedit = ref('')
  const preeditDisplay = ref('')
  const syllables = ref<string[]>([])
  const activeSyllable = ref<string | null>(null)
  const candidates = ref<Candidate[]>([])
  const page = ref(0)
  const pageCount = ref(1)

  const input = ref<HTMLInputElement>()
  const panel = ref<HTMLDivElement>()

  const NUMBER_TITLE = /身份证|证件号|号码|编号|条码|电话|手机|邮编|卡号/
  const isNumeric = computed(
    () => props.numeric ?? NUMBER_TITLE.test(props.title || '')
  )
  const nameMode = computed(
    () => props.nameMode ?? /姓名|收件人|^姓$|^名$/.test(props.title || '')
  )

  const readKeyboardMode = (): KeyboardMode => {
    try {
      return localStorage.getItem(props.storageKey) === 'qwerty'
        ? 'qwerty'
        : 't9'
    } catch {
      return 't9'
    }
  }
  const keyboardMode = ref<KeyboardMode>(
    isNumeric.value ? 'qwerty' : readKeyboardMode()
  )

  // ---------------------------------------------------------------- 引擎
  const userFreq = new UserFreqStore()
  let lmLoading = false

  const engineOptions = () => ({
    mode: (keyboardMode.value === 't9' ? 't9' : 'pinyin') as 'pinyin' | 't9',
    pageSize: 10,
    fuzzy: true,
    enableInitials: true,
    enableNames: nameMode.value,
    userFreq: userFreq.get,
  })

  const engine = new PinyinEngine(engineOptions())

  const ensureLm = () => {
    if (!props.useLm || lmLoading) return
    lmLoading = true
    import('@startsi/pinyin-core/lm')
      .then((m) => {
        if (!m.hasLm()) return
        engine.setLmProvider({
          score: m.lmLogProb,
          continuations: m.lmContinuations,
        })
        refresh()
      })
      .catch(() => {
        /* 没有模型数据就退化成一元，不影响输入 */
      })
  }

  // ---------------------------------------------------------------- 编辑
  const syncCaret = () => {
    nextTick(() => {
      const el = input.value
      if (!el) return
      if (document.activeElement !== el) el.focus({ preventScroll: true })
      const pos = Math.min(cursor.value, el.value.length)
      el.setSelectionRange(pos, pos)
    })
  }

  const insertText = (text: string) => {
    if (!text) return
    const pos = Math.min(cursor.value, value.value.length)
    value.value = value.value.slice(0, pos) + text + value.value.slice(pos)
    cursor.value = pos + text.length
    syncCaret()
  }

  const deleteBackward = () => {
    const pos = Math.min(cursor.value, value.value.length)
    if (pos <= 0) return
    value.value = value.value.slice(0, pos - 1) + value.value.slice(pos)
    cursor.value = pos - 1
    syncCaret()
  }

  const emitValue = () => emit('update:modelValue', value.value)

  const refresh = () => {
    preedit.value = engine.preedit
    engine.setContext(value.value.slice(0, cursor.value))
    candidates.value = engine.list()
    preeditDisplay.value = engine.displayPreedit
    // 分栏时右侧只有 30% 宽，音节按钮最多给 4 个，免得挤掉拼音和翻页
    syllables.value = engine.syllableOptions(4)
    activeSyllable.value = engine.activeSyllable
    page.value = engine.page
    pageCount.value = engine.pageCount
  }

  const applyKey = (key: KeyInput) => {
    const result = engine.press(key)
    if (result.type === 'commit') {
      insertText(result.text)
      userFreq.hit(result.text)
      engine.notifyCommitted(result.text)
      emit('commit', result.text)
    } else if (result.type === 'unhandled' && key.t === 'back') {
      deleteBackward()
    }
    refresh()
    emitValue()
  }

  // ---------------------------------------------------------------- 键盘
  const layoutName = computed<LayoutName>(() => {
    if (isNumeric.value) return 'num'
    if (keyboardMode.value === 't9') return 't9'
    return inputMode.value === 'zh'
      ? 'ch'
      : inputMode.value === 'EN'
        ? 'EN'
        : 'en'
  })

  const setKeyboardMode = (next: KeyboardMode) => {
    if (isNumeric.value || next === keyboardMode.value) return
    keyboardMode.value = next
    try {
      localStorage.setItem(props.storageKey, next)
    } catch {
      /* 存储不可用时忽略 */
    }
    if (next === 't9') setTimeout(preloadT9, 0)
    engine.setOptions(engineOptions())
    engine.reset()
    refresh()
  }

  const onKey = (button: string) => {
    if (button === '{qwerty}') return setKeyboardMode('qwerty')
    if (button === '{t9}') return setKeyboardMode('t9')
    if (button === '{en}') return (inputMode.value = inputMode.value === 'en' ? 'zh' : 'en')
    if (button === '{lock}') {
      inputMode.value = inputMode.value === 'EN' ? 'en' : 'EN'
      return
    }
    if (button === '{switch}') {
      inputMode.value = inputMode.value === 'zh' ? 'en' : 'zh'
      return
    }
    if (button === '{hand}') return turnHandwriting()

    if (button === '{bksp}') {
      if (inputMode.value === 'zh') applyKey({ t: 'back' })
      else {
        deleteBackward()
        emitValue()
      }
      return
    }
    if (button === '{space}') {
      if (inputMode.value === 'zh' && preedit.value) applyKey({ t: 'space' })
      else {
        insertText(' ')
        emitValue()
      }
      return
    }

    if (isNumeric.value) {
      insertText(button)
      emitValue()
      return
    }

    if (inputMode.value === 'zh') {
      if (keyboardMode.value === 't9' && /^[2-9]$/.test(button)) {
        applyKey({ t: 'char', v: button })
        return
      }
      if (keyboardMode.value === 'qwerty' && /^[0-9]$/.test(button) && preedit.value) {
        const index = button === '0' ? 9 : Number(button) - 1
        if (index < candidates.value.length) selectCandidate(index)
        return
      }
      if (/^[a-zA-Z]$/.test(button)) {
        applyKey({ t: 'char', v: button.toLowerCase() })
        return
      }
      if (preedit.value) applyKey({ t: 'space' })
      insertText(button)
      emitValue()
      return
    }

    insertText(inputMode.value === 'EN' ? button.toUpperCase() : button)
    emitValue()
  }

  const onKeyRepeat = (button: string) => {
    if (button !== '{bksp}') return
    if (inputMode.value === 'zh') applyKey({ t: 'back' })
    else {
      deleteBackward()
      emitValue()
    }
  }

  // ---------------------------------------------------------------- 候选
  const selectCandidate = (index: number) => applyKey({ t: 'select', i: index })
  const pageUp = () => applyKey({ t: 'pgup' })
  const pageDown = () => applyKey({ t: 'pgdn' })
  /** 九宫格手选音节：筛选候选，再点一次取消 */
  const pickSyllable = (py: string | null) => {
    engine.setSyllableFilter(py)
    refresh()
  }

  const cancelComposition = () => {
    engine.reset()
    refresh()
  }

  // ---------------------------------------------------------------- 手写
  const turnHandwriting = () => {
    mode.value = 'hand'
    engine.reset()
    refresh()
    props.onExternalHandwriting?.(true)
  }

  const backToKeyboard = () => {
    mode.value = 'keyboard'
    props.onExternalHandwriting?.(false)
    nextTick(() => {
      input.value?.focus()
      syncCaret()
    })
  }

  const onHandPick = (char: string) => {
    insertText(char)
    emitValue()
    refresh()
    emit('commit', char)
  }

  // ---------------------------------------------------------------- 开关
  const open = () => {
    if (props.disabled || visible.value) return
    visible.value = true
    preloadLexicon()
    if (keyboardMode.value === 't9') setTimeout(preloadT9, 0)
    ensureLm()
    nextTick(() => {
      input.value?.focus()
      cursor.value = value.value.length
      syncCaret()
      refresh()
    })
  }

  const close = () => {
    engine.reset()
    refresh()
    emitValue()
    visible.value = false
  }

  const confirm = () => {
    emit('confirm')
    close()
  }

  const reset = () => {
    value.value = ''
    cursor.value = 0
    engine.reset()
    refresh()
    emitValue()
    input.value?.focus()
  }

  const onBackdrop = (event: MouseEvent) => {
    if (event.target === event.currentTarget) close()
  }

  const onInput = () => {
    const el = input.value
    if (!el) return
    value.value = el.value
    cursor.value = el.selectionStart ?? el.value.length
    engine.reset()
    refresh()
    emitValue()
  }

  const onCursor = () => {
    cursor.value = input.value?.selectionStart ?? value.value.length
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirm()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (isNumeric.value || inputMode.value !== 'zh') return
    if (keyboardMode.value === 't9') {
      if (/^[2-9]$/.test(event.key)) {
        event.preventDefault()
        applyKey({ t: 'char', v: event.key })
      }
      return
    }
    if (/^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault()
      applyKey({ t: 'char', v: event.key.toLowerCase() })
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      applyKey({ t: 'back' })
    } else if (event.key === ' ' && preedit.value) {
      event.preventDefault()
      applyKey({ t: 'space' })
    }
  }

  watch(
    () => props.modelValue,
    (next) => {
      if (next === value.value) return
      value.value = next
      cursor.value = next.length
    }
  )

  // 按「面板实际宽度」判断能不能分栏，窗口宽度不可靠（弹窗只有 90% 宽）
  const panelWidth = ref(0)
  let panelObserver: ResizeObserver | null = null

  const measurePanel = () => {
    if (panel.value) panelWidth.value = panel.value.clientWidth
  }

  const split = computed(() => {
    if (props.layout === 'stack' || isNumeric.value) return false
    if (panelWidth.value && panelWidth.value < 760) return false
    if (props.layout === 'split') return true
    return keyboardMode.value === 't9'
  })

  watch(visible, (v) => {
    if (!v) {
      panelObserver?.disconnect()
      panelObserver = null
      return
    }
    nextTick(() => {
      measurePanel()
      if (panel.value && typeof ResizeObserver !== 'undefined') {
        panelObserver = new ResizeObserver(measurePanel)
        panelObserver.observe(panel.value)
      }
    })
  })

  onMounted(() => window.addEventListener('resize', measurePanel))
  onBeforeUnmount(() => {
    window.removeEventListener('resize', measurePanel)
    panelObserver?.disconnect()
  })

  defineExpose({ open, close })
</script>

<template>
  <div class="pi-root">
    <!-- 触发器：想自己画就塞 trigger 插槽 -->
    <slot name="trigger" :open="open" :value="value">
      <button
        type="button"
        :class="['pi-trigger', value ? '' : 'is-empty']"
        :disabled="disabled"
        @click="open"
      >
        {{ value || placeholder }}
      </button>
    </slot>

    <Teleport to="body">
      <div v-if="visible" class="pi-overlay" @click="onBackdrop">
        <div ref="panel" class="pi-panel" :style="{ maxWidth: split ? '1400px' : '1180px' }">
          <div class="pi-header">
            <span class="pi-title">{{ title }}</span>
            <button type="button" class="pi-close" @click="close">×</button>
          </div>

          <div class="pi-input-wrap">
            <input
              ref="input"
              class="pi-input"
              :value="value"
              :maxlength="maxLength"
              :placeholder="placeholder"
              autocomplete="off"
              spellcheck="false"
              @input="onInput"
              @keydown="onKeydown"
              @click="onCursor"
            />
            <button type="button" class="pi-clear" title="清空" @click="reset">
              ×
            </button>
          </div>

          <div
            v-if="mode === 'keyboard'"
            :class="['pi-body', split ? 'is-split' : 'is-stack']"
          >
            <CandidateBar
              v-if="!isNumeric"
              :column="split"
              :preedit="preeditDisplay"
              :candidates="candidates"
              :page="page"
              :page-count="pageCount"
              :syllables="syllables"
              :active-syllable="activeSyllable"
              @select="selectCandidate"
              @pick-syllable="pickSyllable"
              @prev="pageUp"
              @next="pageDown"
              @cancel="cancelComposition"
            />
            <VirtualKeyboard
              :layout-name="layoutName"
              @key="onKey"
              @repeat="onKeyRepeat"
            />
          </div>

          <HandwritingPad
            v-else
            :size="320"
            :load-model="loadModel"
            :model-url="modelUrl"
            @pick="onHandPick"
            @back="backToKeyboard"
            @error="(msg) => emit('error', msg)"
          />

          <div class="pi-footer">
            <button type="button" class="pi-btn" @click="close">取消</button>
            <button type="button" class="pi-btn pi-btn-primary" @click="confirm">
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
  .pi-root {
    display: block;
    width: 100%;
  }

  .pi-trigger {
    background: #fff;
    border: 1px solid #333;
    border-radius: 4px;
    box-sizing: border-box;
    color: #1c1e21;
    cursor: pointer;
    font-size: 17px;
    height: 56px;
    padding: 0 14px;
    text-align: left;
    width: 100%;
  }

  .pi-trigger.is-empty {
    color: #a8b6c5;
  }

  .pi-overlay {
    align-items: flex-start;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 40px 16px;
    position: fixed;
    z-index: 3000;
  }

  .pi-panel {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    padding: 12px 16px 16px;
    width: 100%;
  }

  .pi-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding: 4px 0 10px;
  }

  .pi-title {
    font-size: 19px;
    font-weight: 500;
  }

  .pi-close {
    background: none;
    border: none;
    color: #778899;
    cursor: pointer;
    font-size: 28px;
    line-height: 1;
  }

  .pi-input-wrap {
    align-items: center;
    background: #fff;
    border-radius: 4px;
    box-shadow: inset 0 0 0 2px #0057c2;
    display: flex;
    height: 56px;
    padding: 0 12px;
    position: relative;
  }

  .pi-input {
    background: transparent;
    border: 0;
    color: #1c1e21;
    flex: 1;
    font-size: 19px;
    outline: 0;
    width: 100%;
  }

  .pi-clear {
    background: none;
    border: none;
    color: #0057c2;
    cursor: pointer;
    font-size: 26px;
    line-height: 1;
  }

  .pi-body {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .pi-body.is-split {
    align-items: stretch;
    flex-direction: row;
  }

  /* DOM 里候选条在键盘前面，分栏时靠 order 把它挪到右边 */
  .pi-body.is-split .pi-cand {
    flex: 0 0 30%;
    min-width: 280px;
    order: 2;
  }

  .pi-body.is-split > .pi-kb {
    order: 1;
  }

  .pi-body.is-stack {
    flex-direction: column;
  }

  .pi-body.is-stack .pi-cand {
    order: -1;
    width: 100%;
  }

  .pi-footer {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 14px;
  }

  .pi-btn {
    background: #f2f5f9;
    border: 1px solid #d6e2ee;
    border-radius: 6px;
    color: #1c1e21;
    cursor: pointer;
    font-size: 19px;
    height: 52px;
    min-width: 120px;
  }

  .pi-btn-primary {
    background: #0057c2;
    border-color: #0057c2;
    color: #fff;
  }
</style>
