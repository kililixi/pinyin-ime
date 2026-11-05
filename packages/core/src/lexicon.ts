/** 词库访问层：JSON 惰性解析 + 最近使用的小缓存 */
import { RAW_DICT } from './dict/data'
import { RAW_INITIALS } from './dict/initials'
import type { LexCandidate } from './types'

type RawBucket = Array<string | number>

interface BucketCache {
  get(key: string): LexCandidate[] | undefined
  clear(): void
}

let rawDict: Record<string, RawBucket> | null = null
let rawInitials: Record<string, RawBucket> | null = null

function ensureDict(): Record<string, RawBucket> {
  if (!rawDict) rawDict = JSON.parse(RAW_DICT) as Record<string, RawBucket>
  return rawDict
}

function ensureInitials(): Record<string, RawBucket> {
  if (!rawInitials)
    rawInitials = JSON.parse(RAW_INITIALS) as Record<string, RawBucket>
  return rawInitials
}

function createCache(
  limit: number,
  source: () => Record<string, RawBucket>,
  flat: boolean
) {
  const cache = new Map<string, LexCandidate[]>()
  return {
    get(key: string): LexCandidate[] | undefined {
      const hit = cache.get(key)
      if (hit) return hit
      const raw = source()[key]
      if (!raw) return undefined
      const list: LexCandidate[] = []
      if (flat) {
        for (let i = 0; i < raw.length; i += 2) {
          list.push({ w: raw[i] as string, f: raw[i + 1] as number })
        }
      }
      if (cache.size > limit) cache.clear()
      cache.set(key, list)
      return list
    },
    clear() {
      cache.clear()
    },
  }
}

const dictCache: BucketCache = createCache(4096, ensureDict, true)
const initialsCache: BucketCache = createCache(512, ensureInitials, true)

/** 精确查询拼音键 */
export function getBucket(key: string): LexCandidate[] | undefined {
  return dictCache.get(key)
}

/** 精确查询简拼键（声母串） */
export function getInitialsBucket(key: string): LexCandidate[] | undefined {
  return initialsCache.get(key)
}

// ------------------------------------------------------------------ 九宫格

/** 字母 -> 数字键：2=abc 3=def 4=ghi 5=jkl 6=mno 7=pqrs 8=tuv 9=wxyz */
const T9_DIGIT: Record<string, string> = {
  a: '2',
  b: '2',
  c: '2',
  d: '3',
  e: '3',
  f: '3',
  g: '4',
  h: '4',
  i: '4',
  j: '5',
  k: '5',
  l: '5',
  m: '6',
  n: '6',
  o: '6',
  p: '7',
  q: '7',
  r: '7',
  s: '7',
  t: '8',
  u: '8',
  v: '8',
  w: '9',
  x: '9',
  y: '9',
  z: '9',
}

/** 拼音键 -> 数字键，如 zhongguo -> 94664486 */
function toDigits(key: string): string {
  let out = ''
  for (let i = 0; i < key.length; i++) {
    const digit = T9_DIGIT[key[i]]
    if (!digit) return ''
    out += digit
  }
  return out
}

let t9Index: Map<string, LexCandidate[]> | null = null

/** 由拼音索引懒构建九宫格索引：同一数字串下的同音词合并 */
function buildT9Index(): Map<string, LexCandidate[]> {
  const src = ensureDict()
  const out = new Map<string, LexCandidate[]>()
  for (const key in src) {
    const digits = toDigits(key)
    if (!digits) continue
    const bucket = src[key]
    let list = out.get(digits)
    if (!list) out.set(digits, (list = []))
    for (let i = 0; i < bucket.length; i += 2) {
      // p 记录这个候选原本的拼音，界面上用数字串反查太难看
      list.push({ w: bucket[i] as string, f: bucket[i + 1] as number, p: key })
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.f - a.f)
    if (list.length > 12) list.length = 12
  }
  return out
}

function ensureT9(): Map<string, LexCandidate[]> {
  if (!t9Index) t9Index = buildT9Index()
  return t9Index
}

/** 九宫格查询：入参是数字串 */
export function getT9Bucket(digits: string): LexCandidate[] | undefined {
  return ensureT9().get(digits)
}

// ------------------------------------------------------------------ 前缀联想

/** 只对前 4 位数字建前缀表：再长基本都能精确命中 */
const PREDICT_PREFIX_LEN = 4
const PREDICT_KEEP = 10

let t9Prefix: Map<string, LexCandidate[]> | null = null

/**
 * 数字前缀 -> 以该前缀开头的词。
 * 手机输入法按第一个键就出候选，靠的就是这张表；
 * 例如 56 -> 龙/隆/拢（long），同时能把拼音还原成 lo。
 */
function buildT9Prefix(): Map<string, LexCandidate[]> {
  const out = new Map<string, LexCandidate[]>()
  for (const [digits, list] of ensureT9()) {
    const max = Math.min(PREDICT_PREFIX_LEN, digits.length)
    for (let len = 1; len <= max; len++) {
      const prefix = digits.slice(0, len)
      let arr = out.get(prefix)
      if (!arr) out.set(prefix, (arr = []))
      for (const c of list) arr.push(c)
      // 边收边裁，避免 1 位前缀把所有词都堆进来
      if (arr.length > 200) {
        arr.sort((a, b) => b.f - a.f)
        arr.length = 100
      }
    }
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => b.f - a.f)
    if (arr.length > PREDICT_KEEP) arr.length = PREDICT_KEEP
  }
  return out
}

/** 前缀联想：入参是数字串，返回以它开头的词（按词频排序） */
export function getT9PrefixBucket(digits: string): LexCandidate[] | undefined {
  if (!t9Prefix) t9Prefix = buildT9Prefix()
  return t9Prefix.get(digits)
}

/** 预热九宫格索引与前缀表（切到 9 键时调一次） */
export function preloadT9(): void {
  ensureT9()
  if (!t9Prefix) t9Prefix = buildT9Prefix()
}

// ------------------------------------------------------------------ 联想

/** 每个首字最多留多少个后续词 */
const FOLLOW_PER_CHAR = 40
/** 联想匹配的末尾字数范围：从长到短试，命中即可 */
const FOLLOW_MAX_SUFFIX = 4
const FOLLOW_MIN_SUFFIX = 2

let charIndex: Map<string, LexCandidate[]> | null = null

/** 首字 -> 以它开头的词（按词频排序，预裁剪） */
function buildCharIndex(): Map<string, LexCandidate[]> {
  const out = new Map<string, LexCandidate[]>()
  for (const list of ensureDictKeys()) {
    for (const c of list) {
      const first = c.w[0]
      let arr = out.get(first)
      if (!arr) out.set(first, (arr = []))
      arr.push(c)
    }
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => b.f - a.f)
    if (arr.length > FOLLOW_PER_CHAR) arr.length = FOLLOW_PER_CHAR
  }
  return out
}

function ensureDictKeys(): LexCandidate[][] {
  const out: LexCandidate[][] = []
  const src = ensureDict()
  for (const key in src) {
    const bucket = src[key]
    const list: LexCandidate[] = []
    for (let i = 0; i < bucket.length; i += 2) {
      list.push({ w: bucket[i] as string, f: bucket[i + 1] as number })
    }
    out.push(list)
  }
  return out
}

/**
 * 上屏后的联想：给一段已输入的文本，返回可以接着输入、且以它结尾的词的候选。
 * 例如「北京」-> 北京市 / 北京大学 / 北京时间；「广东」-> 广东省。
 */
export function getFollowWords(text: string, limit = 8): LexCandidate[] {
  if (!charIndex) charIndex = buildCharIndex()
  // 从最长的尾巴开始试：「黑龙江」要能用上 3 个字，「北京」用 2 个字
  const max = Math.min(FOLLOW_MAX_SUFFIX, text.length)
  for (let n = max; n >= FOLLOW_MIN_SUFFIX; n--) {
    const tail = text.slice(-n)
    const pool = charIndex.get(tail[0])
    if (!pool) continue
    const out: LexCandidate[] = []
    for (const c of pool) {
      if (c.w.length > n && c.w.startsWith(tail)) out.push(c)
      if (out.length >= limit) break
    }
    if (out.length) return out
  }
  return []
}

/** 预加载词库（打开输入框时调一次，避免第一次按键卡顿） */
export function preloadLexicon(): void {
  ensureDict()
  ensureInitials()
}

/** 只释放引用，交给 GC；下次访问会重新解析 */
export function releaseLexicon(): void {
  rawDict = null
  rawInitials = null
  dictCache.clear()
  initialsCache.clear()
  t9Index = null
  t9Prefix = null
  charIndex = null
}
