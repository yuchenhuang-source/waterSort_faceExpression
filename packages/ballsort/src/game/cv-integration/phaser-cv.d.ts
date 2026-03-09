/**
 * Scene 类型扩展：实现 getCvAdapter 的场景可被 CvAutoInitPlugin 自动检测并 init CV。
 */

import type { ICvSceneAdapter } from './CvSceneAdapter';

declare module 'phaser' {
  interface Scene {
    /** 若实现，CV 插件将在 create 后自动 init */
    getCvAdapter?: () => ICvSceneAdapter;
  }
}
