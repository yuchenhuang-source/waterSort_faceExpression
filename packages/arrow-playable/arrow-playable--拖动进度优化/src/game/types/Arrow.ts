// 箭头相关类型定义

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  UP_LEFT = 'UP_LEFT',
  UP_RIGHT = 'UP_RIGHT',
  DOWN_LEFT = 'DOWN_LEFT',
  DOWN_RIGHT = 'DOWN_RIGHT'
}

export interface GridPos {
  x: number;
  y: number;
}

// 箭头段（箭头的一个格子）
export interface ArrowSegment {
  position: GridPos;       // 该段的位置
  direction: Direction;    // 该段的指向方向
  segmentIndex: number;    // 在箭头中的索引（0=头部，length-1=尾部）
}

// 箭头对象
export interface ArrowData {
  id: string;                    // 唯一标识
  length: number;                // 长度（3-8）
  segments: ArrowSegment[];      // 所有段的位置和方向序列（定义弯曲路径）
  headDirection: Direction;      // 头部指向方向（决定滑行方向）
  color: number;                 // 颜色（Phaser颜色值）
  isEliminated: boolean;         // 是否已消除
  isAnimating: boolean;          // 是否正在动画中
}

// 动画状态
export interface ArrowAnimation {
  arrow: ArrowData;
  targetPath: GridPos[];         // 目标滑行路径
  currentProgress: number;        // 当前动画进度（0-1）
  segmentOffsets: GridPos[];      // 每个段的偏移量（用于蛇形展开）
  startTime: number;              // 动画开始时间
}
