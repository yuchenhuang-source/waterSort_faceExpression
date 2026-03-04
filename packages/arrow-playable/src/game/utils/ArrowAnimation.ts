// 箭头动画工具类

import { ArrowRuntime, Point, Direction } from '../types/Board';

export interface AnimationState {
  offsetRate: number; // 推进量（以格为单位）
  isAnimating: boolean;
  isComplete: boolean;
}

/**
 * 计算折线总长度
 */
export function calculatePolylineLength(keyPoints: Point[]): number {
  if (keyPoints.length < 2) return 0;
  
  let totalLength = 0;
  for (let i = 1; i < keyPoints.length; i++) {
    const dx = keyPoints[i].x - keyPoints[i - 1].x;
    const dy = keyPoints[i].y - keyPoints[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }
  return totalLength;
}

/**
 * 在折线上找到距离起点 t 像素的位置
 */
export function findPointOnPolyline(
  keyPoints: Point[],
  t: number
): { point: Point; remainingT: number } {
  if (keyPoints.length < 2) {
    return { point: keyPoints[0] || { x: 0, y: 0 }, remainingT: t };
  }
  
  let accumulatedLength = 0;
  
  for (let i = 1; i < keyPoints.length; i++) {
    const prev = keyPoints[i - 1];
    const curr = keyPoints[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    
    if (accumulatedLength + segmentLength >= t) {
      // 在这个线段上
      const localT = (t - accumulatedLength) / segmentLength;
      return {
        point: {
          x: prev.x + dx * localT,
          y: prev.y + dy * localT
        },
        remainingT: 0
      };
    }
    
    accumulatedLength += segmentLength;
  }
  
  // 超过了总长度，返回终点
  return {
    point: keyPoints[keyPoints.length - 1],
    remainingT: t - accumulatedLength
  };
}

/**
 * 根据 offsetRate 生成显示点列表
 * @param arrowData 箭头数据
 * @param offsetRate 推进量（格为单位）
 * @param gridUnit 网格单位（像素/格）
 * @returns 显示点列表
 */
export function generateDisplayPoints(
  arrowData: ArrowRuntime,
  offsetRate: number,
  gridUnit: number
): Point[] {
  const keyPoints = arrowData.keyPoints;
  if (keyPoints.length < 2) {
    return keyPoints;
  }
  
  const t = offsetRate * gridUnit; // 实际推进距离（像素）
  const totalLength = calculatePolylineLength(keyPoints);
  
  if (t <= 0) {
    // 还没开始推进，返回原始点
    return keyPoints;
  }
  
  if (t < totalLength) {
    // 尾部还在折线上，需要裁剪
    const { point: tailPoint } = findPointOnPolyline(keyPoints, t);
    
    // 找到 tailPoint 所在的线段索引
    let segmentIndex = 0;
    let accumulatedLength = 0;
    for (let i = 1; i < keyPoints.length; i++) {
      const prev = keyPoints[i - 1];
      const curr = keyPoints[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);
      
      if (accumulatedLength + segmentLength >= t) {
        segmentIndex = i;
        break;
      }
      accumulatedLength += segmentLength;
    }
    
    // 构建新的点列表：从 tailPoint 开始，保留后面的所有关键点
    const displayPoints: Point[] = [tailPoint];
    for (let i = segmentIndex; i < keyPoints.length; i++) {
      displayPoints.push(keyPoints[i]);
    }
    
    // 头部延伸
    const lastPoint = displayPoints[displayPoints.length - 1];
    const dir = arrowData.direction;
    const headExtendPoint: Point = {
      x: lastPoint.x + dir.x * t,
      y: lastPoint.y + dir.y * t
    };
    displayPoints.push(headExtendPoint);
    
    return displayPoints;
  } else {
    // t >= totalLength：完全飞出阶段
    const lastPoint = keyPoints[keyPoints.length - 1];
    const dir = arrowData.direction;
    
    // 返回两个点：P1 和 P2
    const P1: Point = {
      x: lastPoint.x + dir.x * (t - totalLength),
      y: lastPoint.y + dir.y * (t - totalLength)
    };
    const P2: Point = {
      x: lastPoint.x + dir.x * t,
      y: lastPoint.y + dir.y * t
    };
    
    return [P1, P2];
  }
}
