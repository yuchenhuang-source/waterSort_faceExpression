#!/usr/bin/env node
/**
 * CV 接入静态检查脚本。在 terminal 运行 npm run cv:check 查看接入是否完整。
 * 检查 main 配置、getCvAdapter、adapter 字段、root 方法。
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

const checks = [];
let passed = 0;

function ok(msg) {
  checks.push({ ok: true, msg });
  passed++;
}
function fail(msg, hint) {
  checks.push({ ok: false, msg, hint });
}

// 1. main 配置
const mainPaths = [
  join(SRC, 'game/main.ts'),
  join(SRC, 'main.ts'),
  join(ROOT, 'src/main.ts'),
];
let mainContent = '';
for (const p of mainPaths) {
  if (existsSync(p)) {
    mainContent = readFileSync(p, 'utf-8');
    break;
  }
}
if (mainContent) {
  if (mainContent.includes('preserveDrawingBuffer') && (mainContent.includes('true') || mainContent.includes('true,'))) {
    ok('main: preserveDrawingBuffer: true');
  } else {
    fail('main: preserveDrawingBuffer: true 缺失', 'CV 截帧需此配置，否则黑屏');
  }
  if (mainContent.includes('CvAutoInitPlugin')) {
    ok('main: CvAutoInitPlugin 已注册');
  } else {
    fail('main: CvAutoInitPlugin 未注册', '需在 plugins.scene 中加入 CvAutoInitPlugin');
  }
} else {
  fail('main 配置文件未找到', `检查 ${mainPaths.join(' 或 ')}`);
}

// 2. getCvAdapter
function grepDir(dir, pattern, ext = '.ts') {
  const results = [];
  function walk(d) {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const fp = join(d, f.name);
      if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'node_modules') {
        walk(fp);
      } else if (f.isFile() && f.name.endsWith(ext)) {
        const c = readFileSync(fp, 'utf-8');
        if (pattern.test(c)) results.push({ path: fp, content: c });
      }
    }
  }
  walk(dir);
  return results;
}
// 找实现 getCvAdapter 的 scene（含 return { getRootRenderable 的）
const adapterFiles = grepDir(SRC, /getCvAdapter\s*\(/);
const sceneAdapterFile = adapterFiles.find((f) => f.content.includes('getRootRenderable') && f.content.includes('getStaticTintables'));
const adapterContent = sceneAdapterFile?.content ?? adapterFiles[0]?.content ?? '';
if (adapterFiles.length > 0 && adapterContent.includes('getRootRenderable')) {
  ok('getCvAdapter 已实现');
  if (adapterContent.includes('getRootRenderable')) ok('adapter: getRootRenderable');
  else fail('adapter: getRootRenderable 缺失');
  if (adapterContent.includes('getStaticTintables')) ok('adapter: getStaticTintables');
  else fail('adapter: getStaticTintables 缺失');
  if (adapterContent.includes('getStaticCvIds') || adapterContent.includes('getColorMapIds')) ok('adapter: getStaticCvIds 或 getColorMapIds');
  else fail('adapter: getStaticCvIds 或 getColorMapIds 缺失', '根有 getCvChildren 时需 getStaticCvIds');
} else if (adapterFiles.length > 0) {
  fail('getCvAdapter 已找到但 return 中缺少 getRootRenderable/getStaticTintables', '检查 getCvAdapter() 的返回值');
} else {
  fail('getCvAdapter 未找到', '主场景需实现 getCvAdapter() 返回 ICvSceneAdapter');
}

// 3. root (Board) 方法：在实现 getRootRenderable 的文件附近找 Board/根容器
const rootFiles = grepDir(SRC, /(getCvChildren|prepareCvRender|getColorCodeObjectIds)\s*\(/);
const allContent = rootFiles.map((f) => f.content).join('\n');
if (allContent.includes('getCvChildren')) ok('root: getCvChildren');
else fail('root: getCvChildren 缺失', '根容器需实现 ICvTraversable');
if (allContent.includes('prepareCvRender')) ok('root: prepareCvRender');
else fail('root: prepareCvRender 缺失', '根容器需实现 ICvRenderable');
if (allContent.includes('getColorCodeObjectIds')) ok('root: getColorCodeObjectIds');
else fail('root: getColorCodeObjectIds 缺失', '供 getActiveIds 使用');

// 输出：4 项核心检查
const groups = [
  { name: '1. main 配置', keys: ['main:'] },
  { name: '2. getCvAdapter + adapter 字段', keys: ['getCvAdapter', 'adapter:'] },
  { name: '3. root.getCvChildren / getColorMapIds', keys: ['root: getCvChildren', 'adapter: getStaticCvIds'] },
  { name: '4. root.prepareCvRender + getColorCodeObjectIds', keys: ['root: prepareCvRender', 'root: getColorCodeObjectIds'] },
];
let groupPassed = 0;
for (const g of groups) {
  const gChecks = checks.filter((c) => g.keys.some((k) => c.msg.startsWith(k)));
  const gOk = gChecks.length > 0 && gChecks.every((c) => c.ok);
  if (gOk) groupPassed++;
}
const total = checks.length;
const okCount = checks.filter((c) => c.ok).length;
console.log('\n=== CV 接入检查 ===\n');
checks.forEach((c) => {
  const icon = c.ok ? '✓' : '✗';
  const color = c.ok ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`  ${color}${icon}${reset} ${c.msg}`);
  if (!c.ok && c.hint) console.log(`      → ${c.hint}`);
});
console.log(`\n  ${groupPassed}/4 核心项通过  (${okCount}/${total} 细项)`);
if (groupPassed < 4) {
  console.log('\n  访问 ?cv=1 时，浏览器 console 会输出更详细的运行时检查。\n');
  process.exit(1);
}
console.log('\n');
