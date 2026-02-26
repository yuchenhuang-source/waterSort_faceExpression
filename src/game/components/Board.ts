import { Scene } from 'phaser';
import { Tube } from './Tube';
import { Ball } from './Ball';
import { GAME_CONFIG, BALL_COLORS, BallColor } from '../constants/GameConstants';
import { EventBus } from '../EventBus';
import { getOutputConfigValueAsync } from '../../utils/outputConfigLoader';
import { generatePuzzleWithAdapter, validatePuzzle, PuzzleAdapterResult } from '../../utils/puzzle-adapter';

/**
 * 表示一个可能的移动
 */
interface Move {
    source: Tube;
    target: Tube;
    ballCount: number;  // 可移动的球数
    score: number;      // 移动的评分
}

export class Board extends Phaser.GameObjects.Container {
    private tubes: Tube[] = [];
    private selectedTube: Tube | null = null;
    private hand: Phaser.GameObjects.Image | null = null;
    private handTween: Phaser.Tweens.Tween | null = null;
    private handFadeTween: Phaser.Tweens.Tween | null = null;
    private handMoveTween: Phaser.Tweens.Tween | null = null;
    private handBaseY: number = 0; // 手指的基准Y位置（用于点击动画）
    private isGameActive: boolean = false;
    private idleTimer: number = 0;
    private static readonly IDLE_HINT_DELAY = 5000; // 5秒无操作后显示引导
    private static readonly FADE_DURATION = 200; // 淡入淡出时长
    
    // 引导系统状态
    private hintSourceTube: Tube | null = null;  // 引导的源试管
    private hintTargetTube: Tube | null = null;  // 引导的目标试管
    private hintStep: 'none' | 'source' | 'target' = 'none'; // 引导步骤
    
    // 计数器
    private jumpStepCount: number = 0;      // 跳转步数计数器
    private completedTubeCount: number = 0;  // 完成试管数计数器
    
    // 难度配置
    private difficulty: number = 10;  // 默认最高难度
    private emptyTubeCount: number = 2;  // 空管数量，默认2

    constructor(scene: Scene, preGeneratedPuzzle?: PuzzleAdapterResult, preDifficulty?: number, preEmptyTubeCount?: number) {
        super(scene, 0, 0);

        this.createTubes();
        
        // 如果 Preloader 阶段已生成谜题，直接使用；否则异步加载难度配置后生成
        if (preGeneratedPuzzle && preDifficulty !== undefined && preEmptyTubeCount !== undefined) {
            // 设置难度配置
            this.difficulty = preDifficulty;
            this.emptyTubeCount = preEmptyTubeCount;
            // 使用 Preloader 阶段生成的谜题，立即初始化球（避免重复生成）
            this.initializeBallsWithPuzzle(preGeneratedPuzzle);
        } else {
            // 兼容旧逻辑：如果没有传入谜题，则异步加载配置后生成
            this.loadDifficultyAndInitialize();
        }
        
        this.createHand();
        
        // 监听窗口大小变化
        scene.scale.on('resize', this.handleResize, this);
        this.handleResize(scene.scale.gameSize);

        // 启动空闲计时器
        scene.events.on('update', this.update, this);
        
        // 监听试管完成事件
        EventBus.on('tube-complete-internal', this.onTubeCompleteInternal, this);
        
        scene.add.existing(this);
        this.isGameActive = true;
    }
    
    /**
     * 处理试管完成内部事件（在试管完成动画结束后触发）
     */
    private onTubeCompleteInternal(tubeId: number) {
        // 每次都重新计算完成的试管数量，避免重复计数问题
        this.updateCompletedTubeCount();
        
        // 在试管完成动画结束后再检查游戏胜利
        // 这样确保弹窗在动画结束后才显示
        this.checkWinConditionAfterAnimation();
    }

    private createTubes() {
        for (let i = 0; i < GAME_CONFIG.TUBE_COUNT; i++) {
            const tube = new Tube(this.scene, 0, 0, i);
            tube.on('pointerdown', () => this.handleTubeClick(tube));
            this.add(tube);
            this.tubes.push(tube);
        }
    }

    /**
     * 检查是否是debug模式
     */
    private isDebugMode(): boolean {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('debug') === '1';
    }

    /**
     * 异步加载难度配置并初始化球
     */
    private async loadDifficultyAndInitialize() {
        try {
            const difficulty = await getOutputConfigValueAsync<number>('difficulty', 10);
            this.difficulty = Math.max(1, Math.min(10, difficulty)); // 限制在1-10之间
            
            const emptyTubeCount = await getOutputConfigValueAsync<number>('emptyTubeCount', 2);
            this.emptyTubeCount = Math.max(1, Math.min(6, emptyTubeCount)); // 限制在1-6之间
        } catch (e) {
            console.warn('[Board] 加载配置失败，使用默认值');
            this.difficulty = 10;
            this.emptyTubeCount = 2;
        }
        
        this.initializeBalls();
    }

    private initializeBalls() {
        if (this.isDebugMode()) {
            this.initializeDebugBalls();
        } else {
            this.initializeNormalBalls();
        }
    }

    /**
     * 根据难度计算颜色数
     * 难度1 = 3种颜色，难度10 = 12种颜色
     */
    private getColorCountByDifficulty(): number {
        return this.difficulty + 2;
    }

    /**
     * 根据难度生成颜色和每种颜色的球数分配
     *
     * 策略：
     * - 总共需要填满12个试管（96个球）
     * - 颜色数 = difficulty + 2 (3-12种)
     * - 每种颜色的球数必须是8的倍数
     *
     * 例如：
     * - 3种颜色：每种32个球(4管)
     * - 4种颜色：每种24个球(3管)
     * - 6种颜色：每种16个球(2管)
     * - 5种颜色：2种24球(3管) + 3种16球(2管) = 48+48 = 96
     * - 12种颜色：每种8个球(1管)
     */
    private generateColorDistribution(): { color: BallColor; count: number }[] {
        const numColors = this.getColorCountByDifficulty();
        const totalTubes = 12; // 需要填满的试管数
        const ballsPerTube = GAME_CONFIG.TUBE_CAPACITY; // 8
        
        // 计算每种颜色的基础管数和额外管
        const tubesPerColor = Math.floor(totalTubes / numColors);
        const extraTubes = totalTubes % numColors;
        
        // 随机选择颜色
        const shuffledColors = [...BALL_COLORS].sort(() => Math.random() - 0.5);
        const selectedColors = shuffledColors.slice(0, numColors);
        
        // 分配球数
        const distribution: { color: BallColor; count: number }[] = [];
        
        for (let i = 0; i < numColors; i++) {
            // 前 extraTubes 种颜色多分配一管
            const tubes = i < extraTubes ? tubesPerColor + 1 : tubesPerColor;
            const balls = tubes * ballsPerTube;
            
            distribution.push({
                color: selectedColors[i],
                count: balls
            });
        }
        
        return distribution;
    }

    /**
     * 使用 Preloader 阶段生成的谜题初始化球（优化：避免重复生成）
     */
    private initializeBallsWithPuzzle(result: PuzzleAdapterResult) {
        const tubeContents = result.tubes;
        
        // 验证生成的谜题
        const validation = validatePuzzle(tubeContents);
        if (!validation.valid && import.meta.env.DEV) {
            console.error('[Board] 谜题验证失败:', validation.errors);
        }

        // 根据生成的状态创建实际的球
        // 优化：先批量添加所有球（跳过绘制），最后统一绘制，减少96次drawLiquid调用
        for (let i = 0; i < tubeContents.length; i++) {
            for (const color of tubeContents[i]) {
                const ball = new Ball(this.scene, 0, 0, color);
                this.tubes[i].addBall(ball, false, true); // 第三个参数：skipDraw = true
            }
        }
        
        // 批量添加完成后，统一绘制液体和检查高亮
        for (let i = 0; i < this.tubes.length; i++) {
            this.tubes[i].requestDrawLiquid();
            this.tubes[i].checkSameColorHighlight();
        }
    }

    /**
     * 正常模式初始化球 - 使用新的逆向生成器（保证可解）
     * 注意：此方法仅在未传入预生成谜题时调用（兼容旧逻辑）
     *
     * 新生成器策略：
     * 1. 从完成状态开始，通过逆向合法移动打乱
     * 2. 保证任何生成的谜题都是可解的
     * 3. 支持确定性种子，相同种子产生相同谜题
     */
    private initializeNormalBalls() {
        // 使用新的谜题生成器
        const result = generatePuzzleWithAdapter({
            difficulty: this.difficulty,
            emptyTubeCount: this.emptyTubeCount,
            // seed: undefined,  // 可设置固定种子用于测试
        });
        
        // 复用相同的初始化逻辑
        this.initializeBallsWithPuzzle(result);
    }

    /**
     * 层级配置
     * 将8个高度位置分成4层，每层2个位置
     * 层级顺序：顶层(A) -> 中上层(B) -> 中下层(C) -> 底层(D)
     */
    private readonly LAYER_CONFIG = {
        A: { positions: [6, 7], name: '顶层' },    // 最顶层，最先完成
        B: { positions: [4, 5], name: '中上层' },  // 第二层
        C: { positions: [2, 3], name: '中下层' },  // 第三层
        D: { positions: [0, 1], name: '底层' }     // 最底层，最后完成
    };

    /**
     * 根据难度生成分层谜题 - 核心算法
     *
     * 核心策略（最终版-修正）：
     * 1. 每种颜色的球数是 8 的倍数（由 generateColorDistribution 保证）
     * 2. 每种颜色集中分布在相近的高度位置
     * 3. 从顶部开始分配颜色，玩家可以先完成顶部颜色
     * 4. 最后进行少量层间交换增加趣味性
     *
     * 关键：每个位置层必须恰好有 12 球（numFilledTubes），颜色可以跨层
     */
    private generateLayeredPuzzleByDifficulty(emptyTubeCount: number): BallColor[][] {
        const totalTubes = GAME_CONFIG.TUBE_COUNT;
        const capacity = GAME_CONFIG.TUBE_CAPACITY; // 8
        const numFilledTubes = totalTubes - emptyTubeCount; // 12个有球的试管
        
        // 1. 获取颜色分配（每种颜色的球数是 8 的倍数）
        const colorDistribution = this.generateColorDistribution();
        
        // 2. 生成所有球的序列，按颜色分组排列（颜色1的所有球，颜色2的所有球...）
        const allBalls: BallColor[] = [];
        for (const { color, count } of colorDistribution) {
            for (let i = 0; i < count; i++) {
                allBalls.push(color);
            }
        }
        
        // 3. 为每个位置层创建球的列表（每层正好12球）
        const positionBalls: BallColor[][] = Array.from({ length: capacity }, () => []);
        
        // 从顶部位置（7）开始，按顺序填充
        // 按颜色顺序分配，让同色球尽量集中在相邻位置
        let ballIndex = 0;
        for (let pos = capacity - 1; pos >= 0 && ballIndex < allBalls.length; pos--) {
            for (let i = 0; i < numFilledTubes && ballIndex < allBalls.length; i++) {
                positionBalls[pos].push(allBalls[ballIndex++]);
            }
        }
        
        // 4. 打乱每个位置层的球顺序（保持颜色数量不变）
        for (let pos = 0; pos < capacity; pos++) {
            const balls = positionBalls[pos];
            for (let i = balls.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [balls[i], balls[j]] = [balls[j], balls[i]];
            }
            
            // 验证：每层应该有 numFilledTubes 个球
            if (balls.length !== numFilledTubes) {
                console.error(`[分层谜题] 严重错误：位置 ${pos} 有 ${balls.length} 球, 应为 ${numFilledTubes}`);
            }
        }
        
        // 5. 将球分配到试管（每个试管从位置0到位置7各取一球）
        const tubeContents: BallColor[][] = [];
        for (let i = 0; i < totalTubes; i++) {
            if (i < numFilledTubes) {
                const tube: BallColor[] = [];
                for (let pos = 0; pos < capacity; pos++) {
                    const ball = positionBalls[pos][i];
                    if (ball === undefined) {
                        console.error(`[分层谜题] 严重错误：positionBalls[${pos}][${i}] 是 undefined`);
                    }
                    tube.push(ball);
                }
                tubeContents.push(tube);
            } else {
                tubeContents.push([]); // 空试管
            }
        }
        
        // 6. 根据难度进行层间交换（打乱但保持大致分层）
        this.addLayerInterchange(tubeContents, numFilledTubes, capacity);
        
        return tubeContents;
    }

    /**
     * 根据难度添加层间交换
     * 交换相邻层之间的球，增加趣味性但保持可玩性
     */
    private addLayerInterchange(
        tubeContents: BallColor[][],
        numFilledTubes: number,
        capacity: number
    ) {
        // 难度越高，交换越多
        const swapCount = Math.floor(this.difficulty * 2);
        
        for (let s = 0; s < swapCount; s++) {
            // 随机选择一个位置（除了最顶层）
            const pos = Math.floor(Math.random() * (capacity - 1)); // 0 到 6
            
            // 随机选择两个不同的管
            const tube1 = Math.floor(Math.random() * numFilledTubes);
            let tube2 = Math.floor(Math.random() * numFilledTubes);
            while (tube2 === tube1) {
                tube2 = Math.floor(Math.random() * numFilledTubes);
            }
            
            // 交换相邻位置的球（pos 和 pos+1）
            const ball1 = tubeContents[tube1][pos];
            const ball2 = tubeContents[tube2][pos + 1];
            
            if (ball1 && ball2 && ball1 !== ball2) {
                tubeContents[tube1][pos] = ball2;
                tubeContents[tube2][pos + 1] = ball1;
            }
        }
    }

    /**
     * 原始的分层谜题生成（12色满难度）- 保留作为参考
     */
    private generateLayeredPuzzle(emptyTubeCount: number): BallColor[][] {
        const totalTubes = GAME_CONFIG.TUBE_COUNT;
        const capacity = GAME_CONFIG.TUBE_CAPACITY;
        const numFilledTubes = totalTubes - emptyTubeCount; // 12个有球的试管
        
        // 1. 随机打乱颜色顺序，然后分成4组
        const shuffledColors = [...BALL_COLORS].sort(() => Math.random() - 0.5);
        const colorGroups = {
            A: shuffledColors.slice(0, 3),   // 顶层3种颜色
            B: shuffledColors.slice(3, 6),   // 中上层3种颜色
            C: shuffledColors.slice(6, 9),   // 中下层3种颜色
            D: shuffledColors.slice(9, 12)   // 底层3种颜色
        };
        
        // 2. 初始化试管内容
        const tubeContents: BallColor[][] = [];
        for (let i = 0; i < totalTubes; i++) {
            if (i < numFilledTubes) {
                tubeContents.push(Array(capacity).fill(null as unknown as BallColor));
            } else {
                tubeContents.push([]); // 空试管
            }
        }
        
        // 3. 为每个层级填充对应颜色组的球
        const layers = ['D', 'C', 'B', 'A'] as const; // 从底层开始填充
        
        for (const layerKey of layers) {
            const layer = this.LAYER_CONFIG[layerKey];
            const colors = colorGroups[layerKey];
            
            // 该层级需要填充的所有球（3种颜色 × 8个 = 24个球）
            const ballsForLayer: BallColor[] = [];
            for (const color of colors) {
                for (let i = 0; i < capacity; i++) {
                    ballsForLayer.push(color);
                }
            }
            
            // 随机打乱这些球的顺序
            for (let i = ballsForLayer.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ballsForLayer[i], ballsForLayer[j]] = [ballsForLayer[j], ballsForLayer[i]];
            }
            
            // 将球分配到各个试管的对应位置
            // 每层有2个位置，12个试管，共24个位置正好放24个球
            let ballIndex = 0;
            for (const position of layer.positions) {
                for (let tubeIndex = 0; tubeIndex < numFilledTubes; tubeIndex++) {
                    if (ballIndex < ballsForLayer.length) {
                        tubeContents[tubeIndex][position] = ballsForLayer[ballIndex];
                        ballIndex++;
                    }
                }
            }
        }
        
        // 4. 额外打乱：在相邻层之间进行有限的交换，增加趣味性
        this.addLayerVariation(tubeContents, colorGroups, numFilledTubes);
        
        return tubeContents;
    }

    /**
     * 在相邻层之间添加一些变化，避免过于规整
     * 只在相邻层的边界位置交换，保持可按层解决的特性
     */
    private addLayerVariation(
        tubeContents: BallColor[][],
        colorGroups: Record<string, BallColor[]>,
        numFilledTubes: number
    ) {
        // 相邻层的边界位置对
        const adjacentPairs = [
            { layer1Pos: 7, layer2Pos: 5, group1: 'A', group2: 'B' }, // 顶层与中上层边界
            { layer1Pos: 5, layer2Pos: 3, group1: 'B', group2: 'C' }, // 中上层与中下层边界
            { layer1Pos: 3, layer2Pos: 1, group1: 'C', group2: 'D' }  // 中下层与底层边界
        ];
        
        // 对每对相邻层，随机交换一些球
        for (const pair of adjacentPairs) {
            // 30%的概率进行交换
            const swapCount = Math.floor(Math.random() * 3); // 0-2次交换
            
            for (let s = 0; s < swapCount; s++) {
                // 随机选择两个不同的试管
                const tube1 = Math.floor(Math.random() * numFilledTubes);
                let tube2 = Math.floor(Math.random() * numFilledTubes);
                while (tube2 === tube1) {
                    tube2 = Math.floor(Math.random() * numFilledTubes);
                }
                
                // 交换边界位置的球
                const ball1 = tubeContents[tube1][pair.layer1Pos];
                const ball2 = tubeContents[tube2][pair.layer2Pos];
                
                // 只有当颜色属于预期的组时才交换
                const colors1 = colorGroups[pair.group1 as keyof typeof colorGroups];
                const colors2 = colorGroups[pair.group2 as keyof typeof colorGroups];
                
                if (colors1.includes(ball1) && colors2.includes(ball2)) {
                    tubeContents[tube1][pair.layer1Pos] = ball2;
                    tubeContents[tube2][pair.layer2Pos] = ball1;
                }
            }
        }
    }

    /**
     * 验证基于难度的分层谜题是否有效
     */
    private isLayeredPuzzleValidByDifficulty(tubeContents: BallColor[][]): boolean {
        const capacity = GAME_CONFIG.TUBE_CAPACITY;
        const colorDistribution = this.generateColorDistribution();
        
        // 检查前12个试管是否都是满的
        for (let i = 0; i < 12; i++) {
            if (tubeContents[i].length !== capacity) {
                return false;
            }
            // 检查是否有null值
            if (tubeContents[i].some(ball => ball === null)) {
                return false;
            }
        }
        
        // 检查后2个试管是否为空
        for (let i = 12; i < 14; i++) {
            if (tubeContents[i].length !== 0) {
                return false;
            }
        }
        
        // 检查每种颜色的数量是否正确
        const colorCounts = new Map<BallColor, number>();
        for (const tube of tubeContents) {
            for (const ball of tube) {
                if (ball) {
                    colorCounts.set(ball, (colorCounts.get(ball) || 0) + 1);
                }
            }
        }
        
        for (const { color, count } of colorDistribution) {
            if (colorCounts.get(color) !== count) {
                return false;
            }
        }

        return true;
    }

    /**
     * 验证分层谜题是否有效（原始12色版本）
     */
    private isLayeredPuzzleValid(tubeContents: BallColor[][]): boolean {
        const capacity = GAME_CONFIG.TUBE_CAPACITY;
        
        // 检查前12个试管是否都是满的
        for (let i = 0; i < 12; i++) {
            if (tubeContents[i].length !== capacity) {
                return false;
            }
            // 检查是否有null值
            if (tubeContents[i].some(ball => ball === null)) {
                return false;
            }
        }
        
        // 检查后2个试管是否为空
        for (let i = 12; i < 14; i++) {
            if (tubeContents[i].length !== 0) {
                return false;
            }
        }
        
        // 检查每种颜色是否都有8个球
        const colorCounts = new Map<BallColor, number>();
        for (const tube of tubeContents) {
            for (const ball of tube) {
                if (ball) {
                    colorCounts.set(ball, (colorCounts.get(ball) || 0) + 1);
                }
            }
        }
        
        for (const color of BALL_COLORS) {
            if (colorCounts.get(color) !== capacity) {
                return false;
            }
        }

        return true;
    }

    /**
     * 生成谜题 - 保留原有逆向生成算法作为备用
     */
    private generatePuzzle(numColors: number, emptyTubeCount: number): BallColor[][] {
        const totalTubes = GAME_CONFIG.TUBE_COUNT;
        const capacity = GAME_CONFIG.TUBE_CAPACITY;
        
        // 1. 创建已完成状态（每个试管一种颜色，8个同色球）
        const tubeContents: BallColor[][] = [];
        for (let i = 0; i < totalTubes; i++) {
            if (i < numColors) {
                tubeContents.push(Array(capacity).fill(BALL_COLORS[i]));
            } else {
                tubeContents.push([]);
            }
        }
        
        // 2. 执行智能逆向移动打乱谜题
        const shuffleMoves = 300; // 增加移动次数确保充分打乱
        let consecutiveEmptyMoves = 0;
        
        for (let move = 0; move < shuffleMoves; move++) {
            // 找所有非空、非完成的试管作为可能的源
            const nonEmptyTubes = tubeContents
                .map((content, index) => ({ content, index }))
                .filter(t => t.content.length > 0);
            
            if (nonEmptyTubes.length === 0) break;
            
            // 计算每个试管的"纯度"（同色球比例），优先打乱纯度高的试管
            const weightedSources = nonEmptyTubes.map(t => {
                const colors = new Set(t.content);
                // 纯度越高（颜色种类越少），权重越大
                const purity = t.content.length / colors.size;
                return { ...t, weight: purity };
            });
            
            // 按权重随机选择源试管（纯度高的更容易被选中）
            const totalWeight = weightedSources.reduce((sum, t) => sum + t.weight, 0);
            let random = Math.random() * totalWeight;
            let sourceInfo = weightedSources[0];
            for (const t of weightedSources) {
                random -= t.weight;
                if (random <= 0) {
                    sourceInfo = t;
                    break;
                }
            }
            const sourceIndex = sourceInfo.index;
            
            // 找非满的目标试管
            const targetCandidates = tubeContents
                .map((content, index) => ({ content, index }))
                .filter(t => t.index !== sourceIndex && t.content.length < capacity);
            
            if (targetCandidates.length === 0) {
                consecutiveEmptyMoves++;
                if (consecutiveEmptyMoves > 10) break;
                continue;
            }
            consecutiveEmptyMoves = 0;
            
            // 智能选择目标试管：
            // - 优先选择非空管（颜色混合）
            // - 但有一定概率选择空管（保持解题空间）
            let targetIndex: number;
            const nonEmptyTargets = targetCandidates.filter(t => t.content.length > 0);
            const emptyTargets = targetCandidates.filter(t => t.content.length === 0);
            
            // 80%概率选非空管，20%概率选空管（如果有的话）
            if (nonEmptyTargets.length > 0 && (emptyTargets.length === 0 || Math.random() < 0.8)) {
                // 优先选择与源球颜色不同的目标（增加混乱度）
                const sourceTopColor = tubeContents[sourceIndex][tubeContents[sourceIndex].length - 1];
                const differentColorTargets = nonEmptyTargets.filter(t => {
                    const targetTopColor = t.content[t.content.length - 1];
                    return targetTopColor !== sourceTopColor;
                });
                
                if (differentColorTargets.length > 0 && Math.random() < 0.7) {
                    // 70%概率选择不同颜色的目标
                    targetIndex = differentColorTargets[Math.floor(Math.random() * differentColorTargets.length)].index;
                } else {
                    targetIndex = nonEmptyTargets[Math.floor(Math.random() * nonEmptyTargets.length)].index;
                }
            } else if (emptyTargets.length > 0) {
                targetIndex = emptyTargets[Math.floor(Math.random() * emptyTargets.length)].index;
            } else {
                continue;
            }
            
            // 决定移动多少球（1-3个，倾向于移动更多球）
            const maxPossible = Math.min(
                tubeContents[sourceIndex].length,
                capacity - tubeContents[targetIndex].length
            );
            
            // 倾向于移动更多球：50%概率移动最多可能，30%概率移动2个，20%概率移动1个
            let moveCount: number;
            const rand = Math.random();
            if (rand < 0.5) {
                moveCount = Math.min(maxPossible, 3);
            } else if (rand < 0.8) {
                moveCount = Math.min(maxPossible, 2);
            } else {
                moveCount = 1;
            }
            
            if (moveCount > 0) {
                const ballsToMove = tubeContents[sourceIndex].splice(-moveCount);
                tubeContents[targetIndex].push(...ballsToMove);
            }
        }
        
        // 3. 确保有足够的空管用于解题
        // 统计当前空管数量
        const currentEmptyCount = tubeContents.filter(t => t.length === 0).length;
        
        if (currentEmptyCount < emptyTubeCount) {
            // 需要创建更多空管：把一些球移动到其他管
            this.ensureEmptyTubes(tubeContents, emptyTubeCount);
        }
        
        // 4. 降低难度：创建容易移动的球段
        this.createEasyMoves(tubeContents);
        
        // 5. 重新排列，确保空管始终在最后
        this.moveEmptyTubesToEnd(tubeContents);
        
        return tubeContents;
    }

    /**
     * 降低难度：确保一种颜色的所有球都在试管顶部前两位
     * 策略：
     * 1. 随机选择一种颜色作为"容易完成"的颜色
     * 2. 找到这种颜色的所有8个球
     * 3. 使用交换策略，让每个球都在其所在试管的顶部1-2位置
     * 4. 保持每个试管的球数不变（前12管满8个，后2管空）
     */
    private createEasyMoves(tubeContents: BallColor[][]) {
        // 随机选择一种颜色作为"容易完成"的颜色
        const easyColor = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];
        // 将所有该颜色的球交换到各试管顶部前两位
        // 使用交换策略，不改变任何试管的球数
        
        let swapCount = 0;
        const maxSwaps = 100; // 防止死循环
        
        while (swapCount < maxSwaps) {
            // 找到一个需要移动的easyColor球（不在顶部前两位）
            let sourceFound = false;
            let sourceTubeIndex = -1;
            let sourceBallIndex = -1;
            
            for (let tubeIndex = 0; tubeIndex < tubeContents.length; tubeIndex++) {
                const tube = tubeContents[tubeIndex];
                if (tube.length === 0) continue;
                
                // 检查试管中是否有easyColor球不在顶部前两位
                for (let ballIndex = 0; ballIndex < tube.length - 2; ballIndex++) {
                    if (tube[ballIndex] === easyColor) {
                        sourceTubeIndex = tubeIndex;
                        sourceBallIndex = ballIndex;
                        sourceFound = true;
                        break;
                    }
                }
                if (sourceFound) break;
            }
            
            if (!sourceFound) {
                // 所有easyColor球都已经在顶部前两位了
                break;
            }
            
            // 找到一个可以交换的目标球（在某个试管顶部前两位的非easyColor球）
            let targetFound = false;
            let targetTubeIndex = -1;
            let targetBallIndex = -1;
            
            for (let tubeIndex = 0; tubeIndex < tubeContents.length; tubeIndex++) {
                const tube = tubeContents[tubeIndex];
                if (tube.length === 0) continue;
                
                // 检查顶部前两位是否有非easyColor的球可以交换
                for (let i = 0; i < 2 && i < tube.length; i++) {
                    const ballIndex = tube.length - 1 - i;
                    if (tube[ballIndex] !== easyColor) {
                        targetTubeIndex = tubeIndex;
                        targetBallIndex = ballIndex;
                        targetFound = true;
                        break;
                    }
                }
                if (targetFound) break;
            }
            
            if (!targetFound) {
                // 没有可交换的目标，退出
                break;
            }
            
            // 执行交换
            const sourceTube = tubeContents[sourceTubeIndex];
            const targetTube = tubeContents[targetTubeIndex];
            
            const temp = sourceTube[sourceBallIndex];
            sourceTube[sourceBallIndex] = targetTube[targetBallIndex];
            targetTube[targetBallIndex] = temp;
            
            swapCount++;
        }
    }

    /**
     * 将空试管移动到数组末尾
     */
    private moveEmptyTubesToEnd(tubeContents: BallColor[][]) {
        // 分离非空管和空管
        const nonEmptyTubes: BallColor[][] = [];
        const emptyTubes: BallColor[][] = [];
        
        for (const tube of tubeContents) {
            if (tube.length > 0) {
                nonEmptyTubes.push(tube);
            } else {
                emptyTubes.push(tube);
            }
        }
        
        // 重新填充数组
        tubeContents.length = 0;
        tubeContents.push(...nonEmptyTubes, ...emptyTubes);
    }

    /**
     * 确保有足够的空试管
     */
    private ensureEmptyTubes(tubeContents: BallColor[][], requiredEmpty: number) {
        const capacity = GAME_CONFIG.TUBE_CAPACITY;
        
        while (true) {
            const emptyCount = tubeContents.filter(t => t.length === 0).length;
            if (emptyCount >= requiredEmpty) break;
            
            // 找最少球的非空管
            const nonEmptyTubes = tubeContents
                .map((content, index) => ({ content, index }))
                .filter(t => t.content.length > 0)
                .sort((a, b) => a.content.length - b.content.length);
            
            if (nonEmptyTubes.length === 0) break;
            
            const sourceInfo = nonEmptyTubes[0];
            const ballsToMove = [...sourceInfo.content];
            tubeContents[sourceInfo.index] = [];
            
            // 把球分散到其他非满的管中
            for (const ball of ballsToMove) {
                const targets = tubeContents
                    .map((content, index) => ({ content, index }))
                    .filter(t => t.index !== sourceInfo.index && t.content.length < capacity);
                
                if (targets.length > 0) {
                    const target = targets[Math.floor(Math.random() * targets.length)];
                    tubeContents[target.index].push(ball);
                }
            }
        }
    }

    /**
     * 检查谜题是否足够打乱
     * 条件：
     * 1. 没有完成的试管（除了空管）
     * 2. 至少有一定数量的混色试管
     */
    private isPuzzleSufficientlyShuffled(tubeContents: BallColor[][]): boolean {
        let completedCount = 0;
        let mixedCount = 0;
        
        for (const tube of tubeContents) {
            if (tube.length === 0) continue;
            
            const firstColor = tube[0];
            const allSameColor = tube.every(ball => ball === firstColor);
            
            if (allSameColor && tube.length === GAME_CONFIG.TUBE_CAPACITY) {
                completedCount++;
            } else if (!allSameColor) {
                mixedCount++;
            }
        }
        
        // 不能有已完成的试管，且至少80%的试管是混色的
        const nonEmptyCount = tubeContents.filter(t => t.length > 0).length;
        return completedCount === 0 && mixedCount >= nonEmptyCount * 0.8;
    }

    /**
     * Debug模式初始化：倒数第三列差1个球就满，缺的球在第一个试管顶部
     * 布局：2行7列，index 0-6是第一行，7-13是第二行
     * 倒数第三列是第5列，index为 4 和 11
     */
    private initializeDebugBalls() {
        // 随机选择一个颜色作为"差1个球"的颜色
        const almostCompleteColor = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];

        // 倒数第三列的试管索引（第5列，0-indexed为4）
        const almostCompleteTubeIndex = 4; // 第一行倒数第三位
        
        // 生成球的颜色列表，排除要用于快完成试管的7个球
        let balls: BallColor[] = [];
        BALL_COLORS.forEach(color => {
            if (color === almostCompleteColor) {
                // 这个颜色只添加1个（将放在第一个试管顶部）
                balls.push(color);
            } else {
                // 其他颜色正常添加8个
                for (let i = 0; i < 8; i++) {
                    balls.push(color);
                }
            }
        });

        // 打乱顺序
        balls = Phaser.Utils.Array.Shuffle(balls);
        
        // 找到almostCompleteColor的球，确保它在列表开头（将放在第一个试管顶部）
        const specialBallIndex = balls.findIndex(b => b === almostCompleteColor);
        if (specialBallIndex > 0) {
            // 移到开头
            const specialBall = balls.splice(specialBallIndex, 1)[0];
            balls.unshift(specialBall);
        }

        // 先填充"快完成"的试管（7个相同颜色的球）
        for (let j = 0; j < 7; j++) {
            const ball = new Ball(this.scene, 0, 0, almostCompleteColor);
            this.tubes[almostCompleteTubeIndex].addBall(ball, false);
        }
        
        // 获取第一个球（特殊颜色），先不添加
        const firstBallColor = balls.shift()!;
        
        // 分配剩余的球到其他试管
        // 需要填充的试管：0-3, 5-11 (跳过4，因为已经填了7个球)
        const tubesToFill = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11];
        
        let ballIndex = 0;
        for (const tubeIndex of tubesToFill) {
            for (let j = 0; j < 8; j++) {
                if (ballIndex < balls.length) {
                    const color = balls[ballIndex++];
                    const ball = new Ball(this.scene, 0, 0, color);
                    this.tubes[tubeIndex].addBall(ball, false);
                }
            }
        }
        
        // 最后在第一个试管顶部添加特殊颜色的球
        // 由于试管已满，需要先清理一下第一个试管
        // 实际上我们需要修改逻辑：先填7个球到第一个试管，然后在顶部添加特殊球
        
        // 重新设计：确保第一个试管只有7个球，然后添加特殊球
        // 清空并重新布局
        this.tubes.forEach(tube => {
            while (tube.balls.length > 0) {
                const ball = tube.balls.pop();
                ball?.destroy();
            }
        });
        
        // 重新生成：确保布局正确
        this.initializeDebugBallsV2(almostCompleteColor);
    }
    
    /**
     * Debug布局V2：更清晰的实现
     */
    private initializeDebugBallsV2(almostCompleteColor: BallColor) {
        // 倒数第三列试管索引（第5列 = index 4）
        const almostCompleteTubeIndex = 4;
        
        // 其他要填充8个球的试管 (0-3, 5-11，共11个试管)
        const normalTubes = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11];
        // 第一个试管(index 0)只填7个球，顶部放特殊球
        
        // 计算需要的球：
        // - 试管4: 7个almostCompleteColor
        // - 试管0: 7个随机球 + 1个almostCompleteColor (顶部)
        // - 其他10个试管: 各8个球 = 80个球
        // 总共: 7 + 8 + 80 = 95个球
        // 但是12种颜色*8个=96个，所以我们需要特殊处理
        
        // 生成剩余颜色的球 (排除almostCompleteColor)
        let remainingBalls: BallColor[] = [];
        BALL_COLORS.forEach(color => {
            if (color !== almostCompleteColor) {
                for (let i = 0; i < 8; i++) {
                    remainingBalls.push(color);
                }
            }
        });
        // 共有 11 * 8 = 88 个球
        
        // 打乱顺序
        remainingBalls = Phaser.Utils.Array.Shuffle(remainingBalls);
        
        // 1. 填充"快完成"试管 (index 4) - 7个相同颜色
        for (let j = 0; j < 7; j++) {
            const ball = new Ball(this.scene, 0, 0, almostCompleteColor);
            this.tubes[almostCompleteTubeIndex].addBall(ball, false);
        }
        
        // 2. 填充第一个试管 (index 0) - 7个随机球
        for (let j = 0; j < 7; j++) {
            const color = remainingBalls.shift()!;
            const ball = new Ball(this.scene, 0, 0, color);
            this.tubes[0].addBall(ball, false);
        }
        
        // 3. 在第一个试管顶部添加特殊颜色球 (现在是第8个)
        const specialBall = new Ball(this.scene, 0, 0, almostCompleteColor);
        this.tubes[0].addBall(specialBall, false);
        
        // 4. 填充其他试管
        let ballIndex = 0;
        for (const tubeIndex of normalTubes) {
            for (let j = 0; j < 8; j++) {
                if (ballIndex < remainingBalls.length) {
                    const color = remainingBalls[ballIndex++];
                    const ball = new Ball(this.scene, 0, 0, color);
                    this.tubes[tubeIndex].addBall(ball, false);
                }
            }
        }
        
    }

    private createHand() {
        // 创建引导手势 - 添加到场景而不是容器，确保在所有元素之上
        this.hand = this.scene.add.image(0, 0, 'hand');
        this.hand.setOrigin(0, 0); // origin在左上角
        this.hand.setVisible(false);
        this.hand.setDepth(10000); // 确保在最上层，使用更高的depth值
        
        // 初始缩放：横屏时缩小到70%
        this.hand.setScale(this.getHandBaseScale());

        // 游戏开始时延迟显示初始引导（从500ms延后到1500ms，避免与初始化争抢主线程）
        this.scene.time.delayedCall(1500, () => {
            this.showHint();
        });
    }

    /**
     * 获取当前手指基准缩放值
     */
    private getHandBaseScale(): number {
        const gameSize = this.scene.scale.gameSize;
        const isPortrait = gameSize.height > gameSize.width;
        return isPortrait ? 1 : 0.7;
    }

    /**
     * 启动手指点击动画 - 模拟下压效果
     */
    private startHandAnimation() {
        if (!this.hand) return;
        
        // 停止之前的动画
        this.stopHandAnimation();
        
        // 根据横竖屏获取基准缩放
        const baseScale = this.getHandBaseScale();
        
        // 确保从基准位置开始
        this.hand.setY(this.handBaseY);
        this.hand.setScale(baseScale);
        this.hand.setAngle(0);
        
        const pressDistance = 15 * baseScale; // 下压距离
        
        // 手指动画：模拟点击下压效果
        // 向下移动 + 轻微缩小 + 轻微旋转
        this.handTween = this.scene.tweens.add({
            targets: this.hand,
            y: this.handBaseY + pressDistance,   // 向下移动
            scale: baseScale * 0.95,             // 轻微缩小
            angle: 5,                            // 轻微顺时针旋转
            duration: 300,
            yoyo: true,
            repeat: -1,
            repeatDelay: 200,                    // 点击之间的间隔
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * 停止手指动画
     */
    private stopHandAnimation() {
        if (this.handTween) {
            this.handTween.stop();
            this.handTween = null;
        }
        if (this.hand) {
            // 恢复到基准状态
            this.hand.setY(this.handBaseY);
            this.hand.setScale(this.getHandBaseScale());
            this.hand.setAngle(0);
        }
    }

    private handleTubeClick(tube: Tube) {
        if (!this.isGameActive) return;
        
        // 重置空闲计时器
        this.idleTimer = 0;
        
        // 处理引导系统逻辑
        this.handleHintOnClick(tube);

        this.scene.sound.play('点击');

        if (this.selectedTube === null) {
            // 选择源试管
            if (!tube.isEmpty() && !tube.isCompleted) {
                this.selectTube(tube);
            }
        } else {
            if (this.selectedTube === tube) {
                // 点击同一个试管，取消选择
                this.deselectTube();
            } else {
                // 尝试移动球
                const moveSuccess = this.tryMoveBall(this.selectedTube, tube);
                if (!moveSuccess) {
                    // 移动失败，取消选择当前试管，并尝试选中新点击的试管
                    this.deselectTube();
                    if (!tube.isEmpty() && !tube.isCompleted) {
                        this.selectTube(tube);
                    }
                }
            }
        }
    }

    /**
     * 处理点击时的引导逻辑
     */
    private handleHintOnClick(tube: Tube) {
        if (this.hintStep === 'source') {
            if (tube === this.hintSourceTube) {
                // 用户按引导选中源试管，移动手指到目标试管
                this.moveHandToTarget();
            } else {
                // 用户选中其他试管，淡出引导
                this.fadeOutHand();
            }
        } else if (this.hintStep === 'target') {
            // 目标步骤时，任意点击都淡出
            this.fadeOutHand();
        } else {
            // 无引导状态时，隐藏手指（如果可见）
            if (this.hand && this.hand.visible) {
                this.fadeOutHand();
            }
        }
    }

    private selectTube(tube: Tube) {
        this.selectedTube = tube;
        // 若该试管正在播放归位后的水位渐升动画，先取消，避免液面与选中逻辑冲突
        tube.cancelWaterRiseAnimation();
        const topBall = tube.getTopBall();
        if (topBall) {
            // 提升当前选中试管的层级
            this.bringToTop(tube);
            
            // 液体选中：顶球变为试管外悬浮帧动画，试管液面不再画这颗球（同一液体不画两遍）
            tube.setTopBallFloating(true);
            tube.updateLiquidDisplay();
            topBall.setLiquidState('rising', { tubeDisplayWidth: tube.getCachedTubeDisplayWidth() });
            
            const topY = -tube.getCachedTubeHeight() / 2 - 50;
            this.scene.tweens.add({
                targets: topBall,
                y: topY,
                duration: 200,
                ease: 'Power2',
                onStart: () => {
                    // 上升时：若下方有相邻液体，在相邻液面播放水花（颜色为相邻液体颜色）
                    const adj = tube.getSurfaceBelowTopBall();
                    if (adj) tube.playSplashAtSurface(adj.surfaceY, adj.color);
                },
                onComplete: () => {
                    // 上升完成后：保持不动 = 悬浮状态，循环播放 liquid_still + 容器上下浮动
                    topBall.startContainerHoverAnimation(topY);
                }
            });
        }
    }

    private deselectTube() {
        if (this.selectedTube) {
            const topBall = this.selectedTube.getTopBall();
            const tube = this.selectedTube;
            if (topBall) {
                topBall.stopHoverAnimation();
                // 下降过程使用 移动下降 帧动画，不展示球的 image
                topBall.setLiquidState('moving', { tubeDisplayWidth: tube.getCachedTubeDisplayWidth() });
                
                // @ts-ignore
                const targetY = tube['getBallY'](tube.balls.length - 1);
                
                this.scene.tweens.add({
                    targets: topBall,
                    y: targetY,
                    duration: 180,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        if (!topBall.scene || !tube.scene) return;
                        topBall.setLiquidState('hidden'); // 落回试管内，只显示为液面
                        this.scene.sound.play('落下'); // 液体移动结束：落下音效
                        // 与移动结束相同：水位渐升 + 水花跟随，升完后再恢复顶球标记
                        tube.animateWaterRiseWithSplash(topBall.color, () => {
                            tube.setTopBallFloating(false);
                            tube.updateLiquidDisplay();
                        }, true); // 归位：在相邻液体层顶部添加与上升液体同色的 surface
                    }
                });
            }
            this.selectedTube = null;
        }
    }

    private tryMoveBall(source: Tube, target: Tube): boolean {
        const sourceBalls = source.getTopSameColorBalls();
        if (sourceBalls.length === 0) return false;

        // 顶球即将被移走，不再视为「悬浮」，液面按剩余球重绘
        source.setTopBallFloating(false);

        const sourceColor = sourceBalls[0].color;
        const targetColor = target.getTopColor();
        
        // 移动规则：
        // 1. 目标试管未满
        // 2. 目标试管为空 OR 目标试管顶部颜色与源球颜色相同
        if (!target.isFull() && (target.isEmpty() || targetColor === sourceColor)) {
            // 计算可以移动多少个球
            const availableSpace = GAME_CONFIG.TUBE_CAPACITY - target.balls.length;
            const ballsToMove = sourceBalls.slice(0, availableSpace); // 取前N个能放下的球
            
            if (ballsToMove.length === 0) return false;

            // 停止所有要移动球的悬浮动画（虽然只有最上面的球在悬浮）
            ballsToMove.forEach(ball => ball.stopHoverAnimation());
            
            const targetSameColorBalls: Ball[] = [];
            if (!target.isEmpty() && targetColor === sourceColor) {
                target.balls.forEach(ball => {
                    if (ball.color === sourceColor) {
                        targetSameColorBalls.push(ball);
                    }
                });
            }

            // 提升目标试管层级
            this.bringToTop(target);
            
            const totalBalls = ballsToMove.length;

            // 记录目标试管原有球的数量
            const originalBallCount = target.balls.length;
            
            // 立即清除选中状态，允许用户在动画过程中选择下一个球
            // 这提高了游戏的流畅度和响应性
            this.selectedTube = null;
            
            // 先按正确顺序将所有球添加到目标试管（建立逻辑顺序），但不播放动画
            // ballsToMove[0] 是顶球，应该先动，先落地（在新球的最下面）
            // ballsToMove[N-1] 是底球，应该最后动，最后落地（在新球的最上面）
            // 直接按顺序添加
            // 球仍在源试管时预计算每颗球的起始坐标（reparent 后保持视觉连续）
            const startData = ballsToMove.map((ball) => {
                const worldPos = source.localTransform.transformPoint(ball.x, ball.y);
                const targetLocalPos = target.pointToContainer(worldPos);
                return { ball, targetLocalPos };
            });
            // 只做视觉 reparent，不修改 source/target.balls；液面按「上升/落地」时机分层更新
            startData.forEach(({ ball, targetLocalPos }) => {
                target.add(ball);
                ball.setPosition(targetLocalPos.x, targetLocalPos.y);
                ball.setLiquidState('moving', { tubeDisplayWidth: target.getCachedTubeDisplayWidth() });
            });

            // 然后为每个球创建独立的移动动画
            ballsToMove.forEach((ball, index) => {
                // ballsToMove[0] 是顶球，先启动
                const startDelay = index * 100;
                
                // 计算球在 target.balls 中的索引
                // ballsToMove[0] (顶球，先动) -> 落在 originalBallCount 位置（新球中的最下面）
                // ballsToMove[N-1] (底球，后动) -> 落在 originalBallCount + N-1 位置（新球中的最上面）
                const ballIndexInTarget = originalBallCount + index;
                
                const targetLocalPos = startData[index].targetLocalPos;
                const sourceHoverY = -source.getCachedTubeHeight() / 2 - 50;
                const sourceHoverWorldPos = source.localTransform.transformPoint(0, sourceHoverY);
                const sourceHoverLocalPos = target.pointToContainer(sourceHoverWorldPos);
                const targetHoverY = -target.getCachedTubeHeight() / 2 - 50;
                
                // 4. 计算最终位置（目标试管中的正确位置）
                // @ts-ignore
                const finalY = target['getBallY'](ballIndexInTarget);
                
                // 5. 创建流畅的动画序列 - 使用连续动画减少停顿
                // 计算球当前是否已在悬浮位置（顶部球）
                const isAlreadyHovering = index === 0 && ball.y < 0;
                
                // 动画参数
                const riseTime = isAlreadyHovering ? 50 : 150; // 已悬浮的球快速调整，其他球正常上升
                const arcTime = 250; // 弧线移动时间
                const dropTime = 350; // 下落时间
                
                // 使用连续的tween实现流畅动画
                // 第一步：快速上升到源试管上方；该球开始上升时从源试管移除一层并刷新液面（分层更新）
                this.scene.tweens.add({
                    targets: ball,
                    x: sourceHoverLocalPos.x,
                    y: sourceHoverLocalPos.y,
                    duration: riseTime,
                    ease: 'Power2.easeOut',
                    delay: startDelay,
                    onStart: () => {
                        const isLastInGroup = index === ballsToMove.length - 1;
                        const skipDraw = ballsToMove.length > 1 && !isLastInGroup;
                        const skipHighlight = skipDraw;
                        source.removeBall(ball, { skipDraw, skipHighlight });
                        // 同色联动移动时，仅在最下层被移动液体的相邻层播水花；若无相邻层（移走后源试管空）则不播
                        const isBottomOfMoveGroup = isLastInGroup;
                        if (!isAlreadyHovering && isBottomOfMoveGroup && source.balls.length > 0) {
                            source.playSplashAtCurrentSurface();
                        }
                    },
                    onComplete: () => {
                        if (!ball.scene || !target.scene) return;
                        
                        // 第二步：弧线移动到目标试管上方
                        // 同时移动X和Y，Y先上升再下降形成弧线
                        const peakY = Math.min(sourceHoverLocalPos.y, targetHoverY) - 30; // 弧线最高点
                        
                        // 使用两个并行的tween：X平移 + Y做弧线
                        // X平移
                        this.scene.tweens.add({
                            targets: ball,
                            x: 0,
                            duration: arcTime,
                            ease: 'Sine.easeInOut'
                        });
                        
                        // Y做弧线（先上后下）
                        this.scene.tweens.add({
                            targets: ball,
                            y: peakY,
                            duration: arcTime * 0.4, // 前40%时间上升到顶点
                            ease: 'Sine.easeOut',
                            onComplete: () => {
                                if (!ball.scene || !target.scene) return;
                                
                                // 从顶点开始下降到目标悬浮位置
                                this.scene.tweens.add({
                                    targets: ball,
                                    y: targetHoverY,
                                    duration: arcTime * 0.6, // 后60%时间下降
                                    ease: 'Sine.easeIn',
                                    onComplete: () => {
                                        if (!ball.scene || !target.scene) return;
                                        
                                        // 第三步：下落到最终位置
                                        // 下落开始时，调整层级
                                        // @ts-ignore
                                        target.sendToBack(ball);
                                        // @ts-ignore
                                        target.sendToBack(target.highlightMouthImage);
                                        // @ts-ignore
                                        target.sendToBack(target.tubeMouthImage);
                                        
                                        this.scene.tweens.add({
                                            targets: ball,
                                            y: finalY,
                                            duration: 180, // 再次加速下落
                                            ease: 'Quad.easeIn',
                                            onComplete: () => {
                                                if (!ball.scene || !target.scene) return;

                                                // 落地后该球加入目标试管，液体移动结束播放落下音效，水位渐升 + 水花跟随
                                                target.balls.splice(ballIndexInTarget, 0, ball);
                                                ball.setLiquidState('hidden');
                                                this.scene.sound.play('落下');
                                                target.animateWaterRiseWithSplash(ball.color, () => {
                                                    if (!ball.scene || !target.scene) return;
                                                    // @ts-ignore
                                                    ball.setScale(target.currentBallSize / GAME_CONFIG.BALL_SIZE);
                                                    // @ts-ignore
                                                    target.bringToTop(target.tubeBodyImage);
                                                    // @ts-ignore
                                                    target.bringToTop(target.highlightBodyImage);
                                                    // 每次有球落地且水位升完后都检查完成与高亮（不依赖“最后一个球”的 callback，避免联动时漏检）
                                                    const checkCompletionAndWin = () => {
                                                        if (!target.scene) return;
                                                        target.checkCompletion();
                                                        target.checkSameColorHighlight();
                                                        source.checkSameColorHighlight();
                                                        this.checkWinCondition();
                                                    };
                                                    this.scene.time.delayedCall(0, checkCompletionAndWin, [], this);
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            });
            
            // 增加跳转步数
            this.jumpStepCount++;
            EventBus.emit('jump-step', this.jumpStepCount);
            
            return true;
        }
        
        return false;
    }

    /**
     * 更新完成试管计数（每次遍历所有试管重新计算）
     */
    public updateCompletedTubeCount() {
        // 遍历所有试管，计算完成的数量
        const count = this.tubes.filter(tube => tube.isCompleted).length;
        
        // 只有当计数发生变化时才发送事件
        if (count !== this.completedTubeCount) {
            this.completedTubeCount = count;
            EventBus.emit('tube-completed', this.completedTubeCount);
        }
    }

    private checkWinCondition() {
        const allCompleted = this.tubes.every(tube => tube.isEmpty() || tube.isCompleted);
        if (allCompleted) {
            // 游戏胜利，但不在这里发送 game-over 事件
            // 等待最后一个试管的完成动画结束后再发送
            // 由 onTubeCompleteInternal 中的 checkWinConditionAfterAnimation 处理
            this.isGameActive = false;
        } else {
            // 延后到下一帧执行，避免与 checkCompletion/checkSameColorHighlight 在同一帧跑 14×14 死局扫描，减轻点击交互卡顿
            this.scene.time.delayedCall(0, this.checkDeadlock, [], this);
        }
    }
    
    /**
     * 在试管完成动画结束后检查游戏胜利条件
     */
    private checkWinConditionAfterAnimation() {
        const allCompleted = this.tubes.every(tube => tube.isEmpty() || tube.isCompleted);
        if (allCompleted && !this.isGameActive) {
            EventBus.emit('game-over');
        }
    }

    /**
     * 检查是否陷入死局（没有有效移动）
     */
    private checkDeadlock() {
        // 如果游戏已结束，不检查死局
        if (!this.isGameActive) return;
        
        // 使用 findBestMove 来检查是否有有效移动
        const hasValidMove = this.hasAnyValidMove();
        
        if (!hasValidMove) {
            this.isGameActive = false;
            EventBus.emit('game-deadlock');
        }
    }

    /**
     * 检查是否存在任何有效移动
     * 比 findBestMove 更轻量，只需要找到一个有效移动即可
     */
    private hasAnyValidMove(): boolean {
        for (const source of this.tubes) {
            // 跳过空管和已完成的管
            if (source.isEmpty() || source.isCompleted) continue;
            
            const topBalls = source.getTopSameColorBalls();
            if (topBalls.length === 0) continue;
            
            const topColor = topBalls[0].color;
            
            for (const target of this.tubes) {
                // 跳过自身、已满和已完成的管
                if (source === target || target.isFull() || target.isCompleted) continue;
                
                // 检查是否是合法移动
                const targetColor = target.getTopColor();
                
                // 目标为空或颜色匹配
                if (target.isEmpty() || targetColor === topColor) {
                    // 检查是否有空间
                    const availableSpace = GAME_CONFIG.TUBE_CAPACITY - target.balls.length;
                    if (availableSpace > 0) {
                        // 找到一个有效移动
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    public update(time: number, delta: number) {
        if (!this.isGameActive) return;

        this.idleTimer += delta;
        
        // 5秒无操作后显示引导
        if (this.idleTimer > Board.IDLE_HINT_DELAY && this.hand && !this.hand.visible) {
            this.showHint();
        }
    }

    /**
     * 显示引导手势（第一步：指向源试管）
     * 使用智能评分系统找到最优移动
     * 优化：将 findBestMove 延后到下一帧执行，避免阻塞当前帧
     */
    private showHint() {
        if (!this.hand) return;
        
        // 重置引导状态
        this.hintSourceTube = null;
        this.hintTargetTube = null;
        this.hintStep = 'none';
        
        // 延后到下一帧执行 findBestMove，避免阻塞当前帧（特别是开场1500ms时）
        this.scene.time.delayedCall(0, () => {
            if (!this.hand || !this.isGameActive) return;
            
            // 使用智能评分系统找到最佳移动
            const bestMove = this.findBestMove();
            
            if (bestMove) {
                this.hintSourceTube = bestMove.source;
                this.hintTargetTube = bestMove.target;
                this.hintStep = 'source';

                // 将试管的局部坐标转换为全局坐标（因为hand添加到场景而非容器）
                const globalPos = this.getWorldTransformMatrix().transformPoint(
                    this.hintSourceTube.x,
                    this.hintSourceTube.y - this.hintSourceTube.height / 4
                );
                this.hand.setPosition(globalPos.x, globalPos.y);
                this.handBaseY = globalPos.y; // 记录基准Y位置
                this.fadeInHand();
            }
        }, [], this);
    }

    /**
     * 检查试管是否为纯色管（所有球颜色相同）
     */
    private isPureColorTube(tube: Tube): boolean {
        if (tube.isEmpty()) return false;
        
        const firstColor = tube.balls[0].color;
        return tube.balls.every(ball => ball.color === firstColor);
    }

    /**
     * 找到最佳移动
     * 评分系统：
     * - 完成试管 (+100): 移动后目标试管达到8个同色球
     * - 移动球数 (+球数×10): 一次移动更多球效率更高
     * - 目标颜色纯度 (+纯度×8): 目标试管只有一种颜色时优先
     * - 释放源试管 (+25): 移动后源试管变空，增加操作空间
     * - 移入空管 (-20): 避免无意义占用空管（除非释放源管）
     * - 源管纯度惩罚 (-源管纯度×3): 避免破坏已经较纯的试管
     */
    private findBestMove(): Move | null {
        const moves: Move[] = [];
        
        for (const source of this.tubes) {
            // 跳过空管和已完成的管
            if (source.isEmpty() || source.isCompleted) continue;
            
            // 跳过纯色管 - 如果试管中所有球都是同一颜色，不应该建议移动
            if (this.isPureColorTube(source)) {
                continue;
            }
            
            const topBalls = source.getTopSameColorBalls();
            if (topBalls.length === 0) continue;
            
            const topColor = topBalls[0].color;
            
            for (const target of this.tubes) {
                // 跳过自身、已满和已完成的管
                if (source === target || target.isFull() || target.isCompleted) continue;
                
                // 检查是否是合法移动
                const targetColor = target.getTopColor();
                if (!target.isEmpty() && targetColor !== topColor) continue;
                
                // 计算可移动球数
                const availableSpace = GAME_CONFIG.TUBE_CAPACITY - target.balls.length;
                const ballCount = Math.min(topBalls.length, availableSpace);
                
                if (ballCount === 0) continue;
                
                // 计算移动分数
                const score = this.calculateMoveScore(source, target, ballCount, topColor);
                
                moves.push({ source, target, ballCount, score });
            }
        }
        
        moves.sort((a, b) => b.score - a.score);
        return moves.length > 0 ? moves[0] : null;
    }

    /**
     * 计算移动分数
     */
    private calculateMoveScore(source: Tube, target: Tube, ballCount: number, color: BallColor): number {
        let score = 0;
        
        // 1. 完成试管奖励 (+100)
        // 如果移动后目标试管达到满且全部同色
        const targetBallsAfterMove = target.balls.length + ballCount;
        if (targetBallsAfterMove === GAME_CONFIG.TUBE_CAPACITY) {
            // 检查移动后是否全部同色
            const targetCurrentColor = target.getTopColor();
            if (target.isEmpty() || targetCurrentColor === color) {
                // 还需要确认目标试管原有的球也都是同一颜色
                const targetAllSameColor = target.isEmpty() ||
                    target.balls.every(ball => ball.color === color);
                if (targetAllSameColor) {
                    score += 100;
                }
            }
        }
        
        // 2. 移动球数奖励 (+球数×10)
        score += ballCount * 10;
        
        // 3. 目标颜色纯度奖励
        // 目标试管只有一种颜色时，分数更高
        if (!target.isEmpty()) {
            const targetColors = new Set(target.balls.map(b => b.color));
            if (targetColors.size === 1) {
                // 目标管是纯色的，奖励更高
                score += target.balls.length * 8;
            }
        }
        
        // 4. 释放源试管奖励 (+25)
        const sourceBallsAfterMove = source.balls.length - ballCount;
        if (sourceBallsAfterMove === 0) {
            score += 25;
        }
        
        // 5. 移入空管惩罚 (-20)
        // 但如果这个移动能释放源管，则不惩罚
        if (target.isEmpty() && sourceBallsAfterMove > 0) {
            score -= 20;
        }
        
        // 6. 源管纯度惩罚
        // 如果源管只有一种颜色（即是纯色管），移动会破坏纯度，给予惩罚
        // 但如果是全部移出（释放源管），则不惩罚
        if (sourceBallsAfterMove > 0) {
            const sourceColors = new Set(source.balls.map(b => b.color));
            if (sourceColors.size === 1) {
                // 源管是纯色的，移走部分球会破坏纯度
                score -= source.balls.length * 3;
            }
        }
        
        // 7. 避免无意义的来回移动
        // 如果目标是空管，且源管不能完全清空，且源管顶部同色球等于可移动数
        // 这种移动可能没有实质性进展
        if (target.isEmpty() && sourceBallsAfterMove > 0) {
            const sourceTopBalls = source.getTopSameColorBalls();
            if (sourceTopBalls.length === ballCount && ballCount < 4) {
                // 这是把少量同色球移到空管，可能不是最优解
                score -= 10;
            }
        }
        
        // 8. 优先合并同色球
        // 如果目标管有同色球，且移动后可以增加连续同色球数，奖励
        if (!target.isEmpty()) {
            const targetTopBalls = target.getTopSameColorBalls();
            if (targetTopBalls.length > 0 && targetTopBalls[0].color === color) {
                // 合并后的连续同色球数
                const mergedCount = targetTopBalls.length + ballCount;
                // 合并越多越好
                score += mergedCount * 5;
            }
        }
        
        return score;
    }

    /**
     * 移动手指到目标试管（第二步）
     */
    private moveHandToTarget() {
        if (!this.hand || !this.hintTargetTube) return;
        
        this.hintStep = 'target';
        
        // 停止当前点击动画
        this.stopHandAnimation();
        
        // 计算目标位置
        const globalPos = this.getWorldTransformMatrix().transformPoint(
            this.hintTargetTube.x,
            this.hintTargetTube.y - this.hintTargetTube.height / 4
        );
        
        // 停止之前的移动动画
        if (this.handMoveTween) {
            this.handMoveTween.stop();
            this.handMoveTween = null;
        }
        
        // 平滑移动到目标位置
        this.handMoveTween = this.scene.tweens.add({
            targets: this.hand,
            x: globalPos.x,
            y: globalPos.y,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                // 移动完成后更新基准Y位置并重启点击动画
                this.handBaseY = globalPos.y;
                this.startHandAnimation();
            }
        });
    }

    /**
     * 淡入显示手指
     */
    private fadeInHand() {
        if (!this.hand) return;
        
        // 停止之前的淡入淡出动画
        if (this.handFadeTween) {
            this.handFadeTween.stop();
            this.handFadeTween = null;
        }
        
        this.hand.setAlpha(0);
        this.hand.setVisible(true);
        this.startHandAnimation();
        
        this.handFadeTween = this.scene.tweens.add({
            targets: this.hand,
            alpha: 1,
            duration: Board.FADE_DURATION,
            ease: 'Power2'
        });
    }

    /**
     * 淡出隐藏手指
     */
    private fadeOutHand() {
        if (!this.hand) return;
        
        // 停止之前的淡入淡出动画
        if (this.handFadeTween) {
            this.handFadeTween.stop();
            this.handFadeTween = null;
        }
        
        // 停止移动动画
        if (this.handMoveTween) {
            this.handMoveTween.stop();
            this.handMoveTween = null;
        }
        
        this.handFadeTween = this.scene.tweens.add({
            targets: this.hand,
            alpha: 0,
            duration: Board.FADE_DURATION,
            ease: 'Power2',
            onComplete: () => {
                if (this.hand) {
                    this.hand.setVisible(false);
                    this.stopHandAnimation();
                }
                // 重置引导状态
                this.hintSourceTube = null;
                this.hintTargetTube = null;
                this.hintStep = 'none';
            }
        });
    }

    /**
     * 隐藏引导手势（立即隐藏，不带动画）
     */
    private hideHint() {
        if (this.hand) {
            // 停止所有相关动画
            if (this.handFadeTween) {
                this.handFadeTween.stop();
                this.handFadeTween = null;
            }
            if (this.handMoveTween) {
                this.handMoveTween.stop();
                this.handMoveTween = null;
            }
            
            this.hand.setVisible(false);
            this.hand.setAlpha(1);
            this.hand.setAngle(0);
            this.stopHandAnimation();
            
            // 重置引导状态
            this.hintSourceTube = null;
            this.hintTargetTube = null;
            this.hintStep = 'none';
        }
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        const isPortrait = gameSize.height > gameSize.width;
        const config = isPortrait ? GAME_CONFIG.PORTRAIT : GAME_CONFIG.LANDSCAPE;

        // 计算缩放比例
        // 竖屏使用原始比例，横屏根据试管宽度比例缩放球
        const scale = isPortrait ? 1 : (config.TUBE_WIDTH / GAME_CONFIG.PORTRAIT.TUBE_WIDTH);
        
        // 更新所有试管的尺寸
        const tubeWidth = config.TUBE_WIDTH;
        const tubeHeight = config.TUBE_HEIGHT;
        const ballSize = GAME_CONFIG.BALL_SIZE * scale;
        const ballSpacing = GAME_CONFIG.BALL_SPACING * scale;

        this.tubes.forEach(tube => {
            tube.updateSize(tubeWidth, tubeHeight, ballSize, ballSpacing);
        });

        // 横竖屏切换后，若有球正在悬浮，按新试管尺寸更新其相对位置（试管顶部一段距离）并重启悬浮动画
        if (this.selectedTube) {
            const topBall = this.selectedTube.getTopBall();
            if (topBall) {
                topBall.updateLiquidScale(this.selectedTube.getCachedTubeDisplayWidth());
                const newTopY = -this.selectedTube.getCachedTubeHeight() / 2 - 50;
                topBall.stopHoverAnimation();
                topBall.setPosition(topBall.x, newTopY);
                topBall.startContainerHoverAnimation(newTopY);
            }
        }

        // 重新排列试管
        // 计算整体偏移量以确保居中
        const totalWidth = (GAME_CONFIG.TUBE_COLS - 1) * config.COL_OFFSET_X;
        const startX = (gameSize.width - totalWidth) / 2;
        
        // 计算垂直方向的整体偏移量以确保居中
        const totalHeight = (GAME_CONFIG.TUBE_ROWS - 1) * config.ROW_SPACING_Y;
        // 竖屏时，游戏区域通常偏上，但这里我们尝试居中
        // 如果需要严格按照设计稿的固定Y值，可以使用 config.TUBE_START_Y
        // 但为了适应不同屏幕，居中可能更好
        // 这里我们结合两者：如果屏幕高度足够，则居中；否则使用固定起始位置或进行适配
        
        // 简单居中策略：
        const startY = (gameSize.height - totalHeight) / 2;

        this.tubes.forEach((tube, index) => {
            const row = Math.floor(index / GAME_CONFIG.TUBE_COLS);
            const col = index % GAME_CONFIG.TUBE_COLS;

            const x = startX + col * config.COL_OFFSET_X;
            const y = startY + row * config.ROW_SPACING_Y;

            tube.setPosition(x, y);
        });

        // 更新引导手指位置（如果正在显示）
        this.updateHintPosition();
    }

    /**
     * 更新引导手指位置和尺寸（用于横竖屏切换时）
     */
    private updateHintPosition() {
        if (!this.hand) return;
        
        // 根据当前引导步骤确定目标试管
        const targetTube = this.hintStep === 'target' ? this.hintTargetTube : this.hintSourceTube;
        
        if (targetTube && this.hand.visible) {
            const globalPos = this.getWorldTransformMatrix().transformPoint(
                targetTube.x,
                targetTube.y - targetTube.height / 4
            );
            // 更新基准Y位置
            this.handBaseY = globalPos.y;
            this.hand.setPosition(globalPos.x, globalPos.y);
        }
        
        // 如果动画正在运行，需要重新启动以应用新的基准缩放和位置
        const wasAnimating = this.handTween !== null;
        if (wasAnimating) {
            this.stopHandAnimation();
            this.startHandAnimation();
        } else {
            // 没有动画时，直接设置基准缩放
            this.hand.setScale(this.getHandBaseScale());
            this.hand.setAngle(0);
        }
    }

    /**
     * 调试统计：汇总试管与液体相关对象数量
     */
    public getDebugStats(): {
        tubes: number;
        totalBalls: number;
        totalBoundarySprites: number;
        totalActiveSplashes: number;
        returnBoundaryCount: number;
        addingBlockCount: number;
        totalDrawLiquidCalls: number;
    } {
        let totalBalls = 0;
        let totalBoundarySprites = 0;
        let totalActiveSplashes = 0;
        let returnBoundaryCount = 0;
        let addingBlockCount = 0;
        let totalDrawLiquidCalls = 0;

        for (const tube of this.tubes) {
            totalBalls += tube.balls.length;
            const stats = tube.getDebugStats();
            totalBoundarySprites += stats.boundarySprites;
            totalActiveSplashes += stats.activeSplashes;
            if (stats.hasReturnBoundary) returnBoundaryCount++;
            if (stats.hasAddingBlock) addingBlockCount++;
            totalDrawLiquidCalls += stats.drawLiquidCalls;
        }

        return {
            tubes: this.tubes.length,
            totalBalls,
            totalBoundarySprites,
            totalActiveSplashes,
            returnBoundaryCount,
            addingBlockCount,
            totalDrawLiquidCalls
        };
    }

    /** 调试统计：重置试管 drawLiquid 计数 */
    public resetDebugCounters(): void {
        for (const tube of this.tubes) {
            tube.resetDebugCounters();
        }
    }
}
