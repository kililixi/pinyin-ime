import { PinyinEngine, STATS, preloadT9 } from '../dist/index.js'

const CASES = [
  ['zhongguo', '中国'], ['zhongguoren', '中国人'], ['renminguangchang', '人民广场'],
  ['woaini', '我爱你'], ['nihao', '你好'], ['beijing', '北京'], ['kaifang', '开放'],
  ['xian', '西安'], ['shenfenzheng', '身份证'], ['hukou', '户口'], ['dengji', '登记'],
  ['gongzuo', '工作'], ['xiexie', '谢谢'], ['duibuqi', '对不起'], ['anquan', '安全'],
  ['qingchu', '清楚'], ['tianjing', '天津'], ['zanshi', '暂时'], ['hunan', '湖南'],
  ['zg', '中国'], ['bj', '北京'], ['nihaoma', '你好吗'],
]

const engine = new PinyinEngine()
let hit = 0
for (const [input, expect] of CASES) {
  engine.reset()
  for (const ch of input) engine.press({ t: 'char', v: ch })
  const top = engine.all()[0]?.w ?? ''
  if (top === expect) hit++
  else console.log(`✘ ${input} 期望 ${expect} 实际 ${top}`)
}
console.log(`无 LM：${hit}/${CASES.length}`)

// 带语言模型
try {
  const lm = await import('../dist/lm.js')
  engine.setLmProvider({ score: lm.lmLogProb, continuations: lm.lmContinuations })
  let hit2 = 0
  for (const [input, expect] of CASES) {
    engine.reset()
    for (const ch of input) engine.press({ t: 'char', v: ch })
    const top = engine.all()[0]?.w ?? ''
    if (top === expect) hit2++
  }
  const extra = [['duoshaoqian', '多少钱'], ['beijingshi', '北京市'], ['womendajia', '我们大家']]
  for (const [input, expect] of extra) {
    engine.reset()
    for (const ch of input) engine.press({ t: 'char', v: ch })
    const top = engine.all()[0]?.w ?? ''
    if (top === expect) hit2++
    else console.log(`✘(LM) ${input} 期望 ${expect} 实际 ${top}`)
  }
  console.log(`带 LM：${hit2}/${CASES.length + extra.length}`)
  engine.setContext('谢谢')
  console.log('联想(谢谢):', engine.list().map((c) => c.w).slice(0, 5).join(' / '))
} catch (e) {
  console.log('LM 加载失败:', e.message)
}

// 9 键
const t9 = new PinyinEngine({ mode: 't9' })
preloadT9()
for (const [digits, note] of [['94664486', 'zhongguo'], ['64426', 'nihao'], ['94664', 'zhong']]) {
  t9.reset()
  for (const d of digits) t9.press({ t: 'char', v: d })
  console.log(`T9 ${digits} (${note}) -> ${t9.displayPreedit} | ${t9.all().slice(0, 4).map((c) => c.w).join('/')}`)
}
console.log('词库:', JSON.stringify(STATS))
