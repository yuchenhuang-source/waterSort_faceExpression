# 配置变量与 Dev 热更新

本文档说明项目中「配置变量 + dev 热更新」的机制，以及新项目接入时需要遵守的约定。

---

## 1. 整体流程

```
[ConstantsEditor 组件] 修改数值 → POST /api/constants → 写入 JSON
                                              ↓
[constants-editor-server] 写入 game-constants-config.json
                                              ↓
[configLoader] 下次 fetch 时从 /api/constants 拿到新配置
                                              ↓
[constants-saved 事件] → DeviceSimulator 重载 iframe → 游戏用新配置渲染
```

---

## 2. 必须遵守的配置

### 2.1 Vite `config.dev.mjs`

```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',  // 必须和 constants-editor-server 端口一致
      changeOrigin: true,
    },
  },
  watch: {
    ignored: ['**/game-constants-config.json'],  // 必须忽略，否则会触发 HMR 整页刷新
  },
},
```

**要点：**

- `proxy['/api']` 必须指向 constants-editor-server 的端口
- `watch.ignored` 必须包含配置 JSON，避免 Vite 监听该文件导致整页刷新

---

### 2.2 constants-editor-server 端口

`scripts/constants-editor-server.mjs` 中：

```javascript
const EDITOR_PORT = 3001;  // 必须和 Vite proxy target 一致
```

多项目时，每个项目用不同端口，例如：

- phaser-cv-demo: 3001
- project-b: 3002

对应 Vite 的 `proxy.target` 也要改成各自端口。

---

### 2.3 配置 JSON 路径

`constants-editor-server.mjs` 中：

```javascript
const projectRoot = path.join(__dirname, '..');
const configPath = path.join(projectRoot, 'src', 'game', 'constants', 'game-constants-config.json');
```

`configPath` 必须指向当前项目实际使用的配置 JSON 路径。

---

### 2.4 配置加载逻辑（configLoader）

```javascript
// 优先从 /api/constants 获取（dev 模式），失败时回退到打包的 JSON（生产）
export async function fetchGameConstants() {
  try {
    const r = await fetch('/api/constants');
    if (r.ok) return await r.json();
  } catch { /* 网络错误 */ }
  return configJson;  // 生产环境用打包进来的 JSON
}
```

**要点：**

- dev 时通过 `/api/constants` 拿配置（由 Vite proxy 转发到 editor server）
- 生产时用打包进来的 JSON

---

### 2.5 保存后触发热更新

`ConstantsEditor` 保存成功后需要派发事件：

```javascript
// 保存成功后
window.dispatchEvent(new CustomEvent('constants-saved'));
```

`DeviceSimulator`（或包含 iframe 的父组件）需要监听并重载 iframe：

```javascript
useEffect(() => {
  const handler = () => reloadIframe();
  window.addEventListener('constants-saved', handler);
  return () => window.removeEventListener('constants-saved', handler);
}, [reloadIframe]);
```

---

## 3. 多项目时的端口约定

| 项目     | Vite 端口 | Editor Server 端口 | Vite proxy target      |
|----------|-----------|--------------------|-------------------------|
| phaser-cv-demo | 8080      | 3001               | `http://localhost:3001` |
| project-b| 8081      | 3002               | `http://localhost:3002` |

每个项目的 `constants-editor-server` 和 Vite 的 `proxy.target` 要一一对应。

---

## 4. 总结：必须满足的 5 点

1. **Vite proxy**：`/api` 转发到 constants-editor-server 的端口
2. **watch.ignored**：包含配置 JSON，避免 HMR 整页刷新
3. **configLoader**：dev 用 `/api/constants`，生产用打包 JSON
4. **constants-saved**：保存后派发事件，父组件监听并重载 iframe
5. **端口一致**：Vite proxy target 与 constants-editor-server 端口相同
