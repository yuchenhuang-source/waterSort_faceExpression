/**
 * CV 自动 init 插件。当场景实现 getCvAdapter 时，在 create 后自动调用 initCvIntegration。
 */

import type { ICvSceneAdapter } from './CvSceneAdapter.js';
import { isCVModeEnabled } from '../cv-bridge/CVBridge.js';
import { initCvIntegration } from './CvIntegration.js';

export class CvAutoInitPlugin extends Phaser.Plugins.ScenePlugin {
  boot(): void {
    this.scene?.events.once('create', this.tryAutoInit, this);
  }

  private tryAutoInit(): void {
    if (!isCVModeEnabled() || !this.scene) return;
    const adapter = this.scene.getCvAdapter?.();
    if (!adapter) {
      console.warn('[CV] getCvAdapter 未实现，CV 未初始化。主场景需实现 getCvAdapter() 返回 ICvSceneAdapter。运行 npm run cv:check 检查接入。');
      return;
    }
    initCvIntegration(this.scene!, adapter as ICvSceneAdapter);
  }
}
