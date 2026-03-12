/**
 * 路径简化与网格吸附 - 对应 Python douglas_peucker_simplify, snap_path_to_grid_v6
 */

import type { PixelPath, GridPath } from './types';

function perpendicularDistance(
  pt: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  if (lineStart[0] === lineEnd[0] && lineStart[1] === lineEnd[1]) {
    return Math.hypot(pt[0] - lineStart[0], pt[1] - lineStart[1]);
  }
  const num = Math.abs(
    (lineEnd[1] - lineStart[1]) * pt[0] -
      (lineEnd[0] - lineStart[0]) * pt[1] +
      lineEnd[0] * lineStart[1] -
      lineEnd[1] * lineStart[0]
  );
  const den = Math.hypot(lineEnd[1] - lineStart[1], lineEnd[0] - lineStart[0]);
  return den === 0 ? 0 : num / den;
}

/**
 * Douglas-Peucker 简化（迭代+显式栈，避免长路径时递归爆栈）
 */
export function douglasPeuckerSimplify(path: PixelPath, epsilon: number): PixelPath {
  if (path.length < 3) return path;
  const stack: Array<{ start: number; end: number }> = [{ start: 0, end: path.length - 1 }];
  const keep = new Set<number>();
  keep.add(0);
  keep.add(path.length - 1);
  while (stack.length > 0) {
    const { start, end } = stack.pop()!;
    if (end - start < 2) continue;
    let dmax = 0;
    let index = start;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(path[i], path[start], path[end]);
      if (d > dmax) {
        dmax = d;
        index = i;
      }
    }
    if (dmax > epsilon) {
      keep.add(index);
      stack.push({ start, end: index });
      stack.push({ start: index, end });
    }
  }
  const out: PixelPath = [];
  const sorted = [...keep].sort((a, b) => a - b);
  for (const i of sorted) out.push(path[i]);
  return out;
}

/**
 * 像素路径吸附到网格，保证 4-连通
 */
export function snapPathToGridV6(
  pixelPath: PixelPath,
  stepX: number,
  stepY: number,
  offsetX: number,
  offsetY: number
): GridPath {
  if (pixelPath.length === 0) return [];
  const rawGrid: GridPath = [];
  for (const [py, px] of pixelPath) {
    const col = Math.floor((px - offsetX) / stepX);
    const row = Math.floor((py - offsetY) / stepY);
    const last = rawGrid[rawGrid.length - 1];
    if (rawGrid.length === 0 || last[0] !== row || last[1] !== col) {
      rawGrid.push([row, col]);
    }
  }
  const result: GridPath = [rawGrid[0]];
  for (let i = 1; i < rawGrid.length; i++) {
    const [r0, c0] = result[result.length - 1];
    const [r1, c1] = rawGrid[i];
    const dr = r1 - r0;
    const dc = c1 - c0;
    const manhattan = Math.abs(dr) + Math.abs(dc);
    if (manhattan === 1) {
      result.push([r1, c1]);
    } else if (manhattan === 2 && Math.abs(dr) === 1 && Math.abs(dc) === 1) {
      if (result.length >= 2) {
        const [pr] = result[result.length - 2];
        const prevDr = r0 - pr;
        if (prevDr !== 0) {
          result.push([r0 + dr, c0]);
        } else {
          result.push([r0, c0 + dc]);
        }
      } else {
        result.push([r0 + dr, c0]);
      }
      result.push([r1, c1]);
    } else if (manhattan > 2) {
      let rr = r0;
      let cc = c0;
      while (rr !== r1 || cc !== c1) {
        if (Math.abs(r1 - rr) > Math.abs(c1 - cc)) {
          rr += r1 > rr ? 1 : -1;
        } else {
          cc += c1 > cc ? 1 : -1;
        }
        result.push([rr, cc]);
      }
    }
  }
  return result;
}
