/**
 * 姓名候选：通用词表里几乎没有「王伟 / 张敏」这类人名，
 * 但通用词表里几乎没有姓名，所以用「姓 + 常用名字用字」现拼。
 */
import { GIVEN_NAMES, SURNAMES } from './dict/names'
import { splitSyllables } from './fuzzy'

export interface NameCandidate {
  /** 拼出来的姓名 */
  w: string
  /** 占用的输入字母数 */
  len: number
  /** 伪词频，用于和普通词一起排序 */
  freq: number
}

/** 姓名基准词频：比常见词低、比生僻词高，保证「王伟」排在「王位」前但不压过「中国」 */
const NAME_BASE_FREQ = 9000
/** 三字名相对二字名的折损 */
const THREE_CHAR_FACTOR = 0.6

const givenByPinyin = new Map<string, Array<{ c: string; i: number }>>()
for (let i = 0; i < GIVEN_NAMES.length; i++) {
  const g = GIVEN_NAMES[i]
  const arr = givenByPinyin.get(g.p) || []
  arr.push({ c: g.c, i })
  givenByPinyin.set(g.p, arr)
}

const SURNAME_LIST = SURNAMES.map((s, i) => ({ c: s.c, p: s.p, i }))

function cartesian<T>(groups: T[][]): T[][] {
  let acc: T[][] = [[]]
  for (const g of groups) {
    const next: T[][] = []
    for (const prefix of acc) {
      for (const item of g) next.push([...prefix, item])
    }
    acc = next
  }
  return acc
}

/**
 * 根据输入拼音生成姓名候选。
 * @param preedit 当前拼音串
 * @param perSyllable 每个音节取多少个名字用字
 * @param maxGiven 名字最多几个字
 */
export function buildNameCandidates(
  preedit: string,
  perSyllable = 4,
  maxGiven = 2
): NameCandidate[] {
  const out: NameCandidate[] = []
  if (preedit.length < 3) return out

  for (const surname of SURNAME_LIST) {
    if (preedit.length <= surname.p.length) continue
    if (!preedit.startsWith(surname.p)) continue

    const rest = preedit.slice(surname.p.length)
    const syllables = splitSyllables(rest)
    if (syllables.join('') !== rest) continue
    if (syllables.length > maxGiven) continue

    const groups = syllables.map((s) =>
      (givenByPinyin.get(s) || []).slice(0, perSyllable)
    )
    if (groups.some((g) => g.length === 0)) continue

    const surnameWeight = 1 / (1 + surname.i * 0.06)
    for (const combo of cartesian(groups)) {
      const givenWeight = Math.pow(
        combo.reduce((acc, g) => acc / (1 + g.i * 0.05), 1),
        1 / combo.length
      )
      const freq =
        NAME_BASE_FREQ *
        surnameWeight *
        givenWeight *
        (combo.length === 1 ? 1 : THREE_CHAR_FACTOR)
      out.push({
        w: surname.c + combo.map((g) => g.c).join(''),
        len: preedit.length,
        freq,
      })
    }
  }

  out.sort((a, b) => b.freq - a.freq)
  return out.slice(0, 10)
}
