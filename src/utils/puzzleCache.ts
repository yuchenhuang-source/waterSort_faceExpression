/**
 * 谜题缓存
 * 优先从 HTML 嵌入的 puzzles-config.json 加载固定关卡，无需生成或 localStorage
 */

import { parseEncodedConfig } from './configLoader';
import puzzlesConfigJson from '../game/config/puzzles-config.json';
import { generatePuzzleWithAdapter, PuzzleAdapterResult } from './puzzle-adapter';
import { getOutputConfigAsync, getOutputConfigValueAsync } from './outputConfigLoader';

export interface CachedPuzzleData {
  puzzle: PuzzleAdapterResult;
  difficulty: number;
  emptyTubeCount: number;
}

const STORAGE_KEY = 'ballsort-puzzles-v1';

interface StoredPuzzles {
  version: number;
  emptyTubeCount: number;
  puzzles: Record<string, CachedPuzzleData>;
}

const cache = new Map<string, CachedPuzzleData>();

/** 预生成完成后的 Promise，Preloader 可 await 确保缓存就绪 */
let _pregeneratePromise: Promise<void> | null = null;

function cacheKey(difficulty: number, emptyTubeCount: number): string {
  return `${difficulty}-${emptyTubeCount}`;
}

/** 将 JSON 项（扁平或嵌套）转为 CachedPuzzleData */
function toCachedPuzzleData(
  item: any,
  difficulty: number,
  emptyTubeCount: number
): CachedPuzzleData | null {
  if (!item) return null;
  if (item.puzzle?.tubes) return item as CachedPuzzleData;
  if (item.tubes) {
    return {
      puzzle: {
        tubes: item.tubes,
        seedUsed: item.seedUsed ?? 0,
        perColorTubes: item.perColorTubes ?? [],
        usedColors: item.usedColors ?? [],
      },
      difficulty: item.difficulty ?? difficulty,
      emptyTubeCount: item.emptyTubeCount ?? emptyTubeCount,
    };
  }
  return null;
}

/** 从嵌入配置或 fetch 加载 puzzles-config.json，返回 StoredPuzzles 或 null */
async function loadPuzzlesConfig(emptyTubeCount: number): Promise<StoredPuzzles | null> {
  const filename = 'puzzles-config.json';

  // 生产：从 window.EMBEDDED_CONFIG 解析
  if (typeof window !== 'undefined' && (window as any).EMBEDDED_CONFIG) {
    const parsed = parseEncodedConfig((window as any).EMBEDDED_CONFIG, filename);
    if (parsed?.puzzles && typeof parsed.emptyTubeCount === 'number' && parsed.emptyTubeCount === emptyTubeCount) {
      return parsed as StoredPuzzles;
    }
    return null;
  }

  // 开发：直接使用打包进来的 JSON，无网络延迟
  if (import.meta.env.DEV) {
    const parsed = puzzlesConfigJson as unknown as StoredPuzzles;
    if (parsed?.puzzles && typeof parsed.emptyTubeCount === 'number' && parsed.emptyTubeCount === emptyTubeCount) {
      return parsed;
    }
    return null;
  }
  return null;
}

function loadFromStorage(): StoredPuzzles | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPuzzles;
    if (!parsed?.puzzles || typeof parsed.emptyTubeCount !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(emptyTubeCount: number, data: Record<string, CachedPuzzleData>): void {
  try {
    const stored: StoredPuzzles = {
      version: 1,
      emptyTubeCount,
      puzzles: data,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn('[puzzleCache] 保存失败:', e);
    }
  }
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
 * 应用启动时调用：优先从 HTML 嵌入的 puzzles-config 加载；若无则 localStorage，最后才生成
 */
export function pregeneratePuzzles(): void {
  _pregeneratePromise = getOutputConfigAsync()
    .then(async () => {
      const emptyTubeCount = Math.max(
        1,
        Math.min(6, await getOutputConfigValueAsync<number>('emptyTubeCount', 2))
      );

      // 1. 优先：嵌入的 puzzles-config.json（生产）或 fetch（开发）
      const fromConfig = await loadPuzzlesConfig(emptyTubeCount);
      if (fromConfig?.puzzles) {
        const difficulties = [1, 5, 9];
        for (const d of difficulties) {
          const key = String(d);
          const item = fromConfig.puzzles[key];
          const parsed = toCachedPuzzleData(item, d, emptyTubeCount);
          if (parsed) cache.set(cacheKey(d, emptyTubeCount), parsed);
        }
        return undefined;
      }

      // 2. 其次：localStorage
      const stored = loadFromStorage();
      if (stored && stored.emptyTubeCount === emptyTubeCount && stored.puzzles) {
        const difficulties = [1, 5, 9];
        for (const d of difficulties) {
          const key = String(d);
          const item = stored.puzzles[key];
          if (item?.puzzle?.tubes) {
            cache.set(cacheKey(d, emptyTubeCount), item);
          }
        }
        return undefined;
      }

      // 3. 最后：运行时生成
      const puzzles: Record<string, CachedPuzzleData> = {};
      const difficulties = [1, 5, 9];
      for (const d of difficulties) {
        try {
          const puzzle = generatePuzzleWithAdapter({
            difficulty: d,
            emptyTubeCount,
          });
          const item = { puzzle, difficulty: d, emptyTubeCount };
          cache.set(cacheKey(d, emptyTubeCount), item);
          puzzles[String(d)] = item;
        } catch (e) {
          if (import.meta.env?.DEV) {
            console.warn(`[puzzleCache] 生成难度 ${d} 失败:`, e);
          }
        }
      }
      saveToStorage(emptyTubeCount, puzzles);
    })
    .then(() => undefined)
    .catch((e) => {
      if (import.meta.env?.DEV) {
        console.warn('[puzzleCache] 预生成失败:', e);
      }
    }) as Promise<void>;
}
