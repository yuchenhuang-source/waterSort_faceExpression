// 棋盘工具函数

import { LevelConfig, ArrowData, ArrowRuntime, Direction, Point, OccupancyMap } from '../types/Board';

/**
 * 将格子索引转换为行列坐标
 */
export function indexToRowCol(index: number, width: number): { row: number; col: number } {
  return {
    row: Math.floor(index / width),
    col: index % width
  };
}

/**
 * 将行列坐标转换为格子索引
 */
export function rowColToIndex(row: number, col: number, width: number): number {
  return row * width + col;
}

/**
 * 在指定格子周围 radius 格内查找最近的有箭头的格子（按格子中心欧氏距离）。
 * “radius 格以内”使用切比雪夫距离：max(|Δrow|, |Δcol|) <= radius。
 * @returns 最近的有箭头的格子索引，若范围内没有则返回 null
 */
export function findNearestOccupiedCellInRadius(
  clickedRow: number,
  clickedCol: number,
  width: number,
  height: number,
  arrows: { gridIndices: number[]; isEliminated?: boolean; isAnimating?: boolean }[],
  radius: number
): number | null {
  let nearestIndex: number | null = null;
  let nearestDistSq = Infinity;

  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) > radius) continue;
      const nr = clickedRow + dr;
      const nc = clickedCol + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const idx = rowColToIndex(nr, nc, width);
      const hasArrow = arrows.some(
        a => !a.isEliminated && !a.isAnimating && a.gridIndices.includes(idx)
      );
      if (!hasArrow) continue;
      const distSq = dr * dr + dc * dc;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestIndex = idx;
      }
    }
  }
  return nearestIndex;
}

/**
 * 检查两个格子索引是否四邻接
 */
export function isAdjacent(index1: number, index2: number, width: number): boolean {
  const pos1 = indexToRowCol(index1, width);
  const pos2 = indexToRowCol(index2, width);
  const rowDiff = Math.abs(pos1.row - pos2.row);
  const colDiff = Math.abs(pos1.col - pos2.col);
  return rowDiff + colDiff === 1;
}

/**
 * 去冗余：从格子索引数组提取关键点（起点、拐点、终点）
 * 只保留起点、所有拐点、终点
 */
export function simplifyPath(
  indices: number[],
  width: number,
  cellSizeX: number,
  cellSizeY: number,
  offsetX: number,
  offsetY: number
): Point[] {
  if (indices.length < 2) {
    return [];
  }

  const keyPoints: Point[] = [];
  
  // 起点
  const start = indexToRowCol(indices[0], width);
  keyPoints.push({
    x: offsetX + start.col * cellSizeX + cellSizeX / 2,
    y: offsetY + start.row * cellSizeY + cellSizeY / 2
  });

  // 遍历所有点，找出拐点
  for (let i = 1; i < indices.length - 1; i++) {
    const prev = indexToRowCol(indices[i - 1], width);
    const curr = indexToRowCol(indices[i], width);
    const next = indexToRowCol(indices[i + 1], width);
    
    // 计算方向变化
    const dir1 = { row: curr.row - prev.row, col: curr.col - prev.col };
    const dir2 = { row: next.row - curr.row, col: next.col - curr.col };
    
    // 如果方向改变，则是拐点
    if (dir1.row !== dir2.row || dir1.col !== dir2.col) {
      keyPoints.push({
        x: offsetX + curr.col * cellSizeX + cellSizeX / 2,
        y: offsetY + curr.row * cellSizeY + cellSizeY / 2
      });
    }
  }

  // 终点
  const end = indexToRowCol(indices[indices.length - 1], width);
  keyPoints.push({
    x: offsetX + end.col * cellSizeX + cellSizeX / 2,
    y: offsetY + end.row * cellSizeY + cellSizeY / 2
  });

  return keyPoints;
}

/**
 * 计算箭头朝向（由最后两个关键点决定）
 */
export function calculateDirection(keyPoints: Point[]): Direction {
  if (keyPoints.length < 2) {
    return { x: 1, y: 0 }; // 默认向右
  }

  const last = keyPoints[keyPoints.length - 1];
  const secondLast = keyPoints[keyPoints.length - 2];
  
  const dx = last.x - secondLast.x;
  const dy = last.y - secondLast.y;
  
  // 归一化（只取方向，不取长度）
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: dx > 0 ? 1 : -1, y: 0 };
  } else {
    return { x: 0, y: dy > 0 ? 1 : -1 };
  }
}

/**
 * 从关卡数据创建箭头运行时数据
 */
export function createArrowRuntime(
  arrowData: ArrowData,
  config: LevelConfig,
  cellSizeX: number,
  cellSizeY: number,
  offsetX: number,
  offsetY: number
): ArrowRuntime {
  const id = arrowData.id || `arrow_${Date.now()}_${Math.random()}`;
  const keyPoints = simplifyPath(arrowData.indices, config.width, cellSizeX, cellSizeY, offsetX, offsetY);
  const direction = calculateDirection(keyPoints);
  
  // 转换颜色
  let color = 0x000000; // 默认黑色
  if (arrowData.style?.color) {
    color = parseInt(arrowData.style.color.replace('#', ''), 16);
  }

  return {
    id,
    gridIndices: arrowData.indices,
    keyPoints,
    direction,
    color,
    isEliminated: false,
    isAnimating: false
  };
}

/**
 * 构建占用表
 */
export function buildOccupancyMap(arrows: ArrowRuntime[]): OccupancyMap {
  const occupancy = new Map<number, string>();
  
  arrows.forEach(arrow => {
    if (!arrow.isEliminated) {
      arrow.gridIndices.forEach(index => {
        occupancy.set(index, arrow.id);
      });
    }
  });
  
  return occupancy;
}

/**
 * 检查箭头是否可以退出（Mode A：直通出界）
 */
export function canArrowExit(
  arrow: ArrowRuntime,
  config: LevelConfig,
  occupancy: OccupancyMap
): { canExit: boolean; steps: number; obstacleIdx: number | null } {
  if (arrow.keyPoints.length < 2) {
    return { canExit: false, steps: 0, obstacleIdx: null };
  }

  // 获取头部所在格子
  const headIndex = arrow.gridIndices[arrow.gridIndices.length - 1];
  const headPos = indexToRowCol(headIndex, config.width);
  
  // 沿方向探测
  let steps = 0;
  let currentRow = headPos.row;
  let currentCol = headPos.col;
  
  while (true) {
    // 向前移动一格
    currentRow += arrow.direction.y;
    currentCol += arrow.direction.x;
    
    // 检查是否出界
    if (currentRow < 0 || currentRow >= config.height || 
        currentCol < 0 || currentCol >= config.width) {
      // 出界了，可以退出
      return { canExit: true, steps, obstacleIdx: null };
    }
    
    // 检查是否被占用
    const nextIndex = rowColToIndex(currentRow, currentCol, config.width);
    const occupier = occupancy.get(nextIndex);
    
    if (occupier && occupier !== arrow.id) {
      // 被其他箭头占用
      return { canExit: false, steps, obstacleIdx: nextIndex };
    }
    
    steps++;
  }
}
