/**
 * CV 自动 init 插件。当场景实现 getCvAdapter 时，在 create 后自动调用 initCvIntegration。
 */

import type { ICvSceneAdapter } from './CvSceneAdapter';
import { isCVModeEnabled } from '../cv-bridge/CVBridge';
import { initCvIntegration } from './CvIntegration';

export class CvAutoInitPlugin extends Phaser.Plugins.ScenePlugin {
  boot(): void {
    this.scene.events.once('create', this.tryAutoInit, this);
  }

  private tryAutoInit(): void {
    if (!isCVModeEnabled()) return;
    const adapter = this.scene.getCvAdapter?.();
    if (!adapter) return;
    initCvIntegration(this.scene, adapter as ICvSceneAdapter);
  }
}
