/**
 * 运行时配置加载器
 * 优先从 /api/constants 获取配置（dev 模式），失败时回退到打包的 JSON（生产构建）
 */
import configJson from './game-constants-config.json';
import type { CachedPuzzleData } from '../../utils/puzzleCache';

export type GameConstantsConfig = Record<string, unknown>;

let _config: GameConstantsConfig | null = null;

/** 从 /api/constants 或打包 JSON 获取配置 */
export async function fetchGameConstants(): Promise<GameConstantsConfig> {
  let result: GameConstantsConfig;
  try {
    const r = await fetch('/api/constants');
    if (r.ok) {
      result = (await r.json()) as GameConstantsConfig;
    } else {
      result = configJson as GameConstantsConfig;
    }
  } catch {
    result = configJson as GameConstantsConfig;
  }
  _config = result;
  return result;
}

/** 重新获取配置并更新 _config（用于截图更新后刷新 LevelPreview） */
export async function refreshConfig(): Promise<void> {
  const result = await fetchGameConstants();
  _config = result;
}

/** 获取指定难度的固定谜题，若无则返回 null */
export function getFixedPuzzle(difficulty: number): CachedPuzzleData | null {
  if (!_config) return null;
  try {
    const fp = _config.FIXED_PUZZLES as Record<string, unknown> | undefined;
    if (!fp || typeof fp !== 'object') return null;
    const item = fp[String(difficulty)];
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    const puzzle = obj.puzzle as { tubes?: unknown[] } | undefined;
    if (!puzzle?.tubes || !Array.isArray(puzzle.tubes)) return null;
    return item as CachedPuzzleData;
  } catch {
    return null;
  }
}

/** 获取指定难度的关卡截图（data URL），若无则返回 null */
export function getLevelScreenshot(difficulty: number): string | null {
  if (!_config) return null;
  try {
    const ss = _config.LEVEL_PREVIEW_SCREENSHOTS as Record<string, string> | undefined;
    if (!ss || typeof ss !== 'object') return null;
    const url = ss[String(difficulty)];
    return typeof url === 'string' && url.startsWith('data:') ? url : null;
  } catch {
    return null;
  }
}

/** 是否有固定谜题（任一难度） */
export function hasFixedPuzzle(): boolean {
  if (!_config) return false;
  try {
    const fp = _config.FIXED_PUZZLES as Record<string, unknown> | undefined;
    if (!fp || typeof fp !== 'object') return false;
    return Object.keys(fp).length > 0;
  } catch {
    return false;
  }
}
