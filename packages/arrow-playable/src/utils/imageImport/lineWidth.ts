/**
 * 线宽估计 - 对应 Python estimate_line_width（距离变换直方图取众数）
 */

import { distanceTransformEDT } from './distanceTransform';

export function estimateLineWidth(mask: Uint8Array, width: number, height: number): number {
  const dt = distanceTransformEDT(mask, width, height);
  const vals: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) vals.push(dt[i]);
  }
  if (vals.length === 0) return 1;
  let maxVal = vals[0];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] > maxVal) maxVal = vals[i];
  }
  const binStep = 0.5;
  const numBins = Math.max(2, Math.ceil((maxVal + 0.5) / binStep));
  const hist = new Float64Array(numBins);
  const edges: number[] = [];
  for (let b = 0; b <= numBins; b++) edges.push(b * binStep);
  for (const v of vals) {
    const binIdx = Math.min(numBins - 1, Math.floor(v / binStep));
    hist[binIdx] += 1;
  }
  if (numBins > 1) hist[0] = 0;
  let modeIdx = 0;
  let modeVal = 0;
  for (let b = 0; b < numBins; b++) {
    if (hist[b] > modeVal) {
      modeVal = hist[b];
      modeIdx = b;
    }
  }
  const mode = (edges[modeIdx] + edges[modeIdx + 1]) / 2;
  return Math.max(1, 2 * mode);
}
