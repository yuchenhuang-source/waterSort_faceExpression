import { Scene } from 'phaser';
import { Ball } from './Ball';
import { BallColor, GAME_CONFIG, LIQUID_BALL_DISPLAY_WIDTH_RATIO, LIQUID_BALL_SIZE_SCALE, SPLASH_TUBE_WIDTH_RATIO, SPLASH_VERTICAL_OFFSET_RATIO } from '../constants/GameConstants';
import { getLiquidColors } from '../../utils/outputConfigLoader';
import { EventBus } from '../EventBus';
import { SpineLoader } from '../utils/SpineLoader';

export class Tube extends Phaser.GameObjects.Container {
    private tubeBodyImage: Phaser.GameObjects.Image;
    private tubeMouthImage: Phaser.GameObjects.Image;
    private highlightBodyImage: Phaser.GameObjects.Image;
    private highlightMouthImage: Phaser.GameObjects.Image;
    
    // 液体渲染相关
    private liquidContainer: Phaser.GameObjects.Container;
    private liquidGraphics: Phaser.GameObjects.Graphics;
    private surfaceSprite: Phaser.GameObjects.Sprite; // 顶部液面（加反光）
    /** 水位上升时专用：加入块下边缘 surface，从动画开始就显式显示，不依赖 boundaries 数组 */
    private addingBlockBottomSurfaceSprite: Phaser.GameObjects.Sprite | null = null;
    private boundarySurfaceSprites: Phaser.GameObjects.Sprite[] = []; // 分界处液面（不加反光）
    private maskImage: Phaser.GameObjects.Image;
    private maskGraphics: Phaser.GameObjects.Graphics; // 备用：几何遮罩
    private liquidMask: Phaser.Display.Masks.GeometryMask | null = null; // 液体遮罩引用
    
    // 液体动画相关
    private removingBallColor: BallColor | null = null;
    private removingBallHeight: number = 0;
    /** 球落定后水位渐升：正在加入的液体块颜色与当前高度（0→unitHeight） */
    private addingBallColor: BallColor | null = null;
    public addingBallHeight: number = 0; // 供 tween 读写
    /** 当前水位渐升 tween，用于选中试管时取消未完成的动画 */
    private waterRiseTween: Phaser.Tweens.Tween | null = null;
    /** 当前水位渐升伴随的水花精灵，取消时需销毁 */
    private waterRiseSplashSprite: Phaser.GameObjects.Sprite | null = null;
    /** 仅归位时：上升动画开始时在相邻液体层顶部添加的与上升液体同色的 surface sprite，动画结束时销毁 */
    private returnBoundarySurfaceSprite: Phaser.GameObjects.Sprite | null = null;
    /** 当前是否为归位引起的水位上升（用于 drawLiquid 中不显示 addingBlockBottomSurfaceSprite） */
    private _isReturnWaterRise: boolean = false;
    /** 顶球是否正在试管外悬浮（选中态），为 true 时 drawLiquid 不把顶球算入液面，避免同一液体画两遍 */
    private _topBallFloating: boolean = false;

    private candleImage: Phaser.GameObjects.Image | null = null; // 完成后显示的蜡烛
    private fireSprite: Phaser.GameObjects.Sprite | null = null; // 火焰动画精灵
    public balls: Ball[] = [];
    public id: number;
    public isCompleted: boolean = false;
    private isSameColorHighlighted: boolean = false; // 同色高亮状态（未满但同色）
    private currentHighlightColor: BallColor | null = null; // 当前高亮颜色
    private highlightTween: Phaser.Tweens.Tween | null = null; // 当前高亮过渡动画
    private particleEffect: any; // Spine object - 粒子特效
    private fireworkEffect: any; // Spine object - 烟花特效
    private currentWidth: number;
    private currentHeight: number;
    private currentBallSize: number;
    private currentBallSpacing: number;
    
    // 高亮试管相对于普通试管的尺寸比例
    // 普通试管：129 * 1019，高亮试管：195 * 1115
    private static readonly HIGHLIGHT_WIDTH_RATIO = 195 / 129;  // ≈ 1.512
    private static readonly HIGHLIGHT_HEIGHT_RATIO = 1115 / 1019; // ≈ 1.094
    
    // 火焰动画相对于蜡烛顶部的向下偏移量
    private static readonly FIRE_OFFSET_Y = 15;

    // 液体底部偏移量基准值 (可调整此值改变液体起始高度)
    private static readonly LIQUID_BOTTOM_BASE_OFFSET = 0;

    /** 动画 onUpdate 中节流 drawLiquid 用，避免每帧重绘造成点击交互卡顿 */
    private _lastLiquidDrawTime: number = 0;
    /** 统计 drawLiquid 调用次数 */
    private _debugDrawLiquidCount: number = 0;
    /** 合并同一帧内的液体重绘请求 */
    private _liquidDrawQueued: boolean = false;

    constructor(scene: Scene, x: number, y: number, id: number) {
        super(scene, x, y);
        this.id = id;

        // 默认尺寸
        this.currentWidth = GAME_CONFIG.PORTRAIT.TUBE_WIDTH;
        this.currentHeight = GAME_CONFIG.PORTRAIT.TUBE_HEIGHT;
        this.currentBallSize = GAME_CONFIG.BALL_SIZE;
        this.currentBallSpacing = GAME_CONFIG.BALL_SPACING;

        // 1. 创建遮罩图片 (保留引用，但暂时使用几何遮罩)
        this.maskImage = scene.add.image(0, 0, 'tube_mask');
        this.maskImage.setVisible(false);
        this.add(this.maskImage);

        // 创建几何遮罩图形
        // 注意：为了避免容器嵌套导致的遮罩坐标问题，我们将遮罩图形直接添加到场景中
        this.maskGraphics = scene.make.graphics();
        this.maskGraphics.setVisible(false);
        // 不添加到 Tube 容器，而是直接添加到场景（或者不添加，GeometryMask 不需要源在显示列表中？）
        // Phaser 文档：GeometryMask 源对象不需要在显示列表中。
        // 但为了调试和确保更新，我们通常不添加，或者添加到场景。
        // 这里我们不添加 maskGraphics 到任何容器，只用它来定义形状。
        // 但是，如果不添加，它的 transform (x,y) 不会自动更新。
        // 我们需要在 updateSize 中手动设置它的位置。
        this.liquidContainer = scene.add.container(0, 0);
        this.add(this.liquidContainer);

        // 3. 创建液体 Graphics
        this.liquidGraphics = scene.add.graphics();
        this.liquidContainer.add(this.liquidGraphics);

        // 4. 创建水面 Sprite（使用 surface.png，黑色图运行时按液体颜色着色）
        this.surfaceSprite = scene.add.sprite(0, 0, 'liquid_surface');
        this.surfaceSprite.setOrigin(0.5, 0.5); // 锚点：水平与垂直中心，使液面中心落在液体上边缘，上半在上边缘之上、下半之下
        this.surfaceSprite.setVisible(false);
        this.surfaceSprite.setDepth(1); // 保证在液体 Graphics 之上
        this.liquidContainer.add(this.surfaceSprite);

        // 4b. 水位上升时专用：加入块下边缘 surface（从动画开始就显示）
        this.addingBlockBottomSurfaceSprite = scene.add.sprite(0, 0, 'liquid_surface');
        this.addingBlockBottomSurfaceSprite.setOrigin(0.5, 0.5);
        this.addingBlockBottomSurfaceSprite.setVisible(false);
        this.addingBlockBottomSurfaceSprite.setDepth(1);
        this.liquidContainer.add(this.addingBlockBottomSurfaceSprite);

        // 5. 应用遮罩
        this.liquidMask = new Phaser.Display.Masks.GeometryMask(scene, this.maskGraphics);
        // 恢复正常遮罩逻辑
        this.liquidMask.setInvertAlpha(false);
        
        this.liquidGraphics.setMask(this.liquidMask);
        this.surfaceSprite.setMask(this.liquidMask);
        if (this.addingBlockBottomSurfaceSprite) this.addingBlockBottomSurfaceSprite.setMask(this.liquidMask);

        // 创建试管管口（后层）
        this.tubeMouthImage = scene.add.image(0, 0, 'tube_mouth');
        this.tubeMouthImage.setDisplaySize(this.currentWidth, this.currentHeight);
        this.add(this.tubeMouthImage);
        
        // 创建高亮管口（叠加在普通管口上方，初始透明）
        this.highlightMouthImage = scene.add.image(0, 0, 'highlight_brown_mouth');
        this.highlightMouthImage.setDisplaySize(
            this.currentWidth * Tube.HIGHLIGHT_WIDTH_RATIO,
            this.currentHeight * Tube.HIGHLIGHT_HEIGHT_RATIO
        );
        this.highlightMouthImage.setAlpha(0);
        this.add(this.highlightMouthImage);

        // 创建试管管身（前层）
        this.tubeBodyImage = scene.add.image(0, 0, 'tube_body');
        this.tubeBodyImage.setDisplaySize(this.currentWidth, this.currentHeight);
        this.add(this.tubeBodyImage);
        
        // 创建高亮管身（叠加在普通管身上方，初始透明）
        this.highlightBodyImage = scene.add.image(0, 0, 'highlight_brown_body');
        this.highlightBodyImage.setDisplaySize(
            this.currentWidth * Tube.HIGHLIGHT_WIDTH_RATIO,
            this.currentHeight * Tube.HIGHLIGHT_HEIGHT_RATIO
        );
        this.highlightBodyImage.setAlpha(0);
        this.add(this.highlightBodyImage);
        
        // 层级调整
        // 遮罩层(maskImage) -> 液体层(liquidContainer) -> 管口 -> 高亮管口 -> 管身 -> 高亮管身
        // 由于按顺序添加，这里不需要额外调整，只需确保 maskImage 在最底层
        this.sendToBack(this.maskImage);

        // 设置交互区域
        this.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.currentWidth, this.currentHeight), Phaser.Geom.Rectangle.Contains);
        
        scene.add.existing(this);

        // 遮罩位置仅在 resize（updateSize）和 setPosition 时更新，不再每帧更新
        // 组件销毁时清理资源
        this.on('destroy', () => {
            if (this.maskGraphics) this.maskGraphics.destroy();
            // 清理分界处液面 sprites
            this.boundarySurfaceSprites.forEach(sprite => {
                if (sprite && sprite.scene) sprite.destroy();
            });
            this.boundarySurfaceSprites = [];
            if (this.addingBlockBottomSurfaceSprite && this.addingBlockBottomSurfaceSprite.scene) {
                this.addingBlockBottomSurfaceSprite.destroy();
                this.addingBlockBottomSurfaceSprite = null;
            }
            if (this.returnBoundarySurfaceSprite && this.returnBoundarySurfaceSprite.scene) {
                this.returnBoundarySurfaceSprite.destroy();
                this.returnBoundarySurfaceSprite = null;
            }
        });
    }

    /** 同步遮罩位置与缩放（仅在 updateSize 与 setPosition 时调用，不再每帧调用） */
    private updateMaskPosition() {
        if (this.maskGraphics && this.active) {
            const matrix = this.getWorldTransformMatrix();
            this.maskGraphics.setPosition(matrix.tx, matrix.ty);
            this.maskGraphics.setScale(matrix.scaleX, matrix.scaleY);
        }
    }

    /** 重写 setPosition，在位置变化后同步遮罩（resize 时 Board 会调用 setPosition） */
    setPosition(x: number, y?: number, z?: number, w?: number): this {
        super.setPosition(x, y, z, w);
        this.updateMaskPosition();
        return this;
    }

    /** 供选中液体球等使用的缓存试管宽度（开场和 resize 后由 updateSize 写入，避免 displayWidth 未就绪时取到错误尺寸） */
    public getCachedTubeDisplayWidth(): number {
        return this.currentWidth;
    }

    /** 供悬浮位置等使用的缓存试管高度 */
    public getCachedTubeHeight(): number {
        return this.currentHeight;
    }

    public updateSize(width: number, height: number, ballSize: number, ballSpacing: number) {
        this.currentWidth = width;
        this.currentHeight = height;
        this.currentBallSize = ballSize;
        this.currentBallSpacing = ballSpacing;

        this.tubeBodyImage.setDisplaySize(width, height);
        this.tubeMouthImage.setDisplaySize(width, height);
        
        // 更新遮罩尺寸 (BitmapMask)
        this.maskImage.setDisplaySize(width, height);

        // 更新几何遮罩形状
        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        
        // 绘制圆角矩形作为遮罩
        const radius = width / 2;
        const maskWidth = width - 4;
        const maskHeight = height - 4;
        
        // 关键：因为 maskGraphics 没有添加到 Tube 容器中，它没有继承 Tube 的坐标。
        // 我们需要将绘制的形状偏移到 Tube 的位置。
        // Tube 的 (0,0) 是中心点。
        // maskGraphics 的 (0,0) 是世界坐标原点 (如果未设置 x,y)。
        // 我们设置 maskGraphics 的 x,y 为 Tube 的 x,y。
        
        // 绘制相对于 maskGraphics 原点的形状
        // 位置由 updateMaskPosition 在 updateSize / setPosition 时同步（resize 时）
        this.maskGraphics.fillRoundedRect(-maskWidth/2, -maskHeight/2, maskWidth, maskHeight, { tl: 0, tr: 0, bl: radius, br: radius });
        
        // 立即同步一次位置
        this.updateMaskPosition();

        // 高亮试管按比例放大
        this.highlightBodyImage.setDisplaySize(
            width * Tube.HIGHLIGHT_WIDTH_RATIO,
            height * Tube.HIGHLIGHT_HEIGHT_RATIO
        );
        this.highlightMouthImage.setDisplaySize(
            width * Tube.HIGHLIGHT_WIDTH_RATIO,
            height * Tube.HIGHLIGHT_HEIGHT_RATIO
        );
        this.setSize(width, height);
        
        // 更新交互区域
        if (this.input) {
            // 重新设置 hitArea
            // @ts-ignore
            this.input.hitArea.setTo(0, 0, width, height);
        }

        // 更新蜡烛尺寸（如果已完成显示蜡烛）
        if (this.candleImage) {
            const candleScale = height / this.candleImage.texture.getSourceImage().height;
            this.candleImage.setScale(candleScale * GAME_CONFIG.CANDLE_SCALE_FACTOR);
            
            // 更新位置偏移，保持底部对齐
            const heightDiff = height * (GAME_CONFIG.CANDLE_SCALE_FACTOR - 1);
            const candleOffsetY = -heightDiff / 2;
            this.candleImage.setPosition(0, candleOffsetY);

            // 更新火焰位置和大小（如果存在）
            if (this.fireSprite) {
                // 火焰应该显示在蜡烛顶部
                // 计算蜡烛顶部位置：蜡烛中心Y + 蜡烛高度的一半
                const candleTopY = candleOffsetY - (this.candleImage.displayHeight / 2);
                
                // 根据蜡烛宽度调整火焰大小
                const fireScale = (this.currentWidth / GAME_CONFIG.PORTRAIT.TUBE_WIDTH) * 0.8; // 火焰稍小一些
                this.fireSprite.setScale(fireScale);
                // 应用向下偏移量
                this.fireSprite.setPosition(0, candleTopY + Tube.FIRE_OFFSET_Y);
            }
        }

        // 更新液体显示
        this.requestDrawLiquid();
    }

    private drawLiquid() {
        this._debugDrawLiquidCount++;
        this.liquidGraphics.clear();
        
        if (this.balls.length === 0 && this.removingBallColor === null && this.addingBallColor === null) {
            this.surfaceSprite.setVisible(false);
            // 隐藏所有分界处液面
            this.boundarySurfaceSprites.forEach(sprite => sprite.setVisible(false));
            return;
        }

        // 计算单位高度 (保持与球的大小一致，或者填满试管)
        const unitHeight = this.currentBallSize + this.currentBallSpacing;
        const bottomY = this.currentHeight / 2 - Tube.LIQUID_BOTTOM_BASE_OFFSET * (this.currentHeight / GAME_CONFIG.PORTRAIT.TUBE_HEIGHT);
        
        // 绘制液体柱：顶球若正在试管外悬浮则不参与；若正在加入液体则先不画最后一颗，改画 adding 块
        let currentY = bottomY;
        let topColor: BallColor | null = null;
        let ballsForLiquid =
            this._topBallFloating && this.balls.length > 0
                ? this.balls.slice(0, -1)
                : this.balls;
        if (this.addingBallColor !== null && this.balls.length > 0) {
            ballsForLiquid = this.balls.slice(0, -1); // 正在加入时，主液体不包含最后一颗
        }

        // 记录分界位置（分界处底边缘 = 下方液体的顶部边缘）
        const boundaries: Array<{ y: number; color: BallColor }> = [];
        
        if (ballsForLiquid.length > 0) {
            // 合并相邻同色球
            let currentColor = ballsForLiquid[0].color;
            let currentCount = 0;

            for (let i = 0; i < ballsForLiquid.length; i++) {
                const ball = ballsForLiquid[i];
                if (ball.color === currentColor) {
                    currentCount++;
                } else {
                    // 绘制上一段颜色
                    this.drawLiquidBlock(currentColor, currentCount, currentY, unitHeight);
                    const boundaryY = currentY - currentCount * unitHeight; // 分界处底边缘（下方液体的顶部）
                    currentY = boundaryY;
                    
                    // 记录分界（使用下方液体的颜色）
                    boundaries.push({ y: boundaryY, color: ball.color });

                    // 开始新的一段
                    currentColor = ball.color;
                    currentCount = 1;
                }
            }
            // 绘制最后一段
            this.drawLiquidBlock(currentColor, currentCount, currentY, unitHeight);
            currentY -= currentCount * unitHeight;
            topColor = currentColor;
        }

        // 绘制正在移除的液体块（如果有）：分界处立即画弧线液面，避免短暂直线
        if (this.removingBallColor !== null && this.removingBallHeight > 0) {
            const width = this.currentWidth;
            boundaries.push({ y: currentY - this.removingBallHeight, color: topColor ?? this.removingBallColor });
            this.liquidGraphics.fillStyle(getLiquidColors()[this.removingBallColor], 1);
            this.liquidGraphics.fillRect(-width / 2, currentY - this.removingBallHeight, width, this.removingBallHeight + 2);
            currentY -= this.removingBallHeight;
            topColor = this.removingBallColor;
        }

        // 绘制正在加入的液体块（球落定后水位渐升）：分界处从动画开始就画弧线液面（包括 addingBallHeight===0）
        let addBoundaryY: number | null = null; // 供专用下边缘 sprite 使用
        if (this.addingBallColor !== null) {
            addBoundaryY = currentY - this.addingBallHeight;
            // 归位时用 boundarySurfaceSprites 画此分界（下方液体颜色）；非归位时用 addingBlockBottomSurfaceSprite 画加入块下边缘，不再 push 避免同一条线画两次
            if (this._isReturnWaterRise) {
                boundaries.push({ y: addBoundaryY, color: topColor ?? this.addingBallColor });
            }
            // 非归位时：加入块下边缘用专用 sprite 绘制，不放入 boundaries
            if (this.addingBallHeight > 0) {
                const width = this.currentWidth;
                this.liquidGraphics.fillStyle(getLiquidColors()[this.addingBallColor], 1);
                this.liquidGraphics.fillRect(-width / 2, currentY - this.addingBallHeight, width, this.addingBallHeight + 2);
                currentY -= this.addingBallHeight;
                topColor = this.addingBallColor;
            }
        }

        // 液面贴图处理
        const hasSurfaceTexture = this.scene.textures.exists('liquid_surface');
        
        if (hasSurfaceTexture) {
            // 1. 顶部液面（加反光效果）。仅归位时水位上升刚开始（addingBallHeight<=0）不显示顶部液面；移到目标试管时始终显示
            if (topColor !== null) {
                const hideTopSurfaceForBoundary = this._isReturnWaterRise && this.addingBallColor !== null && this.addingBallHeight <= 0;
                if (hideTopSurfaceForBoundary) {
                    this.surfaceSprite.setVisible(false);
                } else {
                    this.surfaceSprite.setVisible(true);
                    this.surfaceSprite.setPosition(0, currentY);
                    // 液面颜色比液体颜色浅，突出反光效果（混合 30% 白色）
                    const liquidColor = getLiquidColors()[topColor];
                    const surfaceColor = this.lightenColor(liquidColor, 0.5);
                    this.surfaceSprite.setTintFill(surfaceColor);
                    const w = this.currentWidth;
                    const frame = this.surfaceSprite.frame;
                    const fw = (frame?.width ?? this.surfaceSprite.width) || 1;
                    const fh = (frame?.height ?? this.surfaceSprite.height) || 1;
                    const h = Math.max(8, (fh / fw) * w); // 最小高度 8px，避免过薄不可见
                    this.surfaceSprite.setDisplaySize(w, h);
                    this.liquidContainer.bringToTop(this.surfaceSprite); // 保证液面在液体矩形之上
                }
            } else {
                this.surfaceSprite.setVisible(false);
            }

            // 2. 分界处液面（不加反光，使用原始颜色）
            // 确保有足够数量的 sprite
            while (this.boundarySurfaceSprites.length < boundaries.length) {
                const sprite = this.scene.add.sprite(0, 0, 'liquid_surface');
                sprite.setOrigin(0.5, 0.5);
                sprite.setVisible(false);
                sprite.setDepth(1);
                if (this.liquidMask) {
                    sprite.setMask(this.liquidMask); // 使用相同的遮罩
                }
                this.liquidContainer.add(sprite);
                this.boundarySurfaceSprites.push(sprite);
            }

            // 更新/显示分界处液面
            for (let i = 0; i < boundaries.length; i++) {
                const boundary = boundaries[i];
                const sprite = this.boundarySurfaceSprites[i];
                sprite.setVisible(true);
                sprite.setPosition(0, boundary.y);
                // 使用原始颜色，不加反光
                sprite.setTintFill(getLiquidColors()[boundary.color]);
                const w = this.currentWidth;
                const frame = sprite.frame;
                const fw = (frame?.width ?? sprite.width) || 1;
                const fh = (frame?.height ?? sprite.height) || 1;
                const h = Math.max(8, (fh / fw) * w);
                sprite.setDisplaySize(w, h);
            }
            // 水位上升时：非归位用专用 sprite 显示加入块下边缘；归位时用 returnBoundarySurfaceSprite（在动画开始时已添加）
            if (this.addingBlockBottomSurfaceSprite) {
                if (this.addingBallColor !== null && addBoundaryY !== null && !this._isReturnWaterRise) {
                    this.addingBlockBottomSurfaceSprite.setVisible(true);
                    this.addingBlockBottomSurfaceSprite.setPosition(0, addBoundaryY);
                    this.addingBlockBottomSurfaceSprite.setTintFill(getLiquidColors()[this.addingBallColor]);
                    const w = this.currentWidth;
                    const frame = this.addingBlockBottomSurfaceSprite.frame;
                    const fw = (frame?.width ?? this.addingBlockBottomSurfaceSprite.width) || 1;
                    const fh = (frame?.height ?? this.addingBlockBottomSurfaceSprite.height) || 1;
                    const h = Math.max(8, (fh / fw) * w);
                    this.addingBlockBottomSurfaceSprite.setDisplaySize(w, h);
                    this.liquidContainer.bringToTop(this.addingBlockBottomSurfaceSprite);
                } else {
                    this.addingBlockBottomSurfaceSprite.setVisible(false);
                }
            }

            // 多余的分界处液面 sprite 直接隐藏，避免频繁销毁/创建引起 GC 抖动
            for (let i = boundaries.length; i < this.boundarySurfaceSprites.length; i++) {
                this.boundarySurfaceSprites[i].setVisible(false);
            }
        } else {
            this.surfaceSprite.setVisible(false);
            // 隐藏所有分界处液面
            this.boundarySurfaceSprites.forEach(sprite => sprite.setVisible(false));
        }
        // 非液面贴图分支或无 adding 时也要隐藏专用下边缘 sprite
        if (!this.scene.textures.exists('liquid_surface') || this.addingBallColor === null) {
            if (this.addingBlockBottomSurfaceSprite) this.addingBlockBottomSurfaceSprite.setVisible(false);
        }
    }

    /**
     * 将颜色变浅（与白色混合），用于液面反光效果
     * @param color 原始颜色值（十六进制，如 0xff0000）
     * @param lightenRatio 变浅比例（0-1），0.3 表示混合 30% 白色
     * @returns 变浅后的颜色值
     */
    private lightenColor(color: number, lightenRatio: number = 0.3): number {
        // 提取 RGB 分量
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        
        // 与白色混合（255, 255, 255）
        const newR = Math.min(255, Math.round(r + (255 - r) * lightenRatio));
        const newG = Math.min(255, Math.round(g + (255 - g) * lightenRatio));
        const newB = Math.min(255, Math.round(b + (255 - b) * lightenRatio));
        
        // 重新组合为十六进制颜色
        return (newR << 16) | (newG << 8) | newB;
    }

    private drawLiquidBlock(color: BallColor, count: number, bottomY: number, unitHeight: number) {
        const height = count * unitHeight;
        const width = this.currentWidth; // 填满宽度，依靠遮罩裁剪
        
        this.liquidGraphics.fillStyle(getLiquidColors()[color], 1);
        // 绘制矩形 (中心点为 0,0，所以 x 需要偏移)
        this.liquidGraphics.fillRect(-width / 2, bottomY - height, width, height + 2); // +2 为了消除缝隙
    }

    /**
     * 节流版 drawLiquid，用于 tween onUpdate，避免每帧完整重绘导致点击交互卡顿。
     * 仅在距上次绘制超过 intervalMs 时重绘，动画结束时仍应在 onComplete 中调用一次 drawLiquid()。
     */
    private drawLiquidThrottled(intervalMs: number = 33): void {
        const now = this.scene.game.loop.now;
        if (now - this._lastLiquidDrawTime >= intervalMs) {
            this._lastLiquidDrawTime = now;
            this.requestDrawLiquid();
        }
    }

    /**
     * 合并同一帧内的多次重绘请求，保证只绘制一次且使用最新状态
     */
    private requestDrawLiquid(): void {
        if (this._liquidDrawQueued) return;
        this._liquidDrawQueued = true;
        this.scene.events.once('postupdate', () => {
            this._liquidDrawQueued = false;
            if (!this.scene || !this.active) return;
            this.drawLiquid();
        });
    }


    public addBall(ball: Ball, animate: boolean = true, skipDraw: boolean = false) {
        if (this.balls.length >= GAME_CONFIG.TUBE_CAPACITY) return false;

        // 将球添加到列表中
        this.balls.push(ball);
        
        // 关键：必须将球添加到容器中，即使它是隐藏的。
        // 这样 Board 才能通过 localToWorld 正确计算其世界坐标。
        this.add(ball);

        // 确保球处于隐藏状态
        ball.setLiquidState('hidden');
        // 统一设置球容器缩放，与落地时 setScale 一致，避免多操作后尺寸不一致
        ball.setScale(this.currentBallSize / GAME_CONFIG.BALL_SIZE);

        // 计算目标位置（液面顶部）
        const unitHeight = this.currentBallSize + this.currentBallSpacing;
        const bottomY = this.currentHeight / 2 - Tube.LIQUID_BOTTOM_BASE_OFFSET * (this.currentHeight / GAME_CONFIG.PORTRAIT.TUBE_HEIGHT);
        const targetY = bottomY - (this.balls.length * unitHeight);
        
        // 关键：虽然球不可见，但必须设置其位置，因为 Board 会读取 ball.y 来计算动画起点
        ball.setPosition(0, targetY + this.currentBallSize / 2);

        if (animate) {
            // 球落定前：先按「正在加入」绘制，水位不包含新球那一截，等落地后再渐升
            this.addingBallColor = ball.color;
            this.addingBallHeight = 0;
            this.requestDrawLiquid();

            const dropSprite = this.scene.add.sprite(0, -this.currentHeight / 2 - 50, 'liquid_drop');
            dropSprite.setTintFill(getLiquidColors()[ball.color]);
            const dropFrameW = dropSprite.width || 129;
            const dropScale = (this.getCachedTubeDisplayWidth() * LIQUID_BALL_DISPLAY_WIDTH_RATIO * LIQUID_BALL_SIZE_SCALE) / dropFrameW;
            dropSprite.setScale(dropScale);
            this.add(dropSprite);
            this.sendToBack(dropSprite);
            this.moveAbove(dropSprite, this.tubeMouthImage);

            this.scene.tweens.add({
                targets: dropSprite,
                y: targetY,
                duration: 300,
                ease: 'Quad.easeIn',
                onComplete: () => {
                    dropSprite.destroy();
                    this.scene.sound.play('落下');
                    // 落地后：水位逐渐上升，水花随液面上升
                    this.animateWaterRiseWithSplash(ball.color, () => {
                        this.checkCompletion();
                        this.checkSameColorHighlight();
                    });
                }
            });
        } else if (!skipDraw) {
            // 仅在非跳过绘制时执行绘制和高亮检查
            this.requestDrawLiquid();
            // 初始化时也检查同色高亮
            this.checkSameColorHighlight();
        }

        return true;
    }

    public removeTopBall(): Ball | null {
        if (this.balls.length === 0) return null;
        const ball = this.balls.pop();
        
        if (ball) {
            // 关键：将球添加到显示列表，确保其可见
            this.add(ball);

            // 设置球为上升状态（按试管缓存宽度算液体帧动画 scale）
            ball.setLiquidState('rising', { tubeDisplayWidth: this.getCachedTubeDisplayWidth() });
            
            // 启动水位下降动画
            this.removingBallColor = ball.color;
            const unitHeight = this.currentBallSize + this.currentBallSpacing;
            this.removingBallHeight = unitHeight;
            
            // 立即更新一次以显示完整水位
            this.requestDrawLiquid();
            
            this.scene.tweens.add({
                targets: this,
                removingBallHeight: 0,
                duration: 300, // 约等于上升动画时间
                onUpdate: () => {
                    this.drawLiquidThrottled(33); // 约 30fps 重绘，减轻交互卡顿
                },
                onComplete: () => {
                    this.removingBallColor = null;
                    this.requestDrawLiquid();
                }
            });
        }
        
        // 移除球后检查同色高亮
        this.checkSameColorHighlight();
        return ball || null;
    }

    public removeBall(ball: Ball, options?: { skipDraw?: boolean; skipHighlight?: boolean }) {
        const index = this.balls.indexOf(ball);
        if (index !== -1) {
            this.balls.splice(index, 1);
            // 更新液体显示
            if (!options?.skipDraw) {
                this.requestDrawLiquid();
            }
            // 移除球后检查同色高亮
            if (!options?.skipHighlight) {
                this.checkSameColorHighlight();
            }
        }
    }

    /** 刷新试管内液体显示（球落地后调用，使液面与球列表一致） */
    public updateLiquidDisplay() {
        this.requestDrawLiquid();
    }

    /**
     * 计算指定球数时的液面顶部 Y（试管本地坐标，与 drawLiquid 一致）
     */
    private getSurfaceYForBallCount(ballCount: number): number {
        const unitHeight = this.currentBallSize + this.currentBallSpacing;
        const bottomY = this.currentHeight / 2 - Tube.LIQUID_BOTTOM_BASE_OFFSET * (this.currentHeight / GAME_CONFIG.PORTRAIT.TUBE_HEIGHT);
        return bottomY - ballCount * unitHeight;
    }

    /**
     * 计算水花插入索引：上层液体（Y 小）的水花应在下层（Y 大）之上，即按 Y 升序排列（Y 大的先画=在后层）
     */
    private getSplashInsertIndex(splashY: number): number {
        const tubeMouthIndex = this.list.indexOf(this.tubeMouthImage);
        let insertIndex = tubeMouthIndex;
        for (let i = tubeMouthIndex - 1; i >= 0; i--) {
            const child = this.list[i] as Phaser.GameObjects.GameObject & { getData?: (k: string) => unknown; y?: number };
            if (child?.getData?.('isLiquidSplash') && (child.y ?? 0) > splashY) {
                insertIndex = i + 1;
                break;
            }
        }
        return insertIndex;
    }

    /**
     * 在指定液面位置播放水花动画，颜色使用传入的相邻液体颜色（splash 帧为黑色，需 setTintFill 后再播放）
     * 与管身一致：用首帧纹理创建精灵、setDisplaySize 设显示尺寸（displayWidth = 试管宽，保持宽高比）
     * 渲染优先级：上层液面水花 > 下层液面水花（按 Y 管理）
     */
    public playSplashAtSurface(surfaceY: number, color: BallColor): void {
        const splashSprite = this.scene.add.sprite(0, surfaceY, 'splash_00000');
        splashSprite.setData('isLiquidSplash', true);
        splashSprite.setTintFill(getLiquidColors()[color]);
        const splashW = this.currentWidth * SPLASH_TUBE_WIDTH_RATIO;
        splashSprite.setDisplaySize(splashW, splashW * (splashSprite.height / splashSprite.width));
        splashSprite.setOrigin(0.5, 1);
        const splashY = surfaceY + splashSprite.displayHeight * SPLASH_VERTICAL_OFFSET_RATIO;
        splashSprite.setPosition(0, splashY);
        this.add(splashSprite);
        this.moveTo(splashSprite, this.getSplashInsertIndex(splashY));
        splashSprite.play('liquid_splash');
        splashSprite.on('animationcomplete', () => {
            splashSprite.destroy();
        });
    }

    /**
     * 在当前液面（顶球表面）播放水花，用于球被移除后露出的新液面。
     * 若试管已空则不执行。
     */
    public playSplashAtCurrentSurface(): void {
        if (this.balls.length === 0) return;
        const top = this.getTopBall();
        if (!top) return;
        const surfaceY = this.getSurfaceYForBallCount(this.balls.length);
        this.playSplashAtSurface(surfaceY, top.color);
    }

    /**
     * 顶球下方相邻液体的液面位置与颜色（用于选中顶球上升时，在下方液面播水花）。
     * 若球数 < 2 则无“下方相邻液体”，返回 null。
     */
    public getSurfaceBelowTopBall(): { surfaceY: number; color: BallColor } | null {
        if (this.balls.length < 2) return null;
        const surfaceY = this.getSurfaceYForBallCount(this.balls.length - 1);
        const color = this.balls[this.balls.length - 2].color;
        return { surfaceY, color };
    }

    /** 球落定后水位渐升的动画时长（ms） */
    private static readonly WATER_RISE_DURATION = 350;

    /**
     * 球落定后：水位逐渐上升，水花随液面上升而移动；结束时变为静态液体。
     * 调用前需已把球加入 balls（如 splice 或 addBall 已 push）。
     * @param color 新加入液体的颜色
     * @param onComplete 水位升完后的回调（可做 checkCompletion、层级调整等）
     * @param isReturn 是否为归位动画（仅归位时在相邻液体层顶部添加与上升液体同色的 surface sprite）
     */
    public animateWaterRiseWithSplash(color: BallColor, onComplete?: () => void, isReturn?: boolean): void {
        const unitHeight = this.currentBallSize + this.currentBallSpacing;
        const bottomY = this.currentHeight / 2 - Tube.LIQUID_BOTTOM_BASE_OFFSET * (this.currentHeight / GAME_CONFIG.PORTRAIT.TUBE_HEIGHT);
        const startSurfaceY = bottomY - (this.balls.length - 1) * unitHeight; // 新块未长高时的液面 Y = 相邻液体层顶部

        this.addingBallColor = color;
        this.addingBallHeight = 0;
        if (isReturn) {
            this._isReturnWaterRise = true;
            // 仅在归位时：在上升动画开始时，在相邻液体层顶部添加一个与上升液体同色的 surface sprite
            if (this.scene.textures.exists('liquid_surface')) {
                if (this.returnBoundarySurfaceSprite && this.returnBoundarySurfaceSprite.scene) {
                    this.returnBoundarySurfaceSprite.destroy();
                }
                this.returnBoundarySurfaceSprite = this.scene.add.sprite(0, startSurfaceY, 'liquid_surface');
                this.returnBoundarySurfaceSprite.setOrigin(0.5, 0.5);
                this.returnBoundarySurfaceSprite.setTintFill(getLiquidColors()[color]);
                const w = this.currentWidth;
                const frame = this.returnBoundarySurfaceSprite.frame;
                const fw = (frame?.width ?? this.returnBoundarySurfaceSprite.width) || 1;
                const fh = (frame?.height ?? this.returnBoundarySurfaceSprite.height) || 1;
                const h = Math.max(8, (fh / fw) * w);
                this.returnBoundarySurfaceSprite.setDisplaySize(w, h);
                this.returnBoundarySurfaceSprite.setDepth(1);
                if (this.liquidMask) this.returnBoundarySurfaceSprite.setMask(this.liquidMask);
                this.liquidContainer.add(this.returnBoundarySurfaceSprite);
                this.liquidContainer.bringToTop(this.returnBoundarySurfaceSprite);
            }
        }
        this.requestDrawLiquid();

        const splashSprite = this.scene.add.sprite(0, startSurfaceY, 'splash_00000');
        splashSprite.setData('isLiquidSplash', true);
        splashSprite.setTintFill(getLiquidColors()[color]);
        const splashW = this.currentWidth * SPLASH_TUBE_WIDTH_RATIO;
        splashSprite.setDisplaySize(splashW, splashW * (splashSprite.height / splashSprite.width));
        splashSprite.setOrigin(0.5, 1);
        const splashY0 = startSurfaceY + splashSprite.displayHeight * SPLASH_VERTICAL_OFFSET_RATIO;
        splashSprite.setPosition(0, splashY0);
        this.add(splashSprite);
        this.moveTo(splashSprite, this.getSplashInsertIndex(splashY0));
        splashSprite.play('liquid_splash');
        splashSprite.on('animationcomplete', () => {
            if (this.waterRiseSplashSprite === splashSprite) this.waterRiseSplashSprite = null;
            splashSprite.destroy();
        });
        this.waterRiseSplashSprite = splashSprite;

        // 延迟一帧再启动 tween，确保首帧用 addingBallHeight=0 绘制的液面（含下边缘 surface）先被渲染
        this.scene.time.delayedCall(0, () => {
            if (this.waterRiseTween != null || this.addingBallColor === null) return; // 已被取消
            this.waterRiseTween = this.scene.tweens.add({
                targets: this,
                addingBallHeight: unitHeight,
                duration: Tube.WATER_RISE_DURATION,
                ease: 'Quad.easeOut',
                onUpdate: () => {
                    this.drawLiquidThrottled(33); // 约 30fps 重绘，减轻交互卡顿
                    const surfaceY = startSurfaceY - this.addingBallHeight;
                    splashSprite.setPosition(0, surfaceY + splashSprite.displayHeight * SPLASH_VERTICAL_OFFSET_RATIO);
                },
                onComplete: () => {
                    this.waterRiseTween = null;
                    this.waterRiseSplashSprite = null;
                    this.addingBallColor = null;
                    this.addingBallHeight = 0;
                    if (this._isReturnWaterRise) {
                        this._isReturnWaterRise = false;
                        if (this.returnBoundarySurfaceSprite && this.returnBoundarySurfaceSprite.scene) {
                            this.returnBoundarySurfaceSprite.destroy();
                            this.returnBoundarySurfaceSprite = null;
                        }
                    }
                    this.requestDrawLiquid();
                    onComplete?.();
                }
            });
        });
    }

    /**
     * 取消未完成的水位渐升动画（如归位过程中再次选中试管时调用），避免液面与选中逻辑冲突。
     */
    public cancelWaterRiseAnimation(): void {
        if (this.waterRiseTween) {
            this.waterRiseTween.stop();
            this.waterRiseTween = null;
        }
        if (this.waterRiseSplashSprite && this.waterRiseSplashSprite.scene) {
            this.waterRiseSplashSprite.destroy();
            this.waterRiseSplashSprite = null;
        }
        if (this._isReturnWaterRise) {
            this._isReturnWaterRise = false;
            if (this.returnBoundarySurfaceSprite && this.returnBoundarySurfaceSprite.scene) {
                this.returnBoundarySurfaceSprite.destroy();
                this.returnBoundarySurfaceSprite = null;
            }
        }
        this.addingBallColor = null;
        this.addingBallHeight = 0;
        this.requestDrawLiquid();
    }

    /** 设置顶球是否在试管外悬浮（选中时 true，取消选中或移走后 false），用于 drawLiquid 是否排除顶球 */
    public setTopBallFloating(floating: boolean) {
        if (this._topBallFloating === floating) return;
        this._topBallFloating = floating;
    }

    public getTopBall(): Ball | null {
        if (this.balls.length === 0) return null;
        return this.balls[this.balls.length - 1];
    }

    public getTopSameColorBalls(): Ball[] {
        if (this.balls.length === 0) return [];
        
        const topBall = this.balls[this.balls.length - 1];
        const color = topBall.color;
        const result: Ball[] = [];
        
        // 从上往下遍历
        for (let i = this.balls.length - 1; i >= 0; i--) {
            if (this.balls[i].color === color) {
                result.push(this.balls[i]);
            } else {
                break;
            }
        }
        
        return result;
    }

    /**
     * 调试统计：用于排查资源/对象是否持续增长
     */
    public getDebugStats(): {
        balls: number;
        boundarySprites: number;
        activeSplashes: number;
        hasReturnBoundary: boolean;
        hasAddingBlock: boolean;
        drawLiquidCalls: number;
    } {
        let activeSplashes = 0;
        for (const child of this.list) {
            const withData = child as Phaser.GameObjects.GameObject & { getData?: (key: string) => unknown };
            if (withData.getData?.('isLiquidSplash')) activeSplashes++;
        }
        return {
            balls: this.balls.length,
            boundarySprites: this.boundarySurfaceSprites.length,
            activeSplashes,
            hasReturnBoundary: this.returnBoundarySurfaceSprite != null,
            hasAddingBlock: this.addingBlockBottomSurfaceSprite != null,
            drawLiquidCalls: this._debugDrawLiquidCount
        };
    }

    /** 调试统计：重置 drawLiquid 调用计数 */
    public resetDebugCounters(): void {
        this._debugDrawLiquidCount = 0;
    }

    public getTopColor(): BallColor | null {
        const topBall = this.getTopBall();
        return topBall ? topBall.color : null;
    }

    public isFull(): boolean {
        return this.balls.length >= GAME_CONFIG.TUBE_CAPACITY;
    }

    public isEmpty(): boolean {
        return this.balls.length === 0;
    }

    public getBallY(index: number): number {
        // 试管底部位置
        const bottomY = this.currentHeight / 2 - 25 * (this.currentHeight / GAME_CONFIG.PORTRAIT.TUBE_HEIGHT); // 底部留白按比例缩放
        // 从下往上堆叠
        return bottomY - index * (this.currentBallSize + this.currentBallSpacing) - this.currentBallSize / 2;
    }

    public checkCompletion() {
        if (this.balls.length !== GAME_CONFIG.TUBE_CAPACITY) return;

        const firstColor = this.balls[0].color;
        const allSameColor = this.balls.every(ball => ball.color === firstColor);

        if (allSameColor && !this.isCompleted) {
            this.completeTube(firstColor);
        }
    }

    /**
     * 检查是否需要显示同色高亮
     * 条件：不为空、不为满、只有一种颜色、未完成
     */
    public checkSameColorHighlight() {
        
        // 如果已完成，不需要同色高亮
        if (this.isCompleted) {
            this.hideSameColorHighlight();
            return;
        }

        // 条件：不为空、不为满
        const notEmpty = this.balls.length > 0;
        const notFull = this.balls.length < GAME_CONFIG.TUBE_CAPACITY;
        
        if (!notEmpty || !notFull) {
            this.hideSameColorHighlight();
            return;
        }

        // 检查是否只有一种颜色
        const firstColor = this.balls[0].color;
        const onlyOneColor = this.balls.every(ball => ball.color === firstColor);
        
        if (onlyOneColor) {
            this.showSameColorHighlight(firstColor);
        } else {
            this.hideSameColorHighlight();
        }
    }

    /**
     * 显示同色高亮效果 - 淡入高亮图层覆盖普通试管
     */
    private showSameColorHighlight(color: BallColor) {
        // 如果已经是同色高亮且颜色相同，不需要重复处理
        if (this.isSameColorHighlighted && this.currentHighlightColor === color) {
            return;
        }

        // 停止之前的过渡动画
        if (this.highlightTween) {
            this.highlightTween.stop();
            this.highlightTween = null;
        }
        
        this.isSameColorHighlighted = true;
        this.currentHighlightColor = color;

        // 确保普通试管可见
        this.tubeBodyImage.setVisible(true);
        this.tubeMouthImage.setVisible(true);
        this.tubeBodyImage.setAlpha(1);
        this.tubeMouthImage.setAlpha(1);

        // 设置高亮纹理
        this.highlightBodyImage.setTexture(`highlight_${color}_body`);
        this.highlightMouthImage.setTexture(`highlight_${color}_mouth`);
        
        // 确保高亮图片按比例放大
        this.highlightBodyImage.setDisplaySize(
            this.tubeBodyImage.displayWidth * Tube.HIGHLIGHT_WIDTH_RATIO,
            this.tubeBodyImage.displayHeight * Tube.HIGHLIGHT_HEIGHT_RATIO
        );
        this.highlightMouthImage.setDisplaySize(
            this.tubeMouthImage.displayWidth * Tube.HIGHLIGHT_WIDTH_RATIO,
            this.tubeMouthImage.displayHeight * Tube.HIGHLIGHT_HEIGHT_RATIO
        );
        
        // 淡入高亮图层，半透明叠加在普通试管上方（保持普通试管可见）
        this.highlightTween = this.scene.tweens.add({
            targets: [this.highlightBodyImage, this.highlightMouthImage],
            alpha: 0.85,  // 半透明叠加，让普通试管透出来
            duration: 300,
            ease: 'Power2'
        });
    }

    /**
     * 隐藏同色高亮效果 - 淡出高亮图层，恢复普通试管
     */
    private hideSameColorHighlight() {
        if (!this.isSameColorHighlighted) {
            return;
        }

        // 停止之前的过渡动画
        if (this.highlightTween) {
            this.highlightTween.stop();
            this.highlightTween = null;
        }
        
        this.isSameColorHighlighted = false;
        this.currentHighlightColor = null;

        // 淡出高亮图层（普通试管一直可见，无需处理）
        this.highlightTween = this.scene.tweens.add({
            targets: [this.highlightBodyImage, this.highlightMouthImage],
            alpha: 0,
            duration: 300,
            ease: 'Power2'
        });
    }

    private completeTube(color: BallColor) {
        this.isCompleted = true;
        
        // 停止过渡动画
        if (this.highlightTween) {
            this.highlightTween.stop();
            this.highlightTween = null;
        }
        
        // 先重置同色高亮状态
        this.isSameColorHighlighted = false;
        this.currentHighlightColor = null;

        // 1. 播放音效
        this.scene.sound.play('完成');

        // 2. 播放粒子特效和烟花特效 (使用SpineLoader)
        const bottomY = this.currentHeight / 2;
        const offScreenY = 5000; // 屏幕外的Y坐标
        
        // 2a. 创建粒子特效
        try {
            this.particleEffect = SpineLoader.create(this.scene, 0, offScreenY, 'particle', 'High', false);
            this.particleEffect.setScale(this.currentWidth / GAME_CONFIG.PORTRAIT.TUBE_WIDTH);
            this.particleEffect.setDepth(100);
            this.add(this.particleEffect);
            
            // 100ms后移动到试管底部位置
            this.scene.time.delayedCall(100, () => {
                if (this.particleEffect) {
                    this.particleEffect.setPosition(0, bottomY);
                }
            });
        } catch (e) {
            console.warn('Particle spine animation failed to load:', e);
        }

        // 2b. 创建烟花特效
        try {
            this.fireworkEffect = SpineLoader.create(this.scene, 0, offScreenY, 'firework', 'high', false);
            this.fireworkEffect.setScale(this.currentWidth / GAME_CONFIG.PORTRAIT.TUBE_WIDTH);
            this.fireworkEffect.setDepth(101);
            this.add(this.fireworkEffect);
            
            // 100ms后移动到试管底部位置
            this.scene.time.delayedCall(100, () => {
                if (this.fireworkEffect) {
                    this.fireworkEffect.setPosition(0, bottomY);
                }
            });
        } catch (e) {
            console.warn('Firework spine animation failed to load:', e);
        }

        // 3. 先创建蜡烛（透明状态）
        this.candleImage = this.scene.add.image(0, 0, `candle_${color}`);
        const candleScale = this.currentHeight / this.candleImage.height;
        const finalScale = candleScale * GAME_CONFIG.CANDLE_SCALE_FACTOR;
        this.candleImage.setScale(finalScale);
        
        // 计算位置偏移，使蜡烛底部与试管底部对齐
        // 蜡烛放大后高度增加，需要向上移动以保持底部对齐
        const heightDiff = this.currentHeight * (GAME_CONFIG.CANDLE_SCALE_FACTOR - 1);
        const candleOffsetY = -heightDiff / 2;
        this.candleImage.setPosition(0, candleOffsetY);
        
        this.candleImage.setAlpha(0);
        this.add(this.candleImage);

        // 3a. 创建火焰动画精灵（透明状态）
        this.fireSprite = this.scene.add.sprite(0, 0, 'fire_00000');
        // 计算蜡烛顶部位置
        const candleTopY = candleOffsetY - (this.candleImage.displayHeight / 2);
        // 根据蜡烛宽度调整火焰大小
        const fireScale = (this.currentWidth / GAME_CONFIG.PORTRAIT.TUBE_WIDTH) * 0.8; // 火焰稍小一些
        this.fireSprite.setScale(fireScale);
        // 应用向下偏移量
        this.fireSprite.setPosition(0, candleTopY + Tube.FIRE_OFFSET_Y);
        this.fireSprite.setAlpha(0);
        this.add(this.fireSprite);
        
        // 播放火焰动画（循环）
        if (this.scene.anims.exists('fire_animation')) {
            this.fireSprite.play('fire_animation');
        }
        
        // 确保层级正确：蜡烛 < 火焰 < 特效
        this.bringToTop(this.candleImage);
        this.bringToTop(this.fireSprite);
        if (this.particleEffect) {
            this.bringToTop(this.particleEffect);
        }

        // 4. 同时淡出试管/球 和 淡入蜡烛
        const fadeOutTargets = [
            this.tubeBodyImage,
            this.tubeMouthImage,
            this.highlightBodyImage,
            this.highlightMouthImage,
            ...this.balls
        ];

        // 淡出试管和球
        this.scene.tweens.add({
            targets: fadeOutTargets,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                // 隐藏试管和高亮
                this.tubeBodyImage.setVisible(false);
                this.tubeMouthImage.setVisible(false);
                this.highlightBodyImage.setVisible(false);
                this.highlightMouthImage.setVisible(false);
                
                // 隐藏所有球
                this.balls.forEach(ball => ball.setVisible(false));
            }
        });

        // 同时淡入蜡烛和火焰，在动画完成后通知试管完成
        this.scene.tweens.add({
            targets: [this.candleImage, this.fireSprite],
            alpha: 1,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                // 动画完成后再通知试管完成
                // Board.ts 通过监听 tube-complete-internal 来统计完成数并发送正确的 tube-completed 事件
                EventBus.emit('tube-complete-internal', this.id);
            }
        });
    }

}
