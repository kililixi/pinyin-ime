/**
 * 拼音输入法引擎（与框架、DOM 完全无关）
 *
 * 核心是「词图动态规划」：把输入串当成字母网格，枚举所有能对上词库的
 * 词（含跨音节的双字词），用词频打分求最优组合。
 * 单靠整串查表出不来「中国人」这种词表里没有的组合，单靠贪心切分会在
 * 共用字母处崩掉（如 renminguangchang 里 min 与 guang 共用字母 g）。
 */
import { MAX_KEY_LEN as DICT_MAX_KEY_LEN, TOTAL_FREQ } from './dict/meta'
import { DEFAULT_FUZZY_GROUPS, fuzzyVariants } from './fuzzy'
import {
  getBucket,
  getFollowWords,
  getInitialsBucket,
  getSyllableCompletions,
  getT9Bucket,
  getT9PrefixBucket,
  toDigits,
} from './lexicon'
import { buildNameCandidates } from './names'
import type {
  Candidate,
  EngineOptions,
  FuzzyGroup,
  KeyInput,
  LexCandidate,
  PressResult,
} from './types'

/** 单次匹配最多吃掉的字母数（受词库最长键限制，封顶 20 控制 DP 开销） */
const MAX_KEY_LEN = Math.min(20, DICT_MAX_KEY_LEN || 12)
/** 词库解析不到剩余输入时的兜底分 */
const INVALID_REST = -6
/** 模糊音合并后单个 key 的候选上限，防止短前缀爆炸 */
const MAX_FUZZY_BUCKET = 40
/** 精确拼音命中相对模糊音变体的加成 */
const EXACT_BONUS = 0.9
/** 姓名候选的分数折损：姓名不该压过真实高频词 */
const NAME_PENALTY = 2
/** 前缀联想的分数折损 */
const PREDICT_PENALTY = 1.5
/** 命中用户手选音节的加成 */
const SYLLABLE_BONUS = 6
/** 超过这个长度就不再走前缀联想（基本都能精确命中） */
const PREDICT_MAX_LEN = 4

/** 语言模型提供者（由 host 注入，engine 不直接依赖模型数据） */
export interface LmProvider {
  /** log P(word | prev) */
  score(prev: string, word: string): number
  /** prev 后面最常跟的词 */
  continuations(prev: string, limit?: number): Array<{ w: string; c: number }>
}

interface Best {
  score: number
  text: string
  /** 该路径对应的拼音（九宫格用来把数字还原成字母显示） */
  py?: string
}

/** 带「是否精确命中」标记的词库候选 */
interface Scored extends LexCandidate {
  /** 1 = 来自模糊音变体 */
  fuzzy?: 1
}

interface ResolvedOptions {
  mode: 'pinyin' | 't9'
  pageSize: number
  fuzzy: boolean
  fuzzyGroups: FuzzyGroup[]
  userWeight: number
  singlePenalty: number
  wordBonus: number
  enableInitials: boolean
  enableNames: boolean
  useLm: boolean
  lmWeight: number
  userFreq?: (word: string) => number
}

function resolveOptions(opts: EngineOptions): ResolvedOptions {
  return {
    mode: opts.mode ?? 'pinyin',
    pageSize: opts.pageSize ?? 12,
    fuzzy: opts.fuzzy ?? true,
    fuzzyGroups: opts.fuzzyGroups ?? DEFAULT_FUZZY_GROUPS,
    userWeight: opts.userWeight ?? 8,
    singlePenalty: opts.singlePenalty ?? 0,
    wordBonus: opts.wordBonus ?? 0,
    enableInitials: opts.enableInitials ?? true,
    enableNames: opts.enableNames ?? true,
    useLm: opts.useLm ?? true,
    lmWeight: opts.lmWeight ?? 0.8,
    userFreq: opts.userFreq,
  }
}

export class PinyinEngine {
  /** 当前输入拼音（不含已上屏文本）；九宫格下是数字串 */
  preedit = ''
  /** 给界面看的拼音：九宫格时把数字还原成最可能的字母，如 54 -> li */
  preeditDisplay = ''
  /** 当前候选页码，0 起 */
  page = 0

  private opts: ResolvedOptions
  private logTotal = Math.log(TOTAL_FREQ || 1)
  private candidates: Candidate[] = []
  private dirty = true
  /** 语言模型，由宿主按需注入（避免首屏加载 bigram 数据） */
  private lmProvider: LmProvider | null = null
  /** 已上屏的上下文（光标前的内容），用于组词结束后的联想 */
  private context = ''
  /** 九宫格手选的音节过滤（kong / kou …），为 null 表示不过滤 */
  private syllableFilter: string | null = null
  private fuzzyCache = new Map<string, Scored[]>()
  private userCache = new Map<string, number>()

  constructor(options: EngineOptions = {}) {
    this.opts = resolveOptions(options)
  }

  /** 运行时改配置（如关闭模糊音） */
  setOptions(options: EngineOptions): void {
    this.opts = resolveOptions(options)
    this.fuzzyCache.clear()
    this.userCache.clear()
    this.dirty = true
  }

  /**
   * 注入语言模型。传 null 表示关闭。
   * 宿主可以动态 import 模型数据后再注入，让首屏不必加载 bigram。
   */
  setLmProvider(provider: LmProvider | null): void {
    this.lmProvider = provider
    this.dirty = true
  }

  /**
   * 九宫格：手选一个音节，候选优先出这个音节开头的词。
   * 传 null 取消。
   */
  setSyllableFilter(pinyin: string | null): void {
    if (pinyin === this.syllableFilter) return
    this.syllableFilter = pinyin
    this.dirty = true
  }

  /** 当前手选的音节（输入变化后自动失效） */
  get activeSyllable(): string | null {
    if (
      this.syllableFilter &&
      !toDigits(this.syllableFilter).startsWith(this.preedit)
    ) {
      this.syllableFilter = null
    }
    return this.syllableFilter
  }

  /**
   * 九宫格音节候选：给当前数字串列出可能的音节（56 -> kong / kou / lou）。
   * 只有一个可能、或不是九宫格时返回空数组。
   */
  syllableOptions(limit = 6): string[] {
    if (this.opts.mode !== 't9' || !this.preedit) return []
    const options = getSyllableCompletions(this.preedit, limit + 1)
    return options.length > 1 ? options.slice(0, limit).map((o) => o.py) : []
  }

  /**
   * 同步已上屏的上下文，用于组词结束后的联想。
   * 传光标前的文本即可（如「北京」-> 北京市 / 北京大学）。
   */
  setContext(text: string): void {
    if (text === this.context) return
    this.context = text
    this.dirty = true
  }

  /** 用户选了某个词之后，刷新用户词频缓存 */
  notifyCommitted(word: string): void {
    this.userCache.delete(word)
    this.dirty = true
  }

  get pageSize(): number {
    return this.opts.pageSize
  }

  get inputMode(): 'pinyin' | 't9' {
    return this.opts.mode
  }

  /** 界面应显示的组词串（九宫格显示拼音，全拼与输入一致） */
  get displayPreedit(): string {
    if (this.dirty) this.rebuild()
    return this.preeditDisplay || this.preedit
  }

  get pageCount(): number {
    if (this.dirty) this.rebuild()
    return Math.max(1, Math.ceil(this.candidates.length / this.opts.pageSize))
  }

  /** 当前页候选 */
  list(): Candidate[] {
    if (this.dirty) this.rebuild()
    const start = this.page * this.opts.pageSize
    return this.candidates.slice(start, start + this.opts.pageSize)
  }

  /** 全部候选（调试/测试用） */
  all(): Candidate[] {
    if (this.dirty) this.rebuild()
    return this.candidates
  }

  /** 全部分页（供 UI 一次渲染） */
  pages(): Candidate[][] {
    if (this.dirty) this.rebuild()
    const out: Candidate[][] = []
    for (let i = 0; i < this.candidates.length; i += this.opts.pageSize) {
      out.push(this.candidates.slice(i, i + this.opts.pageSize))
    }
    return out.length ? out : [[]]
  }

  /** 按键入口 */
  press(key: KeyInput): PressResult {
    switch (key.t) {
      case 'char': {
        const legal =
          this.opts.mode === 't9'
            ? /^[2-9]$/.test(key.v)
            : /^[a-z']$/.test(key.v)
        if (!legal) return { type: 'unhandled' }
        // 分词符只保留一个，且不能在开头
        const ch = key.v === "'" ? "'" : key.v.toLowerCase()
        if (ch === "'" && (this.preedit === '' || this.preedit.endsWith("'"))) {
          return { type: 'composing' }
        }
        this.preedit += ch
        this.page = 0
        this.dirty = true
        return { type: 'composing' }
      }
      case 'select':
        return this.select(key.i)
      case 'space':
        return this.select(0)
      case 'back': {
        if (!this.preedit) return { type: 'unhandled' }
        this.preedit = this.preedit.slice(0, -1)
        this.page = 0
        this.dirty = true
        return { type: 'composing' }
      }
      case 'pgup': {
        if (this.page > 0) this.page--
        return { type: 'composing' }
      }
      case 'pgdn': {
        if (this.page < this.pageCount - 1) this.page++
        return { type: 'composing' }
      }
      case 'esc': {
        this.reset()
        return { type: 'cancel' }
      }
      default:
        return { type: 'unhandled' }
    }
  }

  /** 选中第 i 个候选（相对当前页），返回要上屏的文本 */
  select(i: number): PressResult {
    if (this.dirty) this.rebuild()
    const index = this.page * this.opts.pageSize + i
    const cand = this.candidates[index]
    if (!cand) return { type: 'composing' }
    this.preedit =
      cand.len >= this.preedit.length ? '' : this.preedit.slice(cand.len)
    if (!this.preedit) this.preeditDisplay = ''
    this.page = 0
    this.dirty = true
    this.userCache.clear()
    return { type: 'commit', text: cand.w }
  }

  reset(): void {
    this.preedit = ''
    this.preeditDisplay = ''
    this.page = 0
    this.dirty = true
  }

  // ------------------------------------------------------------------ 内部

  /** 查词库：精确 + 模糊音变体（合并去重，带缓存） */
  private lookup(key: string): Scored[] | undefined {
    // 九宫格：直接用数字串查合并后的索引，模糊音在数字层面已天然合并
    if (this.opts.mode === 't9') return getT9Bucket(key)

    const exact = getBucket(key)
    if (!this.opts.fuzzy) return exact
    const hit = this.fuzzyCache.get(key)
    if (hit !== undefined) return hit.length ? hit : undefined

    const out: Scored[] = []
    const seen = new Set<string>()
    for (const c of exact ?? []) {
      out.push({ w: c.w, f: c.f })
      seen.add(c.w)
    }
    for (const variant of fuzzyVariants(key, this.opts.fuzzyGroups)) {
      const bucket = getBucket(variant)
      if (!bucket) continue
      for (const c of bucket) {
        if (seen.has(c.w)) continue
        seen.add(c.w)
        out.push({ w: c.w, f: c.f, fuzzy: 1 })
      }
    }
    out.sort((a, b) => b.f - a.f)
    if (out.length > MAX_FUZZY_BUCKET) out.length = MAX_FUZZY_BUCKET

    if (this.fuzzyCache.size > 1024) this.fuzzyCache.clear()
    this.fuzzyCache.set(key, out)
    return out.length ? out : undefined
  }

  private userBonus(word: string): number {
    if (!this.opts.userFreq) return 0
    let count = this.userCache.get(word)
    if (count === undefined) {
      count = this.opts.userFreq(word) || 0
      this.userCache.set(word, count)
    }
    if (count <= 0) return 0
    return Math.min(6, Math.log2(1 + count)) * this.opts.userWeight
  }

  private score(c: Scored): number {
    const base = Math.log(c.f + 1) - this.logTotal
    const shape =
      c.w.length === 1 ? this.opts.singlePenalty : this.opts.wordBonus
    const fuzzy = c.fuzzy ? -EXACT_BONUS : 0
    return base + shape + fuzzy + this.userBonus(c.w)
  }

  /** 组词结束后按已上屏内容给的联想：语言模型的后续词优先，其次前缀补全 */
  private buildSuggestions(): Candidate[] {
    if (!this.context) return []
    const out: Candidate[] = []
    const seen = new Set<string>()

    // 1. bigram：上一个词后面最常跟什么
    const prev = this.lastWord(this.context)
    if (prev && this.lmProvider) {
      for (const c of this.lmProvider.continuations(prev, 6)) {
        if (seen.has(c.w)) continue
        seen.add(c.w)
        out.push({
          w: c.w,
          f: c.c,
          len: 0,
          type: 'predict',
          score: Math.log(c.c + 1) - this.logTotal,
        })
      }
    }

    // 2. 前缀补全：北京 -> 北京市 / 北京大学
    for (const c of getFollowWords(this.context, 8)) {
      if (seen.has(c.w)) continue
      seen.add(c.w)
      out.push({
        w: c.w,
        f: c.f,
        len: 0,
        type: 'predict',
        score: Math.log(c.f + 1) - this.logTotal - 1,
      })
    }
    return out.slice(0, 10)
  }

  /** 取已上屏文本末尾、语言模型认识的最长词作为上文 */
  private lastWord(text: string): string {
    if (!this.lmProvider) return ''
    for (let len = Math.min(4, text.length); len >= 1; len--) {
      const tail = text.slice(-len)
      if (this.lmProvider.continuations(tail, 1).length) return tail
    }
    return ''
  }

  /**
   * 带 bigram 的整句解码（前向 DP，状态 = 上一个词）。
   * 一元 DP 分不清「你+号码」和「你好+吗」，这一步专门解决它。
   */
  private lmSentence(preedit: string): Best | null {
    if (!this.opts.useLm || !this.lmProvider) return null
    const L = preedit.length
    interface State {
      last: string
      score: number
      text: string
      py: string
    }
    const states: State[][] = new Array(L + 1)
    for (let i = 0; i <= L; i++) states[i] = []
    states[0] = [{ last: '', score: 0, text: '', py: '' }]

    for (let i = 0; i < L; i++) {
      const from = states[i]
      if (!from.length) continue
      for (let len = 1; len <= MAX_KEY_LEN && i + len <= L; len++) {
        const bucket = this.lookup(preedit.substr(i, len))
        if (!bucket) continue
        const target = states[i + len]
        for (const c of bucket) {
          const base = this.score(c)
          for (const st of from) {
            // 第一个词不套语言模型：句首的「上下文」由词库自身的词频决定，
            // 否则语料的一元分布会把「中古」压到「胸骨」下面
            const lm =
              st.last && this.lmProvider
                ? this.opts.lmWeight * this.lmProvider.score(st.last, c.w)
                : 0
            target.push({
              last: c.w,
              score: st.score + base + lm,
              text: st.text + c.w,
              py: st.py + (c.p ?? ''),
            })
          }
        }
        this.pruneStates(target)
      }
    }

    const final = states[L]
    if (!final.length) return null
    let top = final[0]
    for (const st of final) if (st.score > top.score) top = st
    return { score: top.score, text: top.text, py: top.py }
  }

  /** 每个位置按「上一个词」去重后只留最优的几条 */
  private pruneStates(
    states: Array<{ last: string; score: number; text: string; py: string }>
  ): void {
    const BEAM = 4
    if (states.length <= BEAM) return
    states.sort((a, b) => b.score - a.score)
    const seen = new Set<string>()
    const out: typeof states = []
    for (const st of states) {
      if (seen.has(st.last)) continue
      seen.add(st.last)
      out.push(st)
      if (out.length >= BEAM) break
    }
    states.length = 0
    states.push(...out)
  }

  private rebuild(): void {
    this.dirty = false
    const preedit = this.preedit
    // 输入变化后，之前选的音节可能已经对不上了，自动失效
    if (this.syllableFilter && !toDigits(this.syllableFilter).startsWith(preedit)) {
      this.syllableFilter = null
    }
    const L = preedit.length
    if (L === 0) {
      this.preeditDisplay = ''
      this.candidates = this.buildSuggestions()
      this.page = 0
      return
    }

    // 1. 从右往左做 DP：best[i] = 吃满 preedit[i..L) 的最优组合
    const best: Array<Best | null> = new Array(L + 1).fill(null)
    best[L] = { score: 0, text: '' }
    for (let i = L - 1; i >= 0; i--) {
      let top: Best | null = null
      for (let len = 1; len <= MAX_KEY_LEN && i + len <= L; len++) {
        const rest = best[i + len]
        if (!rest) continue
        const bucket = this.lookup(preedit.substr(i, len))
        if (!bucket) continue
        for (const c of bucket) {
          const score = this.score(c) + rest.score
          if (!top || score > top.score) {
            top = {
              score,
              text: c.w + rest.text,
              py: c.p ? c.p + (rest.py ?? '') : rest.py,
            }
          }
        }
      }
      best[i] = top
    }

    // 整句候选优先用 bigram 解码；没有语言模型数据时自动退回一元 DP
    const sentence = this.lmSentence(preedit) ?? best[0]

    // 九宫格：把数字串还原成最可能路径的拼音（长度必然一致，一个字母一个数字）
    let display = ''
    const bestPy = sentence?.py
    if (this.opts.mode === 't9' && bestPy && bestPy.length === L)
      display = bestPy

    const out: Candidate[] = []
    const seen = new Set<string>()

    // 2. 整句候选（能完整解析）
    let sentenceCandidate: Candidate | null = null
    if (sentence && sentence.text.length > 0) {
      sentenceCandidate = {
        w: sentence.text,
        f: 0,
        len: L,
        type: 'sentence',
        score: sentence.score,
      }
      seen.add(sentence.text)
    }

    // 3. 首个词/字的候选：选完只消耗一段，剩下的继续组词
    for (let len = 1; len <= Math.min(MAX_KEY_LEN, L); len++) {
      const bucket = this.lookup(preedit.substr(0, len))
      if (!bucket) continue
      const rest = len === L ? { score: 0 } : best[len]
      const restScore = rest ? rest.score : INVALID_REST
      for (const c of bucket) {
        if (seen.has(c.w)) continue
        seen.add(c.w)
        out.push({
          w: c.w,
          f: c.f,
          len,
          py: c.p,
          type: c.w.length === 1 ? 'char' : 'word',
          score:
            this.score(c) +
            restScore +
            (this.syllableFilter && c.p?.startsWith(this.syllableFilter)
              ? SYLLABLE_BONUS
              : 0),
        })
      }
    }

    // 4. 简拼（zg -> 中国），只在整串都是声母串时补充
    if (
      this.opts.mode === 'pinyin' &&
      this.opts.enableInitials &&
      /^[a-z]+$/.test(preedit) &&
      L >= 2
    ) {
      const bucket = getInitialsBucket(preedit)
      if (bucket) {
        for (const c of bucket) {
          if (seen.has(c.w)) continue
          seen.add(c.w)
          out.push({
            w: c.w,
            f: c.f,
            len: L,
            type: 'initial',
            score: this.score(c) - 2,
          })
        }
      }
    }

    // 5. 姓名候选（wangwei -> 王伟），通用词表里没有这类词
    if (this.opts.enableNames && this.opts.mode === 'pinyin') {
      for (const n of buildNameCandidates(preedit)) {
        if (seen.has(n.w)) continue
        seen.add(n.w)
        out.push({
          w: n.w,
          f: n.freq,
          len: n.len,
          type: 'name',
          score:
            Math.log(n.freq + 1) -
            this.logTotal -
            NAME_PENALTY +
            this.userBonus(n.w),
        })
      }
    }

    // 6. 前缀联想：刚开始只按了一两键、还没有完整解析时兜底
    //    56 -> 龙/隆/拢（long），同时把拼音显示成 lo
    if (
      this.opts.mode === 't9' &&
      (this.syllableFilter || (!sentenceCandidate && L <= PREDICT_MAX_LEN))
    ) {
      // 手选了音节就按那个音节取词（能拿到 扣/抠/寇 这些），否则按已输入的数字前缀
      const lookupDigits = this.syllableFilter
        ? toDigits(this.syllableFilter)
        : preedit
      const prefix = getT9PrefixBucket(lookupDigits)
      if (prefix) {
        for (const c of prefix) {
          if (seen.has(c.w)) continue
          seen.add(c.w)
          out.push({
            w: c.w,
            f: c.f,
            len: L,
            py: c.p,
            type: 'predict',
            score:
              this.score(c) -
              PREDICT_PENALTY +
              (this.syllableFilter && c.p?.startsWith(this.syllableFilter)
                ? SYLLABLE_BONUS
                : 0),
          })
        }
        // 九宫格靠前缀联想时，把最优候选的拼音截到已按键数显示
        // （56 -> ko，568 -> kou）。手机输入法也是这样给反馈的。
        if (!display && prefix[0]?.p) {
          display = this.syllableFilter || prefix[0].p.slice(0, L)
        }
      }
    }
    this.preeditDisplay = display || preedit

    // 手选了音节：只留这个音节的词（全被过滤掉时保留原样）
    if (this.syllableFilter) {
      const matched = out.filter((c) => c.py?.startsWith(this.syllableFilter!))
      if (matched.length) out.length = 0, out.push(...matched)
    }

    out.sort((a, b) => b.score - a.score)
    // 整句候选永远第一个：它代表「一次上屏全部输入」，
    // 不能跟「只消耗首段的词」比分数，否则生僻字（热、埃）会窜到前面。
    this.candidates = sentenceCandidate ? [sentenceCandidate, ...out] : out
    const maxPage = Math.max(0, this.pageCount - 1)
    if (this.page > maxPage) this.page = maxPage
  }
}

export default PinyinEngine
