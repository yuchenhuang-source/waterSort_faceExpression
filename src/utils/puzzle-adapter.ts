/**
 * 谜题生成器适配器
 * 将 sort-puzzle-generator 的输出适配到现有游戏系统
 */

import { createPuzzle, GeneratorConfig } from './sort-puzzle-generator';
import { BallColor, BALL_COLORS, GAME_CONFIG } from '../game/constants/GameConstants';

/**
 * 适配器配置接口
 */
export interface PuzzleAdapterConfig {
    /** 难度等级 1-10，影响颜色数量（颜色数 = difficulty + 2） */
    difficulty: number;
    /** 空管数量，默认2，增加空管会减少满管和球数 */
    emptyTubeCount?: number;
    /** 可选的随机种子，用于生成可复现的谜题 */
    seed?: string | number;
    /** 打乱步数倍率，默认1.0，增大可提高打乱程度 */
    shuffleMultiplier?: number;
}

/**
 * 适配器返回结果
 */
export interface PuzzleAdapterResult {
    /** 谜题内容，BallColor二维数组 */
    tubes: BallColor[][];
    /** 使用的种子值 */
    seedUsed: number;
    /** 每种颜色的试管分配 */
    perColorTubes: number[];
    /** 实际使用的颜色列表 */
    usedColors: BallColor[];
}

/**
 * 使用新生成器生成谜题并转换为现有系统格式
 * 
 * @param config 适配器配置
 * @returns 适配后的谜题结果
 * 
 * @example
 * ```typescript
 * const result = generatePuzzleWithAdapter({
 *   difficulty: 5,
 *   seed: 'level-1'
 * });
 * // result.tubes 可直接用于创建Ball对象
 * ```
 */
export function generatePuzzleWithAdapter(config: PuzzleAdapterConfig): PuzzleAdapterResult {
    const {
        difficulty,
        emptyTubeCount = 2,
        seed,
        shuffleMultiplier = 1.0
    } = config;
    
    // 1. 计算派生参数
    const colorCount = Math.min(12, Math.max(3, difficulty + 2)); // 3-12种颜色
    const totalTubes = GAME_CONFIG.TUBE_COUNT;  // 14 (总管数固定)
    // 空管数量限制在合理范围 (1-6)，确保至少有8个满管
    const actualEmptyTubes = Math.min(6, Math.max(1, emptyTubeCount));
    const filledTubes = totalTubes - actualEmptyTubes;  // 满管数 = 14 - 空管数
    const tubeSize = GAME_CONFIG.TUBE_CAPACITY;  // 8
    
    // 2. 计算每种颜色的试管分配
    // 确保总管数为 filledTubes，且每种颜色至少有1管
    // 注意：颜色数不能超过满管数
    const actualColorCount = Math.min(colorCount, filledTubes);
    const perColorTubes = calculateColorDistribution(actualColorCount, filledTubes);
    
    // 3. 计算打乱步数（基础200 + 难度加成）
    const baseShuffleSteps = 200;
    const difficultyBonus = difficulty * 20;
    const shuffleSteps = Math.floor((baseShuffleSteps + difficultyBonus) * shuffleMultiplier);
    
    // 4. 调用新生成器
    const generatorConfig: GeneratorConfig = {
        colorCount: actualColorCount,
        tubeCount: filledTubes,  // 有球的试管数量
        tubeSize,
        perColorTubes,
        shuffleSteps,
        seed,
        allowZeroTubesForColor: false,
        emptyTubeCount: actualEmptyTubes,  // 空试管数量
    };
    
    if (import.meta.env.DEV) {
        console.log('[PuzzleAdapter] 生成器配置:', {
            colorCount: actualColorCount,
            totalTubes,
            filledTubes,
            emptyTubes: actualEmptyTubes,
            tubeSize,
            perColorTubes,
            shuffleSteps,
            seed: seed ?? 'random'
        });
    }
    
    const result = createPuzzle(generatorConfig);
    
    // 5. 颜色映射：将数字索引转换为 BallColor
    // 随机选择颜色顺序（如果有seed则使用确定性方法）
    const usedColors = selectColors(colorCount, result.seedUsed);
    
    // 6. 转换试管内容（生成器已经返回包含空管的完整数组）
    const tubeContents: BallColor[][] = result.tubes.map(tube =>
        tube.map(colorIndex => usedColors[colorIndex])
    );
    
    // 不再需要手动添加空试管，生成器已经处理好了
    
    if (import.meta.env.DEV) {
        console.log('[PuzzleAdapter] 生成完成:', {
            totalTubes: tubeContents.length,
            filledTubes: tubeContents.filter(t => t.length > 0).length,
            emptyTubes: tubeContents.filter(t => t.length === 0).length,
            usedColors: usedColors.slice(0, colorCount),
            seedUsed: result.seedUsed
        });
    }
    
    return {
        tubes: tubeContents,
        seedUsed: result.seedUsed,
        perColorTubes: result.perColorTubes,
        usedColors,
    };
}

/**
 * 计算颜色分配
 * 确保每种颜色至少有1管，总和等于filledTubes
 */
function calculateColorDistribution(colorCount: number, filledTubes: number): number[] {
    const tubesPerColor = Math.floor(filledTubes / colorCount);
    const extraTubes = filledTubes % colorCount;
    
    const distribution: number[] = [];
    for (let i = 0; i < colorCount; i++) {
        // 前 extraTubes 种颜色多分配一管
        distribution.push(i < extraTubes ? tubesPerColor + 1 : tubesPerColor);
    }
    
    // 验证
    const sum = distribution.reduce((a, b) => a + b, 0);
    if (sum !== filledTubes && import.meta.env.DEV) {
        console.error(`[PuzzleAdapter] 颜色分配错误: 总和${sum} != ${filledTubes}`);
    }
    
    return distribution;
}

/**
 * 根据seed选择颜色
 * 使用确定性方法确保相同seed产生相同颜色组合
 */
function selectColors(colorCount: number, seed: number): BallColor[] {
    // 使用简单的确定性打乱
    const colors = [...BALL_COLORS];
    
    // Fisher-Yates shuffle with seeded random
    let t = seed >>> 0;
    const rng = () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    
    for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    
    return colors.slice(0, colorCount);
}

/**
 * 验证生成的谜题是否有效
 */
export function validatePuzzle(tubes: BallColor[][]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const capacity = GAME_CONFIG.TUBE_CAPACITY;
    
    // 检查试管总数
    if (tubes.length !== GAME_CONFIG.TUBE_COUNT) {
        errors.push(`试管数量错误: ${tubes.length} != ${GAME_CONFIG.TUBE_COUNT}`);
    }
    
    // 统计每种颜色的球数
    const colorCounts = new Map<BallColor, number>();
    let filledTubeCount = 0;
    let emptyTubeCount = 0;
    
    for (const tube of tubes) {
        if (tube.length === 0) {
            emptyTubeCount++;
        } else if (tube.length === capacity) {
            filledTubeCount++;
            for (const ball of tube) {
                colorCounts.set(ball, (colorCounts.get(ball) || 0) + 1);
            }
        } else {
            errors.push(`试管容量异常: ${tube.length} (应为 0 或 ${capacity})`);
        }
    }
    
    // 检查空试管数量
    if (emptyTubeCount !== 2) {
        errors.push(`空试管数量错误: ${emptyTubeCount} != 2`);
    }
    
    // 检查每种颜色的球数是否为8的倍数
    for (const [color, count] of colorCounts) {
        if (count % capacity !== 0) {
            errors.push(`颜色 ${color} 数量异常: ${count} (应为 ${capacity} 的倍数)`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 快速生成一个简单的测试谜题（用于调试）
 */
export function generateTestPuzzle(): BallColor[][] {
    return generatePuzzleWithAdapter({
        difficulty: 5,
        seed: 'test-puzzle',
        shuffleMultiplier: 0.5
    }).tubes;
}