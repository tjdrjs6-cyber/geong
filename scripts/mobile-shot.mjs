// Phone-size screenshots of the local Preview for layout checks.
// Usage: node scripts/mobile-shot.mjs <out-prefix> [username password] [screen]
import { chromium } from 'playwright'

const [prefix = '/tmp/mobile', username, password, screen = 'title'] = process.argv.slice(2)
const base = 'http://127.0.0.1:3000/'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const [name, viewport] of (process.env.ONLY_IPHONE ? [['iphone', { width: 390, height: 664 }]] : [['iphone', { width: 390, height: 664 }], ['small', { width: 360, height: 600 }]])) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  page.on('pageerror', error => console.log('[pageerror]', error.message))
  if (username) await page.request.post(base + 'api/auth/login', { data: { username, password } })
  await page.goto(base)
  await page.waitForFunction(() => document.querySelector('[data-screen="title"].is-active, [data-screen="auth"].is-active'), null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)
  if (screen === 'users') { await page.click('[data-action="users"]'); await page.waitForTimeout(1500); await page.click('[data-action="user-view"]').catch(() => {}); await page.waitForTimeout(800) }
  if (screen.startsWith('choose:')) { await page.evaluate(id => { document.querySelector('[data-action="collection"]').click(); setTimeout(() => document.querySelector(`[data-action="choose"][data-id="${id}"]`)?.click(), 300) }, screen.slice(7)); await page.waitForTimeout(6000) }
  if (screen === 'collection') { await page.click('[data-action="collection"]'); await page.waitForTimeout(1200) }
  if (screen === 'spin') { await page.click('[data-action="pull"][data-count="3"]'); await page.waitForTimeout(1150); await page.screenshot({ path: `${prefix}-${name}-mid.png` }); await page.waitForTimeout(1400) }
  if (screen === 'weed') { await page.click('[data-action="weed"]').catch(() => console.log('no weed button')); await page.waitForTimeout(1500) }
  if (screen === 'roulette') { await page.click('[data-action="roulette"]'); await page.waitForTimeout(800); await page.screenshot({ path: `${prefix}-${name}-open.png` }); await page.click('.roulette-spin'); await page.waitForTimeout(1600); await page.screenshot({ path: `${prefix}-${name}-mid.png` }); await page.waitForTimeout(3500) }
  if (screen === 'battle') { await page.click('[data-action="battle"]').catch(() => console.log('no battle button')); await page.waitForTimeout(2600) }
  if (screen === 'decomode') { await page.click('[data-action="mode"][data-mode="deco"]'); await page.waitForTimeout(600) }
  if (screen === 'decospin') { await page.click('[data-action="mode"][data-mode="deco"]'); await page.waitForTimeout(400); await page.click('[data-action="deco-pull"][data-count="3"]'); for (const t of [1500,1200,1200]) { await page.waitForTimeout(t); await page.screenshot({ path: `${prefix}-${name}-${t}-${Date.now()%1000}.png` }) } }
  if (screen === 'decocol') { await page.click('[data-action="decos"]'); await page.waitForTimeout(900) }
  if (screen === 'house') { await page.click('.gacha-nav [data-action="house"]').catch(() => console.log('no house button')); await page.waitForTimeout(1800) }
  if (screen === 'housesel') { await page.click('.gacha-nav [data-action="house"]'); await page.waitForTimeout(1500); await page.click('.house-piece').catch(() => console.log('no piece')); await page.waitForTimeout(500) }
  await page.screenshot({ path: `${prefix}-${name}.png` })
  console.log('saved', `${prefix}-${name}.png`)
  await context.close()
}
await browser.close()
