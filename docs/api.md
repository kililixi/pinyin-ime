# API 说明

- [@startsi/pinyin-core](#startsi核心内核)
- [@startsi/vue-pinyin-ime](#startsi-vue-输入控件)
- [@startsi/vue-handwriting](#startsi-vue-手写板)
- [@startsi/handwriting-model](#startsi-手写模型)

---

## @startsi/pinyin-core

纯 TypeScript，零框架依赖。浏览器、Node、Electron 渲染进程都能跑（`UserFreqStore` 需要 `localStorage`）。

```bash
npm i @startsi/pinyin-core
```

### PinyinEngine

```ts
import { PinyinEngine, preloadLexicon } from '@startsi/pinyin-core'

preloadLexicon()                       // 可选：预热词库，避免首键 100ms 卡顿
const engine = new PinyinEngine({ pageSize: 10 })
```

#### 构造参数 `EngineOptions`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mode` | `'pinyin' \| 't9'` | `'pinyin'` | `t9` 为九宫格：输入 `2`–`9` |
| `pageSize` | `number` | `12` | 每页候选数 |
| `fuzzy` | `boolean` | `true` | 模糊音开关 |
| `fuzzyGroups` | `FuzzyGroup[]` | 内置 8 组 | zh/z、ch/c、sh/s、ing/in、ang/an、eng/en、n/l、f/h |
| `enableInitials` | `boolean` | `true` | 简拼（`zg` → 中国） |
| `enableNames` | `boolean` | `true` | 姓名候选（`wangwei` → 王伟） |
| `useLm` | `boolean` | `true` | 是否启用 bigram 打分（需先 `setLmProvider`） |
| `lmWeight` | `number` | `0.8` | 语言模型权重 |
| `userWeight` | `number` | `8` | 用户词频权重 |
| `singlePenalty` | `number` | `0` | 单字惩罚（负分） |
| `wordBonus` | `number` | `0` | 多字词奖励 |
| `userFreq` | `(word: string) => number` | — | 用户词频查询 |

#### 输入

```ts
press(key: KeyInput): PressResult
```

`KeyInput`：

| 形式 | 含义 |
|---|---|
| `{ t: 'char', v: 'z' }` | 字母（全拼）或数字 `'2'`–`'9'`（九宫格） |
| `{ t: 'select', i: 0 }` | 选当前页第 i 个候选（0 起） |
| `{ t: 'space' }` | 上屏首选 |
| `{ t: 'back' }` | 退格（先删拼音） |
| `{ t: 'pgup' }` / `{ t: 'pgdn' }` | 翻页 |
| `{ t: 'esc' }` | 取消组词 |

`PressResult`：

| 返回 | 宿主该做什么 |
|---|---|
| `{ type: 'commit', text }` | 把 `text` 插到输入框 |
| `{ type: 'composing' }` | 只刷新候选 |
| `{ type: 'unhandled' }` | 引擎没消费，比如拼音为空时的退格 → 自己删正文 |
| `{ type: 'cancel' }` | 取消组词 |

> **核心约定**：`engine.preedit` 永远不要写进输入框的值，只有 `commit` 才写。

#### 读取状态

| 成员 | 类型 | 说明 |
|---|---|---|
| `preedit` | `string` | 当前拼音串（九宫格是数字串） |
| `displayPreedit` | `string` | 给界面显示的拼音（九宫格会还原成字母：`56` → `ko`） |
| `page` | `number` | 当前页（0 起） |
| `pageCount` | `number` | 总页数 |
| `pageSize` | `number` | 每页数量 |
| `inputMode` | `'pinyin' \| 't9'` | 当前输入模型 |
| `list()` | `Candidate[]` | 当前页候选 |
| `all()` | `Candidate[]` | 全部候选（调试/测试用） |
| `pages()` | `Candidate[][]` | 所有分页 |

`Candidate`：

```ts
{
  w: string        // 词
  f: number        // 词频
  len: number      // 选中后消耗几个输入字符
  score: number    // 排序分（调试用）
  py?: string      // 来源拼音（九宫格用）
  type: 'sentence' | 'word' | 'char' | 'initial' | 'name' | 'predict'
}
```

#### 九宫格音节（两级候选）

九宫格一个数字串能对应多个音节（`56` 可能是 `kong` / `kou` / `lou`），
把可能的音节先摆出来，用户点一下再收窄到该音节的词——这就是「两级候选」。

```ts
type(e, '56')
engine.syllableOptions()   // ['kou', 'lou', 'kong', 'long']
engine.setSyllableFilter('kong')
engine.all().map(c => c.w) // 控制 / 恐怕 / 空 / 空间 / 空气 / 恐惧 / 空中…
engine.displayPreedit      // 'kong'
engine.activeSyllable      // 'kong'

engine.setSyllableFilter(null)  // 取消
```

| 成员 | 说明 |
|---|---|
| `syllableOptions(limit?)` | 当前数字串可能的音节，按词频排序；少于 2 个时返回 `[]` |
| `setSyllableFilter(py \| null)` | 手选音节，只留该音节的词；传 `null` 取消 |
| `activeSyllable` | 当前选中的音节（输入变化后自动变 `null`） |

#### 上下文与模型

```ts
setContext(text: string): void        // 已上屏文本（光标前），用于组词后的联想
setLmProvider(p: LmProvider | null)   // 注入语言模型
notifyCommitted(word: string): void   // 上报一次上屏，刷新用户词频
reset(): void
setOptions(o: EngineOptions): void
```

```ts
engine.setContext('谢谢')
engine.list()      // 你 / 了 / 大家 / 谢谢你们 / 谢谢您 …
```

### 九宫格

```ts
import { PinyinEngine, preloadT9 } from '@startsi/pinyin-core'

preloadT9()                                  // 首次约 130ms，建议在打开输入框后调用
const engine = new PinyinEngine({ mode: 't9' })

for (const d of '94664486') engine.press({ t: 'char', v: d })
engine.displayPreedit    // 'zhongguo'
engine.all()[0].w        // '中国'
```

数字键映射：`2=abc 3=def 4=ghi 5=jkl 6=mno 7=pqrs 8=tuv 9=wxyz`。
同音在数字层面天然合并，所以九宫格不再叠加模糊音，也不出姓名候选。

### 语言模型（可选，单独子路径）

主入口不带 bigram 数据（约 770KB），需要时再引：

```ts
const lm = await import('@startsi/pinyin-core/lm')
engine.setLmProvider({
  score: lm.lmLogProb,            // log P(word | prev)
  continuations: lm.lmContinuations,
})
```

| 导出 | 说明 |
|---|---|
| `hasLm()` | 模型数据是否可用 |
| `lmLogProb(prev, word)` | 条件概率对数，带加性平滑 |
| `lmContinuations(prev, limit?)` | `prev` 后面最常跟的词 |

带上 LM 后：`duoshaoqian → 多少钱`、`beijingshi → 北京市`。

### UserFreqStore

```ts
import { UserFreqStore } from '@startsi/pinyin-core'

const store = new UserFreqStore('my-app:pinyin-freq', 5000)
const engine = new PinyinEngine({ userFreq: store.get })

store.hit('中国')     // 记录一次选择，后面这个候选会更靠前
store.get('中国')     // 1
store.clear()
```

数据存在 `localStorage`，按机器生效；`limit` 是最多保留多少条（LRU）。

### 其它工具函数

```ts
import { preloadLexicon, preloadT9, getFollowWords } from '@startsi/pinyin-core'
import { splitSyllables, fuzzyVariants, isCompleteSyllables } from '@startsi/pinyin-core'

splitSyllables('zhongguo')          // ['zhong', 'guo']
isCompleteSyllables('kong')         // true
fuzzyVariants('zhong')              // ['zong', 'zhon'…] 按模糊音分组生成
getFollowWords('北京', 8)            // 以「北京」开头的词
```

---

## @startsi/vue-pinyin-ime

```bash
npm i @startsi/vue-pinyin-ime @startsi/pinyin-core @startsi/vue-handwriting
```

```vue
<script setup>
  import { PinyinInput } from '@startsi/vue-pinyin-ime'
  import '@startsi/vue-pinyin-ime/style.css'
  const name = ref('')
</script>

<template>
  <PinyinInput v-model="name" title="姓名" />
</template>
```

### Props

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `modelValue` | `string` | — | `v-model` |
| `title` | `string` | `''` | 弹层标题，同时用于自动判断字段类型 |
| `placeholder` | `string` | `'请输入'` | |
| `numeric` | `boolean` | 自动 | 数字键盘（`0-9` + `X`）；标题含 身份证/证件号/号码/编号/条码/电话/手机/邮编/卡号 时自动开启 |
| `nameMode` | `boolean` | 自动 | 姓名候选；标题含 姓名/收件人 或为「姓」「名」时自动开启 |
| `layout` | `'auto' \| 'split' \| 'stack'` | `'auto'` | `auto`：九宫格左右分栏、全键盘上下 |
| `maxLength` | `number` | `64` | |
| `disabled` | `boolean` | `false` | |
| `storageKey` | `string` | `'pinyin-ime:keyboard'` | 记住九宫格/全键盘选择的 localStorage 键 |
| `useLm` | `boolean` | `true` | 是否后台加载语言模型 |
| `loadModel` | `() => Promise<ArrayBuffer \| Blob>` | — | 手写模型字节来源（Electron 用） |
| `modelUrl` | `string` | — | 手写模型地址（浏览器用） |
| `onExternalHandwriting` | `(open: boolean) => void` | — | 传了就用外部手写程序，不显示内置手写板 |

### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `update:modelValue` | `string` | 值变化 |
| `confirm` | — | 点「确认」 |
| `commit` | `text: string` | 每次上屏（选词/手写） |
| `error` | `message: string` | 手写模型加载失败等 |

### 音节候选条

九宫格下候选条头部会多出一排音节按钮（`kong` / `kou` / `lou`），
点击即筛选，再点取消。想自己控制可以拆出 `CandidateBar`：

```vue
<CandidateBar
  :preedit="preedit"
  :candidates="candidates"
  :page="page"
  :page-count="pageCount"
  :syllables="syllables"
  :active-syllable="active"
  @select="onSelect"
  @pick-syllable="(py) => ..."
/>
```

### 插槽

```vue
<PinyinInput v-model="name" title="姓名">
  <template #trigger="{ open, value }">
    <el-input readonly :model-value="value" @click="open" />
  </template>
</PinyinInput>
```

### 暴露的方法

```ts
const ref_input = ref()
ref_input.value.open()
ref_input.value.close()
```

---

## @startsi/vue-handwriting

```bash
npm i @startsi/vue-handwriting @startsi/handwriting-model
```

```vue
<script setup>
  import { HandwritingPad } from '@startsi/vue-handwriting'
  import '@startsi/vue-handwriting/style.css'
  import modelUrl from '@startsi/handwriting-model/hz.hzmodel?url'
</script>

<template>
  <HandwritingPad :model-url="modelUrl" @pick="(c) => (text += c)" />
</template>
```

### Props

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `size` | `number` | `320` | 画布边长（px） |
| `topK` | `number` | `10` | 候选个数 |
| `strokeColor` | `string` | `'#1c1e21'` | 笔画颜色 |
| `strokeWidth` | `number` | `8` | 笔画粗细 |
| `loadModel` | `() => Promise<ArrayBuffer \| Blob>` | — | 优先于 `modelUrl` |
| `modelUrl` | `string` | — | 模型地址 |

### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `pick` | `char: string` | 选中一个字（组件会自动清板） |
| `back` | — | 点「拼音键盘」 |
| `error` | `message: string` | 模型加载/识别失败 |

### Electron 中的模型加载

渲染进程读不了 `file://`，让主进程读字节：

```ts
// main
ipcMain.handle('hw:model', () => fs.readFileSync(modelPath))

// renderer
<HandwritingPad :load-model="() => ipcRenderer.invoke('hw:model')" />
```

---

## @startsi/handwriting-model

HanScribe 模型（7.5MB，MIT），单独发包，避免不需要手写的项目多下 7.5MB。

```ts
// Vite：当静态资源
import modelUrl from '@startsi/handwriting-model/hz.hzmodel?url'

// Electron 主进程：取文件路径
const file = path.join(
  path.dirname(require.resolve('@startsi/handwriting-model/package.json')),
  'hz.hzmodel'
)
```

## 兼容性

- 构建目标 ES2020，需要 Chromium 87+ / Node 16+
- 用到了 `ResizeObserver`、`Teleport`、`localStorage`，**不支持 SSR**，需要 `<ClientOnly>` 或动态导入
- 手写需要 CSP 放行：`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:;`
