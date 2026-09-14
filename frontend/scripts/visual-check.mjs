import { chromium } from 'playwright-core'
import path from 'node:path'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const outputDir = process.argv[2]
const baseUrl = process.env.VISUAL_CHECK_URL ?? 'http://127.0.0.1:3000'
if (!outputDir) throw new Error('Usage: node scripts/visual-check.mjs <output-dir>')

const browser = await chromium.launch({ executablePath: edge, headless: true })
const errors = []

async function audit(page, label) {
  const metrics = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('body *')].filter((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    })
    const tinyText = visible.filter((element) => element.children.length === 0 && element.textContent?.trim() && Number.parseFloat(getComputedStyle(element).fontSize) < 12)
    return {
      viewport: [innerWidth, innerHeight],
      documentWidth: document.documentElement.scrollWidth,
      tinyText: tinyText.slice(0, 10).map((element) => ({ text: element.textContent?.trim(), size: getComputedStyle(element).fontSize })),
    }
  })
  console.log(JSON.stringify({ label, ...metrics }))
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
mobile.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
await mobile.screenshot({ path: path.join(outputDir, 'xian-home-mobile.png'), fullPage: true })
await audit(mobile, 'mobile-home')

await mobile.getByRole('button', { name: '开启对决' }).click()
await mobile.getByRole('heading', { name: '对战配置' }).waitFor()
await mobile.screenshot({ path: path.join(outputDir, 'xian-setup-mobile.png'), fullPage: true })
await audit(mobile, 'mobile-setup')
await mobile.getByRole('button', { name: '开始对战' }).click()
await mobile.locator('.event-stage').waitFor()
await mobile.screenshot({ path: path.join(outputDir, 'xian-event-mobile.png'), fullPage: true })
await audit(mobile, 'mobile-event')
await mobile.getByRole('button', { name: '全部跳过' }).click()
await mobile.getByRole('button', { name: '观星术' }).click()
await mobile.getByRole('dialog').waitFor()
await mobile.screenshot({ path: path.join(outputDir, 'xian-card-detail-mobile.png'), fullPage: true })
await audit(mobile, 'mobile-card-detail')
await mobile.getByRole('button', { name: '我知道了' }).click()
await mobile.getByRole('button', { name: '使用卡牌' }).click()
await mobile.locator('.event-stage').waitFor()
await mobile.screenshot({ path: path.join(outputDir, 'xian-card-played-mobile.png'), fullPage: true })
await audit(mobile, 'mobile-card-played')
await mobile.getByRole('button', { name: '全部跳过' }).click()
await mobile.getByRole('heading', { name: /观星术·牌顶定序/ }).waitFor()
await mobile.waitForTimeout(700)
await mobile.screenshot({ path: path.join(outputDir, 'xian-stargazing-mobile.png'), fullPage: true })
await audit(mobile, 'mobile-stargazing')

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
desktop.on('console', (message) => { if (message.type() === 'error') errors.push(`desktop console: ${message.text()}`) })
desktop.on('pageerror', (error) => errors.push(`desktop pageerror: ${error.message}`))
await desktop.goto(baseUrl, { waitUntil: 'networkidle' })
await desktop.screenshot({ path: path.join(outputDir, 'xian-home-desktop.png'), fullPage: true })
await audit(desktop, 'desktop-home')

await browser.close()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
