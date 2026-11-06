<!-- 虚拟键盘：九宫格 / 全键盘 / 数字键盘，自绘，无第三方依赖 -->
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref } from 'vue'
  import type { LayoutName } from './types'

  const props = withDefaults(
    defineProps<{
      layoutName: LayoutName
      /** 九宫格数字键下方的小字母 */
      showT9Letters?: boolean
    }>(),
    { showT9Letters: true }
  )

  const emit = defineEmits<{
    /** 点击一个键 */
    (e: 'key', button: string): void
    /** 长按连发（目前只用于删除） */
    (e: 'repeat', button: string): void
  }>()

  const LAYOUTS: Record<LayoutName, string[]> = {
    t9: ['1 2 3 {bksp}', '4 5 6 {space}', '7 8 9 {hand}', '， 。 @ {qwerty}'],
    num: ['1 2 3', '4 5 6', '7 8 9', 'X 0 {bksp}'],
    ch: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      '{en} q w e r t y u i o p',
      '{lock} a s d f g h j k l',
      '{switch} z x c v b n m',
      '{hand} @ （ ） {t9} {space}',
    ],
    en: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      '{en} q w e r t y u i o p',
      '{lock} a s d f g h j k l',
      '{switch} z x c v b n m',
      '{hand} @ ( ) {t9} {space}',
    ],
    EN: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      '{en} Q W E R T Y U I O P',
      '{lock} A S D F G H J K L',
      '{switch} Z X C V B N M',
      '{hand} @ ( ) {t9} {space}',
    ],
  }

  const T9_LETTERS: Record<string, string> = {
    '2': 'abc',
    '3': 'def',
    '4': 'ghi',
    '5': 'jkl',
    '6': 'mno',
    '7': 'pqrs',
    '8': 'tuv',
    '9': 'wxyz',
  }

  const NAMES: Record<string, string> = {
    '{bksp}': '删',
    '{space}': '空格',
    '{hand}': '手写',
    '{qwerty}': '全键盘',
    '{t9}': '9键',
    '{en}': '英',
    '{lock}': '大小写',
    '{switch}': '英/中',
  }

  const rows = computed(() =>
    LAYOUTS[props.layoutName].map((row) => row.split(' '))
  )

  /** 数字键显示成「2 / abc」两行 */
  const labelOf = (key: string): string => {
    const name = NAMES[key]
    if (name) return name
    const letters = T9_LETTERS[key]
    if (letters && props.showT9Letters && props.layoutName === 't9') return key
    return key
  }

  /** 九宫格里数字键下方的小字母；1 没有字母，用不换行空格占位保证对齐 */
  const lettersOf = (key: string): string => {
    if (props.layoutName !== 't9' || !/^[1-9]$/.test(key)) return ''
    return T9_LETTERS[key] || '\u00a0'
  }

  // ---------------------------------------------------------------- 长按连删
  const LONG_DELAY = 450
  const LONG_INTERVAL = 80
  const LONG_MAX = 8000
  let delayTimer: number | null = null
  let repeatTimer: number | null = null
  const repeating = ref(false)
  let suppressClick = false

  const stop = () => {
    if (delayTimer !== null) {
      clearTimeout(delayTimer)
      delayTimer = null
    }
    if (repeatTimer !== null) {
      clearInterval(repeatTimer)
      repeatTimer = null
    }
    repeating.value = false
  }

  const onDown = (event: PointerEvent, key: string) => {
    if (key !== '{bksp}') return
    stop()
    suppressClick = false
    const started = Date.now()
    delayTimer = window.setTimeout(() => {
      suppressClick = true
      repeating.value = true
      repeatTimer = window.setInterval(() => {
        if (Date.now() - started > LONG_MAX) return stop()
        emit('repeat', key)
      }, LONG_INTERVAL)
    }, LONG_DELAY)
  }

  const onUp = () => stop()

  const onClick = (key: string) => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    emit('key', key)
  }

  onBeforeUnmount(stop)
</script>

<template>
  <div :class="['pi-kb', 'layout-' + layoutName]">
    <div v-for="(row, r) in rows" :key="r" class="pi-kb-row">
      <button
        v-for="(key, k) in row"
        :key="k + key"
        type="button"
        :class="[
          'pi-key',
          key.startsWith('{') ? 'is-fn' : '',
          key === '{space}' ? 'is-space' : '',
        ]"
        @pointerdown="onDown($event, key)"
        @pointerup="onUp"
        @pointercancel="onUp"
        @click="onClick(key)"
      >
        <b class="pi-key-main">{{ labelOf(key) }}</b>
        <i v-if="lettersOf(key)" class="pi-key-sub">{{ lettersOf(key) }}</i>
      </button>
    </div>
  </div>
</template>

<style>
  .pi-kb {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .pi-kb-row {
    display: flex;
    gap: 6px;
  }

  .pi-key {
    align-items: center;
    background: #fff;
    border: 1px solid #d6e2ee;
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    color: #1c1e21;
    cursor: pointer;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    font-size: 26px;
    height: 72px;
    justify-content: center;
    min-width: 0;
    padding: 0 4px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .pi-key:active {
    background: #cfe3ff;
    color: #0057c2;
  }

  .pi-key.is-fn {
    font-size: 20px;
  }

  /* 空格比普通键宽一倍 */
  .pi-key.is-space {
    flex: 2 1 0;
  }

  /* 九宫格：键更高，数字与字母上下排 */
  .layout-t9 .pi-key {
    height: 92px;
  }

  .pi-key-main {
    font-size: 32px;
    font-weight: 500;
    line-height: 1.05;
  }

  .pi-key-sub {
    color: #8ba0b6;
    font-size: 14px;
    font-style: normal;
    letter-spacing: 1px;
    line-height: 1.1;
  }

  .layout-num .pi-key {
    font-size: 34px;
    height: 96px;
  }
</style>
