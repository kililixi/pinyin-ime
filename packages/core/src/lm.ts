/**
 * 二元语言模型（字幕语料统计）
 *
 * 只做一件事：给「上一个词 -> 这个词」一个对数概率，
 * 让 DP 在「你+号码」和「你好+吗」之间选对后者。
 * 数据由 scripts/build-bigram.mjs 生成，缺数据时整体降级为 0。
 */
import { RAW_BIGRAM, RAW_UNIGRAM } from './dict/bigram'

/** 加性平滑的强度：越大越依赖一元概率，越小越信 bigram */
const BETA = 50
/** 条件概率的分母里，一元词表的兜底词数 */
const VOCAB = 200000

let pairMap: Map<string, number> | null = null
let uniMap: Map<string, number> | null = null
let uniTotal = 0
let ready = false

function parseTable(raw: string, keyIsPair: boolean) {
  const map = new Map<string, number>()
  if (!raw) return map
  for (const line of raw.split('\n')) {
    const tab1 = line.indexOf('\t')
    if (tab1 < 0) continue
    const tab2 = keyIsPair ? line.indexOf('\t', tab1 + 1) : -1
    if (keyIsPair && tab2 < 0) continue
    const key = keyIsPair ? line.slice(0, tab2) : line.slice(0, tab1)
    const count = parseInt(
      keyIsPair ? line.slice(tab2 + 1) : line.slice(tab1 + 1),
      36
    )
    if (!key || !count) continue
    map.set(key, count)
  }
  return map
}

function ensure(): void {
  if (ready) return
  ready = true
  pairMap = parseTable(RAW_BIGRAM, true)
  uniMap = parseTable(RAW_UNIGRAM, false)
  for (const c of uniMap.values()) uniTotal += c
}

/** 模型是否可用（没有语料数据时为 false） */
export function hasLm(): boolean {
  ensure()
  return !!pairMap && pairMap.size > 0 && !!uniMap && uniMap.size > 0
}

function uniCount(word: string): number {
  return uniMap?.get(word) || 0
}

/**
 * log P(word | prev)，带加性平滑。
 * prev 为空表示句首，退化为一元概率。
 */
export function lmLogProb(prev: string, word: string): number {
  ensure()
  if (!uniMap || !uniTotal) return 0
  const uniP = (uniCount(word) + 1) / (uniTotal + VOCAB)
  if (!prev) return Math.log(uniP)
  const c1 = uniCount(prev)
  if (!c1) return Math.log(uniP)
  const c12 = pairMap?.get(prev + '\t' + word) || 0
  return Math.log((c12 + BETA * uniP) / (c1 + BETA))
}

// ------------------------------------------------------------------ 后续词

let contMap: Map<string, Array<{ w: string; c: number }>> | null = null

/** prev -> 语料里它后面最常跟的词（建一次，约 20ms） */
function buildContinuations(): Map<string, Array<{ w: string; c: number }>> {
  const out = new Map<string, Array<{ w: string; c: number }>>()
  if (!pairMap) return out
  for (const [key, count] of pairMap) {
    const tab = key.indexOf('\t')
    if (tab < 0) continue
    const prev = key.slice(0, tab)
    let arr = out.get(prev)
    if (!arr) out.set(prev, (arr = []))
    arr.push({ w: key.slice(tab + 1), c: count })
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => b.c - a.c)
    if (arr.length > 10) arr.length = 10
  }
  return out
}

/**
 * 上一个词后面最常跟的词。
 * 例如「我们」-> 的 / 都 / 要 / 一起。
 */
export function lmContinuations(
  prev: string,
  limit = 6
): Array<{ w: string; c: number }> {
  ensure()
  if (!contMap) contMap = buildContinuations()
  return (contMap.get(prev) || []).slice(0, limit)
}

/** 上线收尾：释放（一般不用） */
export function releaseLm(): void {
  pairMap = null
  uniMap = null
  contMap = null
  uniTotal = 0
  ready = false
}
