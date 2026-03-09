/**
 * CV 场景适配器接口。场景实现 getCvAdapter 返回此接口，CvAutoInitPlugin 将自动 init CV。
 */

import type { CvTintable, ICvRenderable } from '../render/CvColorCode';
import type { CVResponse } from '../cv-bridge/CVBridge';

export interface ICvSceneAdapter {
  /** 可选，有 getStaticCvIds 且 root 为 ICvTraversable 时可自动推导 */
  getColorMapIds?: () => number[];
  getStaticCvIds?: () => number[];
  getRootRenderable: () => ICvRenderable;
  getStaticTintables: () => CvTintable[];
  getElementsToHide?: () => Phaser.GameObjects.GameObject[];
  getActiveIds?: () => number[];
  formatStepSuffix?: (response: CVResponse) => string;
}
