# 液体分拣效果设计文档

## 1. 概述
本设计文档旨在描述将现有的"小球试管"玩法修改为"液体试管"玩法的技术方案。
核心目标是使用提供的物料（序列帧动画、遮罩图），实现液体的动态效果，包括静止水面、液体升降、分离与融合等。

**重要原则：**
本次修改仅限于**视觉表现层**的替换。
- **交互逻辑不变**：用户的点击、选中、移动等操作逻辑保持原样。
- **核心玩法不变**：游戏规则、胜利条件、死局检测等逻辑保持原样。
- 仅将"小球"的视觉表现替换为"液体"，将"小球移动"的视觉表现替换为"水球/水流移动"。

## 2. 资源管理 (Asset Management)

### 2.1 新增资源
需要在 `Preloader.ts` 中加载以下资源：

1.  **遮罩图**:
    - `docs/物料-Leah/图片/试管黑色形状.png` -> Key: `tube_mask`
    - 用于裁剪试管内的液体形状。

2.  **液体动画序列帧**:
    - **出瓶子 (Up)**: `docs/物料-Leah/图片/水团活动/1出瓶子/up_*.png` -> Key: `liquid_up`
    - **原地暂停 (Still)**: `docs/物料-Leah/图片/水团活动/2原地暂停/still_*.png` -> Key: `liquid_still`
    - **移动和下降 (Move)**: `docs/物料-Leah/图片/水团活动/3移动和下降/move_*.png` -> Key: `liquid_move`
    - **落入水中 (Drop)**: `docs/物料-Leah/图片/水团活动/4落入水中/drop_*.png` -> Key: `liquid_drop`
    - **水花 (Splash)**: `docs/物料-Leah/图片/水花/splash_*.png` -> Key: `liquid_splash`

### 2.2 资源加载策略
- 使用 `this.load.image` 加载单张遮罩。
- 使用循环加载序列帧图片，并创建 Phaser 动画 (`this.anims.create`)。
- 动画帧率建议：24-30 fps。

## 3. 组件改造 (Component Refactoring)

### 3.1 颜色常量提取
- 将 `Ball.ts` 中的颜色定义提取到 `GameConstants.ts`，方便 `Tube` 和 `Liquid` 共享使用。

### 3.2 Tube 组件 (`src/game/components/Tube.ts`)
`Tube` 组件将不再管理 `Ball` 对象列表的渲染，而是管理"液体层"的渲染。

#### 3.2.1 属性变更
- 移除: `balls: Ball[]` (仅保留逻辑数据结构，移除渲染对象)
- 新增:
    - `liquidGraphics: Phaser.GameObjects.Graphics`: 用于绘制静态液体柱。
    - `liquidMask: Phaser.Display.Masks.BitmapMask`: 基于 `tube_mask` 创建的遮罩。
    - `surfaceSprite: Phaser.GameObjects.Sprite`: 用于显示液体顶部的动态水面效果（播放 `liquid_still`）。
    - `liquidContainer: Phaser.GameObjects.Container`: 包含 `liquidGraphics` 和 `surfaceSprite`，应用遮罩。

#### 3.2.2 渲染逻辑
1.  **液体柱绘制**:
    - 遍历当前试管内的颜色数据。
    - 对于每一段连续的颜色，计算其高度（`unitHeight * count`）。
    - 使用 `liquidGraphics.fillStyle` 绘制对应颜色的矩形。
    - 矩形从底部向上堆叠。

2.  **遮罩应用**:
    - 创建一个 `Image` 使用 `tube_mask` 纹理，设置为不可见。
    - 创建 `BitmapMask` 使用该 Image。
    - **注意**：遮罩图中**黑色区域（不透明区域）**为显示区域，**透明区域**为裁剪（隐藏）区域。
    - 将 Mask 应用于 `liquidContainer`，确保液体只在试管内部显示。

3.  **顶部水面**:
    - 在液体柱的最顶端放置 `surfaceSprite`。
    - 播放 `liquid_still` 动画。
    - 设置 `tint` 为顶层液体的颜色。
    - 如果试管为空，隐藏 `surfaceSprite`。

### 3.3 动态液体对象 (`ActiveLiquid`)
创建一个新的类或在 `Game` 场景中管理一个全局的"活动液体"对象，用于替代原来的 `Ball` 移动逻辑。
**注意：** 该对象仅用于视觉展示，不改变原有的 `Board` 或 `Game` 中的逻辑状态流转。

- **状态**:
    - `IDLE`: 隐藏。
    - `RISING`: 播放 `liquid_up`，从源试管升起。
    - `MOVING`: 播放 `liquid_move`，跟随鼠标/手指或飞向目标。
    - `DROPPING`: 播放 `liquid_drop`，落入目标试管。
    - `SPLASHING`: 播放 `liquid_splash`，在目标液面播放。

- **颜色**:
    - 使用 `setTint` 实时改变黑色序列帧的颜色。

## 4. 动画流程 (Animation Flow)

### 4.1 提取液体 (Lift)
1.  **源试管**:
    - 顶部 N 个同色单位被选中。
    - 试管内的液体柱高度通过 Tween 动画减少 N 个单位高度。
    - 顶部水面 Sprite 跟随液面下降。
2.  **活动液体**:
    - 在源试管口生成。
    - 播放 `liquid_up` 动画。
    - 颜色设置为被选中的颜色。
    - 动画播放完毕后，切换到 `liquid_move` 循环动画。

### 4.2 移动液体 (Move)
- 活动液体跟随输入位置或飞向目标位置。
- 保持播放 `liquid_move` 动画。

### 4.3 注入液体 (Drop)
1.  **活动液体**:
    - 移动到目标试管口上方。
    - 播放 `liquid_drop` 动画，向下移动。
    - 当到达目标液面高度时，播放 `liquid_splash` 动画，然后隐藏。
2.  **目标试管**:
    - 液体柱高度通过 Tween 动画增加 N 个单位高度。
    - 顶部水面 Sprite 跟随液面上升。

## 5. 技术细节

### 5.1 坐标系统
- 液体单位高度 `unitHeight` = `tubeHeight / capacity`。
- 液体底部 Y 坐标 = 试管底部 Y 坐标。
- 液体顶部 Y 坐标 = 试管底部 Y 坐标 - (单位数量 * `unitHeight`)。

### 5.2 遮罩对齐
- `tube_mask` 需要与 `tube_body` 完美重合。
- 建议将 Mask Image 添加到 Tube Container 中（设为不可见），以确保变换同步。

### 5.3 性能优化
- 序列帧动画复用：所有液体共用同一套 Animation 数据，通过 Tint 区分颜色。
- 减少 Graphics 重绘：仅在液体数量变化或动画进行时重绘。

## 6. 任务分解
1.  **资源准备**: 在 `Preloader` 中加载新素材，创建动画。
2.  **重构 Ball/Constants**: 提取颜色常量。
3.  **改造 Tube**: 实现液体 Graphics 绘制和遮罩。
4.  **实现 ActiveLiquid**: 处理液体的升起、移动、落下动画。
5.  **整合逻辑**: 替换原有的 Ball 移动逻辑，对接新的液体动画系统。
