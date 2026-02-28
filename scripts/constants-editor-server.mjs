import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const configPath = path.join(projectRoot, 'src', 'game', 'constants', 'game-constants-config.json');
const gameConstantsPath = path.join(projectRoot, 'src', 'game', 'constants', 'GameConstants.ts');
const distPath = path.join(projectRoot, 'dist', 'index.html');

const app = express();
app.use(express.json({ limit: '1mb' }));

const DEV_PORT = 8080;
const EDITOR_PORT = 3001;

// 静态页面
app.get('/', (req, res) => {
  res.send(getEditorHtml());
});

// 获取当前配置
app.get('/api/constants', (req, res) => {
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    console.error('Read config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 保存配置并触发 dev 重载
app.post('/api/constants', (req, res) => {
  try {
    const config = req.body;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    // touch GameConstants.ts 强制 Vite 检测变更并热更新（JSON 单独变更可能不触发）
    const now = Date.now() / 1000;
    fs.utimesSync(gameConstantsPath, now, now);
    console.log('Config saved. GameConstants.ts touched for HMR.');
    res.json({ ok: true });
  } catch (err) {
    console.error('Save config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 执行 build 并返回文件下载
app.post('/api/build', async (req, res) => {
  try {
    await runBuild();
    if (fs.existsSync(distPath)) {
      res.download(distPath, 'index.html');
    } else {
      res.status(500).json({ error: 'Build failed: dist/index.html not found' });
    }
  } catch (err) {
    console.error('Build error:', err);
    res.status(500).json({ error: err.message });
  }
});

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function getEditorHtml() {
  const devUrl = `http://localhost:${DEV_PORT}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GameConstants 编辑器</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #00d9ff; }
    .links { margin-bottom: 20px; }
    .links a { color: #00d9ff; margin-right: 16px; }
    .section { background: #16213e; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .section h2 { margin-top: 0; color: #e94560; font-size: 1rem; }
    .row { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
    .row label { min-width: 220px; font-size: 13px; }
    .row input { padding: 6px 10px; border-radius: 4px; border: 1px solid #0f3460; background: #0f3460; color: #eee; width: 100px; }
    .row input:focus { outline: 1px solid #00d9ff; }
    .btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .btn-save { background: #00d9ff; color: #1a1a2e; }
    .btn-save:hover { background: #00b8d9; }
    .btn-build { background: #e94560; color: #fff; margin-left: 12px; }
    .btn-build:hover { background: #ff6b6b; }
    .btn-build:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { margin-top: 12px; padding: 8px; border-radius: 4px; font-size: 13px; }
    .status.ok { background: #0f3460; color: #00d9ff; }
    .status.err { background: #3d1a1a; color: #ff6b6b; }
  </style>
</head>
<body>
  <h1>GameConstants 编辑器</h1>
  <div class="links">
    <a href="${devUrl}" target="_blank">打开游戏 (dev)</a>
    <span style="color:#666">|</span>
    <span>修改下方数值会自动保存并热更新</span>
  </div>

  <div style="margin-bottom: 20px;">
    <button class="btn btn-build" id="btnBuild" onclick="doBuild()">npm run build 并下载</button>
  </div>
  <div id="form"></div>
  <div id="status"></div>

  <script>
    let data = {};
    const DEV_URL = '${devUrl}';

    const CATEGORIES = {
      '液体球': ['LIQUID_BALL_DISPLAY_WIDTH_RATIO', 'LIQUID_BALL_SIZE_SCALE', 'LIQUID_UP_FRAME_RATE', 'WATER_RISE_DURATION'],
      '表情球': ['BALL_EXPRESSION_OFFSET_X', 'BALL_EXPRESSION_OFFSET_Y', 'BALL_EXPRESSION_SCALE_RATIO', 'BALL_EXPRESSION_FRAME_RATE'],
      '水花': ['SPLASH_TUBE_WIDTH_RATIO', 'SPLASH_VERTICAL_OFFSET_RATIO', 'SPLASH_FRAME_RATE'],
      '小球动画': ['BALL_RISE_DURATION', 'BALL_DROP_DURATION', 'BALL_MOVE_RISE_ALREADY_HOVER', 'BALL_MOVE_RISE_NORMAL', 'BALL_MOVE_ARC_TIME', 'BALL_MOVE_START_DELAY'],
      'UI布局': ['UI_CONFIG']
    };

    async function load() {
      const r = await fetch('/api/constants');
      data = await r.json();
      render();
    }

    function renderField(k, v, p) {
      const type = typeof v;
      const val = type === 'number' ? v : (type === 'boolean' ? (v ? 'true' : 'false') : String(v));
      return '<div class="row"><label>' + k + '</label><input type="' + (type === 'number' ? 'number' : 'text') + '" step="any" data-path="' + p + '" value="' + val + '" onkeydown="onKeyDown(this,event)" oninput="onChange(this)" onchange="onChange(this)"></div>';
    }

    function renderNested(obj, path = '') {
      const out = [];
      for (const k in obj) {
        const v = obj[k];
        const p = path ? path + '.' + k : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          out.push('<div class="section"><h2>' + k + '</h2>' + renderNested(v, p) + '</div>');
        } else {
          out.push(renderField(k, v, p));
        }
      }
      return out.join('');
    }

    function render() {
      const out = [];
      const used = new Set();
      for (const cat in CATEGORIES) {
        const keys = CATEGORIES[cat].filter(function(k) { return data[k] !== undefined; });
        if (keys.length === 0) continue;
        keys.forEach(function(k) { used.add(k); });
        const rows = keys.map(function(k) {
          const v = data[k];
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) return renderNested(v, k);
          return renderField(k, v, k);
        }).join('');
        out.push('<div class="section"><h2>' + cat + '</h2>' + rows + '</div>');
      }
      const otherKeys = [];
      for (const k in data) {
        if (used.has(k)) continue;
        const v = data[k];
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          out.push('<div class="section"><h2>' + k + '</h2>' + renderNested(v, k) + '</div>');
          used.add(k);
        } else {
          otherKeys.push(k);
        }
      }
      if (otherKeys.length > 0) {
        const rows = otherKeys.map(function(k) { return renderField(k, data[k], k); }).join('');
        out.push('<div class="section"><h2>其他</h2>' + rows + '</div>');
      }
      document.getElementById('form').innerHTML = out.join('');
    }

    function getByPath(obj, path) {
      const parts = path.split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur[parts[i]];
      }
      return [cur, parts[parts.length - 1]];
    }

    function setByPath(obj, path, val) {
      const [parent, key] = getByPath(obj, path);
      const num = parseFloat(val);
      parent[key] = isNaN(num) ? val : num;
    }

    const CURSOR_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape'];
    let keyDownSaveTimer = null;
    function onKeyDown(el, e) {
      if (CURSOR_KEYS.includes(e.key)) return;
      clearTimeout(keyDownSaveTimer);
      keyDownSaveTimer = setTimeout(function() {
        keyDownSaveTimer = null;
        setByPath(data, el.dataset.path, el.value);
        save();
      }, 0);
    }
    function onChange(el) {
      if (keyDownSaveTimer) return;
      setByPath(data, el.dataset.path, el.value);
      save();
    }

    async function save() {
      const s = document.getElementById('status');
      try {
        const r = await fetch('/api/constants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        s.className = 'status ok';
        s.textContent = '已自动保存，游戏页热更新中…';
      } catch (e) {
        s.className = 'status err';
        s.textContent = '保存失败: ' + e.message;
      }
    }

    async function doBuild() {
      const btn = document.getElementById('btnBuild');
      const s = document.getElementById('status');
      btn.disabled = true;
      s.className = 'status ok';
      s.textContent = '正在 build...';
      try {
        const r = await fetch('/api/build', { method: 'POST' });
        if (!r.ok) {
          const j = await r.json();
          throw new Error(j.error || r.statusText);
        }
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'index.html';
        a.click();
        URL.revokeObjectURL(a.href);
        s.textContent = 'Build 完成，已开始下载 index.html';
      } catch (e) {
        s.className = 'status err';
        s.textContent = 'Build 失败: ' + e.message;
      }
      btn.disabled = false;
    }

    load();
  </script>
</body>
</html>`;
}

function startServer(port = EDITOR_PORT) {
  const server = app.listen(port, () => {
    console.log('');
    console.log('  [tools] 修改页面(数值编辑): http://localhost:' + port);
    console.log('  [tools] 游戏 dev 页面:     http://localhost:' + DEV_PORT);
    console.log('');
  });
  server.on('error', (err) => {
    server.close();
    if (err.code === 'EADDRINUSE' && port < 3010) {
      console.log('[tools] 端口 ' + port + ' 占用，尝试 ' + (port + 1) + '...');
      startServer(port + 1);
    } else {
      console.error('[tools] 启动失败:', err.message);
      process.exit(1);
    }
  });
}
startServer();
