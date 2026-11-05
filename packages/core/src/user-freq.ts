/** 用户词频：记住「这台机器上这个字/词被选过几次」，让常用词往前排 */
const DEFAULT_KEY = 'pinyin:user-freq:v1'

interface Record_ {
  /** 被选次数 */
  c: number
  /** 最后一次使用时间 */
  t: number
}

function readStorage(storageKey: string): Record<string, Record_> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Record_>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export class UserFreqStore {
  private map = new Map<string, Record_>()
  private storageKey: string
  private limit: number
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(storageKey = DEFAULT_KEY, limit = 5000) {
    this.storageKey = storageKey
    this.limit = limit
    const saved = readStorage(storageKey)
    for (const [word, rec] of Object.entries(saved)) {
      if (typeof rec?.c === 'number')
        this.map.set(word, { c: rec.c, t: rec.t || 0 })
    }
  }

  /** 供引擎使用的查询函数 */
  get = (word: string): number => this.map.get(word)?.c ?? 0

  /** 用户选了某个候选 */
  hit(word: string): void {
    const rec = this.map.get(word) || { c: 0, t: 0 }
    rec.c += 1
    rec.t = Date.now()
    this.map.set(word, rec)
    this.scheduleSave()
  }

  clear(): void {
    this.map.clear()
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      /* 存储不可用时忽略 */
    }
  }

  get size(): number {
    return this.map.size
  }

  private scheduleSave(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.save()
    }, 800)
  }

  private save(): void {
    if (this.map.size > this.limit) {
      const sorted = [...this.map.entries()].sort((a, b) => b[1].t - a[1].t)
      this.map = new Map(sorted.slice(0, this.limit))
    }
    try {
      const obj: Record<string, Record_> = {}
      for (const [word, rec] of this.map) obj[word] = rec
      localStorage.setItem(this.storageKey, JSON.stringify(obj))
    } catch {
      /* 存储不可用（隐私模式/超限）时静默降级 */
    }
  }
}

export default UserFreqStore
