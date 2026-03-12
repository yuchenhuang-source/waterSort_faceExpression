# 7 Board组件实现

## 7.1 属性
```typescript
scene: Phaser.Scene;                                      // 持有的场景引用
root: Phaser.GameObjects.Container;                        // Board根容器（统一缩放/位移）

// === 背景与棋盘 ===
bgImage: Phaser.GameObjects.Image;                         // 游戏底图/背景
boardImage: Phaser.GameObjects.Image | null = null;        // 棋盘底板（若有）
boardRect: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle(); // 棋盘可交互区域（整体判定）

// === 格子与箭头 ===
gridRows: number = 6;                                      // 行数（可配）
gridCols: number = 6;                                      // 列数（可配）
cellSize: number = 120;                                    // 单元格尺寸（px，可配）
cellGap: number = 16;                                      // 单元间距（px，可配）
cellRects: Phaser.Geom.Rectangle[][] = [];                  // 每个格子的点击/命中矩形
cellCenters: Phaser.Math.Vector2[][] = [];                  // 每个格子的中心点坐标（用于连线/动效）

arrowSprites: Phaser.GameObjects.Image[][] = [];            // 每格箭头贴图对象
arrowDirData: number[][] = [];                              // 关卡数据：每格箭头方向（0/1/2/3 = 上右下左）
arrowState: ('Normal' | 'Selected' | 'Clearing' | 'Empty')[][] = []; // 每格状态

// === 连线与高亮 ===
pathLine: Phaser.GameObjects.Graphics;                      // 实时路径线（拖拽期间绘制）
pathPoints: Phaser.Math.Vector2[] = [];                     // 路径点（按顺序存中心点）
pathCells: { r: number; c: number }[] = [];                 // 路径格子序列（按顺序）
selectedSet: Set<string> = new Set();                       // 选中过的格子集合（防重复）
currentStart: { r: number; c: number } | null = null;       // 当前起点格
minClearLen: number = 3;                                    // 最小消除长度（可配）

// === 动画与输入控制 ===
isDragging: boolean = false;                                // 是否处于连线拖拽中
isAnimating: boolean = false;                               // 是否在播放消除/结算动画（防止多点）
dragPointerId: number | null = null;                        // 当前拖拽指针ID（防多指干扰）

// === 计数与引导 ===
hintTimer: number = 0;                                      // 引导计时器（5s无操作）
idleHintSeconds: number = 5;                                // 无操作触发引导阈值（可配）
clearCount: number = 0;                                     // 成功消除次数（跳转/结束用）
clearedArrowTotal: number = 0;                              // 累计消除箭头数（跳转/结束用）

// === 跳转/弹窗阈值（由外部配置注入也可）===
popupAtClearCount: number = 15;                             // 达到N次消除弹窗（可配）
jumpAtClearCount: number = 20;                              // 达到N次消除直接跳转（可配）可配）
```

## 7.2 箭头处理
- 创建
  * initializeBoard(rows: number, cols: number, levelData: number[][])：初始化棋盘数据（方向/空位）与可视对象
  * createBoardView()：创建棋盘底板、计算棋盘Rect、初始化绘制层
  * createCell(r: number, c: number)：创建单元格判定区域与中心点缓存
  * createArrow(r: number, c: number, dir: number)：创建箭头贴图并设置朝向（旋转角度）
  * rebuildCellArrow(r: number, c: number)：当该格数据变化（被清除/重置）时刷新显示
  * resetBoardVisual()：快速清空所有选中态、路径线、临时特效
- 箭头选中与路径扩展
  * startPath(r: number, c: number)：起手选择某格作为路径起点（高亮+初始化序列）
  * canExtendTo(r: number, c: number): boolean：检查是否可扩展到该格（相邻/不重复/规则）
  * extendPath(r: number, c: number)：加入路径（记录格子+点位+高亮+更新线条）
  * isAdjacent(a: {r:number,c:number}, b:{r:number,c:number}): boolean：相邻判定（仅上下左右）
  * isRepeated(r: number, c: number): boolean：重复选中判定
  * isDirectionValid(prev: {r:number,c:number}, next: {r:number,c:number}): boolean：方向/类型规则判定（按Arrow2规则）
  * highlightCell(r: number, c: number, on: boolean)：格子高亮（描边/发光/缩放）
- 路径线绘制（实时）
  * updatePathLine()：根据 pathPoints 重新绘制连线
  * clearPathLine()：清空路径线图形
  * addPathPoint(point: Phaser.Math.Vector2)：增加路径点并刷新绘制
- 结算（松手消除）
  * endPathAndResolve()：松手入口，决定成功/失败
  * canClearCurrentPath(): boolean：是否满足最小长度与规则
  * clearArrows(path: {r:number,c:number}[])：执行消除流程（数据更新 + 动画队列）
  * animateClearSequence(path: {r:number,c:number}[])：连锁消除动画（按顺序、短间隔）
  * applyClearResult(path: {r:number,c:number}[])：动画结束后落地到数据（置空/刷新显示）
  * playClearFX(r: number, c: number, dir: number)：单格消除特效（碎片/闪光）
  * playBoardShake()：消除结束棋盘轻震动（增强爽感）
- 无效结算（错误/不足）
  * cancelPath()：取消当前路径（清理线条+取消高亮）playInvalidFeedback()：无效反馈（路径闪一下→淡出、最后一格轻抖动）
- 完成检测与跳转检查
  * checkWinCondition(): boolean：检查是否满足胜利条件（达到目标消除次数/清除量）
  * checkJumpCondition(): {popup?: boolean, jump?: boolean}：检查是否达到弹窗/强跳阈值
  * lockInteraction()：结算/弹窗期间锁定输入
  * unlockInteraction()：结算完成恢复输入

## 7.3 用户交互
- 点击/拖拽判定
  * onPointerDown(pointer: Phaser.Input.Pointer)：统一按下入口（起手选中）
  * onPointerMove(pointer: Phaser.Input.Pointer)：拖拽过程中扩展路径（命中格子变化才处理）
  * onPointerUp(pointer: Phaser.Input.Pointer)：松手结算入口
  * getCellByPoint(x: number, y: number): {r:number,c:number} | null：根据坐标命中棋盘格
  * isInBoardArea(x: number, y: number): boolean：是否在棋盘可交互区域内
  * isClickValidArea(x: number, y: number): boolean：非棋盘区域点击判定（无效不反馈或极轻反馈）
- 交互流程
  * 无路径时：按下某箭头格 → startPath（高亮起点+显示路径头）
  * 拖拽过程中：
手指移动到相邻格 → 若 canExtendTo 为 true：extendPath
若不合法：不加入路径（可选播放轻微提示，不中断拖拽）
  * 松手结算：
    1. 若 canClearCurrentPath = true：连锁消除 → 更新计数 → 检查胜利/跳转
    2. 若 canClearCurrentPath = false：无效反馈 → 清空路径 → 保持棋盘不变
- 引导事件
  * getHintPath(): {cells: {r:number,c:number}[]} | null：提供一段可执行的最短提示路径（至少2格，优先可形成3格以上）
  * showHint(cells: {r:number,c:number}[])：展示引导（手指缩放循环 + 半透明路径预览）
  * resetHintTimer()：任意按下或成功消除后重置 5s 计时
  * hideHint()：任意一次成功消除后渐隐消失
- 事件派发（与事件系统对接）
  * emitActionEvent(type: 'Start' | 'Extend' | 'Clear' | 'Invalid' | 'Popup' | 'Jump' | 'Win', payload?: any)
  * 触发时机：起手选中、路径扩展、成功消除、无效松手、弹窗出现、强跳、胜利等

## 7.4 自适应处理
- 监听resize事件
- 重新计算裁剪区域
- 更新差异点位置和判定区域
- 保持图片比例不变
- 保持10px透明区域