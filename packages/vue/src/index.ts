export { default as PinyinInput } from './PinyinInput.vue'
export { default as CandidateBar } from './CandidateBar.vue'
export { default as VirtualKeyboard } from './VirtualKeyboard.vue'
export type { Props as PinyinInputProps } from './PinyinInput.vue'
export type { LayoutName } from './types'

// 注意：PinyinEngine 请直接从 @startsi/pinyin-core 引入。
// 这里不再 re-export，否则构建时 dts 会把它改写成 monorepo 相对路径（发布后失效）。
