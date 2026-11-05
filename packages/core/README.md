# @startsi/pinyin-core

中文拼音输入法内核。纯 TypeScript，零依赖，浏览器 / Node 通用。

## 安装

```bash
npm i @startsi/pinyin-core
```

## 用法

```ts
import { PinyinEngine, preloadLexicon, preloadT9 } from '@startsi/pinyin-core'

preloadLexicon()          // 打开输入框时预热，避免首键卡顿
const engine = new PinyinEngine({ pageSize: 10 })

for (const ch of 'zhongguo') engine.press({ t: 'char', v: ch })
engine.all()              // [{ w: '中国', type: 'sentence', ... }, ...]
engine.displayPreedit     // 'zhongguo'

const r = engine.press({ t: 'space' })
// r = { type: 'commit', text: '中国' }
engine.preedit            // 上屏后剩余的拼音
```

`press` 的返回值：

| 返回 | 含义 |
|---|---|
| `{ type: 'commit', text }` | 把 text 插到输入框 |
| `{ type: 'composing' }` | 只更新了候选 |
| `{ type: 'unhandled' }` | 引擎没消费（如 preedit 为空时的退格），宿主自己删正文 |
| `{ type: 'cancel' }` | 取消组词 |

**关键约定：preedit 永远不进 `value`**，只有上屏才写值。

## 九宫格

```ts
const engine = new PinyinEngine({ mode: 't9' })
preloadT9()
for (const d of '94664486') engine.press({ t: 'char', v: d })
engine.displayPreedit   // 'zhongguo'
engine.all()[0]         // 中国
```

## 语言模型（可选）

主入口不带 bigram 数据，需要的话单独引：

```ts
const lm = await import('@startsi/pinyin-core/lm')
engine.setLmProvider({
  score: lm.lmLogProb,
  continuations: lm.lmContinuations,
})
```

不带 LM：22/22 golden 用例；带上：25/25（`多少钱`、`北京市`、`我们大家`）。

## 词库

13 万词条 / 9.4 万拼音键，来自 jieba（MIT）+ OpenSubtitles 词频（口语权重），
全表 OpenCC 繁转简。golden 用例见 `test/smoke.mjs`。
