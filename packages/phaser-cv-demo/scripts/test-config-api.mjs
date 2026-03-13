#!/usr/bin/env node
/**
 * 逐步检测项目是否已正确接入 config API
 * 用法: npm run test:config_api
 * 在项目根目录运行，会按步骤检查并输出问题与修复建议
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();

const STEP = (n, msg) => `[步骤 ${n}] ${msg}`;
const OK = (msg) => `  ✓ ${msg}`;
const FAIL = (msg) => `  ✗ ${msg}`;
const FIX = (msg) => `  → 修复: ${msg}`;

let failed = false;
let port = null;

// --- 步骤 1: package.json 是否有 constantsApi ---
console.log('\n' + STEP(1, '检查 package.json 中的 constantsApi 配置'));
try {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log(FAIL('package.json 不存在'));
    console.log(FIX('确保在项目根目录运行此脚本'));
    failed = true;
  } else {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const api = pkg.constantsApi;
    if (!api || typeof api !== 'object') {
      console.log(FAIL('package.json 中缺少 constantsApi 配置'));
      console.log(FIX('在 package.json 中添加:'));
      console.log('  "constantsApi": {');
      console.log('    "configPath": "src/game/constants/game-constants-config.json",');
      console.log('    "apiPath": "/api/constants"');
      console.log('  }');
      failed = true;
    } else {
      if (!api.configPath) {
        console.log(FAIL('constantsApi.configPath 未配置'));
        console.log(FIX('添加 configPath，例如: "configPath": "src/game/constants/game-constants-config.json"'));
        failed = true;
      } else {
        console.log(OK(`constantsApi 已配置 (configPath: ${api.configPath})`));
      }
    }
  }
} catch (e) {
  console.log(FAIL('读取 package.json 失败: ' + e.message));
  failed = true;
}

// --- 步骤 2: 配置文件是否存在 ---
console.log('\n' + STEP(2, '检查配置文件是否存在'));
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const configPath = path.join(cwd, (pkg.constantsApi?.configPath || '').replace(/^\//, ''));
  if (!pkg.constantsApi?.configPath) {
    console.log(FAIL('跳过（步骤 1 未通过）'));
  } else if (!fs.existsSync(configPath)) {
    console.log(FAIL(`配置文件不存在: ${pkg.constantsApi.configPath}`));
    console.log(FIX(`创建该文件，或修改 constantsApi.configPath 为正确路径`));
    failed = true;
  } else {
    try {
      JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(OK(`配置文件存在且为有效 JSON: ${pkg.constantsApi.configPath}`));
    } catch (e) {
      console.log(FAIL(`配置文件不是有效 JSON: ${e.message}`));
      console.log(FIX('修正 JSON 格式'));
      failed = true;
    }
  }
} catch (e) {
  console.log(FAIL('跳过（步骤 1 未通过）'));
}

// --- 步骤 3: Vite 配置是否注册 constantsApiPlugin ---
console.log('\n' + STEP(3, '检查 Vite 配置是否注册 constantsApiPlugin'));
const viteConfigCandidates = [
  'vite/config.dev.mjs',
  'vite/config.dev.ts',
  'vite.config.mjs',
  'vite.config.ts',
  'vite.config.js',
];
let viteConfigPath = null;
let viteConfigContent = '';
for (const p of viteConfigCandidates) {
  const full = path.join(cwd, p);
  if (fs.existsSync(full)) {
    viteConfigContent = fs.readFileSync(full, 'utf8');
    // 优先使用 dev 配置（因为 config API 在 dev 时使用）
    if (p.includes('dev')) {
      viteConfigPath = p;
      break;
    }
    if (!viteConfigPath) viteConfigPath = p;
  }
}
if (!viteConfigPath) {
  console.log(FAIL('未找到 Vite 配置文件'));
  console.log(FIX('创建 vite.config.mjs 或 vite/config.dev.mjs'));
  failed = true;
} else {
  const hasImport = /constantsApiPlugin|constants-api-plugin/.test(viteConfigContent);
  const hasUse = /constantsApiPlugin\s*\(\s*\)/.test(viteConfigContent);
  if (!hasImport) {
    console.log(FAIL(`Vite 配置未导入 constantsApiPlugin (${viteConfigPath})`));
    console.log(FIX('添加: import { constantsApiPlugin } from "./constants-api-plugin.mjs";'));
    failed = true;
  } else if (!hasUse) {
    console.log(FAIL(`Vite 配置未在 plugins 中注册 constantsApiPlugin (${viteConfigPath})`));
    console.log(FIX('在 plugins 数组中添加: constantsApiPlugin(),'));
    failed = true;
  } else {
    console.log(OK(`Vite 配置已注册 constantsApiPlugin (${viteConfigPath})`));
    // 尝试解析端口
    const portMatch = viteConfigContent.match(/port:\s*(\d+)/);
    if (portMatch) port = parseInt(portMatch[1], 10);
  }
}

// --- 步骤 4: constants-api-plugin.mjs 是否存在 ---
console.log('\n' + STEP(4, '检查 constants-api-plugin.mjs 是否存在'));
const pluginPaths = [
  path.join(cwd, 'vite', 'constants-api-plugin.mjs'),
  path.join(cwd, 'constants-api-plugin.mjs'),
];
let pluginExists = false;
for (const p of pluginPaths) {
  if (fs.existsSync(p)) {
    pluginExists = true;
    const rel = path.relative(cwd, p);
    console.log(OK(`插件文件存在: ${rel}`));
    break;
  }
}
if (!pluginExists) {
  console.log(FAIL('vite/constants-api-plugin.mjs 不存在'));
  console.log(FIX('从 phaser-cv-demo 或 arrow-playable--main 复制 vite/constants-api-plugin.mjs 到本项目'));
  failed = true;
}

// --- 步骤 5: 尝试请求 /api/constants（需 dev 已启动）---
// 仅在前 4 步通过时执行，避免误报（其他项目占用端口）
console.log('\n' + STEP(5, '检查 /api/constants 是否可访问（需先 npm run dev）'));
const steps1to4Ok = !failed;
const tryPorts = port ? [port] : [8081, 8082, 5173, 8080];
let apiOk = false;
if (!steps1to4Ok) {
  console.log(FAIL('跳过（步骤 1-4 未全通过，无法确认本项目的 API 端口）'));
  failed = true;
} else {
for (const p of tryPorts) {
  try {
    const res = await fetch(`http://localhost:${p}/api/constants`);
    const text = await res.text();
    if (res.ok) {
      try {
        JSON.parse(text);
        console.log(OK(`GET http://localhost:${p}/api/constants 返回有效 JSON`));
        apiOk = true;
        break;
      } catch {
        console.log(FAIL(`端口 ${p} 有响应但非 JSON`));
      }
    }
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('fetch')) {
      // 静默跳过
    } else {
      console.log(FAIL(`请求 localhost:${p} 失败: ${e.message}`));
    }
  }
}
if (!apiOk) {
  console.log(FAIL('无法访问 /api/constants'));
  console.log(FIX('1. 先运行 npm run dev 启动开发服务器'));
  if (port) {
    console.log(FIX(`2. 确认本项目的 dev 端口为 ${port}`));
  } else {
    console.log(FIX('2. 在 Vite 配置的 server.port 中指定端口'));
  }
  console.log(FIX('3. 确认 constants-api-plugin 已正确配置 CORS'));
  failed = true;
}
}

// --- 总结 ---
console.log('\n' + '='.repeat(50));
if (failed) {
  console.log('结果: 未完全接入 config API，请按上述步骤修复。\n');
  process.exit(1);
} else {
  console.log('结果: 已成功接入 config API。\n');
  process.exit(0);
}
