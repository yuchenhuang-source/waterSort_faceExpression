import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { Board } from '../components/Board';
import { isPerfEnabled, initPerf, recordBoardUpdate, tickPerf } from '../../utils/perfLogger';
import download from './constants/download';
import { getOutputConfigAsync } from '../../utils/outputConfigLoader';
import { getDownloadText } from '../../utils/i18n';
import { getCachedPuzzle } from '../../utils/puzzleCache';
import { getOutputConfigValueAsync } from '../../utils/outputConfigLoader';
import { generatePuzzleWithAdapter } from '../../utils/puzzle-adapter';

// 配置类型定义
interface GameConfig {
    jumpStepCount: number;
    completedTubeCount: number;
    showPopup: boolean;
}

export class Game extends Scene
{
    private downloadBtn: Phaser.GameObjects.Image;
    private downloadBtnContainer: Phaser.GameObjects.Container;
    private iconBtn: Phaser.GameObjects.Image; // 左上角icon
    private resizeHandler: () => void;
    private board: Board;
    private debugText: Phaser.GameObjects.Text | null = null;
    private debugTimer: Phaser.Time.TimerEvent | null = null;
    private debugUpdateSamples: number[] = [];
    
    // 胜利弹窗相关
    private victoryPopup: Phaser.GameObjects.Container | null = null;
    private victoryOverlay: Phaser.GameObjects.Rectangle | null = null;
    private autoDownloadTimer: Phaser.Time.TimerEvent | null = null; // 自动下载定时器
    private hasClickedPopup: boolean = false; // 是否已点击弹窗
    
    // 配置相关
    private gameConfig: GameConfig = {
        jumpStepCount: 999,
        completedTubeCount: 999,
        showPopup: true
    };
    private hasTriggeredDownload: boolean = false;
    private currentDifficulty: number = 1;
    private currentEmptyTubeCount: number = 2;

    constructor ()
    {
        super('Game');
    }

    async create (data?: { puzzle?: any; difficulty?: number; emptyTubeCount?: number })
    {
        const tCreate = performance.now();
        this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
        
        // 加载配置
        await this.loadConfig();
        console.log('[TIMING] loadConfig完成', { t: performance.now(), d: (performance.now() - tCreate).toFixed(0) + 'ms' });

        // 记录当前难度
        this.currentDifficulty = data?.difficulty ?? 1;
        this.currentEmptyTubeCount = data?.emptyTubeCount ?? 2;

        // 创建游戏区域，传入 Preloader 阶段生成的谜题和配置（如果存在）
        const tBoard = performance.now();
        this.board = new Board(this, data?.puzzle, data?.difficulty, data?.emptyTubeCount);
        console.log('[TIMING] Board创建完成', { t: performance.now(), d: (performance.now() - tBoard).toFixed(0) + 'ms' });

        // 创建下载按钮
        this.createDownloadButton();

        // 初始化场景大小
        this.updateGameSize();

        // 保存resize处理函数的引用，以便后续移除
        this.resizeHandler = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        // 监听游戏胜利事件
        EventBus.on('game-over', this.showVictoryPopup, this);
        
        // 监听死局事件
        EventBus.on('game-deadlock', this.showDeadlockPopup, this);
        
        // 监听计数器事件
        EventBus.on('jump-step', this.onJumpStep, this);
        EventBus.on('tube-completed', this.onTubeCompleted, this);

        // 首次交互后启动 BGM（Phaser 播放，不经过 EventBus）
        this.input.once('pointerdown', () => this.tryStartBGM());
        this.input.once('pointerup', () => this.tryStartBGM());

        // 用户选关后：如果难度不同则用新谜题重启场景
        EventBus.on('level-selected', this.onLevelSelected, this);

        // 广告显示/暂停时暂停/恢复 Phaser 音频
        EventBus.on('pauseAd', this.pauseGameSound, this);
        EventBus.on('showAd', this.resumeGameSound, this);

        this.initDebugOverlay();
        if (isPerfEnabled()) initPerf();

        console.log('[TIMING] 关卡加载完成', { t: performance.now(), ts: new Date().toISOString() });
        EventBus.emit('current-scene-ready', this);
    }

    private bgmStarted = false;

    private tryStartBGM() {
        if (this.bgmStarted) return;
        this.bgmStarted = true;
        this.sound.play('bgm', { loop: true, volume: 0.6 });
    }

    private pauseGameSound() {
        this.sound.pauseAll();
    }

    private resumeGameSound() {
        this.sound.resumeAll();
    }

    private async onLevelSelected(difficulty: number) {
        if (difficulty === this.currentDifficulty) return;
        const emptyTubeCount = this.currentEmptyTubeCount;
        const cached = getCachedPuzzle(difficulty, emptyTubeCount);
        if (cached) {
            this.scene.restart(cached);
        } else {
            const etc = await getOutputConfigValueAsync<number>('emptyTubeCount', 2);
            const puzzle = generatePuzzleWithAdapter({ difficulty, emptyTubeCount: Math.max(1, Math.min(6, etc)) });
            this.scene.restart({ puzzle, difficulty, emptyTubeCount: Math.max(1, Math.min(6, etc)) });
        }
    }

    /**
     * 调试面板（界面显示统计信息）
     */
    private initDebugOverlay() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') !== '1') return;

        this.debugText = this.add.text(10, 10, '', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#00ff88',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            padding: { x: 6, y: 4 }
        });
        this.debugText.setDepth(20000);
        this.debugText.setScrollFactor(0);

        this.debugTimer = this.time.addEvent({
            delay: 500,
            loop: true,
            callback: () => this.updateDebugOverlay()
        });
        this.updateDebugOverlay();

        this.events.once('shutdown', () => {
            if (this.debugTimer) this.debugTimer.remove(false);
            if (this.debugText) this.debugText.destroy();
            this.debugTimer = null;
            this.debugText = null;
        });
    }

    private updateDebugOverlay() {
        if (!this.debugText || !this.board) return;

        const textureKeys = this.textures.getTextureKeys().filter(key => !key.startsWith('__'));
        const sceneObjects = this.children.list.length;
        const fps = this.game.loop.actualFps ? this.game.loop.actualFps.toFixed(1) : 'n/a';
        const boardStats = this.board.getDebugStats();
        const totalDrawCalls = boardStats.totalDrawLiquidCalls;
        this.board.resetDebugCounters();
        const mem = (performance as any).memory;
        const memLine = mem ? `Heap(MB): ${(mem.usedJSHeapSize / 1048576).toFixed(1)} / ${(mem.totalJSHeapSize / 1048576).toFixed(1)}` : 'Heap(MB): n/a';
        const updateAvg = this.debugUpdateSamples.length
            ? (this.debugUpdateSamples.reduce((a, b) => a + b, 0) / this.debugUpdateSamples.length).toFixed(2)
            : '0.00';
        const updateMax = this.debugUpdateSamples.length
            ? Math.max(...this.debugUpdateSamples).toFixed(2)
            : '0.00';
        this.debugUpdateSamples.length = 0;

        this.debugText.setText([
            `FPS: ${fps}`,
            `Textures: ${textureKeys.length}`,
            `SceneObjects: ${sceneObjects}`,
            `Tubes: ${boardStats.tubes} Balls: ${boardStats.totalBalls}`,
            `BoundarySprites: ${boardStats.totalBoundarySprites}`,
            `ActiveSplashes: ${boardStats.totalActiveSplashes}`,
            `ReturnBoundary: ${boardStats.returnBoundaryCount} AddingBlock: ${boardStats.addingBlockCount}`,
            `DrawLiquid/0.5s: ${totalDrawCalls}`,
            `Board.update ms (avg/max): ${updateAvg} / ${updateMax}`,
            memLine
        ].join('\n'));
    }

    update(time: number, delta: number) {
        if (!this.board) return;
        const t0 = performance.now();
        this.board.update(time, delta);
        const t1 = performance.now();
        const boardMs = t1 - t0;
        this.debugUpdateSamples.push(boardMs);
        if (isPerfEnabled()) {
            recordBoardUpdate(boardMs);
            tickPerf(this);
        }
    }
    
    /**
     * 加载配置
     */
    private async loadConfig() {
        try {
            const config = await getOutputConfigAsync();
            if (config.jumpStepCount !== undefined) {
                this.gameConfig.jumpStepCount = config.jumpStepCount;
            }
            if (config.completedTubeCount !== undefined) {
                this.gameConfig.completedTubeCount = config.completedTubeCount;
            }
            if (config.showPopup !== undefined) {
                this.gameConfig.showPopup = config.showPopup;
            }
        } catch (error) {
            console.warn('Failed to load game config, using defaults:', error);
        }
    }
    
    /**
     * 处理跳转步数变化
     */
    private onJumpStep(count: number) {
        if (count >= this.gameConfig.jumpStepCount) {
            this.triggerDownloadAction();
        }
    }
    
    /**
     * 处理完成试管数变化
     */
    private onTubeCompleted(count: number) {
        if (count >= this.gameConfig.completedTubeCount) {
            this.triggerDownloadAction();
        }
    }
    
    /**
     * 触发下载动作（根据配置显示弹窗或直接下载）
     */
    private triggerDownloadAction() {
        if (this.hasTriggeredDownload) return;
        this.hasTriggeredDownload = true;
        
        if (this.gameConfig.showPopup) {
            this.showVictoryPopup();
        } else {
            download();
        }
    }

    private createDownloadButton() {
        // 创建下载按钮容器
        this.downloadBtnContainer = this.add.container(0, 0);
        
        // 目标尺寸（原 download.png 的尺寸）
        const targetWidth = 338;
        const targetHeight = 106;
        
        this.downloadBtn = this.add.image(0, 0, 'download');
        this.downloadBtn.setDisplaySize(targetWidth, targetHeight);
        this.downloadBtnContainer.add(this.downloadBtn);
        
        // 添加 DOWNLOAD 文字（根据浏览器语言自动切换）
        const downloadText = this.add.text(0, 0, getDownloadText(), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#6a2f00'
        });
        downloadText.setOrigin(0.5, 0.5);
        this.downloadBtnContainer.add(downloadText);
        
        this.downloadBtnContainer.setInteractive(
            new Phaser.Geom.Rectangle(
                -targetWidth / 2,
                -targetHeight / 2,
                targetWidth,
                targetHeight
            ),
            Phaser.Geom.Rectangle.Contains
        );
        
        // 按钮点击事件
        this.downloadBtnContainer.on('pointerdown', () => {
            EventBus.emit('download-click');
            download();
        });

        // 按钮缩放动画
        this.tweens.add({
            targets: this.downloadBtnContainer,
            scale: { from: 1, to: 1.1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        // 创建左上角icon
        this.iconBtn = this.add.image(0, 0, 'icon');
        this.iconBtn.setDisplaySize(128, 128);
        this.iconBtn.setOrigin(0, 0); // 设置原点在左上角
        this.iconBtn.setInteractive();
        this.iconBtn.on('pointerdown', () => {
            download();
        });
    }

    private onWindowResize() {
        this.updateGameSize();
    }

    private updateGameSize() {
        const isPortrait = window.innerHeight > window.innerWidth;
        
        if (isPortrait) {
            // 竖屏: 1080 x 2160
            this.scale.setGameSize(1080, 2160);
            // 更新下载按钮位置
            if (this.downloadBtnContainer) {
                this.downloadBtnContainer.setPosition(1080 / 2, 2160 - 200);
            }
            // 更新icon位置（左上角，留20px边距）
            if (this.iconBtn) {
                this.iconBtn.setPosition(20, 20);
            }
        } else {
            // 横屏: 2160 x 1080
            this.scale.setGameSize(2160, 1080);
            
            // 计算游戏区域试管底部位置
            // 游戏区域居中，两行试管
            // startY = (1080 - 500) / 2 = 290
            // 第二行Y = 290 + 500 = 790
            // 试管高度 = 432，底部 = 790 + 432/2 = 1006
            const tubeBottomY = 290 + 500 + 432 / 2; // = 1006
            
            // 更新下载按钮位置，底部与试管底部对齐
            if (this.downloadBtnContainer && this.downloadBtn) {
                const btnHeight = this.downloadBtn.displayHeight;
                const btnCenterY = tubeBottomY - btnHeight / 2;
                this.downloadBtnContainer.setPosition(2160 - 240, btnCenterY);
            }
            // 更新icon位置（左上角，留20px边距）
            if (this.iconBtn) {
                this.iconBtn.setPosition(20, 20);
            }
        }
        
        // 更新胜利弹窗位置
        this.updateVictoryPopupPosition();
    }

    /**
     * 显示死局弹窗
     */
    private showDeadlockPopup() {
        // 重置点击状态
        this.hasClickedPopup = false;
        
        const gameSize = this.scale.gameSize;
        const centerX = gameSize.width / 2;
        const centerY = gameSize.height / 2;

        // 创建半透明遮罩（depth高于引导手指的10000）
        this.victoryOverlay = this.add.rectangle(
            centerX, centerY,
            gameSize.width, gameSize.height,
            0x000000, 0.7
        );
        this.victoryOverlay.setDepth(11000);
        this.victoryOverlay.setInteractive(); // 阻止点击穿透

        // 创建弹窗容器（depth高于引导手指的10000）
        this.victoryPopup = this.add.container(centerX, centerY);
        this.victoryPopup.setDepth(11001);

        // 点击处理函数（标记已点击并调用下载）
        const handleClick = () => {
            this.hasClickedPopup = true;
            if (this.autoDownloadTimer) {
                this.autoDownloadTimer.destroy();
                this.autoDownloadTimer = null;
            }
            download();
        };

        // 添加icon图片（缩小到1/2）
        const icon = this.add.image(0, -80, 'icon');
        icon.setScale(0.5);
        icon.setInteractive();
        icon.on('pointerdown', handleClick);
        this.victoryPopup.add(icon);

        // 添加download按钮容器（调整位置适应缩小后的icon）
        const downloadBtnY = (icon.height * 0.5) / 2 + 50;
        const downloadBtnContainer = this.add.container(0, downloadBtnY);
        
        // 目标尺寸（原 download.png 的尺寸）
        const targetWidth = 338;
        const targetHeight = 106;
        
        const downloadBtn = this.add.image(0, 0, 'download');
        downloadBtn.setDisplaySize(targetWidth, targetHeight);
        downloadBtnContainer.add(downloadBtn);
        
        // 添加 DOWNLOAD 文字（根据浏览器语言自动切换）
        const downloadText = this.add.text(0, 0, getDownloadText(), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#6a2f00'
        });
        downloadText.setOrigin(0.5, 0.5);
        downloadBtnContainer.add(downloadText);
        
        downloadBtnContainer.setInteractive(
            new Phaser.Geom.Rectangle(
                -targetWidth / 2,
                -targetHeight / 2,
                targetWidth,
                targetHeight
            ),
            Phaser.Geom.Rectangle.Contains
        );
        downloadBtnContainer.on('pointerdown', handleClick);
        this.victoryPopup.add(downloadBtnContainer);
        
        // 下载按钮缩放动画
        this.tweens.add({
            targets: downloadBtnContainer,
            scale: { from: 1, to: 1.1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 弹窗入场动画
        this.victoryPopup.setScale(0);
        this.tweens.add({
            targets: this.victoryPopup,
            scale: 1,
            duration: 400,
            ease: 'Back.easeOut'
        });

        // 3秒后自动调用下载（如果用户没有点击）
        this.autoDownloadTimer = this.time.delayedCall(3000, () => {
            if (!this.hasClickedPopup) {
                download();
            }
        });
    }

    /**
     * 显示胜利弹窗
     */
    private showVictoryPopup() {
        // 重置点击状态
        this.hasClickedPopup = false;
        
        // 停止 BGM 并播放胜利音效（Phaser 直接播放）
        this.sound.stopByKey('bgm');
        this.sound.play('胜利');
        
        const gameSize = this.scale.gameSize;
        const centerX = gameSize.width / 2;
        const centerY = gameSize.height / 2;

        // 创建半透明遮罩（depth高于引导手指的10000）
        this.victoryOverlay = this.add.rectangle(
            centerX, centerY,
            gameSize.width, gameSize.height,
            0x000000, 0.7
        );
        this.victoryOverlay.setDepth(11000);
        this.victoryOverlay.setInteractive(); // 阻止点击穿透

        // 创建弹窗容器（depth高于引导手指的10000）
        this.victoryPopup = this.add.container(centerX, centerY);
        this.victoryPopup.setDepth(11001);

        // 点击处理函数（标记已点击并调用下载）
        const handleClick = () => {
            this.hasClickedPopup = true;
            if (this.autoDownloadTimer) {
                this.autoDownloadTimer.destroy();
                this.autoDownloadTimer = null;
            }
            download();
        };

        // 添加icon图片（缩小到1/2）
        const icon = this.add.image(0, -80, 'icon');
        icon.setScale(0.5);
        icon.setInteractive();
        icon.on('pointerdown', handleClick);
        this.victoryPopup.add(icon);

        // 添加download按钮容器（调整位置适应缩小后的icon）
        const downloadBtnY = (icon.height * 0.5) / 2 + 50;
        const downloadBtnContainer2 = this.add.container(0, downloadBtnY);
        
        // 目标尺寸（原 download.png 的尺寸）
        const targetWidth2 = 338;
        const targetHeight2 = 106;
        
        const downloadBtn2 = this.add.image(0, 0, 'download');
        downloadBtn2.setDisplaySize(targetWidth2, targetHeight2);
        downloadBtnContainer2.add(downloadBtn2);
        
        // 添加 DOWNLOAD 文字（根据浏览器语言自动切换）
        const downloadText2 = this.add.text(0, 0, getDownloadText(), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#6a2f00'
        });
        downloadText2.setOrigin(0.5, 0.5);
        downloadBtnContainer2.add(downloadText2);
        
        downloadBtnContainer2.setInteractive(
            new Phaser.Geom.Rectangle(
                -targetWidth2 / 2,
                -targetHeight2 / 2,
                targetWidth2,
                targetHeight2
            ),
            Phaser.Geom.Rectangle.Contains
        );
        downloadBtnContainer2.on('pointerdown', handleClick);
        this.victoryPopup.add(downloadBtnContainer2);
        
        // 下载按钮缩放动画
        this.tweens.add({
            targets: downloadBtnContainer2,
            scale: { from: 1, to: 1.1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 遮罩点击也触发下载
        this.victoryOverlay.on('pointerdown', handleClick);

        // 弹窗入场动画：缩放 + 淡入
        this.victoryPopup.setAlpha(0);
        this.victoryPopup.setScale(0.5);
        this.victoryOverlay.setAlpha(0);
        
        // 遮罩淡入
        this.tweens.add({
            targets: this.victoryOverlay,
            alpha: { from: 0, to: 1 },
            duration: 200,
            ease: 'Power2'
        });
        
        // 弹窗缩放+淡入（带弹性效果）
        this.tweens.add({
            targets: this.victoryPopup,
            alpha: { from: 0, to: 1 },
            scale: { from: 0.5, to: 1 },
            duration: 400,
            ease: 'Back.easeOut',
            delay: 100  // 稍微延迟，让遮罩先出现
        });
        
        // 3秒后如果没有点击，自动触发下载
        this.autoDownloadTimer = this.time.delayedCall(3000, () => {
            if (!this.hasClickedPopup) {
                download();
            }
        });
    }

    /**
     * 更新胜利弹窗位置（横竖屏切换时）
     */
    private updateVictoryPopupPosition() {
        if (!this.victoryPopup || !this.victoryOverlay) return;
        
        const gameSize = this.scale.gameSize;
        const centerX = gameSize.width / 2;
        const centerY = gameSize.height / 2;
        
        this.victoryPopup.setPosition(centerX, centerY);
        this.victoryOverlay.setPosition(centerX, centerY);
        this.victoryOverlay.setSize(gameSize.width, gameSize.height);
    }

    shutdown() {
        EventBus.off('pauseAd', this.pauseGameSound, this);
        EventBus.off('showAd', this.resumeGameSound, this);
    }
}
