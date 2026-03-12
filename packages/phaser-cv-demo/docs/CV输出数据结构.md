# CV 输出数据结构

基于 `packages/phaser-cv/cv-bridge/color_cv_processor.py` 和 `ui/app.js` 分析。

## 1. 完整 detections 结构

当游戏按 S 截帧并发送到 CV 服务后，返回的 `detections` 结构如下：

```json
{
  "status": "ok",
  "objects": [
    {
      "id": 0,
      "x": 540,
      "y": 960,
      "normX": 0.5,
      "normY": 0.5,
      "pixels": 1234,
      "bbox": { "x": 100, "y": 200, "w": 80, "h": 120 },
      "label": "tube1"
    }
  ],
  "detectedIds": [0, 1, 2, 100, 101, 102],
  "frameSize": {
    "width": 270,
    "height": 480,
    "coordScale": 4,
    "gameWidth": 1080,
    "gameHeight": 1920
  },
  "frameDiffs": [
    {
      "id": 100,
      "label": "id100",
      "dx": 5.2,
      "dy": -10.3,
      "dist": 11.5,
      "dArea": 50,
      "prevArea": 200
    }
  ],
  "idToLabel": {
    "0": "tube1",
    "1": "tube2",
    "14": "ball_14",
    "500": "hand",
    "501": "icon",
    "502": "download"
  },
  "processingMs": 12.5
}
```

## 2. 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| **objects** | `object[]` | 检测到的对象列表 |
| **objects[].id** | number | 对象 ID（试管 0~N-1，球 100+，手 500，按钮 501/502，液体 1000，表情 1001） |
| **objects[].x** | number | 中心 x 坐标（游戏分辨率空间，已乘 coordScale） |
| **objects[].y** | number | 中心 y 坐标 |
| **objects[].normX** | number | 归一化 x（0~1，= x / gameWidth） |
| **objects[].normY** | number | 归一化 y（0~1，= y / gameHeight） |
| **objects[].pixels** | number | 该 ID 颜色对应的像素数量 |
| **objects[].bbox** | object | 包围框 `{ x, y, w, h }` |
| **objects[].label** | string | 可读标签（如 tube1、ball_14，由 idToLabel 附加） |
| **detectedIds** | number[] | 检测到的 ID 列表（已排序） |
| **frameSize** | object | 帧尺寸与坐标缩放 |
| **frameSize.width** | number | 截帧宽度（下采样后，如 270） |
| **frameSize.height** | number | 截帧高度（如 480） |
| **frameSize.coordScale** | number | 坐标缩放系数（如 4，用于还原到 1080 空间） |
| **frameSize.gameWidth** | number | 游戏视口宽度（竖屏 1080，横屏 1920） |
| **frameSize.gameHeight** | number | 游戏视口高度（竖屏 1920，横屏 1080） |
| **frameDiffs** | object[] | 与上一帧相比的位置/面积变化 |
| **frameDiffs[].id** | number | 对象 ID |
| **frameDiffs[].dx, dy** | number | 位置变化 |
| **frameDiffs[].dist** | number | 移动距离 |
| **frameDiffs[].dArea** | number | 面积变化 |
| **frameDiffs[].prevArea** | number | 上一帧面积 |
| **frameDiffs[].label** | string | 可读标签（由 idToLabel 附加） |
| **idToLabel** | object | 游戏提供的 cvId→可读标签映射（如 tube1、ball_14、hand） |
| **processingMs** | number | 处理耗时（毫秒） |

## 3. CV 服务端控制台输出

运行 `npm run dev:cv` 后，按 S 截帧时，Python 服务会打印：

```
[CV-PIXELS] objects=104 ids=[0, 1, 2, ..., 13, 14, 15, ..., 101, 501, 502]
[CV] idToLabel count=107 sample={'0': 'tube1', '1': 'tube2', ...}
```

- `objects`：检测到的对象数量
- `ids`：检测到的 cvId 列表（试管 0..13、球 14..101、icon 501、download 502）
- `idToLabel`：游戏传入的标签映射（当 getCvIdToLabelMap 提供时）

## 4. ID 分配（ballsort 实际约定）

| 类型 | ID 范围 | 示例 |
|------|---------|------|
| 试管 | 0 ~ N-1 | 0..13（14 管） |
| 球 | N ~ | 14..101（从试管数起） |
| 手 | 500 | hand |
| 按钮 | 501, 502 | icon, download |
| 液体/表情 | 1000, 1001 | liquid, expression |

## 5. 归一化坐标换算（用于 game_input）

游戏视口通常为 1080×1920（竖屏）或 1920×1080（横屏）。CV 返回的 `x`, `y` 已在 `coordScale` 放大后的空间。

归一化公式（0~1）：

```
normX = obj.x / (frameSize.width * frameSize.coordScale)
normY = obj.y / (frameSize.height * frameSize.coordScale)
```

或使用 frameSize 中的 gameWidth/gameHeight：

```
normX = obj.x / frameSize.gameWidth
normY = obj.y / frameSize.gameHeight
```

## 6. 点击 MCP 实现计划（逐步 Todo）

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | frameSize 增加 gameWidth、gameHeight（竖屏 1080×1920，横屏 1920×1080） | `color_cv_processor.py` | |
| 2 | server 增加 latest_detections 变量，每帧更新 | `server.py` | |
| 3 | server 增加 _attach_labels()，为 objects/frameDiffs 附加 label | `server.py` | |
| 4 | server 增加 _add_normalized_coords()，为 objects 附加 normX、normY | `server.py` | |
| 5 | **停下来，告诉用户开启 Cursor Debug Mode 测试 progress** | — | |
| 6 | HTTP 增加 GET /api/latest-detections，CORS 启用 | `server.py` | |
| 7 | CVBridge.sendFrameAndWait 支持 idToLabel 参数 | `CVBridge.ts` | |
| 8 | CvIntegration 支持 getCvIdToLabelMap，传给 sendFrameAndWait | `CvIntegration.ts` | |
| 9 | **停下来，告诉用户开启 Cursor Debug Mode 测试 progress** | — | |
| 10 | Board.getCvIdToLabelMap()，Game.getCvAdapter 增加 getCvIdToLabelMap | `Board.ts`, `Game.ts` | |
| 11 | 文档更新（CV输出数据结构.md） | — | |


## 7. 点击 MCP 接口

点击 MCP 可通过 HTTP 轮询获取最新 detections（含 frameDiffs）：

```
GET http://localhost:5000/api/latest-detections
```

- **响应**：与 detections 结构相同（含 objects、frameSize、frameDiffs、idToLabel）
- **无数据时**：`{"status": "no_data"}`（需先按 S 截帧）
- **CORS**：`Access-Control-Allow-Origin: *`，支持跨域请求
- **轮询建议**：按需轮询（如 500ms 间隔），或按 S 后立即请求

## 8. 自动化测试所需字段

| 用途 | 必需字段 |
|------|----------|
| 决定点击位置 | `objects[].id`, `objects[].x`, `objects[].y`, `frameSize` |
| 验证操作成功 | `objects` 或 `frameDiffs` 前后对比 |
| 判断游戏状态 | `detectedIds`（哪些对象可见） |
| 点击 MCP 轮询 | `GET /api/latest-detections` |
