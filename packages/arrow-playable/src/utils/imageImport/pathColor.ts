/**
 * 路径上色与箭头头检测 - 对应 Python assign_path_color, detect_arrow_head_at_endpoint
 */

import type { PixelPath } from './types';

/**
 * 整条路径用中心像素投票得到单一颜色
 */
export function assignPathColor(
  pixelPath: PixelPath,
  labelImg: Int16Array,
  width: number,
  height: number,
  dt: Float64Array,
  nColors: number,
  edgeIgnoreDt: number
): number {
  const votes: number[] = [];
  const votesFallback: number[] = [];
  for (const [y, x] of pixelPath) {
    if (y < 0 || y >= height || x < 0 || x >= width) continue;
    const label = labelImg[y * width + x];
    if (label >= 0) {
      votesFallback.push(label);
      if (dt[y * width + x] >= edgeIgnoreDt) votes.push(label);
    }
  }
  const pool = votes.length > 0 ? votes : votesFallback;
  if (pool.length === 0) return 0;
  const counts = new Int32Array(nColors);
  for (const v of pool) counts[v]++;
  let best = 0;
  let bestCount = 0;
  for (let c = 0; c < nColors; c++) {
    if (counts[c] > bestCount) {
      bestCount = counts[c];
      best = c;
    }
  }
  return best;
}

/**
 * 端点局部窗口密度 vs 线条主体密度，判断是否为箭头头
 */
export function detectArrowHeadAtEndpoint(
  pixelPath: PixelPath,
  maskOrig: Uint8Array,
  width: number,
  height: number,
  endpointIdx: number,
  windowSize: number
): boolean {
  if (pixelPath.length < 2) return false;
  const [ey, ex] = pixelPath[endpointIdx];
  const y0 = Math.max(0, ey - windowSize);
  const y1 = Math.min(height, ey + windowSize + 1);
  const x0 = Math.max(0, ex - windowSize);
  const x1 = Math.min(width, ex + windowSize + 1);
  if (y0 >= y1 || x0 >= x1) return false;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += maskOrig[y * width + x];
      count++;
    }
  }
  const density = sum / (count + 1e-6);

  const sampleStart =
    endpointIdx === 0 ? 5 : Math.max(0, pixelPath.length - 15);
  const sampleEnd =
    endpointIdx === 0 ? Math.min(pixelPath.length, 15) : Math.max(0, pixelPath.length - 5);
  if (sampleStart >= sampleEnd) return false;

  const lineDensities: number[] = [];
  for (let idx = sampleStart; idx < sampleEnd; idx++) {
    const [sy, sx] = pixelPath[idx];
    const ly0 = Math.max(0, sy - windowSize);
    const ly1 = Math.min(height, sy + windowSize + 1);
    const lx0 = Math.max(0, sx - windowSize);
    const lx1 = Math.min(width, sx + windowSize + 1);
    if (ly0 < ly1 && lx0 < lx1) {
      let s = 0;
      let c = 0;
      for (let y = ly0; y < ly1; y++) {
        for (let x = lx0; x < lx1; x++) {
          s += maskOrig[y * width + x];
          c++;
        }
      }
      lineDensities.push(s / (c + 1e-6));
    }
  }
  if (lineDensities.length === 0) return false;
  lineDensities.sort((a, b) => a - b);
  const medianLineDensity = lineDensities[Math.floor(lineDensities.length / 2)];
  return density > medianLineDensity * 1.4;
}
