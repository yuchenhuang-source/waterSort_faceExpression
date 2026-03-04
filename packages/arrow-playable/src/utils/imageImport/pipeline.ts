/**
 * 图片导入主流程 - 对应 Python image_import.py main() v6
 */

import type { ImageImportParams, ImageImportResult, ImportArrowData } from './types';
import { loadImageFromFile } from './imageLoader';
import { alphaMask, filterDarkBorders, preprocessMask } from './mask';
import { estimateLineWidth } from './lineWidth';
import { distanceTransformEDT } from './distanceTransform';
import { autoClusterColors, kmeansFixedK, type Pixel } from './kmeans';
import { estimateGridStep, estimateOffset } from './gridEstimate';
import { zhangSuenThinning } from './zhangSuen';
import { traceSkeletonPathsV6 } from './pathTracing';
import { snapPathToGridV6 } from './pathToGrid';
import { assignPathColor, detectArrowHeadAtEndpoint } from './pathColor';
import { tryMergeAdjacentPaths } from './pathMerge';

function splitAtGaps(path: Array<[number, number]>): Array<Array<[number, number]>> {
  if (path.length < 2) return path.length ? [path] : [];
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const dist =
      Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
    if (dist > 1) {
      if (current.length >= 2) segments.push(current);
      current = [path[i]];
    } else {
      current.push(path[i]);
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function hasBacktrack(path: Array<[number, number]>): boolean {
  const set = new Set<string>();
  for (const [r, c] of path) {
    const k = `${r},${c}`;
    if (set.has(k)) return true;
    set.add(k);
  }
  return false;
}

const DEFAULT_PARAMS: Required<ImageImportParams> = {
  colors: 0,
  alphaThreshold: 1,
  closeRadius: -1,
  forceStepX: 0,
  forceStepY: 0,
  minArrowLen: 2,
  borderBrightness: 30,
  simplifyEpsilon: 0
};

/**
 * 从图片 File 执行完整导入，返回与 LevelData 兼容的结果
 */
export async function runImageImport(
  file: File,
  params: ImageImportParams = {}
): Promise<ImageImportResult> {
  const p = { ...DEFAULT_PARAMS, ...params };
  const { data, width: w, height: h } = await loadImageFromFile(file);
  const sourceName = file.name || 'image';

  let maskOrig = alphaMask(data, w, h, p.alphaThreshold);
  if (p.borderBrightness > 0) {
    maskOrig = filterDarkBorders(data, w, h, maskOrig, p.borderBrightness);
  }

  const lineWidth = estimateLineWidth(maskOrig, w, h);
  let closeR = p.closeRadius;
  if (closeR < 0) closeR = Math.max(1, Math.floor(lineWidth * 0.7));
  const maskCombined = preprocessMask(maskOrig, w, h, closeR);

  const pixels: Pixel[] = [];
  const maskIndices: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (maskOrig[y * w + x]) {
        const i = (y * w + x) * 4;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
        maskIndices.push(y * w + x);
      }
    }
  }
  if (pixels.length === 0) throw new Error('No stroke pixels found');

  const dt = distanceTransformEDT(maskOrig, w, h);
  const dtValues = maskIndices.map((idx) => dt[idx]);

  let labelsArr: number[];
  let centers: Pixel[];
  let nColors: number;
  if (p.colors > 0) {
    const res = kmeansFixedK(pixels, p.colors);
    labelsArr = res.labels;
    centers = res.centers;
    nColors = p.colors;
  } else {
    const res = autoClusterColors(pixels, dtValues, 8);
    labelsArr = res.labels;
    centers = res.centers;
    nColors = res.k;
  }

  const labelImg = new Int16Array(w * h);
  labelImg.fill(-1);
  for (let i = 0; i < maskIndices.length; i++) labelImg[maskIndices[i]] = labelsArr[i];

  const palette = centers.map((c) => `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`);

  const { stepX: stepXEst, stepY: stepYEst } = estimateGridStep(
    maskCombined,
    w,
    h,
    lineWidth
  );
  let stepX = stepXEst ?? 1;
  let stepY = stepYEst ?? 1;
  const skeleton = zhangSuenThinning(maskOrig, w, h);
  if (p.forceStepX > 0) stepX = p.forceStepX;
  if (p.forceStepY > 0) stepY = p.forceStepY;
  if (stepX && stepY && Math.abs(stepX - stepY) < Math.max(stepX, stepY) * 0.15) {
    const step = Math.round((stepX + stepY) / 2);
    stepX = stepY = step;
  }

  let oxInit = estimateOffset(maskCombined, w, h, stepX, 0);
  let oyInit = estimateOffset(maskCombined, w, h, stepY, 1);
  const searchRange = Math.max(2, Math.floor(stepX / 3));
  let bestOx = oxInit;
  let bestOy = oyInit;
  let bestScore = -1;
  const skelPoints: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (skeleton[y * w + x]) skelPoints.push([y, x]);
  for (let dox = -searchRange; dox <= searchRange; dox++) {
    for (let doy = -searchRange; doy <= searchRange; doy++) {
      const testOx = oxInit + dox;
      const testOy = oyInit + doy;
      let inCentre = 0;
      for (const [sy, sx] of skelPoints) {
        const cx = ((sx - testOx) % stepX + stepX) % stepX / stepX;
        const cy = ((sy - testOy) % stepY + stepY) % stepY / stepY;
        if (cx > 0.2 && cx < 0.8 && cy > 0.2 && cy < 0.8) inCentre++;
      }
      if (inCentre > bestScore) {
        bestScore = inCentre;
        bestOx = testOx;
        bestOy = testOy;
      }
    }
  }
  const ox = bestOx;
  const oy = bestOy;

  const pixelPaths = traceSkeletonPathsV6(skeleton, w, h);
  const minPixelLen = Math.max(2, Math.floor(lineWidth));
  const filteredPixelPaths = pixelPaths.filter((path) => path.length >= minPixelLen);

  const gridPathsWithColor: Array<{ path: Array<[number, number]>; color: number }> = [];
  const windowPx = Math.max(5, Math.floor(lineWidth * 2));
  const edgeIgnoreDt = Math.max(0.3, lineWidth * 0.15);

  for (const pp of filteredPixelPaths) {
    const isHeadAtStart = detectArrowHeadAtEndpoint(pp, maskOrig, w, h, 0, windowPx);
    const isHeadAtEnd = detectArrowHeadAtEndpoint(pp, maskOrig, w, h, pp.length - 1, windowPx);
    let ppOriented: Array<[number, number]>;
    if (isHeadAtStart && !isHeadAtEnd) {
      ppOriented = [...pp].reverse();
    } else {
      ppOriented = pp;
    }
    const gp = snapPathToGridV6(ppOriented, stepX, stepY, ox, oy);
    if (gp.length < 2) continue;
    const color = assignPathColor(ppOriented, labelImg, w, h, dt, nColors, edgeIgnoreDt);
    gridPathsWithColor.push({ path: gp, color });
  }

  const merged = tryMergeAdjacentPaths(gridPathsWithColor);

  const allNodes = new Set<string>();
  for (const { path } of merged) {
    for (const [r, c] of path) allNodes.add(`${r},${c}`);
  }
  if (allNodes.size === 0) throw new Error('No cells mapped to grid');
  const rows = [...allNodes].map((k) => parseInt(k.split(',')[0], 10));
  const cols = [...allNodes].map((k) => parseInt(k.split(',')[1], 10));
  let minRow = rows[0], maxRow = rows[0], minCol = cols[0], maxCol = cols[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] < minRow) minRow = rows[i];
    if (rows[i] > maxRow) maxRow = rows[i];
    if (cols[i] < minCol) minCol = cols[i];
    if (cols[i] > maxCol) maxCol = cols[i];
  }
  const gridW = maxCol - minCol + 1;
  const gridH = maxRow - minRow + 1;

  const arrows: ImportArrowData[] = [];
  let arrowCount = 0;
  for (const { path: gp, color } of merged) {
    const shifted = gp.map(([r, c]) => [r - minRow, c - minCol] as [number, number]);
    if (hasBacktrack(shifted)) continue;
    const gapSegs = splitAtGaps(shifted);
    for (const seg of gapSegs) {
      if (seg.length < p.minArrowLen) continue;
      const indices = seg.map(([r, c]) => r * gridW + c);
      arrows.push({
        id: `import_c${color}_${arrowCount++}`,
        indices,
        style: { color: palette[color] }
      });
    }
  }

  return {
    meta: {
      source: sourceName,
      lineWidthPx: Math.round(lineWidth * 100) / 100,
      gridStepX: stepX,
      gridStepY: stepY,
      offsetX: Math.round(ox * 100) / 100,
      offsetY: Math.round(oy * 100) / 100,
      closingRadius: closeR,
      borderBrightness: p.borderBrightness,
      simplifyEpsilon: p.simplifyEpsilon,
      palette
    },
    config: { width: gridW, height: gridH },
    cellSizeX: stepX,
    cellSizeY: stepY,
    arrows
  };
}

export type { ImageImportResult, ImageImportParams };
