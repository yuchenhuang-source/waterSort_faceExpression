# CvColorCode API 接入指南

本文档说明如何在新 Phaser 项目中接入 CvColorCode API，实现 CV 颜色编码截帧。

---

## 1. 前置依赖

### 1.1 安装共享包

CV 相关逻辑已整合到 `@ballsort-multi/phaser-cv` 包，新项目只需安装依赖：

```bash
npm install @ballsort-multi/phaser-cv
# 或使用 file: 引用本地包
# "dependencies": { "@ballsort-multi/phaser-cv": "file:../phaser-cv" }
```

### 1.2 模块说明

| 模块 | 说明 |
|------|------|
| `ObjectIdPipeline` | 颜色映射：generateColorMap、extractValidPixels、ColorMap 类型 |
| `CvColorCode` | 核心 API：CvTintable、applyCvTintables、ICvTintableProvider、ICvRenderable |
| `CVBridge` | WebSocket 连接 CV 服务 |
| `CvIntegration` | 一键接入：S/R 键、截帧发送、状态文案 |

### 1.3 依赖关系

```
ObjectIdPipeline  ← 独立，无 Phaser 依赖
CvColorCode       ← 依赖 Phaser.GameObjects.GameObject
CVBridge          ← 依赖 ObjectIdPipeline (ColorMap)
CvIntegration     ← 依赖 CVBridge、ObjectIdPipeline
```

---

## 2. API 概览

### 2.1 CvTintable（纹理对象）

```typescript
interface CvTintable {
    obj: Phaser.GameObjects.GameObject;  // Image / Sprite
    id: number;                           // 唯一 ID
    restore?: () => void;                 // 可选，默认 clearTint
}
```

- 适用于有纹理的对象（Image、Sprite）
- `applyCvTintables` 会对 `obj.visible === true` 的对象调用 `setTintFill`
- 若需恢复为游戏颜色（非 clearTint），提供自定义 `restore`

### 2.2 ICvTintableProvider（叶子对象）

```typescript
interface ICvTintableProvider {
    getCvTintables(): CvTintable[];
}
```

- 叶子对象实现，如单个球、单个按钮
- 返回该对象参与 CV 渲染的 tintables 列表

### 2.3 ICvRenderable（组合对象）

```typescript
interface ICvRenderable {
    prepareCvRender(idToColor: Map<number, number>): {
        tintables: CvTintable[];
        restore: () => void;
    };
}
```

- 组合对象实现，如 Board、Tube
- `prepareCvRender` 负责：Graphics 绘制（如有）、收集子级 tintables
- `restore` 负责：销毁临时 Graphics、恢复 visibility，**不含 tint 恢复**（由顶层 applyCvTintables 统一处理）

### 2.4 CvGraphicsDrawer（无纹理对象）

```typescript
type CvGraphicsDrawer<T = unknown> = (
    idToColor: Map<number, number>
) => { restore: () => void; data?: T };
```

- 适用于无纹理的 Graphics（fillStyle + fillRect）
- 在 `prepareCvRender` 内调用，绘制后返回 restore

---

## 3. ID 分配策略

| 类型 | ID 范围 | 说明 |
|------|---------|------|
| 容器/槽位 | 0 ~ N-1 | 如试管 cvId |
| 实体对象 | 100+ | 如球 cvId，需保证唯一 |
| 特殊 UI | 500+ | Hand:500, Icon:501, Download:502 |
| 动画/特效 | 1000+ | Liquid:1000, Expression:1001 |
| 背景 | 9999 | 固定 |

**约束**：总 ID 数 ≤ 216（ObjectIdPipeline 的 GRID_COLORS 上限）

---

## 4. 接入步骤

### 4.1 根场景（Game）准备

1. **维护 cvTintables 数组**：用于静态 UI（背景、icon、download 等）

```typescript
private cvTintables: CvTintable[] = [];

private registerCvTintable(obj: Phaser.GameObjects.GameObject, id: number, restore?: () => void) {
    this.cvTintables.push({ obj, id, restore });
}
```

2. **getColorMapIds（可选）**：根对象实现 `ICvTraversable` + `getCvChildren` 时，Integration 会通过 `collectAllCvIds(root, getStaticCvIds())` 自动推导，无需显式实现 `getColorMapIds`。仅在根非树结构时需在 adapter 中提供。

### 4.2 根对象实现 ICvRenderable

根对象（如 Board）实现 `prepareCvRender`：

```typescript
class Board implements ICvRenderable {
    public prepareCvRender(idToColor: Map<number, number>): { tintables: CvTintable[]; restore: () => void } {
        // 1. 刷新液体/Graphics 状态（如有）
        this.drawAllLiquids();

        // 2. 收集 hand tintables
        const handTintables: CvTintable[] = [];
        if (this.hand) {
            const savedHandVis = this.hand.visible;
            handTintables.push({
                obj: this.hand,
                id: 500,
                restore: () => {
                    this.hand!.clearTint();
                    this.hand!.setVisible(savedHandVis);
                },
            });
        }

        // 3. 调用子级 prepareCvRender，扁平化 tintables
        const tubeResults = this.tubes.map(t => t.prepareCvRender(idToColor));
        const tintables = [...handTintables, ...tubeResults.flatMap(r => r.tintables)];

        // 4. restore：仅 Graphics、visibility，不含 tint
        const restore = () => {
            this.boardLiquidGraphics?.setVisible(savedLiquidVis);
            this.requestLiquidRedraw?.();
            tubeResults.forEach(r => r.restore());
        };

        return { tintables, restore };
    }
}
```

### 4.3 子对象实现 ICvRenderable 或 ICvTintableProvider

- **组合对象**（如 Tube）：实现 `prepareCvRender`，内部创建 liquidFill Graphics、收集 tubeBody、surface、balls 的 tintables
- **叶子对象**（如 Ball）：实现 `getCvTintables()`，返回 ballImage、liquidSprite、expressionSprite 等

### 4.4 截帧逻辑（可选）

若使用 `initCvIntegration`（推荐），截帧逻辑由 Integration 内部实现，**无需手动实现**。以下为参考实现（不使用时）：

```typescript
public captureColorCodedFrame(): { pixels: string; width: number; height: number; colorMap: ColorMap } {
    const { colorMap, idToColor } = this.ensureColorMap();

    // 1. 根对象 prepareCvRender
    const boardResult = this.board.prepareCvRender(idToColor);

    // 2. 合并所有 tintables，顶层单次 apply
    const allTintables = [...this.cvTintables, ...boardResult.tintables];
    const restoreTint = applyCvTintables(allTintables, idToColor);

    // 3. 隐藏非 CV 的 UI（可选）
    const savedCvText = this.cvStepText?.visible;
    if (this.cvStepText) this.cvStepText.setVisible(false);

    // 4. 强制渲染 ID 色场景
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.preRender();
    this.children.depthSort();
    (this.cameras as any).render(renderer, this.children, 1);
    renderer.postRender();

    // 5. 提取像素
    const pixels = extractValidPixels(this.game.canvas, colorMap, 4);

    // 6. 恢复：先 restoreTint，再 boardResult.restore
    restoreTint();
    boardResult.restore();
    if (this.cvStepText) this.cvStepText.setVisible(savedCvText!);

    // 7. 再次渲染以恢复正常画面
    renderer.preRender();
    this.children.depthSort();
    (this.cameras as any).render(renderer, this.children, 1);
    renderer.postRender();

    const w = Math.round(this.game.canvas.width / 4);
    const h = Math.round(this.game.canvas.height / 4);
    return { pixels, width: w, height: h, colorMap };
}
```

---

## 5. 条件检查清单

| 条件 | 说明 |
|------|------|
| Phaser 3 | 使用 WebGL 渲染器 |
| 对象有 setTintFill/clearTint | Image、Sprite 支持；Graphics 需用 CvGraphicsDrawer |
| 唯一 cvId | 每个参与 CV 的对象有稳定、唯一的数字 ID |
| getColorMapIds / getCvChildren | 根实现 getCvChildren 时由 collectAllCvIds 自动推导；否则需显式提供 getColorMapIds |
| restore 顺序 | 先 restoreTint（恢复 tint），再 boardResult.restore（Graphics、visibility） |
| 可见性过滤 | applyCvTintables 仅对 `obj.visible === true` 的对象 tint |

---

## 6. 常见问题

### Q: 对象需要恢复为游戏颜色而非 clearTint？

在 CvTintable 中提供自定义 `restore`，例如：

```typescript
{
    obj: this.liquidSprite,
    id: 1000,
    restore: () => this.liquidSprite.setTintFill(getLiquidColors()[this.color]),
}
```

### Q: 无纹理的 Graphics 如何参与 CV？

在 `prepareCvRender` 内创建临时 Graphics，用 `fillStyle` + `fillRect` 按 idToColor 绘制，restore 时 `destroy()`。参考 Tube 的 `drawLiquidIdLocal`。

### Q: 总 ID 数超过 216？

ObjectIdPipeline 的 GRID_COLORS 上限为 216。需减少对象数量或合并 ID（例如多个球共用一个槽位 ID，若 CV 不区分）。

### Q: 截帧后画面未恢复？

检查：1) restoreTint 是否在 boardResult.restore 之前调用；2) 各 restore 是否正确恢复 visibility；3) Board 的 requestLiquidRedraw 是否触发重绘。

---

## 7. 一键接入（CvIntegration）

在场景 `create()` 中调用 `initCvIntegration` 并传入回调即可完成 CV 接入（截帧逻辑由 Integration 内部实现）：

```typescript
import { isCVModeEnabled, initCvIntegration } from '@ballsort-multi/phaser-cv';

create() {
  // ... 游戏初始化、Board、cvTintables、registerCvTintable 等 ...

  if (isCVModeEnabled()) {
    initCvIntegration(this, {
      getStaticCvIds: () => [500, 501, 502, 1000, 1001],  // hand/icon/download/liquid/expression
      getRootRenderable: () => this.board,  // Board 实现 getCvChildren 时 getColorMapIds 自动推导
      getStaticTintables: () => this.cvTintables,
      getElementsToHide: () => [],  // 可选：截帧时需隐藏的 UI（如 debugText）
      getActiveIds: () => this.board.getColorCodeObjectIds(),
      formatStepSuffix: (res) => '',  // 可选：根据 response 自定义文案后缀
    });
  }
}
```

- Integration 会在 scene 上挂载 `captureColorCodedFrame`，供 CVBridge / App 的 cv-capture-frame 使用
- 访问 `?cv=1` 启用 CV 模式，需启动 CV 服务（`npm run dev:cv`）

---

## 8. 接入检查

### 8.1 静态检查（Terminal）

```bash
npm run cv:check
```

输出 `4/4 核心项通过` 表示接入完整；否则会列出缺失项及修复提示。

### 8.2 运行时检查（浏览器 Console）

访问 `?cv=1` 时，若接入完整会输出 `[CV] 接入检查: 4/4 ✓ 接入完整`；若有缺失会列出具体项。

---

## 9. 参考实现

完整实现见本仓库：

- `packages/phaser-cv`（共享 CV 包：CvColorCode、ObjectIdPipeline、CVBridge、CvIntegration）
- `packages/phaser-cv-demo/scripts/cv-check.mjs`（静态检查脚本）
- `packages/phaser-cv-demo/src/game/scenes/Game.ts`（registerCvTintable、getCvAdapter）
- `packages/phaser-cv-demo/src/game/components/Board.ts`（prepareCvRender、getCvChildren）
- `packages/phaser-cv-demo/src/game/components/Tube.ts`（prepareCvRender）
- `packages/phaser-cv-demo/src/game/components/Ball.ts`（getCvTintables、ICvTintableProvider）
