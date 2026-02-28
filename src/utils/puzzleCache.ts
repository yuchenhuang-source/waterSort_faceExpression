/**
 * 谜题缓存
 * 每次游戏启动时生成 3 个关卡（难度 1/5/9），供选关预览和游戏使用
 */

import { generatePuzzleWithAdapter, PuzzleAdapterResult } from './puzzle-adapter';
import { getOutputConfigAsync, getOutputConfigValueAsync } from './outputConfigLoader';

export interface CachedPuzzleData {
  puzzle: PuzzleAdapterResult;
  difficulty: number;
  emptyTubeCount: number;
}

const cache = new Map<string, CachedPuzzleData>();

/** 预生成完成后的 Promise，Preloader 可 await 确保缓存就绪 */
let _pregeneratePromise: Promise<void> | null = null;

function cacheKey(difficulty: number, emptyTubeCount: number): string {
  return `${difficulty}-${emptyTubeCount}`;
}

/**
 * 获取缓存的谜题，若无则返回 null
 */
export function getCachedPuzzle(
  difficulty: number,
  emptyTubeCount: number
): CachedPuzzleData | null {
  return cache.get(cacheKey(difficulty, emptyTubeCount)) ?? null;
}

/**
 * 等待预生成完成（用于 Preloader 确保缓存就绪）
 */
export function waitForPregenerate(): Promise<void> {
  if (_pregeneratePromise) return _pregeneratePromise;
  pregeneratePuzzles();
  return _pregeneratePromise!;
}

/**
 * 应用启动时调用：每次游戏启动生成 3 个关卡（难度 1/5/9），供选关预览和游戏使用
 */
export function pregeneratePuzzles(): void {
  _pregeneratePromise = getOutputConfigAsync()
    .then(async () => {
      const emptyTubeCount = Math.max(
        1,
        Math.min(6, await getOutputConfigValueAsync<number>('emptyTubeCount', 2))
      );

      const difficulties = [1, 5, 9];
      for (const d of difficulties) {
        try {
          const puzzle = generatePuzzleWithAdapter({
            difficulty: d,
            emptyTubeCount,
          });
          const item: CachedPuzzleData = { puzzle, difficulty: d, emptyTubeCount };
          cache.set(cacheKey(d, emptyTubeCount), item);
        } catch (e) {
          if (import.meta.env?.DEV) {
            console.warn(`[puzzleCache] 生成难度 ${d} 失败:`, e);
          }
        }
      }
    })
    .then(() => undefined)
    .catch((e) => {
      if (import.meta.env?.DEV) {
        console.warn('[puzzleCache] 预生成失败:', e);
      }
    }) as Promise<void>;
}
