/** 模糊音：把输入串切成音节，再按等价音生成变体 key */
import { SYLLABLES } from './dict/meta'
import type { FuzzyGroup } from './types'

const SYLLABLE_SET = new Set(SYLLABLES)
const MAX_SYLLABLE_LEN = 6

/** 默认模糊音分组，第一项为标准形 */
export const DEFAULT_FUZZY_GROUPS: FuzzyGroup[] = [
  { variants: ['zh', 'z'] },
  { variants: ['ch', 'c'] },
  { variants: ['sh', 's'] },
  { variants: ['ing', 'in'] },
  { variants: ['ang', 'an'] },
  { variants: ['eng', 'en'] },
  { variants: ['n', 'l'] },
  { variants: ['f', 'h'] },
]

/**
 * 按音节表做最长匹配切分。切不开的尾巴原样保留（用户可能还没输完）。
 */
export function splitSyllables(letters: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < letters.length) {
    let matched = ''
    for (
      let len = Math.min(MAX_SYLLABLE_LEN, letters.length - i);
      len >= 1;
      len--
    ) {
      const piece = letters.substr(i, len)
      if (SYLLABLE_SET.has(piece)) {
        matched = piece
        break
      }
    }
    if (matched) {
      out.push(matched)
      i += matched.length
    } else {
      out.push(letters[i])
      i += 1
    }
  }
  return out
}

/** 这串字母能否正好切成若干完整音节（如 kong / kou / zhongguo） */
export function isCompleteSyllables(letters: string): boolean {
  if (!letters) return false
  const parts = splitSyllables(letters)
  if (parts.join('') !== letters) return false
  return parts.every((p) => SYLLABLE_SET.has(p))
}

/** 单个音节的等价形态（含自身） */
function syllableAlternatives(syl: string, groups: FuzzyGroup[]): string[] {
  const set = new Set<string>([syl])
  for (const g of groups) {
    if (g.variants.length < 2) continue
    const [std, ...rest] = g.variants
    for (const alt of rest) {
      if (syl.startsWith(std) && alt) {
        set.add(alt + syl.slice(std.length))
      }
      if (syl.startsWith(alt) && std) {
        set.add(std + syl.slice(alt.length))
      }
      if (std.length > 1 && syl.endsWith(std)) {
        set.add(syl.slice(0, -std.length) + alt)
      }
      if (alt.length > 1 && syl.endsWith(alt)) {
        set.add(syl.slice(0, -alt.length) + std)
      }
    }
  }
  return [...set]
}

/**
 * 生成模糊音变体 key（不含自身）。
 * 用笛卡尔积组合各音节变体，超过上限即截断，避免组合爆炸。
 */
export function fuzzyVariants(
  letters: string,
  groups: FuzzyGroup[] = DEFAULT_FUZZY_GROUPS,
  limit = 16
): string[] {
  if (!letters) return []
  const syls = splitSyllables(letters)
  const alts = syls.map((s) => syllableAlternatives(s, groups))
  if (alts.every((a) => a.length === 1)) return []

  let acc = ['']
  for (const a of alts) {
    const next: string[] = []
    for (const prefix of acc) {
      for (const v of a) next.push(prefix + v)
    }
    acc = next.length > limit * 4 ? next.slice(0, limit * 4) : next
  }
  return acc.filter((v) => v !== letters).slice(0, limit)
}
