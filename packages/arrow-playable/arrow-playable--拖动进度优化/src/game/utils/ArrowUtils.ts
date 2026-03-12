import { Direction, GridPos, ArrowSegment, ArrowData } from '../types/Arrow';
import { getArrowConfigSync, hexToPhaserColor } from '../config/arrow-config';

// 根据方向移动位置
export function moveInDirection(pos: GridPos, direction: Direction): GridPos {
  const newPos = { ...pos };
  switch (direction) {
    case Direction.UP:
      newPos.y -= 1;
      break;
    case Direction.DOWN:
      newPos.y += 1;
      break;
    case Direction.LEFT:
      newPos.x -= 1;
      break;
    case Direction.RIGHT:
      newPos.x += 1;
      break;
    case Direction.UP_LEFT:
      newPos.x -= 1;
      newPos.y -= 1;
      break;
    case Direction.UP_RIGHT:
      newPos.x += 1;
      newPos.y -= 1;
      break;
    case Direction.DOWN_LEFT:
      newPos.x -= 1;
      newPos.y += 1;
      break;
    case Direction.DOWN_RIGHT:
      newPos.x += 1;
      newPos.y += 1;
      break;
  }
  return newPos;
}

// 检查位置是否在边界内
export function isWithinBounds(pos: GridPos, gridSize: number): boolean {
  return pos.x >= 0 && pos.x < gridSize && pos.y >= 0 && pos.y < gridSize;
}

// 生成箭头的完整路径（支持弯曲路径）
export function generateArrowPath(
  startPos: GridPos,
  directions: Direction[],
  length: number
): ArrowSegment[] {
  const segments: ArrowSegment[] = [];
  let currentPos = { ...startPos };

  for (let i = 0; i < length; i++) {
    // 如果方向数组不够长，使用最后一个方向
    const direction = directions[i] || directions[directions.length - 1];
    segments.push({
      position: { ...currentPos },
      direction: direction,
      segmentIndex: i
    });
    currentPos = moveInDirection(currentPos, direction);
  }

  return segments;
}

// 计算箭头滑行时的检测路径（从头部沿滑行方向到边界）
export function calculateSlidePath(
  arrow: ArrowData,
  gridSize: number
): GridPos[] {
  const path: GridPos[] = [];
  const headPos = arrow.segments[0].position;
  const slideDirection = arrow.headDirection;
  let currentPos = { ...headPos };

  while (isWithinBounds(currentPos, gridSize)) {
    path.push({ ...currentPos });
    currentPos = moveInDirection(currentPos, slideDirection);
  }

  return path;
}

// 创建L形箭头（测试用）
export function createLShapeArrow(
  id: string,
  startPos: GridPos,
  color?: number
): ArrowData {
  const resolvedColor = color ?? hexToPhaserColor(getArrowConfigSync().defaultColor);
  // L形：向右2格，向下2格
  const directions: Direction[] = [
    Direction.RIGHT,
    Direction.RIGHT,
    Direction.DOWN,
    Direction.DOWN
  ];
  const segments = generateArrowPath(startPos, directions, 4);

  return {
    id,
    length: 4,
    segments,
    headDirection: Direction.RIGHT, // 头部向右，决定滑行方向
    color: resolvedColor,
    isEliminated: false,
    isAnimating: false
  };
}

// 创建直线箭头（测试用）
export function createStraightArrow(
  id: string,
  startPos: GridPos,
  direction: Direction,
  length?: number,
  color?: number
): ArrowData {
  const config = getArrowConfigSync();
  const resolvedLength = length ?? config.straightArrowDefaultLength;
  const resolvedColor = color ?? hexToPhaserColor(config.straightArrowDefaultColor);
  const directions = Array(resolvedLength).fill(direction);
  const segments = generateArrowPath(startPos, directions, resolvedLength);

  return {
    id,
    length: resolvedLength,
    segments,
    headDirection: direction,
    color: resolvedColor,
    isEliminated: false,
    isAnimating: false
  };
}
