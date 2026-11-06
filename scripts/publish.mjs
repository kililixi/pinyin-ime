/**
 * 依次发布四个包（core → handwriting → model → vue）。
 *
 * 账号如果开了「发布时强制 2FA」，需要带一次性验证码：
 *   NPM_OTP=123456 npm run publish:all
 *
 * 或者用带 2FA bypass 的 granular access token（适合 CI）：
 *   //registry.npmjs.org/:_authToken=npm_xxx
 *
 * 只想预演不真发：
 *   npm run publish:all -- --dry-run
 */
import { spawnSync } from 'node:child_process'

const PACKAGES = [
  '@startsi/pinyin-core',
  '@startsi/vue-handwriting',
  '@startsi/handwriting-model',
  '@startsi/vue-pinyin-ime',
]

const otp = process.env.NPM_OTP
const extra = process.argv.slice(2).filter((a) => a.startsWith('--'))

if (!otp && !extra.includes('--dry-run')) {
  console.log('提示：账号开启发布 2FA 时需要 NPM_OTP=六位验证码，否则会 403。')
}

/** 已经发过这个版本就跳过，避免 2FA 超时后重跑时卡在第一个包 */
function alreadyPublished(name) {
  if (extra.includes('--dry-run')) return false
  const r = spawnSync('npm', ['view', name, 'version'], { encoding: 'utf8' })
  if (r.status !== 0) return false
  const latest = (r.stdout || '').trim()
  return latest && latest === versionOf(name)
}

function versionOf(name) {
  const r = spawnSync(
    'npm',
    ['pkg', 'get', 'version', '-w', name],
    { encoding: 'utf8' }
  )
  return (r.stdout || '').trim()
}

for (const name of PACKAGES) {
  if (alreadyPublished(name)) {
    console.log(`\n↷ ${name}@${versionOf(name)} 已发布，跳过`)
    continue
  }
  const args = ['publish', '-w', name, '--access', 'public', ...extra]
  if (otp) args.push(`--otp=${otp}`)
  console.log(`\n▶ ${name}  ${args.slice(1).join(' ')}`)
  const r = spawnSync('npm', args, { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n✘ ${name} 发布失败，已停止（后面的包不会再发）`)
    process.exit(r.status ?? 1)
  }
}
console.log('\n✔ 四个包都发布完成')
