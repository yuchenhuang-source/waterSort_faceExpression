import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { Board } from '../components/Board';
import { Config } from '../constants/GameConstants';
import { isPerfEnabled, initPerf, recordBoardUpdate, tickPerf } from '../../utils/perfLogger';
import download from './constants/download';
import { getOutputConfigAsync, getOutputConfigValue } from '../../utils/outputConfigLoader';
import { getDownloadText } from '../../utils/i18n';
import { getCachedPuzzle } from '../../utils/puzzleCache';
import { getOutputConfigValueAsync } from '../../utils/outputConfigLoader';
import { generatePuzzleWithAdapter } from '../../utils/puzzle-adapter';
import { isCVModeEnabled, getCVBridge, destroyCVBridge } from '../cv-bridge/CVBridge';
import { resetCvIds } from '../cvIdGenerator';
import { generateColorMap, extractValidPixels, ColorMap } from '../render/ObjectIdPipeline';
// CV 录制功能已暂时注释。按 S 单步发送帧仍可用。恢复时取消下方注释并恢复 App/DeviceSimulator/CVRecordControls 中的相关代码。
// import JSZip from 'jszip';
// import { CV_RECORD_PLAY, CV_RECORD_PAUSE, CV_RECORD_END, CV_RECORD_STATUS } from '../cvRecordEvents';

// 配置类型定义
interface GameConfig {
    jumpStepCount: number;
    completedTubeCount: number;
    showPopup: boolean;
}

export class Game extends Scene
{
    private backgroundImage: Phaser.GameObjects.Image | null = null; // 全屏背景（CV 模式作为普通元素）
    private iconBtn: Phaser.GameObjects.Image; // 左上角icon
    private centerBtn: Phaser.GameObjects.Image; // 屏幕中心按钮
    private centerBtnContainer: Phaser.GameObjects.Container; // 按钮容器（包含图片和文字）
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

    // CV Bridge (Phase 1)
    private waitingForCV: boolean = false;
    private cvStepText: Phaser.GameObjects.Text | null = null;
    private cvStepCount: number = 0;
    //private cvDetectionHistory: Array<{ timestamp: number; tubes: Array<{ id: number; x: number; y: number }>; balls: Array<{ id: number; x: number; y: number; tubeId?: number; index?: number }> }> = [];

    /** Stable color map: generated once per game session, reused every frame. */
    private _colorMap: ColorMap | null = null;
    private _idToColor: Map<number, number> | null = null;

    /** CV 模式需要 tint 的对象（通用逻辑，新增对象只需 registerCvTintable） */
    private cvTintables: Array<{ obj: Phaser.GameObjects.GameObject; id: number }> = [];

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

        resetCvIds();
        this._colorMap = null;
        this._idToColor = null;
        // 清空 CV tint 注册表（场景重启时避免重复）
        this.cvTintables = [];
        // 创建全屏背景（作为普通 GameObject，CV 模式 tint 处理）
        this.createBackground();

        // 创建游戏区域，传入 Preloader 阶段生成的谜题和配置（如果存在）
        const tBoard = performance.now();
        this.board = new Board(this, data?.puzzle, data?.difficulty, data?.emptyTubeCount);
        console.log('[TIMING] Board创建完成', { t: performance.now(), d: (performance.now() - tBoard).toFixed(0) + 'ms' });

        // 创建左上角 icon 和屏幕中心按钮
        this.createUIButtons();

        // 初始化场景大小
        this.updateGameSize();
        this.time.delayedCall(0, () => this.updateGameSize(), [], this);

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

        // CV mode: connect to CV server, enable step-on-S
        if (isCVModeEnabled()) {
            this.initCVMode();
        }

        // 难度 1/5/9 对应关卡 1/2/3，便于 AI 轮询 console 检测
        const levelNum = this.currentDifficulty === 1 ? 1 : this.currentDifficulty === 5 ? 2 : 3;
        console.log('[LEVEL_ENTER] 成功进入第' + levelNum + '关', {
            difficulty: this.currentDifficulty,
            levelNum,
            t: performance.now(),
            ts: new Date().toISOString()
        });
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
        const levelNum = difficulty === 1 ? 1 : difficulty === 5 ? 2 : 3;
        console.log('[LEVEL_ENTER] 开始切换关卡', { difficulty, levelNum, t: performance.now() });
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

    /**
     * CV mode: connect to CV server, show "Press S to step", handle step loop
     */
    private initCVMode() {
        const bridge = getCVBridge(this.game);
        this.cvStepText = this.add.text(this.scale.width / 2, 60, 'CV: Connecting...', {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: '#00ff88',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: { x: 12, y: 8 }
        });
        this.cvStepText.setOrigin(0.5, 0);
        this.cvStepText.setDepth(20001);
        this.cvStepText.setScrollFactor(0);

        const urlParams = new URLSearchParams(window.location.search);
        const autoMode = urlParams.get('auto') === '1';

        this.waitingForCV = true;

        // CV 录制已暂时注释：Play/Pause/End 按钮不再注册
        // EventBus.on(CV_RECORD_PLAY, this.onCVRecordPlay, this);
        // EventBus.on(CV_RECORD_PAUSE, this.onCVRecordPause, this);
        // EventBus.on(CV_RECORD_END, this.onCVRecordEnd, this);

        bridge.connect().then(() => {
            // 录制已注释。R 恢复运行以便点击试管，S 截帧（截帧时需场景运行中才有升起的水球和表情）
            if (this.cvStepText) this.cvStepText.setText(autoMode ? 'CV: R恢复 S截帧 (录制已暂时关闭)' : 'CV: R恢复 S截帧');
            const handler = (e: KeyboardEvent) => {
                if (e.key === 's' || e.key === 'S') this.stepOneFrame();
                else if (e.key === 'r' || e.key === 'R') { this.scene.resume(); if (this.cvStepText) this.cvStepText.setText('CV: 运行中 - 点击试管后按 S 截帧'); }
            };
            document.addEventListener('keydown', handler);
            this.events.once('shutdown', () => document.removeEventListener('keydown', handler));
            this.scene.pause();
        }).catch((err) => {
            console.error('[CV] Failed to connect', err);
            if (this.cvStepText) this.cvStepText.setText('CV: Connection failed');
        });

        this.events.once('shutdown', () => {
            this.cvAutoStepRunning = false;
            // EventBus.off(CV_RECORD_PLAY, this.onCVRecordPlay, this);
            // EventBus.off(CV_RECORD_PAUSE, this.onCVRecordPause, this);
            // EventBus.off(CV_RECORD_END, this.onCVRecordEnd, this);
            destroyCVBridge();
            if (this.cvStepText) {
                this.cvStepText.destroy();
                this.cvStepText = null;
            }
        });
    }

    /* CV 录制 handlers 已暂时注释
    private onCVRecordPlay = () => {
        const connected = getCVBridge(this.game).isConnected();
        console.log('[CV-RECORD] onCVRecordPlay called, bridge connected:', connected);
        if (typeof window !== 'undefined' && window.self !== window.top) {
            window.parent.postMessage({ type: 'cv-record-debug', msg: 'onCVRecordPlay', connected }, '*');
        }
        this.cvDetectionHistory = [];
        this.cvAutoStepRunning = true;
        this.waitingForCV = false;
        this.scene.resume();
        EventBus.emit(CV_RECORD_STATUS, 'recording' as const);
        if (this.cvStepText) this.cvStepText.setText('CV: 录制中...');
        const bridge = getCVBridge(this.game);
        if (!bridge.isConnected()) {
            console.log('[CV-RECORD] bridge not connected, waiting 500ms then retry');
            this.time.delayedCall(500, () => {
                if (this.cvAutoStepRunning && bridge.isConnected()) this.startAutoStepLoop();
                else if (this.cvAutoStepRunning) console.warn('[CV-RECORD] bridge still not connected after 500ms');
            }, [], this);
        } else {
            this.startAutoStepLoop();
        }
    };

    private onCVRecordPause = () => {
        this.cvAutoStepRunning = false;
        this.waitingForCV = true;
        this.scene.pause();
        EventBus.emit(CV_RECORD_STATUS, 'paused' as const);
        if (this.cvStepText) this.cvStepText.setText('CV: 已暂停');
    };

    private onCVRecordEnd = () => {
        this.exportCsvAndZip();
    };
    */

    /* exportCsvAndZip 已暂时注释
    private exportCsvAndZip() {
        this.cvAutoStepRunning = false;
        this.waitingForCV = true;
        this.scene.pause();
        EventBus.emit(CV_RECORD_STATUS, 'idle' as const);
        if (this.cvStepText) this.cvStepText.setText('CV: 点击播放开始');

        setTimeout(() => {
            const history = this.cvDetectionHistory;
            if (history.length === 0) {
                const emptyMsg = JSON.stringify({ frames: 0, csvRows: 0, reason: 'no frames recorded' });
                console.log('[CV-RECORD] export completed', emptyMsg);
                if (typeof window !== 'undefined' && window.self !== window.top) {
                    window.parent.postMessage({ type: 'cv-record-export-complete', summary: emptyMsg }, '*');
                }
                return;
            }

            const tubeIds = new Set<number>();
            const ballIds = new Set<number>();
            history.forEach(({ tubes, balls }) => {
                tubes.forEach(t => tubeIds.add(t.id));
                balls.forEach(b => ballIds.add(b.id));
            });
            const sortedTubeIds = [...tubeIds].sort((a, b) => a - b);
            const sortedBallIds = [...ballIds].sort((a, b) => a - b);
            const escapeCsv = (val: unknown): string => {
                if (val === undefined || val === null || val === '') return '';
                const s = String(val);
                if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
                return s;
            };
            const headers = ['timestamp'];
            sortedTubeIds.forEach(id => { headers.push(`T${id}_x`, `T${id}_y`); });
            sortedBallIds.forEach(id => { headers.push(`B${id}_x`, `B${id}_y`, `B${id}_tubeId`, `B${id}_index`); });
            const rows = [headers.join(',')];
            history.forEach(({ timestamp, tubes, balls }) => {
                const tubeMap = Object.fromEntries(tubes.map(t => [t.id, t]));
                const ballMap = Object.fromEntries(balls.map(b => [b.id, b]));
                const cells = [escapeCsv(timestamp)];
                sortedTubeIds.forEach(id => {
                    const t = tubeMap[id];
                    cells.push(escapeCsv(t?.x ?? ''), escapeCsv(t?.y ?? ''));
                });
                sortedBallIds.forEach(id => {
                    const b = ballMap[id];
                    cells.push(escapeCsv(b?.x ?? ''), escapeCsv(b?.y ?? ''), escapeCsv(b?.tubeId ?? ''), escapeCsv(b?.index ?? ''));
                });
                rows.push(cells.join(','));
            });
            const csvContent = rows.join('\n');
            const zip = new JSZip();
            zip.file('detections.csv', csvContent);
            zip.generateAsync({ type: 'blob' }).then(blob => {
                const rowCount = rows.length - 1;
                const summary = JSON.stringify({
                    frames: history.length,
                    csvRows: rowCount,
                    headerCols: headers.length,
                    sampleRow: rows[1] ? (rows[1].slice(0, 80) + (rows[1].length > 80 ? '...' : '')) : ''
                });
                console.log('[CV-RECORD] export completed', summary);
                if (typeof window !== 'undefined' && window.self !== window.top) {
                    window.parent.postMessage({ type: 'cv-record-export-complete', summary }, '*');
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `cv-detections-${Date.now()}.zip`;
                a.click();
                URL.revokeObjectURL(a.href);
            });
            this.cvDetectionHistory = [];
        }, 250);
    }
    */

    private cvAutoStepRunning = false;

    /* startAutoStepLoop 已暂时注释
    private startAutoStepLoop() {
        this.cvAutoStepRunning = true;
        const loop = async () => {
            while (this.cvAutoStepRunning) {
                await this.stepOneFrame();
                await new Promise<void>((r) => setTimeout(r, 100));
            }
        };
        loop();
    }
    */

    private async stepOneFrame() {
        const bridge = getCVBridge(this.game);
        if (!bridge.isConnected()) {
            console.log('[CV-RECORD] stepOneFrame skipped: bridge not connected');
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const autoMode = urlParams.get('auto') === '1';

        if (autoMode && this.waitingForCV) return;
        this.waitingForCV = true;

        if (this.cvStepText) this.cvStepText.setText('CV: Processing...');

        try {
            const { pixels, width, height, colorMap } = this.captureColorCodedFrame();
            // Send activeIds to server so Python filters before broadcasting to CV UI
            const activeIds = this.board.getColorCodeObjectIds();
            const response = await bridge.sendFrameAndWait({ pixels, width, height }, colorMap, activeIds);
            this.cvStepCount++;
            const detections = response.detections || {};
            const objects = (detections.objects || []) as Array<{ id: number; x: number; y: number; tubeId?: number; index?: number }>;
            //const tubes = objects.filter(o => o.id < 100);
            //const balls = objects
            //    .filter(o => o.id >= 100 && o.id < 500)
            //    .map(o => ({ ...o, tubeId: Math.floor((o.id - 100) / 10), index: (o.id - 100) % 10 }));
            const liquidDetected = objects.some(o => o.id === 1000);
            const expressionDetected = objects.some(o => o.id === 1001);
            // CV 录制已暂时注释：不再 push 到 cvDetectionHistory
            // if (this.cvAutoStepRunning) {
            //     this.cvDetectionHistory.push({
            //         timestamp: Date.now(),
            //         tubes: tubes.map(t => ({ id: t.id, x: t.x, y: t.y })),
            //         balls: balls.map(b => ({ id: b.id, x: b.x, y: b.y, tubeId: b.tubeId, index: b.index }))
            //     });
            //     console.log('[CV-RECORD] frame', this.cvDetectionHistory.length);
            // }
            const liquidExpr = ` | 液体${liquidDetected?'✓':'-'} 表情${expressionDetected?'✓':'-'}`;
            if (this.cvStepText) this.cvStepText.setText(autoMode ? `CV: Step ${this.cvStepCount}${liquidExpr}` : `CV: Step ${this.cvStepCount}${liquidExpr} - Press S`);
            if (!autoMode) {
                this.scene.resume();
                this.events.once('postupdate', () => this.scene.pause());
            }
        } catch (err) {
            console.error('[CV-COLOR] error:', err);
            this.cvAutoStepRunning = false;
            if (this.cvStepText) this.cvStepText.setText('CV: Error - Press S');
        } finally {
            if (autoMode) this.waitingForCV = false;
        }
    }

    /**
     * Capture a color-coded frame for CV detection.
     * Each game object is rendered as a flat colored shape using its unique ID color.
     * Uses forced render: save state → apply ID colors → render → capture → restore → render.
     */
    /**
     * Build the color map once per game session and cache it.
     * Colors cover all possible tube/ball/hand/button IDs so they never change between frames.
     *
     * ID ranges:
     *   Tubes    0-13
     *   Balls    100 + tubeId*10 + slotIndex  (max 100+13*10+7 = 237)
     *   Liquid   1000 (升起的水球液体动画，点击试管后出现)
     *   Expression 1001 (升起的水球表情，点击试管后出现)
     *   Hand     500  (kept > 237 to avoid collision with ball range)
     *   Icon     501
     *   Download 502
     */
    private static readonly ID_LIQUID = 1000;
    private static readonly ID_EXPRESSION = 1001;
    private static readonly ID_BACKGROUND = 9999;

    private ensureColorMap(): { colorMap: ColorMap; idToColor: Map<number, number> } {
        if (this._colorMap && this._idToColor) {
            return { colorMap: this._colorMap, idToColor: this._idToColor };
        }
        const allIds = [...this.board.getColorMapIds(), Game.ID_BACKGROUND];
        const result = generateColorMap(allIds);
        this._colorMap = result.colorMap;
        this._idToColor = result.idToColor;
        return result;
    }

    public captureColorCodedFrame(): { pixels: string, width: number, height: number, colorMap: ColorMap } {
        // Reuse the stable color map (same colors every frame)
        const { colorMap, idToColor } = this.ensureColorMap();

        // Apply ID mode to board (tubes + balls + hand)
        const restoreBoard = this.board.applyIdRenderMode(idToColor);

        // Apply ID mode to all registered CV tintables (background, icon, download, etc.)
        this.cvTintables.forEach(({ obj, id }) => {
            if (obj && typeof (obj as any).setTintFill === 'function') {
                (obj as any).setTintFill(idToColor.get(id) ?? 0x888888);
            }
        });

        // Hide non-tagged UI elements (cvStepText, debugText; centerDownloadText 已注册 cvTintable 502，与按钮一起 tint)
        const savedCvText = this.cvStepText?.visible;
        const savedDebugText = this.debugText?.visible;
        if (this.cvStepText) this.cvStepText.setVisible(false);
        if (this.debugText) this.debugText.setVisible(false);

        // Force render the ID-colored scene
        const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        renderer.preRender();
        this.children.depthSort();
        (this.cameras as any).render(renderer, this.children, 1);
        renderer.postRender();

        // Delegate canvas capture + blend filtering to the generic CV utility.
        // extractValidPixels: downsamples 4x with nearest-neighbor, rejects
        // semi-transparent edges (alpha < 200), snaps to nearest grid color,
        // and applies per-channel tolerance to discard GPU-blended boundary pixels.
        // Set cv.keepBlendedPixels: true in output-config.json to retain blended edge pixels.
        const keepBlended = getOutputConfigValue<boolean>('cv.keepBlendedPixels', false);
        const pixels = extractValidPixels(this.game.canvas, colorMap, 4, { keepBlendedPixels: keepBlended });

        // Restore everything
        restoreBoard();
        this.cvTintables.forEach(({ obj }) => {
            if (obj && typeof (obj as any).clearTint === 'function') {
                (obj as any).clearTint();
            }
        });
        if (this.cvStepText) this.cvStepText.setVisible(savedCvText!);
        if (this.debugText) this.debugText.setVisible(savedDebugText!);

        // Force render to restore normal view
        renderer.preRender();
        this.children.depthSort();
        (this.cameras as any).render(renderer, this.children, 1);
        renderer.postRender();

        const CV_DOWNSAMPLE = 4;
        const w = Math.round(this.game.canvas.width / CV_DOWNSAMPLE);
        const h = Math.round(this.game.canvas.height / CV_DOWNSAMPLE);
        return { pixels, width: w, height: h, colorMap };
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

    private createBackground() {
        const isPortrait = window.innerHeight > window.innerWidth;
        const width = isPortrait ? 1080 : 2160;
        const height = isPortrait ? 2160 : 1080;
        const bgKey = isPortrait ? 'bg-v' : 'bg-h';
        this.backgroundImage = this.add.image(width / 2, height / 2, bgKey);
        this.backgroundImage.setDisplaySize(width, height);
        this.backgroundImage.setDepth(-1000);
        this.registerCvTintable(this.backgroundImage, Game.ID_BACKGROUND);
    }

    private registerCvTintable(obj: Phaser.GameObjects.GameObject, id: number) {
        this.cvTintables.push({ obj, id });
    }

    private updateBackground() {
        if (!this.backgroundImage) return;
        const isPortrait = window.innerHeight > window.innerWidth;
        const width = isPortrait ? 1080 : 2160;
        const height = isPortrait ? 2160 : 1080;
        const bgKey = isPortrait ? 'bg-v' : 'bg-h';
        if (this.backgroundImage.texture?.key !== bgKey) {
            this.backgroundImage.setTexture(bgKey);
        }
        this.backgroundImage.setPosition(width / 2, height / 2);
        this.backgroundImage.setDisplaySize(width, height);
    }

    private createUIButtons() {
        // 计算当前屏幕尺寸
        const isPortrait = window.innerHeight > window.innerWidth;
        const width = isPortrait ? 1080 : 2160;
        const height = isPortrait ? 2160 : 1080;

        // 左上角 icon（x/y 为 0-1 相对屏幕比例，适配任意分辨率；若超出可见区域则自动缩小）
        const iconCfg = isPortrait ? Config.UI_CONFIG.ICON.PORTRAIT : Config.UI_CONFIG.ICON.LANDSCAPE;
        const baseW = (iconCfg as { displayWidth?: number }).displayWidth ?? 128;
        const baseH = (iconCfg as { displayHeight?: number }).displayHeight ?? 128;
        const iconNormX = (iconCfg as { x?: number }).x ?? 0;
        const iconNormY = (iconCfg as { y?: number }).y ?? 0;
        const iconX = width * iconNormX;
        const iconY = height * iconNormY;
        const { x: finalX, y: finalY, w: iconW, h: iconH } = this.getIconDisplaySize(width, height, iconX, iconY, baseW, baseH);
        this.iconBtn = this.add.image(finalX, finalY, 'icon');
        this.iconBtn.setDisplaySize(iconW, iconH);
        this.iconBtn.setOrigin(0, 0);
        this.iconBtn.setInteractive();
        this.iconBtn.on('pointerdown', () => download());
        this.registerCvTintable(this.iconBtn, 501);

        const btnCfg = this.getDownloadBtnConfig(isPortrait);
        const { px: btnX, py: btnY } = this.btnPosFromNorm(width, height, btnCfg.x, btnCfg.y);

        // 创建按钮容器
        this.centerBtnContainer = this.add.container(btnX, btnY);
        this.centerBtnContainer.setScale(btnCfg.scale);

        // 按钮背景图片
        const targetWidth = 338;
        const targetHeight = 106;
        this.centerBtn = this.add.image(0, 0, 'download');
        this.centerBtn.setDisplaySize(targetWidth, targetHeight);
        this.centerBtnContainer.add(this.centerBtn);
        this.registerCvTintable(this.centerBtn, 502);

        // 添加多语言文字（与按钮同 ID 502，CV 捕获时一起 tint，避免隐藏/恢复导致不显示）
        const downloadText = this.add.text(0, 0, getDownloadText(), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#6a2f00'
        });
        downloadText.setOrigin(0.5, 0.5);
        this.centerBtnContainer.add(downloadText);
        this.registerCvTintable(downloadText, 502);

        // 设置交互区域
        this.centerBtnContainer.setInteractive(
            new Phaser.Geom.Rectangle(-targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight),
            Phaser.Geom.Rectangle.Contains
        );
        this.centerBtnContainer.on('pointerdown', () => {
            EventBus.emit('download-click');
            download();
        });

        // 添加缩放动画
        this.tweens.add({
            targets: this.centerBtnContainer,
            scale: { from: btnCfg.scale, to: btnCfg.scale * 1.1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private onWindowResize() {
        this.updateGameSize();
    }

    private getDownloadBtnConfig(isPortrait: boolean): { x: number; y: number; scale: number } {
        const cfg = Config.UI_CONFIG.DOWNLOAD_BTN as {
            PORTRAIT?: { x?: number; y?: number; scale?: number };
            LANDSCAPE?: { x?: number; y?: number; scale?: number };
        };
        const base = isPortrait ? cfg.PORTRAIT : cfg.LANDSCAPE;
        return {
            x: base?.x ?? 0,
            y: base?.y ?? 0.82,
            scale: base?.scale ?? 1
        };
    }

    /** -1~1 转屏幕坐标，0 表示中心 */
    private btnPosFromNorm(width: number, height: number, x: number, y: number): { px: number; py: number } {
        return {
            px: width * (x + 1) / 2,
            py: height * (y + 1) / 2
        };
    }

    /** 获取安全区域 inset（刘海等），单位 px */
    private getSafeAreaInsets(): { top: number; left: number; right: number; bottom: number } {
        try {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);pointer-events:none;visibility:hidden;';
            document.body.appendChild(div);
            const s = getComputedStyle(div);
            const top = parseFloat(s.paddingTop) || 0;
            const right = parseFloat(s.paddingRight) || 0;
            const bottom = parseFloat(s.paddingBottom) || 0;
            const left = parseFloat(s.paddingLeft) || 0;
            document.body.removeChild(div);
            return { top, right, bottom, left };
        } catch {
            return { top: 0, left: 0, right: 0, bottom: 0 };
        }
    }

    /** 获取 object-fit:cover 下可见的游戏区域（游戏坐标，含安全区域） */
    private getVisibleGameRect(gameWidth: number, gameHeight: number): { x: number; y: number; width: number; height: number } {
        const container = this.scale.canvas?.parentElement;
        if (!container) return { x: 0, y: 0, width: gameWidth, height: gameHeight };
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const safe = this.getSafeAreaInsets();
        const safeW = cw - safe.left - safe.right;
        const safeH = ch - safe.top - safe.bottom;
        if (safeW <= 0 || safeH <= 0) return { x: 0, y: 0, width: gameWidth, height: gameHeight };
        const scale = Math.max(cw / gameWidth, ch / gameHeight);
        const scaledW = gameWidth * scale;
        const scaledH = gameHeight * scale;
        const offsetX = (cw - scaledW) / 2;
        const offsetY = (ch - scaledH) / 2;
        return {
            x: (safe.left - offsetX) / scale,
            y: (safe.top - offsetY) / scale,
            width: safeW / scale,
            height: safeH / scale
        };
    }

    /** 计算 icon 在可见区域内能用的 displaySize 与位置（若超出则缩小并可能微调位置） */
    private getIconDisplaySize(
        gameWidth: number,
        gameHeight: number,
        iconX: number,
        iconY: number,
        baseW: number,
        baseH: number
    ): { x: number; y: number; w: number; h: number } {
        const visible = this.getVisibleGameRect(gameWidth, gameHeight);
        const visRight = visible.x + visible.width;
        const visBottom = visible.y + visible.height;
        let x = iconX;
        let y = iconY;
        let w = baseW;
        let h = baseH;
        if (x < visible.x) x = visible.x;
        if (y < visible.y) y = visible.y;
        if (x + w > visRight) w = Math.max(1, visRight - x);
        if (y + h > visBottom) h = Math.max(1, visBottom - y);
        let scale = Math.min(w / baseW, h / baseH, 1);
        scale = Math.max(0.2, scale);
        w = baseW * scale;
        h = baseH * scale;
        if (x + w > visRight) x = visRight - w;
        if (y + h > visBottom) y = visBottom - h;
        if (x < visible.x) x = visible.x;
        if (y < visible.y) y = visible.y;
        return { x, y, w, h };
    }

    private updateGameSize() {
        const isPortrait = window.innerHeight > window.innerWidth;
        const width = isPortrait ? 1080 : 2160;
        const height = isPortrait ? 2160 : 1080;

        this.scale.setGameSize(width, height);

        // 更新背景尺寸和方向
        this.updateBackground();

        // 显式刷新 Board 布局，避免 scale resize 事件顺序导致旋转后位置错误
        if (this.board) {
            this.board.refreshLayout();
        }

        const icon = isPortrait ? Config.UI_CONFIG.ICON.PORTRAIT : Config.UI_CONFIG.ICON.LANDSCAPE;
        if (this.iconBtn) {
            const baseW = (icon as { displayWidth?: number }).displayWidth ?? 128;
            const baseH = (icon as { displayHeight?: number }).displayHeight ?? 128;
            const iconNormX = (icon as { x?: number }).x ?? 0;
            const iconNormY = (icon as { y?: number }).y ?? 0;
            const iconX = width * iconNormX;
            const iconY = height * iconNormY;
            const visible = this.getVisibleGameRect(width, height);
            const { x: finalX, y: finalY, w: iconW, h: iconH } = this.getIconDisplaySize(width, height, iconX, iconY, baseW, baseH);
            this.iconBtn.setPosition(finalX, finalY);
            this.iconBtn.setDisplaySize(iconW, iconH);
            const inBounds =
                finalX >= visible.x &&
                finalY >= visible.y &&
                finalX + iconW <= visible.x + visible.width &&
                finalY + iconH <= visible.y + visible.height;
            const iconRect = { x: finalX, y: finalY, w: iconW, h: iconH };
            if (import.meta.env.DEV) {
                console.log('[icon-debug]', { visibleRect: visible, iconRect, inBounds });
            }
            (window as unknown as { __iconDebug?: unknown }).__iconDebug = { visibleRect: visible, iconRect, inBounds };
            if (typeof window !== 'undefined' && window !== window.top) {
                window.parent.postMessage({ type: 'icon-debug', visibleRect: visible, iconRect, inBounds }, '*');
            }
        }

        if (this.centerBtnContainer) {
            const btnCfg = this.getDownloadBtnConfig(isPortrait);
            const { px, py } = this.btnPosFromNorm(width, height, btnCfg.x, btnCfg.y);
            this.centerBtnContainer.setPosition(px, py);
            this.centerBtnContainer.setScale(btnCfg.scale);
            this.tweens.killTweensOf(this.centerBtnContainer);
            this.tweens.add({
                targets: this.centerBtnContainer,
                scale: { from: btnCfg.scale, to: btnCfg.scale * 1.1 },
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
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
        const iconOffsetY = Config.UI_CONFIG.POPUP.ICON_OFFSET_Y;
        const icon = this.add.image(0, iconOffsetY, 'icon');
        icon.setScale(0.5);
        icon.setInteractive();
        icon.on('pointerdown', handleClick);
        this.victoryPopup.add(icon);

        // 添加download按钮容器（调整位置适应缩小后的icon）
        const downloadBtnY = (icon.height * 0.5) / 2 + Config.UI_CONFIG.POPUP.DOWNLOAD_BTN_OFFSET_Y;
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
        const iconOffsetY = Config.UI_CONFIG.POPUP.ICON_OFFSET_Y;
        const icon = this.add.image(0, iconOffsetY, 'icon');
        icon.setScale(0.5);
        icon.setInteractive();
        icon.on('pointerdown', handleClick);
        this.victoryPopup.add(icon);

        // 添加download按钮容器（调整位置适应缩小后的icon）
        const downloadBtnY = (icon.height * 0.5) / 2 + Config.UI_CONFIG.POPUP.DOWNLOAD_BTN_OFFSET_Y;
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
        window.removeEventListener('resize', this.resizeHandler);
        EventBus.off('pauseAd', this.pauseGameSound, this);
        EventBus.off('showAd', this.resumeGameSound, this);
        EventBus.off('level-selected', this.onLevelSelected, this);
        EventBus.off('game-over', this.showVictoryPopup, this);
        EventBus.off('game-deadlock', this.showDeadlockPopup, this);
        EventBus.off('jump-step', this.onJumpStep, this);
        EventBus.off('tube-completed', this.onTubeCompleted, this);
    }
}
