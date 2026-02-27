import { Scene } from 'phaser';
import { BallColor, GAME_CONFIG, LIQUID_BALL_DISPLAY_WIDTH_RATIO, LIQUID_BALL_SIZE_SCALE, BALL_EXPRESSION_OFFSET_X, BALL_EXPRESSION_OFFSET_Y, BALL_EXPRESSION_SCALE_RATIO } from '../constants/GameConstants';
import { getLiquidColors } from '../../utils/outputConfigLoader';

export class Ball extends Phaser.GameObjects.Container {
    // 光晕效果参数（3->1 减少每球 2 个 Sprite，提升流畅度）
    private static readonly GLOW_LAYER_COUNT = 1;
    private static readonly GLOW_BASE_SCALE = 1.15; // 最内层光晕缩放倍数
    private static readonly GLOW_SCALE_STEP = 0.08; // 每层光晕的缩放增量
    private static readonly GLOW_BASE_ALPHA = 0.6; // 最内层光晕透明度
    private static readonly GLOW_ALPHA_STEP = -0.15; // 每层光晕的透明度递减量（外层更透明）
    private static readonly GLOW_BASE_LIGHTEN = 0.4; // 最内层光晕颜色变浅比例
    private static readonly GLOW_LIGHTEN_STEP = 0.2; // 每层光晕的颜色变浅增量（外层更浅）
    private static readonly GLOW_BLEND_MODE = Phaser.BlendModes.SCREEN; // 光晕混合模式

    private ballImage: Phaser.GameObjects.Image;
    private candleImage: Phaser.GameObjects.Image;
    private liquidSprite: Phaser.GameObjects.Sprite; // 液体动画精灵
    private ballExpressionSprite: Phaser.GameObjects.Sprite | null = null; // 选中升起时播放的圆球表情动画
    private glowSprites: Phaser.GameObjects.Sprite[] = []; // 多层光晕精灵数组
    /** 选中悬浮时容器上下浮动的 tween（仅液体状态使用） */
    private containerHoverTween: Phaser.Tweens.Tween | null = null;
    public color: BallColor;
    public isCandle: boolean = false;
    private baseSize: number = GAME_CONFIG.BALL_SIZE; // 基准尺寸

    constructor(scene: Scene, x: number, y: number, color: BallColor) {
        super(scene, x, y);
        this.color = color;

        // 创建球的图片
        this.ballImage = scene.add.image(0, 0, `ball_${color}`);
        this.add(this.ballImage);

        // 创建液体动画精灵（初始隐藏）
        this.liquidSprite = scene.add.sprite(0, 0, 'liquid_move');
        this.liquidSprite.setVisible(false);
        this.add(this.liquidSprite);

        // 创建多层光晕精灵（从里到外，颜色逐渐变浅）
        for (let i = 0; i < Ball.GLOW_LAYER_COUNT; i++) {
            const glowSprite = scene.add.sprite(0, 0, 'liquid_move');
            glowSprite.setVisible(false);
            glowSprite.setBlendMode(Ball.GLOW_BLEND_MODE);
            // 内层透明度高，外层透明度低
            glowSprite.setAlpha(Ball.GLOW_BASE_ALPHA + i * Ball.GLOW_ALPHA_STEP);
            this.add(glowSprite);
            this.glowSprites.push(glowSprite);
            // 确保光晕在液体后面（最外层在最后面）
            this.sendToBack(glowSprite);
        }

        // 创建蜡烛图片（初始隐藏）
        this.candleImage = scene.add.image(0, 0, `candle_${color}`);
        this.candleImage.setVisible(false);
        this.add(this.candleImage);

        // 确保球和蜡烛的显示尺寸一致
        this.normalizeSizes();

        scene.add.existing(this);
    }

    /**
     * 将颜色变浅（与白色混合），用于光晕效果
     * @param color 原始颜色值（十六进制，如 0xff0000）
     * @param lightenRatio 变浅比例（0-1），0.5 表示混合 50% 白色
     * @returns 变浅后的颜色值
     */
    private lightenColor(color: number, lightenRatio: number = 0.5): number {
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

    /**
     * 根据试管 displayWidth 计算液体精灵 scale：displayWidth = 试管宽 * 比例，保持素材宽高比。
     * 补偿 Ball 容器的 scale，使液体最终视觉尺寸一致（多操作后球可能被 setScale，导致子节点被缩放）。
     * 确保不小于配置基准，避免异常缩小。
     */
    private setLiquidScaleFromTubeWidth(tubeDisplayWidth: number) {
        const configW = this.scene.scale.height > this.scene.scale.width
            ? GAME_CONFIG.PORTRAIT.TUBE_WIDTH
            : GAME_CONFIG.LANDSCAPE.TUBE_WIDTH;
        const w = (tubeDisplayWidth != null && tubeDisplayWidth > 0)
            ? Math.max(tubeDisplayWidth, configW)
            : configW;

        const frameW = this.liquidSprite.width || 129;
        const targetW = w * LIQUID_BALL_DISPLAY_WIDTH_RATIO * LIQUID_BALL_SIZE_SCALE;
        const ballScale = Math.max(0.01, this.scaleX);
        const scale = (targetW / frameW) / ballScale;
        this.liquidSprite.setScale(scale);
        // 多层光晕精灵逐渐放大，形成从里到外的渐变效果
        this.glowSprites.forEach((glowSprite, index) => {
            const glowScale = Ball.GLOW_BASE_SCALE + index * Ball.GLOW_SCALE_STEP;
            glowSprite.setScale(scale * glowScale);
        });
    }

    /**
     * 显示并播放圆球表情动画（选中升起时）
     */
    private showBallExpression(tubeDisplayWidth?: number): void {
        if (!this.scene.textures.exists('圆球表情_00000')) return;
        if (!this.ballExpressionSprite) {
            this.ballExpressionSprite = this.scene.add.sprite(BALL_EXPRESSION_OFFSET_X, BALL_EXPRESSION_OFFSET_Y, '圆球表情_00000');
            this.ballExpressionSprite.setOrigin(0.5, 0.5);
            this.add(this.ballExpressionSprite);
            if (this.scene.anims.exists('ball_expression')) {
                this.ballExpressionSprite.play('ball_expression');
            }
        }
        this.ballExpressionSprite.setVisible(true);
        this.updateBallExpressionScale(tubeDisplayWidth);
    }

    /**
     * 隐藏圆球表情动画
     */
    private hideBallExpression(): void {
        if (this.ballExpressionSprite) {
            this.ballExpressionSprite.setVisible(false);
        }
    }

    /**
     * 更新圆球表情精灵的缩放，与液体精灵 displayWidth 保持一致（避免尺寸不一致）
     * 补偿 Ball 容器的 scale，与 setLiquidScaleFromTubeWidth 一致。
     */
    private updateBallExpressionScale(tubeDisplayWidth?: number): void {
        if (!this.ballExpressionSprite || !this.ballExpressionSprite.visible) return;
        const configW = this.scene.scale.height > this.scene.scale.width
            ? GAME_CONFIG.PORTRAIT.TUBE_WIDTH
            : GAME_CONFIG.LANDSCAPE.TUBE_WIDTH;
        const w = (tubeDisplayWidth != null && tubeDisplayWidth > 0)
            ? Math.max(tubeDisplayWidth, configW)
            : configW;
        const targetW = w * LIQUID_BALL_DISPLAY_WIDTH_RATIO * LIQUID_BALL_SIZE_SCALE * BALL_EXPRESSION_SCALE_RATIO;
        const ballScale = Math.max(0.01, this.scaleX);
        const frameW = this.ballExpressionSprite.width || 1;
        const scale = frameW > 0 ? (targetW / frameW) / ballScale : BALL_EXPRESSION_SCALE_RATIO / ballScale;
        this.ballExpressionSprite.setScale(scale);
    }

    /**
     * 横竖屏切换后若液体精灵仍在显示，可调用此方法用当前试管宽刷新 scale
     */
    public updateLiquidScale(tubeDisplayWidth: number) {
        if (this.liquidSprite.visible) {
            this.setLiquidScaleFromTubeWidth(tubeDisplayWidth);
        }
        if (this.ballExpressionSprite?.visible) {
            this.updateBallExpressionScale(tubeDisplayWidth);
        }
    }

    /**
     * 同步所有光晕精灵的动画和状态
     */
    private syncGlowSprites(animationKey: string, loop: boolean = false) {
        this.glowSprites.forEach(glowSprite => {
            if (!glowSprite.visible) return;
            
            // 同步动画
            if (glowSprite.anims.currentAnim?.key !== animationKey) {
                glowSprite.play(animationKey, loop);
            }
            
            // 同步帧（使用 AnimationState.setCurrentFrame 按动画帧同步，避免 setFrame 错误）
            if (this.liquidSprite.anims.currentFrame) {
                const targetFrame = this.liquidSprite.anims.currentFrame;
                if (glowSprite.anims.currentFrame?.index !== targetFrame.index) {
                    glowSprite.anims.setCurrentFrame(targetFrame);
                }
            }
        });
    }

    /**
     * 设置光晕同步监听器
     */
    private setupGlowSync() {
        // 移除之前的监听器（如果存在）
        this.liquidSprite.off('animationupdate');
        
        // 添加新的监听器，实时同步所有光晕帧（使用 setCurrentFrame 按动画帧同步）
        this.liquidSprite.on('animationupdate', () => {
            const targetFrame = this.liquidSprite.anims.currentFrame;
            if (targetFrame) {
                this.glowSprites.forEach(glowSprite => {
                    if (glowSprite.visible && glowSprite.anims.currentFrame?.index !== targetFrame.index) {
                        glowSprite.anims.setCurrentFrame(targetFrame);
                    }
                });
            }
        });
    }

    /**
     * 设置液体状态
     * @param options.tubeDisplayWidth 试管 displayWidth，用于按比例与宽高比计算液体帧动画 scale（横竖屏会变）
     */
    public setLiquidState(state: 'idle' | 'moving' | 'hidden' | 'rising', options?: { tubeDisplayWidth?: number }) {
        const liquidColor = getLiquidColors()[this.color];

        if (state === 'hidden') {
            this.ballImage.setVisible(false);
            this.liquidSprite.setVisible(false);
            this.hideBallExpression();
            this.glowSprites.forEach(glowSprite => {
                glowSprite.setVisible(false);
                if (glowSprite.parentContainer === this) this.remove(glowSprite);
            });
            this.candleImage.setVisible(false);
            // 移除动画同步监听器
            this.liquidSprite.off('animationupdate');
        } else if (state === 'moving') {
            this.ballImage.setVisible(false);
            this.candleImage.setVisible(false);
            this.hideBallExpression();
            this.liquidSprite.setVisible(true);
            // 确保光晕在显示列表中，然后显示
            this.glowSprites.forEach((glowSprite, index) => {
                if (glowSprite.parentContainer !== this) {
                    this.add(glowSprite);
                    this.sendToBack(glowSprite);
                }
                glowSprite.setVisible(true);
                const lightenRatio = Ball.GLOW_BASE_LIGHTEN + index * Ball.GLOW_LIGHTEN_STEP;
                const glowColor = this.lightenColor(liquidColor, lightenRatio);
                glowSprite.setTintFill(glowColor);
            });
            
            // 设置液体颜色
            this.liquidSprite.setTintFill(liquidColor); // 黑色帧按形状渲染为液体颜色
            
            // 播放动画
            this.liquidSprite.play('liquid_move', true); // 移动/下降时使用 移动和下降 帧动画
            this.syncGlowSprites('liquid_move', true);
            this.setupGlowSync(); // 设置实时同步

            const tubeW = options?.tubeDisplayWidth ?? (this.scene.scale.height > this.scene.scale.width ? GAME_CONFIG.PORTRAIT.TUBE_WIDTH : GAME_CONFIG.LANDSCAPE.TUBE_WIDTH);
            this.setLiquidScaleFromTubeWidth(tubeW);
        } else if (state === 'rising') {
            this.ballImage.setVisible(false);
            this.candleImage.setVisible(false);
            this.liquidSprite.setVisible(true);
            this.glowSprites.forEach((glowSprite, index) => {
                if (glowSprite.parentContainer !== this) {
                    this.add(glowSprite);
                    this.sendToBack(glowSprite);
                }
                glowSprite.setVisible(true);
                const lightenRatio = Ball.GLOW_BASE_LIGHTEN + index * Ball.GLOW_LIGHTEN_STEP;
                const glowColor = this.lightenColor(liquidColor, lightenRatio);
                glowSprite.setTintFill(glowColor);
            });
            this.liquidSprite.setTintFill(liquidColor);

            const tubeW = options?.tubeDisplayWidth ?? (this.scene.scale.height > this.scene.scale.width ? GAME_CONFIG.PORTRAIT.TUBE_WIDTH : GAME_CONFIG.LANDSCAPE.TUBE_WIDTH);
            this.setLiquidScaleFromTubeWidth(tubeW);
            this.showBallExpression(tubeW);
            this.scene.time.delayedCall(0, () => {
                if (!this.scene || !this.liquidSprite.visible) return;
                this.setLiquidScaleFromTubeWidth(tubeW);
                this.updateBallExpressionScale(tubeW);
            });

            this.clearMask();
            if (this.parentContainer) {
                this.parentContainer.bringToTop(this);
            } else {
                this.setDepth(1000);
            }

            this.liquidSprite.play('liquid_up');
            this.syncGlowSprites('liquid_up', false);
            this.setupGlowSync();
            this.liquidSprite.once('animationcomplete', () => {
                if (this.liquidSprite.visible) {
                    this.liquidSprite.play('liquid_still', true);
                    this.syncGlowSprites('liquid_still', true);
                    this.setupGlowSync();
                }
            });
        } else {
            // idle 状态
            this.hideBallExpression();
            if (!this.isCandle) {
                this.ballImage.setVisible(true);
            } else {
                this.candleImage.setVisible(true);
            }
            this.liquidSprite.setVisible(false);
            this.glowSprites.forEach(glowSprite => {
                glowSprite.setVisible(false);
                if (glowSprite.parentContainer === this) this.remove(glowSprite);
            });
            this.liquidSprite.off('animationupdate');
        }
    }

    /**
     * 统一球和蜡烛的显示尺寸
     * 以球的尺寸为基准，调整蜡烛的缩放比例
     */
    private normalizeSizes() {
        // 获取原始尺寸
        const ballWidth = this.ballImage.width;
        const ballHeight = this.ballImage.height;
        const candleWidth = this.candleImage.width;
        const candleHeight = this.candleImage.height;

        // 计算蜡烛需要的缩放比例，使其与球的尺寸一致
        if (candleWidth > 0 && candleHeight > 0) {
            const scaleX = ballWidth / candleWidth;
            const scaleY = ballHeight / candleHeight;
            // 使用统一的缩放比例，保持宽高比
            const scale = Math.min(scaleX, scaleY);
            this.candleImage.setScale(scale);
        }
    }

    public transformToCandle() {
        if (this.isCandle) return;
        
        this.isCandle = true;
        
        // 停止悬浮动画
        this.stopHoverAnimation();
        
        // 播放转换动画
        this.scene.tweens.add({
            targets: this.ballImage,
            alpha: 0,
            duration: 500,
            ease: 'Power2'
        });

        this.candleImage.setAlpha(0);
        this.candleImage.setVisible(true);
        
        this.scene.tweens.add({
            targets: this.candleImage,
            alpha: 1,
            duration: 500,
            ease: 'Power2'
        });
    }

    public reset() {
        this.isCandle = false;
        this.ballImage.setAlpha(1);
        this.ballImage.setVisible(true);
        this.candleImage.setAlpha(0);
        this.candleImage.setVisible(false);
        this.stopHoverAnimation();
    }

    public startHoverAnimation() {
        if (this.isCandle) return;
        
        this.scene.tweens.add({
            targets: this.ballImage,
            y: -10,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * 选中悬浮时：对容器做上下浮动（配合液体帧动画「保持不动」循环使用）
     * @param containerTopY 当前容器 Y（试管坐标系），将在此高度与 containerTopY-10 之间循环
     */
    public startContainerHoverAnimation(containerTopY: number) {
        if (this.containerHoverTween) {
            this.containerHoverTween.stop();
            this.containerHoverTween = null;
        }
        this.containerHoverTween = this.scene.tweens.add({
            targets: this,
            y: containerTopY - 10,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    /** 光晕已移除，保留空实现以兼容调用方 */
    public showGlow(_withBreathing?: boolean) {}

    /** 光晕已移除，保留空实现以兼容调用方 */
    public hideGlow() {}

    public stopHoverAnimation() {
        this.scene.tweens.killTweensOf(this.ballImage);
        this.ballImage.y = 0;
        if (this.containerHoverTween) {
            this.containerHoverTween.stop();
            this.containerHoverTween = null;
        }
    }
}