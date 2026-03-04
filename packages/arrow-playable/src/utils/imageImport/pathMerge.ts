/**
 * 相邻路径合并 - 对应 Python are_paths_adjacent, try_merge_adjacent_paths
 */

import type { GridPath } from './types';

export function arePathsAdjacent(pathA: GridPath, pathB: GridPath): boolean {
  for (const [ra, ca] of pathA) {
    for (const [rb, cb] of pathB) {
      if (Math.abs(ra - rb) + Math.abs(ca - cb) === 1) return true;
    }
  }
  return false;
}

function pathConcat(pa: GridPath, pb: GridPath): GridPath {
  if (pa.length === 0) return pb;
  if (pb.length === 0) return pa;
  const dist = Math.abs(pa[pa.length - 1][0] - pb[0][0]) + Math.abs(pa[pa.length - 1][1] - pb[0][1]);
  if (dist === 0) return [...pa, ...pb.slice(1)];
  if (dist === 1) return [...pa, ...pb];
  return [...pa, ...pb];
}

/**
 * 合并 4-相邻且同色、端点可连接的路径
 */
export function tryMergeAdjacentPaths(
  gridPathsWithColor: Array<{ path: GridPath; color: number }>
): Array<{ path: GridPath; color: number }> {
  if (gridPathsWithColor.length < 2) return gridPathsWithColor;
  let result = gridPathsWithColor.map((x) => ({ path: [...x.path], color: x.color }));
  let changed = true;
  while (changed) {
    changed = false;
    const newResult: Array<{ path: GridPath; color: number }> = [];
    const mergedIndices = new Set<number>();
    for (let i = 0; i < result.length; i++) {
      if (mergedIndices.has(i)) continue;
      let pathI = result[i].path;
      const colorI = result[i].color;
      for (let j = i + 1; j < result.length; j++) {
        if (mergedIndices.has(j)) continue;
        const pathJ = result[j].path;
        const colorJ = result[j].color;
        if (colorI !== colorJ) continue;
        if (!arePathsAdjacent(pathI, pathJ)) continue;
        let mergedPath: GridPath | null = null;
        const endI = pathI[pathI.length - 1];
        const startJ = pathJ[0];
        const endJ = pathJ[pathJ.length - 1];
        const startI = pathI[0];
        const d = (a: [number, number], b: [number, number]) =>
          Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (d(endI, startJ) <= 1) mergedPath = pathConcat(pathI, pathJ);
        else if (d(endI, endJ) <= 1) mergedPath = pathConcat(pathI, [...pathJ].reverse());
        else if (d(startI, startJ) <= 1) mergedPath = pathConcat([...pathI].reverse(), pathJ);
        else if (d(startI, endJ) <= 1)
          mergedPath = pathConcat([...pathI].reverse(), [...pathJ].reverse());
        if (mergedPath) {
          pathI = mergedPath;
          mergedIndices.add(j);
          changed = true;
        }
      }
      newResult.push({ path: pathI, color: colorI });
    }
    result = newResult;
  }
  return result;
}
