/**
 * @startsi/pinyin-core —— 中文拼音输入法内核
 *
 * 主入口不带语言模型数据（bigram 约 1.4MB），
 * 需要整句/联想的宿主自己动态引入：
 *   const lm = await import('@startsi/pinyin-core/lm')
 *   engine.setLmProvider({ score: lm.lmLogProb, continuations: lm.lmContinuations })
 */
export { PinyinEngine } from './engine'
export type { LmProvider } from './engine'
export { UserFreqStore } from './user-freq'
export { preloadLexicon, preloadT9, getFollowWords } from './lexicon'
export {
  DEFAULT_FUZZY_GROUPS,
  fuzzyVariants,
  isCompleteSyllables,
  splitSyllables,
} from './fuzzy'
export { DICT_VERSION, STATS } from './dict/meta'
export type {
  Candidate,
  EngineOptions,
  FuzzyGroup,
  InputMode,
  KeyInput,
  LexCandidate,
  PressResult,
} from './types'
