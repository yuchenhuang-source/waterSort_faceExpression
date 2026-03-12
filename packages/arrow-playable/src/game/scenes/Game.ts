import { Scene } from 'phaser';
import { Board } from '../components/Board';
import { LevelData } from '../types/Board';
import { EventBus } from '../EventBus';
import { getLevelDataAsync } from '../config/level-config';
import download from './constants/download';
import { canArrowExit } from '../utils/BoardUtils';
import { getOutputConfigValueAsync } from '../../utils/outputConfigLoader';

/** 横竖屏尺寸 */
const ORIENTATION = {
  /** 竖屏 */
  PORTRAIT_WIDTH: 1080,
  PORTRAIT_HEIGHT: 1920,
  /** 横屏 */
  LANDSCAPE_WIDTH: 1920,
  LANDSCAPE_HEIGHT: 1080,
};

/** 根据 window 尺寸返回当前应使用的游戏宽高 */
function getGameSize(): { w: number; h: number } {
  const isLandscape = typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
  return isLandscape
    ? { w: ORIENTATION.LANDSCAPE_WIDTH, h: ORIENTATION.LANDSCAPE_HEIGHT }
    : { w: ORIENTATION.PORTRAIT_WIDTH, h: ORIENTATION.PORTRAIT_HEIGHT };
}

/** 布局常量 */
const LAYOUT = {
  /** 左右两侧边距 */
  PADDING_X: 40,
  /** 棋盘上方预留空间（放标题 + 说明文字） */
  PADDING_TOP: 160,
  /** 棋盘下方预留空间（放调试信息等） */
  PADDING_BOTTOM: 140,

  /** 格子最大尺寸（避免小谜题格子过大） */
  MAX_CELL_SIZE: 100,
  /** 格子最小尺寸（保证可点击） */
  MIN_CELL_SIZE: 16,

  /** 横屏下箭头区域固定高度，宽度按棋盘比例自适应 */
  LANDSCAPE_ARROW_AREA_HEIGHT: 900,

  /** 横屏谜题区域占屏幕宽度比例（美人鱼最大可放大到此宽度） */
  LANDSCAPE_PUZZLE_WIDTH_RATIO: 2 / 3,
  /** 横屏右侧缩放条宽度 */
  ZOOM_BAR_WIDTH: 56,
  /** 缩放步进 */
  ZOOM_STEP: 0.25,
};

export class Game extends Scene
{
    private board: Board | null = null;
    private levelData: LevelData | null = null;
    private uiContainer: Phaser.GameObjects.Container | null = null;
    private ctaButton: Phaser.GameObjects.Image | null = null;
    private ctaBreathTween: Phaser.Tweens.Tween | null = null; // CTA按钮呼吸动画
    private boundResize: () => void;
    private eliminatedArrowIds: string[] = []; // 保存已消除的箭头ID列表
    private guideHand: Phaser.GameObjects.Image | null = null; // 引导手势
    private guideTween: Phaser.Tweens.Tween | null = null; // 引导动画
    private guideLoopTimer: Phaser.Time.TimerEvent | null = null; // 点击循环里“下一次按压”的延迟，隐藏时必须取消
    private guideSessionId: number = 0; // 当前引导会话 id，隐藏时递增，用于丢弃过期回调
    private hasShownGuide: boolean = false; // 是否已显示过引导
    private guideArrowId: string | null = null; // 当前被引导的箭头 ID，用于高亮与闪烁
    private guideIdleTimer: Phaser.Time.TimerEvent | null = null; // 5 秒无点击后再次弹出引导的定时器
    private boundGuideIdlePointerDown: (() => void) | undefined; // 用于移除的全局点击监听
    
    // 下载跳转配置
    private downloadConfig: {
      triggerByClearCount: boolean;
      clearCountThreshold: number;
      triggerByProgress: boolean;
      progressThreshold: number;
      triggerByAreaProgress: boolean;
      areaProgressThreshold: number;
      autoJumpDelay: number;
    } | null = null;
    
    // 计数变量
    private clearCount: number = 0; // 成功消除次数
    private clearedArrowTotal: number = 0; // 累计消除箭头数
    private totalArrows: number = 0; // 总箭头数（用于计算进度）
    private totalGridCells: number = 0; // 美人鱼线条所占格子总数（用于面积比例进度）
    private clearedGridCells: number = 0; // 已消除线条占用的格子数

    // 音频：BGM 仅首次交互后播放一次
    private bgmStarted: boolean = false;

    // 横屏谜题缩放：仅横屏使用
    private boardContainer: Phaser.GameObjects.Container | null = null;
    private zoomBarContainer: Phaser.GameObjects.Container | null = null;
    private puzzleZoom: number = 1;
    /** 横屏拖拽屏幕区域控制的平移 */
    private puzzlePanX: number = 0;
    private puzzlePanY: number = 0;
    /** 横屏时谜题区域宽度、棋盘宽高与垂直偏移，用于更新 container 位置 */
    private landscapePuzzleState: {
      puzzleAreaWidth: number;
      boardWidth: number;
      boardHeight: number;
      offsetY: number;
    } | null = null;
    /** 缩放条滑块拖拽中（滑块改为调节放大尺寸） */
    private zoomSliderDragging: boolean = false;
    /** 拖拽谜题区域平移中 */
    private puzzleAreaPanning: boolean = false;
    private lastPanPointerX: number = 0;
    private lastPanPointerY: number = 0;
    private panStartX: number = 0;
    private panStartY: number = 0;
    /** 当前 pointer 是否在缩放条上按下（用于不触发 pan） */
    private zoomBarPointerDown: boolean = false;
    private boundZoomPointerMove?: (ptr: Phaser.Input.Pointer) => void;
    private boundZoomPointerUp?: () => void;
    private boundPanPointerDown?: (ptr: Phaser.Input.Pointer) => void;
    private boundPanPointerMove?: (ptr: Phaser.Input.Pointer) => void;
    private boundPanPointerUp?: () => void;

    constructor ()
    {
        super('Game');
        this.boundResize = () => this.onWindowResize();
    }

    async create ()
    {
        // ── 1. 按当前窗口横竖屏设置画布分辨率 ──
        const size = getGameSize();
        this.scale.setGameSize(size.w, size.h);
        // 背景透明，不设置背景色

        // ── 2. 加载关卡数据并缓存（resize 时复用） ──
        this.levelData = await getLevelDataAsync();
        
        // ── 2.1 加载下载跳转配置 ──
        await this.loadDownloadConfig();
        
        // ── 2.2 初始化总箭头数与总格子数（用于进度 / 面积比例） ──
        if (this.levelData) {
            this.totalArrows = this.levelData.arrows.length;
            this.totalGridCells = this.levelData.arrows.reduce(
                (sum, a) => sum + (a.indices?.length ?? 0),
                0
            );
        }

        // ── 3. 创建棋盘与 UI ──
        this.buildBoardAndUI();

        // ── 4. 监听窗口 resize，横竖屏切换时重新布局 ──
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.boundResize);
        }

        // ── 5. 开场时再检测一次横竖屏（部分设备 create 时尺寸未就绪），不一致则按当前尺寸重建布局并更新引导位置
        this.time.delayedCall(100, () => {
            const { w, h } = getGameSize();
            if (this.scale.width !== w || this.scale.height !== h) {
                const guideWasVisible = !!this.guideHand;
                this.scale.setGameSize(w, h);
                this.buildBoardAndUI();
                this.createCTAButton();
                // 引导重新初始化：先完全隐藏再重新选 arrow、设位置、从头播放入场与点击动画
                if (guideWasVisible) {
                    this.reinitAndShowGuideHand();
                }
            }
        });

        // 暴露场景给 React
        EventBus.emit('current-scene-ready', this);
    }

    /** 根据当前 scale 尺寸重建棋盘和 UI（create 与 resize 共用） */
    private buildBoardAndUI(): void {
        const levelData = this.levelData;
        if (!levelData) return;

        // 横竖屏/尺寸变化时先移除引导手势，避免旧坐标残留；resize 后由 onWindowResize 按需重新显示
        if (this.guideHand) {
            this.hideGuideHand(false);
        }

        // 移除“任意点击重置计时”的监听，避免重复注册
        if (this.boundGuideIdlePointerDown) {
            this.input.off('pointerdown', this.boundGuideIdlePointerDown);
            this.boundGuideIdlePointerDown = undefined;
        }

        // 保存已消除的箭头状态（在销毁前）
        if (this.board) {
            this.eliminatedArrowIds = this.board.getEliminatedArrowIds();
            this.board.destroy();
            this.board = null;
        }
        if (this.boardContainer) {
            this.boardContainer.destroy();
            this.boardContainer = null;
        }
        if (this.zoomBarContainer) {
            if (this.boundZoomPointerMove) this.input.off('pointermove', this.boundZoomPointerMove);
            if (this.boundZoomPointerUp) this.input.off('pointerup', this.boundZoomPointerUp);
            if (this.boundPanPointerDown) this.input.off('pointerdown', this.boundPanPointerDown);
            if (this.boundPanPointerMove) this.input.off('pointermove', this.boundPanPointerMove);
            if (this.boundPanPointerUp) this.input.off('pointerup', this.boundPanPointerUp);
            this.boundZoomPointerMove = this.boundZoomPointerUp = undefined;
            this.boundPanPointerDown = this.boundPanPointerMove = this.boundPanPointerUp = undefined;
            this.zoomBarContainer.destroy();
            this.zoomBarContainer = null;
        }
        this.landscapePuzzleState = null;

        // 销毁 UI 容器
        if (this.uiContainer) {
            this.uiContainer.destroy();
            this.uiContainer = null;
        }

        const gridW = levelData.config.width;
        const gridH = levelData.config.height;
        const screenW = this.scale.width;
        const screenH = this.scale.height;
        const isLandscape = screenW > screenH;

        let cellSizeX: number;
        let cellSizeY: number;
        let boardWidth: number;
        let boardHeight: number;
        let offsetX: number;
        let offsetY: number;

        if (isLandscape) {
            boardHeight = LAYOUT.LANDSCAPE_ARROW_AREA_HEIGHT;
            const cellSize = boardHeight / gridH;
            cellSizeX = cellSize;
            cellSizeY = cellSize;
            boardWidth = gridW * cellSizeX;
            offsetY = Math.round((screenH - boardHeight) / 2);
            const puzzleAreaWidth = Math.floor(screenW * LAYOUT.LANDSCAPE_PUZZLE_WIDTH_RATIO);
            offsetX = Math.round((puzzleAreaWidth - boardWidth) / 2);
            this.landscapePuzzleState = {
                puzzleAreaWidth,
                boardWidth,
                boardHeight,
                offsetY,
            };
            this.puzzleZoom = 1;
            this.puzzlePanX = 0;
            this.puzzlePanY = 0;
            this.boardContainer = this.add.container(0, 0);
            this.boardContainer.setDepth(5);
            this.board = new Board(
                this,
                levelData,
                cellSizeX,
                cellSizeY,
                0,
                0,
                this.boardContainer
            );
            this.applyPuzzleZoomPan();
            this.createLandscapeZoomBar(screenW, screenH);
        } else {
            const availW = screenW - LAYOUT.PADDING_X * 2;
            const availH = screenH - LAYOUT.PADDING_TOP - LAYOUT.PADDING_BOTTOM;
            let cellSize = Math.floor(Math.min(availW / gridW, availH / gridH));
            cellSize = Math.max(LAYOUT.MIN_CELL_SIZE, Math.min(LAYOUT.MAX_CELL_SIZE, cellSize));
            cellSizeX = cellSize;
            cellSizeY = cellSize;
            boardWidth = gridW * cellSizeX;
            boardHeight = gridH * cellSizeY;
            offsetX = Math.round((screenW - boardWidth) / 2);
            offsetY = Math.round(
                LAYOUT.PADDING_TOP + (availH - boardHeight) / 2
            );
            this.board = new Board(
                this,
                levelData,
                cellSizeX,
                cellSizeY,
                offsetX,
                offsetY
            );
        }

        this.board.onArrowClick((arrowId) => {
            // 点击音效（click.mp3，由 virtual:game-assets 加载）
            if (this.cache.audio.exists('click')) {
                this.sound.play('click');
            }
            // 首次交互时启动 BGM
            this.startBGMOnce();
            console.log(`点击了箭头: ${arrowId}`);
            const arrow = this.board!.getArrow(arrowId);
            if (arrow) {
                console.log(`箭头路径: [${arrow.gridIndices.join(', ')}]`);
                console.log(`箭头朝向: (${arrow.direction.x}, ${arrow.direction.y})`);
            }
            // 用户点击箭头后，隐藏引导手势
            if (this.guideHand) {
                this.hideGuideHand();
            }
        });

        this.board.onWin(() => {
            this.showWinMessage();
        });
        
        // 监听箭头成功飞出事件，进行计数
        this.board.onArrowExit((arrowId) => {
            this.handleArrowExit(arrowId);
        });

        // 恢复已消除格子数（按当前已消除的箭头对应的格子数汇总，resize 时与逻辑一致）
        this.clearedGridCells = 0;
        for (const id of this.eliminatedArrowIds) {
            const arrow = levelData.arrows.find((a) => (a.id ?? '') === id);
            if (arrow?.indices) this.clearedGridCells += arrow.indices.length;
        }

        // 恢复箭头状态（如果有已消除的箭头）
        if (this.eliminatedArrowIds.length > 0) {
            this.board.restoreArrowStates(this.eliminatedArrowIds);
        }

        this.uiContainer = this.add.container(0, 0);
        this.drawUI(levelData, cellSizeX, cellSizeY, boardHeight, offsetX, offsetY, this.uiContainer);
        
        // ── 创建 CTA 按钮（右下角） ──
        this.createCTAButton();
        
        // ── 显示引导手势（仅在首次创建时） ──
        if (!this.hasShownGuide && this.eliminatedArrowIds.length === 0) {
            this.showGuideHand();
        }
        
        // ── 任意用户点击都重置“5 秒后再引导”的计时 ──
        this.boundGuideIdlePointerDown = () => this.resetGuideIdleTimer();
        this.input.on('pointerdown', this.boundGuideIdlePointerDown);
    }
    
    /** 创建 CTA 按钮，位于右下角 */
    private createCTAButton(): void {
        // 先停止并销毁已有动画
        if (this.ctaBreathTween) {
            this.ctaBreathTween.stop();
            this.ctaBreathTween = null;
        }
        
        // 先销毁已有按钮
        if (this.ctaButton) {
            this.tweens.killTweensOf(this.ctaButton);
            this.ctaButton.destroy();
            this.ctaButton = null;
        }
        
        // 检查资源是否存在
        if (!this.textures.exists('playnow')) {
            console.warn('CTA 按钮图片 playnow 未找到，请确保 playnow.png 已加载');
            return;
        }
        
        const screenW = this.scale.width;
        const screenH = this.scale.height;
        
        // 获取按钮尺寸
        const buttonTexture = this.textures.get('playnow');
        const buttonWidth = buttonTexture ? buttonTexture.getSourceImage().width : 200;
        const buttonHeight = buttonTexture ? buttonTexture.getSourceImage().height : 80;
        
        // 右下角位置（留出一些边距）
        const margin = 40;
        const buttonX = screenW - buttonWidth / 2 - margin;
        const buttonY = screenH - buttonHeight / 2 - margin;
        
        // 创建按钮
        this.ctaButton = this.add.image(buttonX, buttonY, 'playnow');
        this.ctaButton.setInteractive({ useHandCursor: true });
        this.ctaButton.setDepth(100); // 确保在最上层
        
        // 添加点击事件
        this.ctaButton.on('pointerdown', () => {
            if (this.cache.audio.exists('click')) this.sound.play('click');
            this.startBGMOnce();
            download();
        });
        
        // 添加悬停效果
        this.ctaButton.on('pointerover', () => {
            if (this.ctaButton && this.ctaBreathTween) {
                // 悬停时暂停呼吸动画，使用固定缩放
                this.ctaBreathTween.pause();
                this.ctaButton.setScale(1.05);
            }
        });
        
        this.ctaButton.on('pointerout', () => {
            if (this.ctaButton && this.ctaBreathTween) {
                // 离开时恢复呼吸动画
                this.ctaBreathTween.resume();
            }
        });
        
        // 创建呼吸缩放动画
        this.startCTABreathAnimation();
    }
    
    /**
     * 启动CTA按钮的呼吸缩放动画
     */
    private startCTABreathAnimation(): void {
        if (!this.ctaButton) return;
        
        // 呼吸动画：从1.0缩放到1.08，再回到1.0，循环
        this.ctaBreathTween = this.tweens.add({
            targets: this.ctaButton,
            scale: 1.08,
            duration: 1200,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1 // 无限循环
        });
    }

    /** 横屏：根据 zoom 与拖拽平移更新棋盘容器位置与缩放；谜题以场景全屏居中 */
    private applyPuzzleZoomPan(): void {
        const state = this.landscapePuzzleState;
        const container = this.boardContainer;
        if (!state || !container) return;
        const { boardWidth, boardHeight } = state;
        const scaledW = boardWidth * this.puzzleZoom;
        const scaledH = boardHeight * this.puzzleZoom;
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        container.setPosition(
            centerX - scaledW / 2 - this.puzzlePanX,
            centerY - scaledH / 2 - this.puzzlePanY
        );
        container.setScale(this.puzzleZoom);
    }

    /** 横屏：获取最大缩放（美人鱼宽度 = 谜题区宽度） */
    private getMaxPuzzleZoom(): number {
        const state = this.landscapePuzzleState;
        if (!state) return 1;
        return state.puzzleAreaWidth / state.boardWidth;
    }

    /** 横屏：水平平移半范围（拖拽聚焦，puzzlePanX ∈ [-halfRange, halfRange]） */
    private getPuzzlePanXHalfRange(): number {
        const state = this.landscapePuzzleState;
        if (!state) return 0;
        const scaledW = state.boardWidth * this.puzzleZoom;
        const w = this.scale.width;
        return Math.max(0, (scaledW - w) / 2);
    }

    /** 横屏：垂直平移半范围（拖拽聚焦，puzzlePanY ∈ [-halfRange, halfRange]） */
    private getPuzzlePanYHalfRange(): number {
        const state = this.landscapePuzzleState;
        if (!state) return 0;
        const scaledH = state.boardHeight * this.puzzleZoom;
        const h = this.scale.height;
        return Math.max(0, (scaledH - h) / 2);
    }

    /** 横屏：创建右侧缩放条（+ / 可拖拽滑块 / -），总高 720，垂直居中，x=1600 */
    private createLandscapeZoomBar(_screenW: number, screenH: number): void {
        if (this.zoomBarContainer) {
            this.zoomBarContainer.destroy();
            this.zoomBarContainer = null;
        }
        const barW = LAYOUT.ZOOM_BAR_WIDTH;
        const barX = 1700;
        const barHeight = 720;
        const barTop = screenH / 2 - barHeight / 2;
        const barBottom = barTop + barHeight;
        const btnSize = 48;
        const btnMargin = 12;
        const trackGap = 24;
        const trackTop = barTop + btnMargin + btnSize + trackGap;
        const trackBottom = barBottom - btnMargin - btnSize - trackGap;
        const trackH = trackBottom - trackTop;
        const thumbR = 14;
        const maxZoom = this.getMaxPuzzleZoom();

        const container = this.add.container(0, 0);
        container.setDepth(100);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.35);
        bg.fillRoundedRect(barX - barW / 2, barTop, barW, barHeight, 8);
        container.add(bg);

        const plusBtn = this.add.graphics();
        plusBtn.fillStyle(0xffffff, 1);
        plusBtn.lineStyle(2, 0xcccccc, 0.9);
        plusBtn.fillRoundedRect(barX - btnSize / 2, barTop + 12, btnSize, btnSize, 8);
        plusBtn.strokeRoundedRect(barX - btnSize / 2, barTop + 12, btnSize, btnSize, 8);
        const plusZone = this.add.zone(barX, barTop + 12 + btnSize / 2, btnSize + 8, btnSize + 8);
        plusZone.setInteractive({ useHandCursor: true });
        plusZone.on('pointerdown', () => {
            this.zoomBarPointerDown = true;
            const next = Math.min(maxZoom, this.puzzleZoom + LAYOUT.ZOOM_STEP);
            if (next !== this.puzzleZoom) {
                this.puzzleZoom = next;
                this.applyPuzzleZoomPan();
                this.syncZoomThumbPosition(container);
            }
        });
        const plusText = this.add.text(barX, barTop + 12 + btnSize / 2, '+', { fontSize: '32px', color: '#111', fontStyle: 'bold' }).setOrigin(0.5);
        container.add([plusBtn, plusZone, plusText]);

        const minusBtn = this.add.graphics();
        minusBtn.fillStyle(0xffffff, 1);
        minusBtn.lineStyle(2, 0xcccccc, 0.9);
        minusBtn.fillRoundedRect(barX - btnSize / 2, barBottom - 12 - btnSize, btnSize, btnSize, 8);
        minusBtn.strokeRoundedRect(barX - btnSize / 2, barBottom - 12 - btnSize, btnSize, btnSize, 8);
        const minusZone = this.add.zone(barX, barBottom - 12 - btnSize / 2, btnSize + 8, btnSize + 8);
        minusZone.setInteractive({ useHandCursor: true });
        minusZone.on('pointerdown', () => {
            this.zoomBarPointerDown = true;
            const next = Math.max(1, this.puzzleZoom - LAYOUT.ZOOM_STEP);
            if (next !== this.puzzleZoom) {
                this.puzzleZoom = next;
                this.applyPuzzleZoomPan();
                this.syncZoomThumbPosition(container);
            }
        });
        const minusText = this.add.text(barX, barBottom - 12 - btnSize / 2, '−', { fontSize: '32px', color: '#111', fontStyle: 'bold' }).setOrigin(0.5);
        container.add([minusBtn, minusZone, minusText]);

        const trackBg = this.add.graphics();
        trackBg.fillStyle(0xffffff, 0.25);
        trackBg.fillRoundedRect(barX - 6, trackTop, 12, trackH, 6);
        container.add(trackBg);

        /** 滑块：底部=1x，顶部=最大；指针 Y 大(底部) t=1→zoom 小，Y 小(顶部) t=0→zoom 大 */
        const syncZoomFromPointerY = (pointerY: number) => {
            const t = Phaser.Math.Clamp((pointerY - trackTop) / trackH, 0, 1);
            if (maxZoom <= 1) {
                this.puzzleZoom = 1;
            } else {
                this.puzzleZoom = 1 + (maxZoom - 1) * (1 - t);
            }
            this.applyPuzzleZoomPan();
            this.syncZoomThumbPositionFromT(container, maxZoom <= 1 ? 1 : 1 - (this.puzzleZoom - 1) / (maxZoom - 1));
        };

        const t = maxZoom <= 1 ? 1 : 1 - (this.puzzleZoom - 1) / (maxZoom - 1);
        const thumbY = trackTop + Phaser.Math.Clamp(t, 0, 1) * trackH;
        const thumb = this.add.graphics();
        thumb.fillStyle(0xffffff, 0.95);
        thumb.fillCircle(0, 0, thumbR);
        thumb.setPosition(barX, thumbY);
        const thumbZone = this.add.zone(barX, thumbY, thumbR * 2 + 12, thumbR * 2 + 12);
        thumbZone.setInteractive({ useHandCursor: true });
        thumbZone.setDepth(1);

        const trackZone = this.add.zone(barX, (trackTop + trackBottom) / 2, 24, trackH);
        trackZone.setInteractive({ useHandCursor: true });
        trackZone.setDepth(0);
        container.add(trackZone);
        container.add(thumb);
        container.add(thumbZone);

        const onTrackOrThumbDown = (ptr: Phaser.Input.Pointer) => {
            this.zoomBarPointerDown = true;
            this.zoomSliderDragging = true;
            syncZoomFromPointerY(ptr.y);
        };
        trackZone.on('pointerdown', onTrackOrThumbDown);
        thumbZone.on('pointerdown', onTrackOrThumbDown);

        this.boundZoomPointerMove = (ptr: Phaser.Input.Pointer) => {
            if (!this.zoomSliderDragging) return;
            if (!ptr.isDown) return;
            const cont = this.zoomBarContainer;
            if (!cont || !cont.active) return;
            syncZoomFromPointerY(ptr.y);
        };
        this.boundZoomPointerUp = () => {
            this.zoomSliderDragging = false;
            this.zoomBarPointerDown = false;
        };
        this.input.on('pointermove', this.boundZoomPointerMove);
        this.input.on('pointerup', this.boundZoomPointerUp);

        const panThreshold = 15;
        this.boundPanPointerDown = (ptr: Phaser.Input.Pointer) => {
            this.panStartX = ptr.x;
            this.panStartY = ptr.y;
            this.lastPanPointerX = ptr.x;
            this.lastPanPointerY = ptr.y;
            this.puzzleAreaPanning = false;
        };
        this.boundPanPointerMove = (ptr: Phaser.Input.Pointer) => {
            if (!ptr.isDown || !this.boardContainer || !this.landscapePuzzleState) return;
            if (this.zoomBarPointerDown) return;
            const dx = ptr.x - this.lastPanPointerX;
            const dy = ptr.y - this.lastPanPointerY;
            const dist = Math.sqrt((ptr.x - this.panStartX) ** 2 + (ptr.y - this.panStartY) ** 2);
            if (!this.puzzleAreaPanning && dist > panThreshold) this.puzzleAreaPanning = true;
            if (this.puzzleAreaPanning) {
                const halfX = this.getPuzzlePanXHalfRange();
                const halfY = this.getPuzzlePanYHalfRange();
                this.puzzlePanX = Phaser.Math.Clamp(this.puzzlePanX - dx, -halfX, halfX);
                this.puzzlePanY = Phaser.Math.Clamp(this.puzzlePanY - dy, -halfY, halfY);
                this.applyPuzzleZoomPan();
            }
            this.lastPanPointerX = ptr.x;
            this.lastPanPointerY = ptr.y;
        };
        this.boundPanPointerUp = () => {
            this.puzzleAreaPanning = false;
            this.zoomBarPointerDown = false;
        };
        this.input.on('pointerdown', this.boundPanPointerDown);
        this.input.on('pointermove', this.boundPanPointerMove);
        this.input.on('pointerup', this.boundPanPointerUp);

        container.setData('trackTop', trackTop);
        container.setData('trackBottom', trackBottom);
        container.setData('trackH', trackH);
        container.setData('barX', barX);
        container.setData('thumb', thumb);
        container.setData('thumbZone', thumbZone);

        this.zoomBarContainer = container;
    }

    /** 根据比例 t (0=顶部, 1=底部) 设置滑块位置 */
    private syncZoomThumbPositionFromT(container: Phaser.GameObjects.Container, t: number): void {
        const thumb = container.getData('thumb') as Phaser.GameObjects.Graphics;
        const thumbZone = container.getData('thumbZone') as Phaser.GameObjects.Zone;
        const barX = container.getData('barX') as number;
        const trackTop = container.getData('trackTop') as number;
        const trackH = container.getData('trackH') as number;
        if (!thumb || !thumbZone || typeof barX !== 'number' || typeof trackTop !== 'number' || typeof trackH !== 'number') return;
        const newThumbY = trackTop + t * trackH;
        thumb.setPosition(barX, newThumbY);
        thumbZone.setPosition(barX, newThumbY);
    }

    /** 根据当前 puzzleZoom 同步滑块位置（底部=1x，顶部=最大） */
    private syncZoomThumbPosition(container: Phaser.GameObjects.Container): void {
        const maxZoom = this.getMaxPuzzleZoom();
        const t = maxZoom <= 1 ? 1 : 1 - (this.puzzleZoom - 1) / (maxZoom - 1);
        this.syncZoomThumbPositionFromT(container, Phaser.Math.Clamp(t, 0, 1));
    }

    private onWindowResize(): void {
        const { w, h } = getGameSize();
        if (this.scale.width === w && this.scale.height === h) return;
        const guideWasVisible = !!this.guideHand;
        this.scale.setGameSize(w, h);
        this.buildBoardAndUI();
        // 更新 CTA 按钮位置
        this.createCTAButton();
        // 引导需重新初始化：先完全隐藏（销毁+清理），再重新选 arrow、设位置、从头播放入场与点击动画
        if (guideWasVisible) {
            this.reinitAndShowGuideHand();
        }
    }

    /** 不再展示文案，保留空实现便于 resize 时统一销毁 container */
    private drawUI(
      _levelData: LevelData,
      _cellSizeX: number,
      _cellSizeY: number,
      _boardHeight: number,
      _offsetX: number,
      _offsetY: number,
      _container: Phaser.GameObjects.Container
    ): void {
      // 已去掉所有标题、说明、调试文案
    }

    /**
     * 显示胜利消息
     */
    private showWinMessage(): void {
      const centerX = this.scale.width / 2;
      const centerY = this.scale.height / 2;

      // 半透明遮罩
      const overlay = this.add.graphics();
      overlay.fillStyle(0x000000, 0.4);
      overlay.fillRect(0, 0, this.scale.width, this.scale.height);
      overlay.setDepth(200);

      // 胜利文本
      this.add
        .text(centerX, centerY, 'Congratulations!', {
          fontSize: '64px',
          color: '#FFD700',
          align: 'center',
          fontFamily: 'Arial',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(201);
    }

    /**
     * 显示引导手势
     * 找到第一个可飞出的箭头，在手部位置显示引导手势并模拟点击
     */
    private showGuideHand(): void {
        if (!this.board) return;
        
        // 若已有“5 秒后再引导”的定时器，取消避免重复
        if (this.guideIdleTimer) {
            this.guideIdleTimer.remove();
            this.guideIdleTimer = null;
        }
        
        // 若引导已存在，先彻底销毁再重新创建（避免旧动画/定时器影响）
        if (this.guideHand) {
            this.hideGuideHand(false);
        }
        
        // 新一轮引导会话，用于丢弃可能尚未执行的旧 delayedCall
        this.guideSessionId += 1;
        const currentSessionId = this.guideSessionId;
        
        // 检查资源是否存在
        if (!this.textures.exists('hand')) {
            console.warn('引导手势图片 hand 未找到，请确保 hand.png 已加载');
            return;
        }
        
        // 获取所有箭头
        const arrows = this.board.getAllArrows();
        if (arrows.length === 0) return;
        
        // 获取占用表
        const occupancy = this.board.getOccupancy();
        if (!this.levelData) return;
        
        // 找到第一个可飞出的箭头
        let targetArrow = null;
        for (const arrow of arrows) {
            if (arrow.isEliminated || arrow.isAnimating) continue;
            
            const exitCheck = canArrowExit(arrow, this.levelData.config, occupancy);
            if (exitCheck.canExit) {
                targetArrow = arrow;
                break;
            }
        }
        
        if (!targetArrow) {
            console.log('没有找到可飞出的箭头，不显示引导手势');
            return;
        }
        
        // 引导位置：箭头路径的中点（沿路径长度一半处的点，不是整体图形中心）
        const kp = targetArrow.keyPoints;
        if (!kp || kp.length === 0) return;
        let centerX: number;
        let centerY: number;
        if (kp.length === 1) {
            centerX = kp[0].x;
            centerY = kp[0].y;
        } else {
            let totalLen = 0;
            for (let i = 0; i < kp.length - 1; i++) {
                const dx = kp[i + 1].x - kp[i].x;
                const dy = kp[i + 1].y - kp[i].y;
                totalLen += Math.sqrt(dx * dx + dy * dy);
            }
            const halfLen = totalLen / 2;
            let acc = 0;
            centerX = kp[0].x;
            centerY = kp[0].y;
            for (let i = 0; i < kp.length - 1; i++) {
                const dx = kp[i + 1].x - kp[i].x;
                const dy = kp[i + 1].y - kp[i].y;
                const segLen = Math.sqrt(dx * dx + dy * dy);
                if (segLen > 0 && acc + segLen >= halfLen) {
                    const t = (halfLen - acc) / segLen;
                    centerX = kp[i].x + t * dx;
                    centerY = kp[i].y + t * dy;
                    break;
                }
                acc += segLen;
                centerX = kp[i + 1].x;
                centerY = kp[i + 1].y;
            }
        }
        // 横屏有棋盘容器时 centerX/Y 为容器本地坐标，引导加入容器后随缩放/平移一起动
        const inBoardContainer = !!this.boardContainer;
        
        this.guideArrowId = targetArrow.id;
        this.board.setArrowHighlight(this.guideArrowId, true);
        
        this.guideHand = this.add.image(centerX, centerY, 'hand');
        if (inBoardContainer && this.boardContainer) {
            this.boardContainer.add(this.guideHand);
        } else {
            this.guideHand.setDepth(150);
        }
        this.guideHand.setOrigin(0, 0.4);
        this.guideHand.setScale(0.8);
        
        const entranceNormalY = centerY;
        this.guideHand.setY(entranceNormalY - 80);
        this.guideHand.setAlpha(0);
        
        this.tweens.add({
            targets: this.guideHand,
            alpha: 1,
            y: entranceNormalY,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                if (this.guideHand && this.guideHand.active && this.guideSessionId === currentSessionId) {
                    this.startGuideClickAnimation();
                }
            }
        });
        
        this.hasShownGuide = true;
    }
    
    /**
     * 引导点击动画循环：只做按压动画，不触发真实点击。
     * 每次执行都从当前 guideHand 位置读取坐标并配置动画，切换布局后也能按新位置正确播放。
     */
    private startGuideClickAnimation(): void {
        if (!this.guideHand || !this.guideHand.active) return;
        const currentSessionId = this.guideSessionId;
        // 按当前手的位置配置模拟点击的坐标参数，确保切换后动画用新位置
        const normalY = this.guideHand.y;
        const pressY = normalY + 25;
        
        const pressTween = this.tweens.add({
            targets: this.guideHand,
            y: pressY,
            scale: 0.75,
            duration: 280,
            ease: 'Power2',
            yoyo: true,
            repeat: 0,
            onComplete: () => {
                if (!this.guideHand || !this.guideHand.active || this.guideSessionId !== currentSessionId) return;
                
                const restoreTween = this.tweens.add({
                    targets: this.guideHand,
                    y: normalY,
                    scale: 0.8,
                    duration: 180,
                    ease: 'Power2',
                    onComplete: () => {
                        if (!this.guideHand || !this.guideHand.active || this.guideSessionId !== currentSessionId) return;
                        if (this.guideLoopTimer) {
                            this.guideLoopTimer.remove();
                            this.guideLoopTimer = null;
                        }
                        this.guideLoopTimer = this.time.delayedCall(600, () => {
                            this.guideLoopTimer = null;
                            if (this.guideHand && this.guideHand.active && this.guideSessionId === currentSessionId) {
                                this.startGuideClickAnimation();
                            }
                        });
                    }
                });
                
                if (!this.guideTween) {
                    this.guideTween = restoreTween;
                }
            }
        });
        
        this.guideTween = pressTween;
    }
    
    /**
     * 首次用户交互后播放 BGM（循环），仅执行一次
     */
    private startBGMOnce(): void {
        if (this.bgmStarted) return;
        this.bgmStarted = true;
        if (this.cache.audio.exists('bgm')) {
            this.sound.play('bgm', { loop: true });
        }
    }

    /**
     * 加载下载跳转配置
     */
    private async loadDownloadConfig(): Promise<void> {
        try {
            const config = await getOutputConfigValueAsync('download', {
                triggerByClearCount: true,
                clearCountThreshold: 20,
                triggerByProgress: false,
                progressThreshold: 0.8,
                triggerByAreaProgress: false,
                areaProgressThreshold: 0.8,
                autoJumpDelay: 3000
            });
            
            this.downloadConfig = {
                triggerByClearCount: config?.triggerByClearCount ?? true,
                clearCountThreshold: config?.clearCountThreshold ?? 20,
                triggerByProgress: config?.triggerByProgress ?? false,
                progressThreshold: config?.progressThreshold ?? 0.8,
                triggerByAreaProgress: config?.triggerByAreaProgress ?? false,
                areaProgressThreshold: config?.areaProgressThreshold ?? 0.8,
                autoJumpDelay: config?.autoJumpDelay ?? 3000
            };
            
            console.log('下载跳转配置已加载:', this.downloadConfig);
        } catch (error) {
            console.warn('加载下载跳转配置失败，使用默认值:', error);
            this.downloadConfig = {
                triggerByClearCount: true,
                clearCountThreshold: 20,
                triggerByProgress: false,
                progressThreshold: 0.8,
                triggerByAreaProgress: false,
                areaProgressThreshold: 0.8,
                autoJumpDelay: 3000
            };
        }
    }
    
    /**
     * 处理箭头成功飞出事件
     */
    private handleArrowExit(arrowId: string): void {
        if (!this.downloadConfig) return;
        
        // 更新计数
        this.clearCount++;
        this.clearedArrowTotal++;
        const arrow = this.levelData?.arrows.find((a) => (a.id ?? '') === arrowId);
        if (arrow?.indices) {
            this.clearedGridCells += arrow.indices.length;
        }
        
        console.log(`箭头成功飞出: ${arrowId}, 当前消除次数: ${this.clearCount}, 累计消除箭头数: ${this.clearedArrowTotal}, 已消除格子数: ${this.clearedGridCells}/${this.totalGridCells}`);
        
        // 检查是否达到跳转条件
        let shouldTrigger = false;
        
        // 按消除次数触发
        if (this.downloadConfig.triggerByClearCount) {
            if (this.clearCount >= this.downloadConfig.clearCountThreshold) {
                console.log(`达到消除次数阈值 ${this.downloadConfig.clearCountThreshold}，触发下载跳转`);
                shouldTrigger = true;
            }
        }
        
        // 按箭头数进度触发
        if (this.downloadConfig.triggerByProgress && !shouldTrigger) {
            const progress = this.totalArrows > 0 ? this.clearedArrowTotal / this.totalArrows : 0;
            if (progress >= this.downloadConfig.progressThreshold) {
                console.log(`达到进度阈值 ${this.downloadConfig.progressThreshold} (当前进度: ${progress.toFixed(2)})，触发下载跳转`);
                shouldTrigger = true;
            }
        }
        
        // 按美人鱼面积比例触发（线条所占格子数比例）
        if (this.downloadConfig.triggerByAreaProgress && !shouldTrigger) {
            const areaProgress = this.totalGridCells > 0 ? this.clearedGridCells / this.totalGridCells : 0;
            if (areaProgress >= this.downloadConfig.areaProgressThreshold) {
                console.log(`达到面积比例阈值 ${this.downloadConfig.areaProgressThreshold} (当前面积进度: ${areaProgress.toFixed(2)})，触发下载跳转`);
                shouldTrigger = true;
            }
        }
        
        // 触发下载跳转
        if (shouldTrigger) {
            this.triggerDownload();
        }
    }
    
    /**
     * 触发下载跳转
     */
    private triggerDownload(): void {
        console.log('触发下载跳转');
        
        // 不停止游戏：跳转触发后继续允许交互，直到实际发生页面跳转
        
        // 根据配置决定是立即跳转还是延迟跳转
        if (this.downloadConfig && this.downloadConfig.autoJumpDelay > 0) {
            // 延迟跳转（可以在这里显示弹窗提示）
            this.time.delayedCall(this.downloadConfig.autoJumpDelay, () => {
                download();
            });
        } else {
            // 立即跳转
            download();
        }
    }
    
    /**
     * 用户发生点击时重置 5 秒无操作计时（任意点击都重置，只有连续 5 秒无点击才再弹引导）
     */
    private resetGuideIdleTimer(): void {
        if (this.guideIdleTimer) {
            this.guideIdleTimer.remove();
            this.guideIdleTimer = null;
        }
        if (this.hasShownGuide && this.board) {
            this.guideIdleTimer = this.time.delayedCall(5000, () => {
                this.guideIdleTimer = null;
                this.showGuideHand();
            });
        }
    }

    /**
     * 隐藏引导手势（完全销毁并清理状态，不是单纯不显示）
     * 会停止所有引导相关 tween、销毁手势对象、取消高亮，保证无残留状态。
     * @param scheduleIdleGuide 是否在 5 秒无点击后再次弹出引导（场景销毁时传 false）
     */
    private hideGuideHand(scheduleIdleGuide: boolean = true): void {
        // 取消“5 秒后再引导”的定时器（若有）
        if (this.guideIdleTimer) {
            this.guideIdleTimer.remove();
            this.guideIdleTimer = null;
        }
        
        // 取消点击循环里“下一次按压”的延迟，否则切换后旧回调会触发导致动画重叠
        if (this.guideLoopTimer) {
            this.guideLoopTimer.remove();
            this.guideLoopTimer = null;
        }
        
        // 递增会话 id，使尚未执行的旧回调被丢弃
        this.guideSessionId += 1;
        
        // 停止引导动画链（按压/恢复 tween），避免残留回调
        if (this.guideTween) {
            this.guideTween.stop();
            this.guideTween = null;
        }
        
        if (this.guideHand) {
            this.tweens.killTweensOf(this.guideHand);
            this.guideHand.setAlpha(0);
            this.guideHand.destroy();
            this.guideHand = null;
        }
        
        // 取消被引导箭头的高亮
        if (this.guideArrowId && this.board) {
            this.board.setArrowHighlight(this.guideArrowId, false);
            this.guideArrowId = null;
        }
        
        // 第一次引导结束后：5 秒无点击则再次弹出引导，指向下一个可飞出的箭头
        if (scheduleIdleGuide && this.hasShownGuide && this.board) {
            this.guideIdleTimer = this.time.delayedCall(5000, () => {
                this.guideIdleTimer = null;
                this.showGuideHand();
            });
        }
    }

    /**
     * 布局变化后重新初始化并显示引导：
     * 先完全隐藏（销毁并清理所有引导状态与动画），下一帧再重新选 arrow、重新设位置、从头播放入场动画与点击循环。
     */
    private reinitAndShowGuideHand(): void {
        this.hideGuideHand(false);
        this.time.delayedCall(0, () => this.showGuideHand());
    }

    update() {
      // 预留给后续动画/逻辑
    }

    shutdown(): void {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', this.boundResize);
      }
      if (this.board) {
        this.board.destroy();
        this.board = null;
      }
      if (this.uiContainer) {
        this.uiContainer.destroy();
        this.uiContainer = null;
      }
      // 停止并销毁CTA按钮呼吸动画
      if (this.ctaBreathTween) {
        this.ctaBreathTween.stop();
        this.ctaBreathTween = null;
      }
      if (this.ctaButton) {
        this.tweens.killTweensOf(this.ctaButton);
        this.ctaButton.destroy();
        this.ctaButton = null;
      }
      if (this.guideHand) {
        this.hideGuideHand(false);
      }
      if (this.guideIdleTimer) {
        this.guideIdleTimer.remove();
        this.guideIdleTimer = null;
      }
      if (this.guideLoopTimer) {
        this.guideLoopTimer.remove();
        this.guideLoopTimer = null;
      }
      if (this.boundGuideIdlePointerDown) {
        this.input.off('pointerdown', this.boundGuideIdlePointerDown);
        this.boundGuideIdlePointerDown = undefined;
      }
      this.levelData = null;
    }
}
