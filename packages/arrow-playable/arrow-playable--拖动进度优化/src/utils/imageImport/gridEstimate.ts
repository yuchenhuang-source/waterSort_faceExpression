/**
 * 网格步长与偏移估计 - 对应 Python _dominant_period, estimate_grid_step, estimate_offset
 */

import { zhangSuenThinning } from './zhangSuen';
import { distanceTransformEDT } from './distanceTransform';

/**
 * 自相关 ac[lag] = sum_i sig[i]*sig[i+lag]，然后找 [lo, hi) 内峰值
 */
function dominantPeriod(
  signal: number[],
  minPeriod: number,
  maxPeriod: number
): { period: number; score: number } | null {
  const n = signal.length;
  if (n <= minPeriod) return null;
  const mean = signal.reduce((a, b) => a + b, 0) / n;
  const sig = signal.map((s) => s - mean);
  let variance = 0;
  for (let i = 0; i < n; i++) variance += sig[i] * sig[i];
  variance /= n;
  if (variance < 1e-12) return null;
  const lo = Math.max(1, minPeriod);
  const hi = Math.min(maxPeriod, n - 1);
  if (lo >= hi) return null;
  const ac: number[] = [];
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += sig[i] * sig[i + lag];
    ac.push(lag === 0 ? 0 : sum);
  }
  let maxAc = -Infinity;
  let bestPeriod = lo;
  for (let lag = lo; lag < hi; lag++) {
    if (ac[lag] > maxAc) {
      maxAc = ac[lag];
      bestPeriod = lag;
    }
  }
  if (maxAc <= 0) return null;
  const acSub = ac.slice(lo, hi);
  const peaks: Array<{ period: number; val: number }> = [];
  for (let i = 1; i < acSub.length - 1; i++) {
    const val = acSub[i];
    if (val > acSub[i - 1] && val > acSub[i + 1] && val > 0) {
      peaks.push({ period: i + lo, val });
    }
  }
  if (peaks.length === 0) {
    return { period: bestPeriod, score: maxAc };
  }
  const globalMax = Math.max(...peaks.map((p) => p.val));
  const significance = 0.3;
  for (const { period, val } of peaks) {
    if (val >= globalMax * significance) return { period, score: val };
  }
  const best = peaks.reduce((a, b) => (a.val > b.val ? a : b));
  return { period: best.period, score: best.val };
}

/**
 * 估计网格步长并返回骨架
 */
export function estimateGridStep(
  mask: Uint8Array,
  width: number,
  height: number,
  lineWidth: number
): { stepX: number; stepY: number; skeleton: Uint8Array } {
  const skeleton = zhangSuenThinning(mask, width, height);
  const colProj: number[] = [];
  for (let x = 0; x < width; x++) {
    let s = 0;
    for (let y = 0; y < height; y++) s += skeleton[y * width + x];
    colProj.push(s);
  }
  const rowProj: number[] = [];
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) s += skeleton[y * width + x];
    rowProj.push(s);
  }
  const colMean = colProj.reduce((a, b) => a + b, 0) / colProj.length;
  const rowMean = rowProj.reduce((a, b) => a + b, 0) / rowProj.length;
  const colCentered = colProj.map((c) => c - colMean);
  const rowCentered = rowProj.map((r) => r - rowMean);
  const minP = Math.max(4, Math.floor(lineWidth * 2));
  const maxX = Math.min(300, width - 1);
  const maxY = Math.min(300, height - 1);
  const rx = dominantPeriod(colCentered, minP, maxX);
  const ry = dominantPeriod(rowCentered, minP, maxY);
  let stepX = rx?.period ?? 1;
  let stepY = ry?.period ?? 1;
  return { stepX, stepY, skeleton };
}

/**
 * 估计网格偏移（相位加权直方图）
 */
export function estimateOffset(
  mask: Uint8Array,
  width: number,
  height: number,
  step: number,
  axis: number
): number {
  if (step <= 0) return 0;
  const dt = distanceTransformEDT(mask, width, height);
  const hist = new Float64Array(step);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const coord = axis === 0 ? x : y;
      const phase = ((coord % step) + step) % step;
      hist[phase] += dt[y * width + x];
    }
  }
  let peak = 0;
  let maxVal = 0;
  for (let i = 0; i < step; i++) {
    if (hist[i] > maxVal) {
      maxVal = hist[i];
      peak = i;
    }
  }
  return peak - step / 2;
}
