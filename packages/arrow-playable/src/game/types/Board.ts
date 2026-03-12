// 棋盘和箭头相关类型定义（基于设计文档）

// 关卡配置
export interface LevelConfig {
  width: number;
  height: number;
  rule?: {
    exitMode?: 'A' | 'B' | 'C'; // 退出模式
  };
}

// 关卡元数据
export interface LevelMeta {
  version: string;
  created: string; // ISO 8601
  levelName: string;
  author: string;
  description: string;
}

// 箭头数据（关卡格式）
export interface ArrowData {
  id?: string;
  indices: number[]; // 格子索引数组，至少2个点
  style?: {
    color?: string; // hex颜色，如 "#000000"
  };
}

// 完整关卡数据
export interface LevelData {
  meta: LevelMeta;
  config: LevelConfig;
  arrows: ArrowData[];
}

// 方向向量（归一化）
export interface Direction {
  x: number; // -1, 0, 1
  y: number; // -1, 0, 1
}

// 点坐标（世界坐标）
export interface Point {
  x: number;
  y: number;
}

// 箭头运行时数据（从关卡数据派生）
export interface ArrowRuntime {
  id: string;
  gridIndices: number[]; // 原始格子索引
  keyPoints: Point[]; // 去冗余后的关键点（起点、拐点、终点）
  direction: Direction; // 朝向（由最后两个关键点计算）
  color: number; // Phaser颜色值
  isEliminated: boolean;
  isAnimating: boolean;
}

// 占用表（格子索引 -> 箭头ID）
export type OccupancyMap = Map<number, string>;
