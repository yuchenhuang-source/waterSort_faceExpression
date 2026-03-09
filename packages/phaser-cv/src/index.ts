/**
 * @ballsort-multi/phaser-cv
 * Color-encoded instance segmentation for Phaser games.
 */
/// <reference path="./phaser-cv.d.ts" />

// Render
export * from './render/ObjectIdPipeline.js';
export * from './render/CvColorCode.js';

// CV Bridge
export {
  CVBridge,
  isCVModeEnabled,
  getCVBridge,
  destroyCVBridge,
  type CVResponse,
  type PixelFrameData,
} from './cv-bridge/CVBridge.js';

// CV Integration
export {
  initCvIntegration,
  type CvIntegrationOptions,
} from './cv-integration/CvIntegration.js';
export { verifyCvIntegration, type CvVerifyResult } from './cv-integration/CvIntegrationVerify.js';
export type { ICvSceneAdapter } from './cv-integration/CvSceneAdapter.js';
export { CvAutoInitPlugin } from './cv-integration/CvAutoInitPlugin.js';
