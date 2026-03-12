/**
 * 骨架像素级路径追踪 - 对应 Python trace_skeleton_paths_v6
 * 8-连通，从端点开始 DFS，分叉时选最直方向
 */

import type { PixelPath } from './types';

function key(y: number, x: number): string {
  return `${y},${x}`;
}

export function traceSkeletonPathsV6(
  skeleton: Uint8Array,
  width: number,
  height: number
): PixelPath[] {
  const pointSet = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skeleton[y * width + x]) pointSet.add(key(y, x));
    }
  }
  if (pointSet.size === 0) return [];

  const neighborMap = new Map<string, Array<[number, number]>>();
  const dydx = [-1, 0, 1];
  for (const k of pointSet) {
    const [y, x] = k.split(',').map(Number);
    const nbs: Array<[number, number]> = [];
    for (const dy of dydx) {
      for (const dx of dydx) {
        if (dy === 0 && dx === 0) continue;
        const nk = key(y + dy, x + dx);
        if (pointSet.has(nk)) nbs.push([y + dy, x + dx]);
      }
    }
    neighborMap.set(k, nbs);
  }

  const endpoints = [...neighborMap.entries()]
    .filter(([, nbs]) => nbs.length === 1)
    .map(([k]) => k)
    .sort();

  const visited = new Set<string>();
  const paths: PixelPath[] = [];

  function traceFrom(start: [number, number]): PixelPath {
    const path: PixelPath = [start];
    visited.add(key(start[0], start[1]));
    let current: [number, number] = start;
    for (;;) {
      const nbs = (neighborMap.get(key(current[0], current[1])) || []).filter(
        (n) => !visited.has(key(n[0], n[1]))
      );
      if (nbs.length === 0) break;
      let next: [number, number];
      if (nbs.length > 1 && path.length >= 2) {
        const prev = path[path.length - 2];
        const dy = current[0] - prev[0];
        const dx = current[1] - prev[1];
        nbs.sort((a, b) => {
          const da = Math.abs(a[0] - current[0] - dy) + Math.abs(a[1] - current[1] - dx);
          const db = Math.abs(b[0] - current[0] - dy) + Math.abs(b[1] - current[1] - dx);
          return da - db;
        });
        next = nbs[0];
      } else {
        next = nbs[0];
      }
      visited.add(key(next[0], next[1]));
      path.push(next);
      current = next;
    }
    return path;
  }

  for (const k of endpoints) {
    if (visited.has(k)) continue;
    const [y, x] = k.split(',').map(Number);
    const path = traceFrom([y, x]);
    if (path.length >= 2) paths.push(path);
  }

  const sortedPoints = [...pointSet].sort();
  for (const k of sortedPoints) {
    if (visited.has(k)) continue;
    const [y, x] = k.split(',').map(Number);
    const path = traceFrom([y, x]);
    if (path.length >= 2) paths.push(path);
  }

  return paths;
}
