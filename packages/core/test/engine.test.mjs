import test from 'node:test'
import assert from 'node:assert/strict'
import { PinyinEngine, UserFreqStore, preloadT9, STATS } from '../dist/index.js'

const type = (engine, text) => {
  engine.reset()
  for (const ch of text) engine.press({ t: 'char', v: ch })
}
const top = (engine, text) => {
  type(engine, text)
  return engine.all()[0]?.w
}

test('词库规模', () => {
  assert.ok(STATS.words > 100000, `词条数 ${STATS.words}`)
  assert.ok(STATS.keys > 80000, `拼音键 ${STATS.keys}`)
})

test('词组候选', () => {
  const e = new PinyinEngine()
  assert.equal(top(e, 'zhongguo'), '中国')
  assert.equal(top(e, 'zhongguoren'), '中国人')
  assert.equal(top(e, 'renminguangchang'), '人民广场')
  assert.equal(top(e, 'shenfenzheng'), '身份证')
  assert.equal(top(e, 'woaini'), '我爱你')
})

test('模糊音', () => {
  const e = new PinyinEngine()
  assert.equal(top(e, 'tianjing'), '天津')   // in / ing
  assert.equal(top(e, 'zanshi'), '暂时')     // zh / z
  assert.equal(top(e, 'hunan'), '湖南')      // n / l
  const off = new PinyinEngine({ fuzzy: false })
  assert.notEqual(top(off, 'tianjing'), '天津')
})

test('简拼', () => {
  const e = new PinyinEngine()
  assert.equal(top(e, 'zg'), '中国')
  assert.equal(top(e, 'bj'), '北京')
})

test('姓名候选', () => {
  const e = new PinyinEngine({ enableNames: true })
  type(e, 'wangwei')
  const words = e.all().map((c) => c.w)
  assert.ok(words.includes('王伟'), `候选里应有姓名：${words.slice(0, 8)}`)
})

test('preedit 与上屏分离', () => {
  const e = new PinyinEngine()
  type(e, 'zhongguo')
  assert.equal(e.preedit, 'zhongguo')
  const r = e.press({ t: 'space' })
  assert.deepEqual(r, { type: 'commit', text: '中国' })
  assert.equal(e.preedit, '')
})

test('选词后剩余拼音继续组词', () => {
  const e = new PinyinEngine()
  type(e, 'zhongguo')
  const first = e.all()[1] // 中
  assert.equal(first.w, '中')
  const r = e.press({ t: 'select', i: 1 })
  assert.equal(r.type, 'commit')
  assert.equal(e.preedit, 'guo')
  assert.ok(e.all().length > 0, '剩余拼音应还有候选')
})

test('退格只删拼音，删完返回 unhandled', () => {
  const e = new PinyinEngine()
  type(e, 'ni')
  assert.equal(e.press({ t: 'back' }).type, 'composing')
  assert.equal(e.preedit, 'n')
  assert.equal(e.press({ t: 'back' }).type, 'composing')
  assert.equal(e.preedit, '')
  // 拼音删完后再退格，交给宿主删正文
  assert.equal(e.press({ t: 'back' }).type, 'unhandled')
})

test('分页', () => {
  const e = new PinyinEngine({ pageSize: 5 })
  type(e, 'shi')
  assert.ok(e.pageCount > 1, `页数 ${e.pageCount}`)
  const firstPage = e.list().map((c) => c.w)
  e.press({ t: 'pgdn' })
  assert.equal(e.page, 1)
  const secondPage = e.list().map((c) => c.w)
  assert.notDeepEqual(firstPage, secondPage)
  e.press({ t: 'pgup' })
  assert.equal(e.page, 0)
})

test('用户词频提升候选顺序', () => {
  const store = new UserFreqStore('test-nofs')
  const e = new PinyinEngine({ userFreq: store.get })
  type(e, 'shi')
  const before = e.all().map((c) => c.w)
  const target = before[before.length - 1]
  for (let i = 0; i < 20; i++) {
    store.hit(target)
    e.notifyCommitted(target) // 宿主上屏后要通知引擎刷新词频缓存
  }
  e.reset()
  const after = top(e, 'shi')
  assert.equal(after, target, `选过 20 次的「${target}」应排到第一`)
})

test('九宫格', () => {
  preloadT9()
  const e = new PinyinEngine({ mode: 't9' })
  type(e, '94664486')
  assert.equal(e.displayPreedit, 'zhongguo')
  assert.equal(e.all()[0].w, '中国')

  type(e, '64426')
  assert.equal(e.displayPreedit, 'nihao')
  assert.equal(e.all()[0].w, '你好')
})

test('九宫格前缀联想', () => {
  preloadT9()
  const e = new PinyinEngine({ mode: 't9' })
  type(e, '56')
  assert.equal(e.displayPreedit, 'ko', '56 应显示字母而不是数字')
  assert.ok(e.all().length > 0, '两个数字也要出候选')
})

test('九宫格音节候选与筛选', () => {
  preloadT9()
  const e = new PinyinEngine({ mode: 't9' })
  type(e, '56')
  const options = e.syllableOptions()
  assert.ok(options.length > 1, `56 应有多个音节：${options}`)
  assert.ok(options.includes('kong') || options.includes('kou'), `应含 kong/kou：${options}`)

  // 选音节后只剩该音节的词
  e.setSyllableFilter('kong')
  const kongWords = e.all().map((c) => c.w)
  assert.ok(kongWords.length > 0)
  assert.ok(
    kongWords.every((w) => ["控制", "恐怕", "空", "空间", "空气", "恐惧", "空中", "恐怖", "空军"].includes(w)),
    `kong 过滤后混入了别的词：${kongWords}`
  )
  assert.equal(e.displayPreedit, 'kong')
  assert.equal(e.activeSyllable, 'kong')

  // 再点一次取消
  e.setSyllableFilter(null)
  assert.equal(e.activeSyllable, null)
  assert.ok(e.all().some((c) => c.w === '龙'), '取消过滤后应恢复全部候选')

  // 输入变化后过滤自动失效
  e.setSyllableFilter('kong')
  e.press({ t: 'char', v: '8' })
  assert.equal(e.activeSyllable, null, '继续按键后音节过滤应失效')
})

test('拼音模式只接受字母，九宫格只接受数字', () => {
  const p = new PinyinEngine()
  assert.equal(p.press({ t: 'char', v: '5' }).type, 'unhandled')
  const t = new PinyinEngine({ mode: 't9' })
  assert.equal(t.press({ t: 'char', v: 'z' }).type, 'unhandled')
})

test('语言模型修正整句', async () => {
  const lm = await import('../dist/lm.js')
  if (!lm.hasLm()) return
  const e = new PinyinEngine()
  e.setLmProvider({ score: lm.lmLogProb, continuations: lm.lmContinuations })
  assert.equal(top(e, 'duoshaoqian'), '多少钱')
  assert.equal(top(e, 'beijingshi'), '北京市')
  assert.equal(top(e, 'nihaoma'), '你好吗')
})

test('联想：bigram + 前缀补全', async () => {
  const lm = await import('../dist/lm.js')
  const e = new PinyinEngine()
  if (lm.hasLm()) e.setLmProvider({ score: lm.lmLogProb, continuations: lm.lmContinuations })
  e.reset()
  e.setContext('谢谢')
  const words = e.list().map((c) => c.w)
  assert.ok(words.includes('你'), `谢谢后面应能联想「你」：${words}`)

  e.setContext('北京')
  const addr = e.list().map((c) => c.w)
  assert.ok(addr.some((w) => w.startsWith('北京')), `应能补全北京相关词：${addr}`)
})
