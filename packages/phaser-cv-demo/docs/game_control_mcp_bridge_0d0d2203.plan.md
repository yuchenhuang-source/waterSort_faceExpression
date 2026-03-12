---
name: Game Control MCP Bridge
overview: 实现方案二：自定义 MCP 工具 + WebSocket 桥，让 Agent 通过结构化触摸动作向运行中的 Phaser 游戏发送输入指令。仅考虑手机触屏操作，不考虑桌面鼠标。
todos:
  - id: game-ws
    content: "游戏端 WebSocket + 触摸动作解析与模拟 (Game.ts)"
    status: pending
  - id: debug-checkpoint-1
    content: "停下来，告诉用户开启 Cursor Debug Mode 测试 progress"
    status: pending
  - id: bridge
    content: "桥接服务 game-control-bridge.mjs"
    status: pending
  - id: debug-checkpoint-2
    content: "停下来，告诉用户开启 Cursor Debug Mode 测试 progress"
    status: pending
  - id: mcp-server
    content: "MCP Server mcp-game-control/ + game_input 工具"
    status: pending
  - id: docs-scripts
    content: "启动脚本 dev:control + 文档 GameControlMCP.md"
    status: pending
isProject: false
---

# 方案二：Game Control MCP + WebSocket 桥 实现计划

**目标设备**：仅手机触屏，不考虑桌面鼠标/光标。

---

## 1. 结构化触摸动作（Touch Actions）

**协议约定**：交流中**只发送 sequence**，使用**极短数组格式**，不发送冗长对象。

所有坐标使用**归一化** `x`, `y` ∈ [0, 1]，相对于视口。游戏内换算：`pixelX = x * viewportWidth`。

### 1.1 消息格式（顶层）

```json
{ "steps": [ Step, Step, ... ] }
```

### 1.2 步骤格式（极短数组）


| 步骤            | 数组格式                       | 说明                |
| ------------- | -------------------------- | ----------------- |
| **touchDown** | `["d", x, y]`              | 按下                |
| **touchUp**   | `["u", x, y]`              | 松开                |
| **touchMove** | `["m", x, y, durationMs?]` | 移动。第 4 项可选，表示移动耗时 |
| **delay**     | `["w", ms]`                | 等待                |


**约束**：禁止 `d` 后直接 `u`，中间必须包含 `w`。`w` 可极小（如 1ms）。

点击：`[["d", x, y], ["w", ms], ["u", x, y]]`。长按：`["w", 300]` 等更大值。拖拽：`[["d", x, y], ["m", x, y, durationMs?], ["w", ms], ["u", x, y]]`。

### 1.3 示例

```json
{ "steps": [["d", 0.5, 0.5], ["w", 1], ["u", 0.5, 0.5]] }
{ "steps": [["d", 0.5, 0.5], ["w", 300], ["u", 0.5, 0.5]] }
{ "steps": [["d", 0.2, 0.5], ["m", 0.8, 0.5, 200], ["w", 1], ["u", 0.8, 0.5]] }
```

---

## 2. 架构概览

```mermaid
flowchart LR
    subgraph Agent [Agent/Cursor]
        MCPTool[game_input]
    end
    
    subgraph MCP [MCP Server]
        MCPServer[game-control MCP]
    end
    
    subgraph Bridge [Bridge Server]
        HTTP[/command POST]
        WS[WebSocket 9876]
    end
    
    subgraph Game [Browser Game]
        Phaser[Phaser Game]
    end
    
    MCPTool -->|"call tool"| MCPServer
    MCPServer -->|"HTTP POST"| HTTP
    HTTP -->|"forward"| WS
    WS -->|"JSON action"| Phaser
    Phaser -->|"模拟 touch 事件"| Phaser
```



---

## 3. 游戏端：WebSocket 客户端 + 触摸模拟

**文件**：[packages/phaser-cv-demo/src/game/scenes/Game.ts](packages/phaser-cv-demo/src/game/scenes/Game.ts)

**改动**：

- 读取 URL 参数 `control=1`，仅在启用时连接 `ws://localhost:9876`
- `onmessage` 解析 JSON：仅处理 `{ steps: [...] }`，顺序执行。每步为 `["d"|"u"|"m"|"w", ...]`。校验：`d` 后必须有 `w` 才能 `u`，否则拒绝
- **触摸模拟**：将归一化坐标转为世界坐标，通过 Phaser InputPlugin 模拟 pointer 事件（pointerdown/pointermove/pointerup）
- 用 `this.time.delayedCall` 串起 steps
- 在 `shutdown` 时关闭 WebSocket

**坐标换算**：`worldX = x * this.scale.width`，`worldY = y * this.scale.height`

**关键**：Phaser 的 pointer 抽象统一了 touch 和 mouse，模拟 pointer 事件即可覆盖触屏。

---

## 4. 桥接服务：Node.js WebSocket + HTTP

**新建文件**：`packages/phaser-cv-demo/scripts/game-control-bridge.mjs`

- WebSocket：`ws://localhost:9876`，维护游戏连接
- HTTP：`POST /command`，接收 JSON body（`{ steps: [...] }`），转发给 WebSocket
- 无连接时返回 503

**依赖**：`ws`（devDependencies）

---

## 5. 自定义 MCP Server

**新建目录**：`packages/phaser-cv-demo/mcp-game-control/`

**工具**：`game_input`

- 参数：`sequence` (object, required) — `{ steps: [["d"|"u"|"m"|"w", ...], ...] }`
- 实现：`fetch('http://localhost:9876/command', { method: 'POST', body: JSON.stringify(sequence) })`
- 返回：成功/失败

**示例调用**：

```json
game_input({ "steps": [["d", 0.5, 0.5], ["w", 1], ["u", 0.5, 0.5]] })
game_input({ "steps": [["d", 0.2, 0.5], ["m", 0.8, 0.5, 200], ["w", 1], ["u", 0.8, 0.5]] })
```

---

## 6. 启动脚本与文档

**package.json**：新增 `"dev:control": "node scripts/game-control-bridge.mjs"`

**文档**：`docs/GameControlMCP.md` — 架构、启动顺序、动作 Schema、MCP 配置

---

## 7. 实现顺序（逐步 Todo）

| # | 任务 | 产出 | 状态 |
|---|------|------|------|
| 1 | 游戏端：读取 `control=1` 参数，连接 `ws://localhost:9876` | Game.ts | |
| 2 | 游戏端：解析 `{ steps: [...] }`，校验 d→w→u 约束 | Game.ts | |
| 3 | 游戏端：归一化坐标转世界坐标，模拟 pointerdown/pointermove/pointerup | Game.ts | |
| 4 | 游戏端：用 `delayedCall` 串起 steps，shutdown 时关闭 WebSocket | Game.ts | |
| 5 | **停下来，告诉用户开启 Cursor Debug Mode 测试 progress** | — | |
| 6 | 桥接服务：WebSocket 9876 + HTTP POST /command，转发 JSON 给游戏 | game-control-bridge.mjs | |
| 7 | 桥接服务：无连接时返回 503 | game-control-bridge.mjs | |
| 8 | **停下来，告诉用户开启 Cursor Debug Mode 测试 progress** | — | |
| 9 | MCP Server：新建 mcp-game-control/，工具 game_input(sequence) | mcp-game-control/ | |
| 10 | MCP Server：fetch POST /command 到桥接 | mcp-game-control/ | |
| 11 | 启动脚本：`dev:control`，文档 GameControlMCP.md | package.json、docs | |


---

## 8. 使用流程

**需要 CV 时**（`?cv=1`）：`npm run dev:control:cv:all`（游戏 + 桥接 + CV 服务）

**仅 Control 时**：`npm run dev:control:all`（游戏 + 桥接）

**或分步**：
1. 启动桥接：`npm run dev:control`
2. 启动游戏：`npm run dev` 或 `npm run dev:cv`（cv=1 需 dev:cv）
3. 打开游戏：`http://localhost:8080?control=1`（或 `?cv=1&control=1&level=1&simW=390&simH=844&simScale=0.5&enableSimulator=1` 带模拟器）
4. **cv=1 或 control=1 时**：先显示选关，用户点击关卡后再进入游戏
5. Agent 调用：`game_input({ steps: [["d", 0.5, 0.5], ["w", 1], ["u", 0.5, 0.5]] })`

---

## 9. 端口


| 组件             | 端口   |
| -------------- | ---- |
| Control Bridge | 9876 |


