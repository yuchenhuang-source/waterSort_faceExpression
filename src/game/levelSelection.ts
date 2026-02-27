import { EventBus } from './EventBus';

/** 选关 1/2/3 对应难度 1/5/9（ballsort 难度 1-10） */
const LEVEL_TO_DIFFICULTY: Record<number, number> = {
  1: 1,
  2: 5,
  3: 9,
};

let persistentSelectedDifficulty = 1;
let initialLevelFromURL: number | null = null;
let userHasSelectedFromUI = false;

/** 支持 ?level=1,2,3 -> 难度 1,5,9 */
function resolveLevelFromParam(rawValue: string | null): number | null {
  if (!rawValue || typeof window === 'undefined') return null;
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return null;
  const num = Number(normalized);
  if (Number.isInteger(num) && num >= 1 && num <= 3) {
    return LEVEL_TO_DIFFICULTY[num];
  }
  return null;
}

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const resolved = resolveLevelFromParam(params.get('level'));
  if (resolved !== null) {
    persistentSelectedDifficulty = resolved;
    initialLevelFromURL = 1;
  }
}

export function getInitialLevelFromURL(): number | null {
  return initialLevelFromURL;
}

export function getPersistentSelectedLevel(): number {
  return persistentSelectedDifficulty;
}

/** 传入难度 1/5/9，选关 1/2/3 对应 1/5/9 */
export function setPersistentSelectedLevel(difficulty: number) {
  persistentSelectedDifficulty = difficulty;
  userHasSelectedFromUI = true;
  EventBus.emit('level-selected', difficulty);
}

/** 是否已有可用关卡（来自 URL 或用户已点击选关） */
export function isLevelSelectionReady(): boolean {
  return initialLevelFromURL !== null || userHasSelectedFromUI;
}
