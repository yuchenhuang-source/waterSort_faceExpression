/**
 * 关卡截图存储
 * 模拟器点击「随机更新3关」后，将每关的截图存入 localStorage，供 LevelPreview 使用
 */

const STORAGE_KEY = 'simLevelScreenshots';

/** 按难度 1/5/9 索引的 data URL */
type StoredScreenshots = Record<string, string>;

/**
 * 获取指定难度的关卡截图（data URL），若无则返回 null
 */
export function getLevelScreenshot(difficulty: number): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScreenshots;
    const url = parsed[String(difficulty)];
    return typeof url === 'string' && url.startsWith('data:') ? url : null;
  } catch {
    return null;
  }
}

/**
 * 设置 3 个关卡的截图（难度 1/5/9）
 */
export function setLevelScreenshots(map: Record<number, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const stored: StoredScreenshots = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'string' && v.startsWith('data:')) {
        stored[String(k)] = v;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn('[levelScreenshotStorage] 写入失败:', e);
    }
  }
}

/**
 * 是否有关卡截图
 */
export function hasLevelScreenshots(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredScreenshots;
    return Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}
