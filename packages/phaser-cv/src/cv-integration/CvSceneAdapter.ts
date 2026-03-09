/**
 * CV 场景适配器接口。场景实现 getCvAdapter 返回此接口，CvAutoInitPlugin 将自动 init CV。
 */

import type { CvTintable, ICvRenderable } from '../render/CvColorCode.js';
import type { CVResponse } from '../cv-bridge/CVBridge.js';

export interface ICvSceneAdapter {
  /** 可选，有 getStaticCvIds 且 root 为 ICvTraversable 时可自动推导 */
  getColorMapIds?: () => number[];
  getStaticCvIds?: () => number[];
  getRootRenderable: () => ICvRenderable;
  getStaticTintables: () => CvTintable[];
  getElementsToHide?: () => Phaser.GameObjects.GameObject[];
  getActiveIds?: () => number[];
  formatStepSuffix?: (response: CVResponse) => string;
  /** 可选，返回 true 时保留 blended 边缘像素。默认 false */
  getKeepBlendedPixels?: () => boolean;
  /** 可选，cvId → 可读标签映射，供 CV UI 直接使用（如 tube1、ball_14、hand 等） */
  getCvIdToLabelMap?: () => Map<number, string> | Record<string, string>;
}
