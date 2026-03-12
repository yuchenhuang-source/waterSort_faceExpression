/**
 * 固定关卡存储
 * 模拟器点击「固定随机关卡」后，随机生成 3 个关卡（难度 1/5/9）存入 localStorage，游戏永远使用固定关卡
 */

import type { CachedPuzzleData } from './puzzleCache';

const STORAGE_KEY = 'simFixedPuzzles';

/** 存储格式：按难度 1/5/9 索引 */
type StoredPuzzles = Record<string, CachedPuzzleData>;

/**
 * 获取指定难度的固定谜题，若无则返回 null
 */
export function getFixedPuzzle(difficulty: number): CachedPuzzleData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPuzzles;
    const key = String(difficulty);
    const item = parsed[key];
    if (!item?.puzzle?.tubes || !Array.isArray(item.puzzle.tubes)) return null;
    return item;
  } catch {
    return null;
  }
}

/**
 * 设置 3 个固定谜题（难度 1/5/9）
 */
export function setFixedPuzzles(items: CachedPuzzleData[]): void {
  if (typeof window === 'undefined') return;
  try {
    const map: StoredPuzzles = {};
    for (const item of items) {
      map[String(item.difficulty)] = item;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn('[fixedPuzzleStorage] 写入失败:', e);
    }
  }
}

/**
 * 是否有固定谜题（任一难度）
 */
export function hasFixedPuzzle(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredPuzzles;
    return Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}
