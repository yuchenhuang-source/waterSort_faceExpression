/**
 * 图片导入 pipeline 类型（与 Python image_import.py v6 对应）
 */

/** 像素路径：[(y, x), ...] 像素坐标 */
export type PixelPath = Array<[number, number]>;

/** 网格路径：[(row, col), ...] 格子坐标 */
export type GridPath = Array<[number, number]>;

/** 导入参数（与 Python 命令行参数对应） */
export interface ImageImportParams {
  /** 颜色聚类数，0 = 自动 */
  colors?: number;
  /** 透明度阈值 */
  alphaThreshold?: number;
  /** 形态学闭运算半径，-1=自动，0=关闭 */
  closeRadius?: number;
  /** 强制网格步长 X，0=自动 */
  forceStepX?: number;
  /** 强制网格步长 Y，0=自动 */
  forceStepY?: number;
  /** 最短箭头长度（格子数） */
  minArrowLen?: number;
  /** 黑色边框亮度阈值，0=关闭 */
  borderBrightness?: number;
  /** Douglas-Peucker 简化 epsilon，0=关闭 */
  simplifyEpsilon?: number;
}

/** 导入结果 meta（与 Python 输出一致） */
export interface ImageImportMeta {
  source: string;
  lineWidthPx: number;
  gridStepX: number;
  gridStepY: number;
  offsetX: number;
  offsetY: number;
  closingRadius: number;
  borderBrightness: number;
  simplifyEpsilon: number;
  palette: string[];
}

/** 单条箭头（与 LevelData.arrows 项一致） */
export interface ImportArrowData {
  id: string;
  indices: number[];
  style: { color: string };
}

/** 完整导入结果（可直接用于 Editor 加载） */
export interface ImageImportResult {
  meta: ImageImportMeta;
  config: { width: number; height: number };
  cellSizeX: number;
  cellSizeY: number;
  arrows: ImportArrowData[];
}

/** 内部：RGBA 图像数据 */
export interface ImageDataRGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
