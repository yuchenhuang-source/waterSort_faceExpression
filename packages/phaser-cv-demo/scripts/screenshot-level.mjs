#!/usr/bin/env node
/**
 * 使用 Puppeteer 自动截图游戏画面
 *
 * 用法：
 *   node scripts/screenshot-level.mjs [options]
 *
 * 选项：
 *   --url <url>      游戏地址，默认 http://localhost:8080
 *   --out <path>     输出文件路径（单关模式），默认 screenshot.png
 *   --wait <ms>      等待渲染时间(ms)，默认 2000
 *   --mode <1|3>     1=单关截图到文件，3=截取3关输出JSON到stdout（供API调用）
 *
 * 示例：
 *   node scripts/screenshot-level.mjs
 *   node scripts/screenshot-level.mjs --url "http://localhost:8080?level=2" --out level2.png
 *   node scripts/screenshot-level.mjs --mode 3
 *
 * 注意：需先启动开发服务器 (npm run dev)
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return defaultValue;
}

const baseUrl = getArg('--url', 'http://localhost:8080').replace(/\/$/, '');
const outPath = getArg('--out', path.join(process.cwd(), 'screenshot.png'));
const waitMs = parseInt(getArg('--wait', '2000'), 10) || 2000;
const mode = getArg('--mode', '1');

const LEVEL_TO_DIFFICULTY = { 1: 1, 2: 5, 3: 9 };

function getChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function captureOne(page, level, waitMs) {
  const difficulty = LEVEL_TO_DIFFICULTY[level];
  const url = `${baseUrl}?level=${level}&simulator=1&screenshot=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const canvasSelector = '#game-container canvas';
  await page.waitForSelector(canvasSelector, { timeout: 45000 });
  await new Promise((r) => setTimeout(r, waitMs));

  const clip = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, canvasSelector);

  const dataUrl = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.width === 0 || el.height === 0) return null;
    return el.toDataURL('image/png');
  }, canvasSelector);

  return { difficulty, dataUrl };
}

async function main() {
  const executablePath = getChromePath();
  const launchOpts = { headless: 'new' };
  if (executablePath) launchOpts.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });

    if (mode === '3') {
      const results = {};
      for (const level of [1, 2, 3]) {
        const { difficulty, dataUrl } = await captureOne(page, level, waitMs);
        if (dataUrl) results[difficulty] = dataUrl;
      }
      process.stdout.write(JSON.stringify(results));
    } else {
      const { dataUrl } = await captureOne(page, 1, waitMs);
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1];
        if (base64) fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
      } else {
        const clip = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }, '#game-container canvas');
        if (clip) {
          await page.screenshot({ path: outPath, clip });
        } else {
          await page.screenshot({ path: outPath });
        }
      }
      console.log('[screenshot] Saved to', path.resolve(outPath));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[screenshot]', e.message);
  process.exit(1);
});
