/** 拼音输入法核心类型定义 */

/** 词库中的候选（原始数据） */
export interface LexCandidate {
  /** 汉字词 */
  w: string
  /** 词频 */
  f: number
  /** 来源拼音（仅九宫格索引带，用于把数字串还原成拼音显示） */
  p?: string
}

/** 供 UI 渲染的候选 */
export interface Candidate extends LexCandidate {
  /** 该候选占用的输入字母数（选中后从 preedit 中消耗的长度） */
  len: number
  /** 候选类型：整句 / 词 / 单字 / 简拼 / 姓名 / 前缀联想 */
  type: 'sentence' | 'word' | 'char' | 'initial' | 'name' | 'predict'
  /** 内部排序分，调试用 */
  score: number
}

export type InputMode = 'pinyin' | 't9'

export interface EngineOptions {
  /**
   * 输入模型：
   * pinyin —— 全拼（字母）
   * t9     —— 九宫格（数字串，2=abc 3=def 4=ghi 5=jkl 6=mno 7=pqrs 8=tuv 9=wxyz）
   */
  mode?: InputMode
  /** 每页候选数，默认 12 */
  pageSize?: number
  /** 是否开启模糊音，默认 true */
  fuzzy?: boolean
  /** 模糊音分组，默认见 fuzzy.ts */
  fuzzyGroups?: FuzzyGroup[]
  /** 用户词频权重，默认 8 */
  userWeight?: number
  /** 单字惩罚（负分），防止把词拆成单字，默认 -1.6 */
  singlePenalty?: number
  /** 多字词奖励，默认 0 */
  wordBonus?: number
  /** 是否启用简拼，默认 true */
  enableInitials?: boolean
  /** 是否生成姓名候选，默认 true */
  enableNames?: boolean
  /** 是否用二元语言模型给整句打分，默认 true（没有语料数据时自动降级） */
  useLm?: boolean
  /** 语言模型权重，默认 0.8 */
  lmWeight?: number
  /** 用户词频查询：返回该词被选过的次数 */
  userFreq?: (word: string) => number
}

export interface FuzzyGroup {
  /** 等价音（第一个为标准形） */
  variants: string[]
}

export type KeyInput =
  | { t: 'char'; v: string }
  | { t: 'select'; i: number }
  | { t: 'space' }
  | { t: 'back' }
  | { t: 'pgup' }
  | { t: 'pgdn' }
  | { t: 'esc' }

export type PressResult =
  /** 未消费，宿主自行处理（如英文输入） */
  | { type: 'unhandled' }
  /** 只改变了 preedit / 候选 */
  | { type: 'composing' }
  /** 上屏了一段文本 */
  | { type: 'commit'; text: string }
  /** 取消组词 */
  | { type: 'cancel' }
