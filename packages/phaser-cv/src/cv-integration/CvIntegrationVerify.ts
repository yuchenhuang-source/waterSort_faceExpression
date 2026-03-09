/**
 * CV 接入验证：运行时检查 adapter 与 root 是否完整实现，输出 (4/4) 或缺失项。
 * 在 initCvIntegration 中调用，结果输出到 console，便于新项目排查。
 */

import type { ICvSceneAdapter } from './CvSceneAdapter.js';
import type { ICvRenderable, ICvTraversable } from '../render/CvColorCode.js';

export interface CvVerifyResult {
  passed: number;
  total: number;
  ok: boolean;
  errors: string[];
}

const TOTAL = 4;

/**
 * 验证 CV 接入是否完整。返回 { passed, total, ok, errors }，并输出到 console。
 */
export function verifyCvIntegration(adapter: ICvSceneAdapter): CvVerifyResult {
  const errors: string[] = [];
  let passed = 0;

  // 1. adapter.getRootRenderable + getStaticTintables
  if (typeof adapter.getRootRenderable !== 'function') {
    errors.push('adapter.getRootRenderable 缺失');
  } else if (typeof adapter.getStaticTintables !== 'function') {
    errors.push('adapter.getStaticTintables 缺失');
  } else {
    passed++;
  }

  // 2. root 存在且实现 prepareCvRender
  const root = adapter.getRootRenderable?.();
  if (!root) {
    errors.push('getRootRenderable() 返回空');
  } else if (typeof (root as ICvRenderable).prepareCvRender !== 'function') {
    errors.push('root.prepareCvRender 缺失');
  } else {
    passed++;
  }

  // 3. getColorMapIds 可推导：root.getCvChildren 或 adapter.getColorMapIds
  const hasGetCvChildren =
    root && 'getCvChildren' in root && typeof (root as ICvTraversable).getCvChildren === 'function';
  const hasGetColorMapIds = typeof adapter.getColorMapIds === 'function';
  if (!hasGetCvChildren && !hasGetColorMapIds) {
    errors.push('root 需实现 getCvChildren，或 adapter 提供 getColorMapIds');
  } else {
    passed++;
  }

  // 4. root.getColorCodeObjectIds（getActiveIds 会用到）
  if (root && typeof (root as any).getColorCodeObjectIds !== 'function') {
    errors.push('root.getColorCodeObjectIds 缺失');
  } else {
    passed++;
  }

  const ok = passed === TOTAL;
  const result: CvVerifyResult = { passed, total: TOTAL, ok, errors };

  // 输出到 console
  const prefix = '[CV] 接入检查:';
  if (ok) {
    console.log(`${prefix} ${passed}/${TOTAL} ✓ 接入完整`);
  } else {
    console.warn(`${prefix} ${passed}/${TOTAL}`);
    errors.forEach((e) => console.warn(`  ✗ ${e}`));
  }

  return result;
}
